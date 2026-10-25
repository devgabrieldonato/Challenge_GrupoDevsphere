"""Alertas e recuperação de fila com API real, dados isolados e nenhum modelo."""
from contextlib import closing
import json
import os
import secrets
import sqlite3
import time
import unittest
from unittest.mock import patch
from test_next_http import NextHttpTests

class OperationalStatusTests(NextHttpTests):
    @classmethod
    def setUpClass(cls):
        with patch.dict(os.environ, {"DEVSPHERE_INFERENCE_ENABLED":"0"}): super().setUpClass()

    def setUp(self):
        # Limpa apenas a fila sintética desta classe para não herdar estados entre cenários.
        with closing(sqlite3.connect(self.db)) as db, db:
            db.execute("DELETE FROM worker_jobs")
            db.execute("DELETE FROM worker_runtime")

    def seed_job(self, document, state, owner=None, **changes):
        identifier = secrets.token_hex(16)
        values={"id":identifier,"owner_id":owner or self.ids["a@test.local"],"document_id":document,"operation":"convert","status":state,"idempotency_key":identifier,"request_json":"{}",**changes}
        with closing(sqlite3.connect(self.db)) as db, db:
            db.execute("INSERT INTO worker_jobs("+','.join(values)+") VALUES("+','.join('?' for _ in values)+")",tuple(values.values()))
        return identifier

    def operations(self):
        status,data,_=self.request("GET","/api/v1/operations",cookie=self.admin)
        self.assertEqual(status,200,data);return data

    def test_admin_only_and_no_private_payload(self):
        self.assertIn(self.request("GET","/api/v1/operations")[0],(401,403))
        for cookie in (self.a,self.b,self.teacher):self.assertEqual(self.request("GET","/api/v1/operations",cookie=cookie)[0],403)
        self.document()
        data=self.operations()
        self.assertEqual(data["scope"],"institution")
        self.assertEqual(data["queue"],{"queued":0,"running":0,"oldestQueuedAgeSeconds":None,"expiredLeases":0})
        self.assertNotIn(str(self.directory),json.dumps(data))
        self.assertNotIn("markdown",json.dumps(data))

    def test_stalled_queue_expired_lease_and_recurring_failures(self):
        doc=self.document()
        self.seed_job(doc,"queued",created_at="2020-01-01 00:00:00")
        self.seed_job(doc,"running",lease_until=int(time.time())-10)
        for _ in range(3):self.seed_job(doc,"failed",error_json=json.dumps({"code":"fixture_error","message":"PRIVATE_NEVER_ECHO"}))
        data=self.operations();codes={a["code"] for a in data["alerts"]}
        self.assertTrue({"worker_unavailable","queue_wait_exceeded","expired_job_lease","recurring_failures"}<=codes)
        self.assertEqual(data["failures"]["count"],3)
        self.assertNotIn("PRIVATE_NEVER_ECHO",json.dumps(data))
        self.assertGreater(data["queue"]["oldestQueuedAgeSeconds"],120)

    def test_institution_scope_and_expected_policy_blocks(self):
        doc=self.document()
        with closing(sqlite3.connect(self.db)) as db,db:
            db.execute("UPDATE users SET institution_id='synthetic-other' WHERE id=?",(self.ids["b@test.local"],))
        try:
            self.seed_job(doc,"queued",owner=self.ids["b@test.local"],created_at="2020-01-01 00:00:00")
            for _ in range(3):self.seed_job(doc,"failed",error_json='{"code":"inference_disabled"}')
            data=self.operations()
            self.assertEqual(data["queue"]["queued"],0)
            self.assertEqual(data["failures"]["count"],0)
            self.assertFalse(data["alerts"],data)
        finally:
            with closing(sqlite3.connect(self.db)) as db,db:
                institution=db.execute("SELECT institution_id FROM users WHERE id=?",(self.ids["a@test.local"],)).fetchone()[0]
                db.execute("UPDATE users SET institution_id=? WHERE id=?",(institution,self.ids["b@test.local"]))

    def test_unknown_storage_is_null_and_read_only(self):
        doc=self.document()
        with closing(sqlite3.connect(self.db)) as db,db:db.execute("UPDATE source_documents SET byte_size=NULL WHERE id=?",(doc,))
        data=self.operations()
        self.assertIsNone(data["storage"]["institutionUsedBytes"])
        self.assertGreater(data["storage"]["unknownSizes"],0)
        self.assertIn("storage_accounting_required",{a["code"] for a in data["alerts"]})
        with closing(sqlite3.connect(self.db)) as db:self.assertIsNone(db.execute("SELECT byte_size FROM source_documents WHERE id=?",(doc,)).fetchone()[0])

    def test_recovery_reclaims_only_expired_lease_without_model(self):
        # Exercita a lógica real de recuperação, sem executar o trabalho retornado.
        from worker.run import connect,claim
        doc=self.document();job=self.seed_job(doc,"running",attempts=1,lease_until=int(time.time())-10)
        self.assertIn("expired_job_lease",{a["code"] for a in self.operations()["alerts"]})
        with patch.dict(os.environ,{"DEVSPHERE_INFERENCE_ENABLED":"0"}),closing(connect(self.db)) as db:
            selected=claim(db)
            self.assertEqual(selected["id"],job)
            row=db.execute("SELECT status,attempts,lease_until FROM worker_jobs WHERE id=?",(job,)).fetchone()
            self.assertEqual((row["status"],row["attempts"]),("running",2));self.assertGreater(row["lease_until"],time.time())
            self.assertIsNone(claim(db),"Lease válido não deve ser consumido de novo")
            db.execute("UPDATE worker_jobs SET status='cancelled',lease_until=NULL WHERE id=?",(job,));db.commit()
        self.assertEqual(self.operations()["queue"]["expiredLeases"],0)

class LowDiskOperationsTests(OperationalStatusTests):
    @classmethod
    def setUpClass(cls):
        with patch.dict(os.environ,{"DEVSPHERE_INFERENCE_ENABLED":"0","DEVSPHERE_STORAGE_MIN_FREE_BYTES":str(1024**4)}):NextHttpTests.setUpClass.__func__(cls)
    def test_low_disk_alert_and_upload_refusal_do_not_fill_disk(self):
        self.storage.mkdir(mode=0o700,exist_ok=True)
        data=self.operations()
        if data["storage"]["availableBytes"]>=1024**4:self.skipTest("Fixture requer menos de 1 TiB disponível")
        self.assertIn("low_disk_space",{a["code"] for a in data["alerts"]})
        before=list(self.storage.iterdir())
        status,data,_=self.upload()
        self.assertEqual((status,data["error"]["code"]),(507,"storage_disk_reserve"))
        self.assertEqual(list(self.storage.iterdir()),before)

def load_tests(loader,tests,pattern):
    return unittest.TestSuite([OperationalStatusTests(name) for name in OperationalStatusTests.__dict__ if name.startswith('test_')]+[LowDiskOperationsTests('test_low_disk_alert_and_upload_refusal_do_not_fill_disk')])
if __name__=='__main__':unittest.main()
