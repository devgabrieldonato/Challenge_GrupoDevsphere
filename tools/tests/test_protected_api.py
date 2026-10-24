"""Contratos protegidos com API e SQLite temporários; nenhum modelo é executado."""
from __future__ import annotations

from contextlib import closing
import json
import os
from pathlib import Path
import secrets
import sqlite3
import time
import unittest
from unittest.mock import patch

from test_next_http import NextHttpTests


class ProtectedApiTests(NextHttpTests):
    """Modo seguro não depende do estado de botões ou payloads do navegador."""

    @classmethod
    def setUpClass(cls):
        with patch.dict(os.environ, {"DEVSPHERE_INFERENCE_ENABLED": "0", "DEVSPHERE_ALLOW_SOURCE_PURGE": "0"}):
            super().setUpClass()

    def prepared(self):
        identifier = self.document()
        self.assertEqual(self.request("PUT", f"/api/v1/documents/{identifier}", {"markdown": "## Página 1\nTexto sintético suficiente."}, cookie=self.a)[0], 200)
        return identifier

    def test_policy_blocks_direct_generation_and_retry(self):
        identifier = self.prepared()
        before = None
        with closing(sqlite3.connect(self.db)) as db:
            before = db.execute("SELECT count(*) FROM worker_jobs").fetchone()[0]
        status, result, _ = self.request("POST", f"/api/v1/documents/{identifier}/jobs", {"operation":"generate", "inferenceEnabled":True}, cookie=self.a)
        self.assertEqual((status,result["error"]["code"]),(403,"inference_disabled"))
        with closing(sqlite3.connect(self.db)) as db, db:
            self.assertEqual(db.execute("SELECT count(*) FROM worker_jobs").fetchone()[0], before)
            job = secrets.token_hex(16)
            db.execute("INSERT INTO worker_jobs(id,owner_id,document_id,operation,request_json,idempotency_key,status) VALUES(?,?,?,'generate','{}',?,'failed')", (job,self.ids["a@test.local"],identifier,secrets.token_hex(12)))
        self.assertEqual(self.request("POST", f"/api/v1/jobs/{job}/retry", {},cookie=self.a)[0],403)

    def test_runtime_absent_stale_alive_and_allowlist(self):
        self.assertNotEqual(self.request("GET","/api/v1/runtime")[0],200)
        with closing(sqlite3.connect(self.db)) as db,db:
            db.execute("DELETE FROM worker_runtime")
        result=self.request("GET","/api/v1/runtime",cookie=self.a)[1]
        self.assertFalse(result["apiInferenceEnabled"])
        self.assertEqual(result["worker"]["status"],"absent")
        config={"inferenceEnabled":False,"generatorModel":"qwen3:8b","criticModel":"gemma3:4b","secret":"DO_NOT_EXPOSE","generation":{"context":8192,"output":6000,"secret":"DO_NOT_EXPOSE"},"configurationLoadedAt":int(time.time()),"codeVersion":"worker-runtime-v1"}
        with closing(sqlite3.connect(self.db)) as db,db:
            db.execute("INSERT INTO worker_runtime VALUES('synthetic',?,?,?,?)",(int(time.time()),int(time.time())-100,json.dumps(config),"abc"))
        result=self.request("GET","/api/v1/runtime",cookie=self.a)[1]
        self.assertEqual(result["worker"]["status"],"stale")
        self.assertNotIn("config",result["worker"])
        with closing(sqlite3.connect(self.db)) as db,db:
            db.execute("UPDATE worker_runtime SET heartbeat_at=?",(int(time.time()),))
        result=self.request("GET","/api/v1/runtime",cookie=self.admin)[1]
        self.assertEqual(result["worker"]["status"],"alive")
        self.assertEqual(result["worker"]["config"]["generation"]["context"],8192)
        self.assertNotIn("DO_NOT_EXPOSE",json.dumps(result))

    def test_default_retention_blocks_purge(self):
        identifier=self.document()
        self.request("POST",f"/api/v1/documents/{identifier}/withdraw",{},cookie=self.a)
        result=self.request("GET",f"/api/v1/documents/{identifier}/deletion-eligibility",cookie=self.a)[1]
        self.assertFalse(result["eligible"])
        self.assertIn("retention_policy",result["reasons"])
        self.assertEqual(self.request("DELETE",f"/api/v1/documents/{identifier}",cookie=self.a)[0],409)
        self.assertEqual(self.request("GET",f"/api/v1/documents/{identifier}/deletion-eligibility",cookie=self.b)[0],404)

    def test_budget_has_separate_quota(self):
        identifier=self.prepared()
        with closing(sqlite3.connect(self.db)) as db,db:
            # Somente o usuário sintético desta base tem o histórico isolado.
            db.execute("DELETE FROM worker_jobs WHERE owner_id=?",(self.ids["a@test.local"],))
            for _ in range(12):
                db.execute("INSERT INTO worker_jobs(id,owner_id,document_id,operation,request_json,idempotency_key,status) VALUES(?,?,?,'convert','{}',?,'failed')",(secrets.token_hex(16),self.ids["a@test.local"],identifier,secrets.token_hex(16)))
        status,result,_=self.request("POST",f"/api/v1/documents/{identifier}/jobs",{"operation":"budget"},cookie=self.a)
        self.assertEqual(status,202,result)
        self.request("POST",f"/api/v1/jobs/{result['id']}/cancel",{},cookie=self.a)
        with closing(sqlite3.connect(self.db)) as db,db:
            db.execute("DELETE FROM worker_jobs WHERE owner_id=?",(self.ids["a@test.local"],))
            for _ in range(12):
                db.execute("INSERT INTO worker_jobs(id,owner_id,document_id,operation,request_json,idempotency_key,status) VALUES(?,?,?,'generate',?,?,'failed')",(secrets.token_hex(16),self.ids["a@test.local"],identifier,json.dumps({"operation":"budget"}),secrets.token_hex(16)))
        status,result,_=self.request("POST",f"/api/v1/documents/{identifier}/jobs",{"operation":"convert"},cookie=self.a)
        self.assertEqual(status,202,result)
        self.request("POST",f"/api/v1/jobs/{result['id']}/cancel",{},cookie=self.a)


class PurgeApiTests(NextHttpTests):
    """Opt-in de desenvolvimento para material sintético sem qualquer vínculo."""
    @classmethod
    def setUpClass(cls):
        with patch.dict(os.environ,{"DEVSPHERE_INFERENCE_ENABLED":"0","DEVSPHERE_ALLOW_SOURCE_PURGE":"1"}):
            super().setUpClass()

    def withdrawn(self):
        identifier=self.document()
        self.request("POST",f"/api/v1/documents/{identifier}/withdraw",{},cookie=self.a)
        return identifier

    def test_purge_idempotence_and_ownership(self):
        identifier=self.withdrawn()
        path=self.storage/f"{identifier}.pdf"
        self.assertTrue(self.request("GET",f"/api/v1/documents/{identifier}/deletion-eligibility",cookie=self.a)[1]["eligible"])
        self.assertEqual(self.request("DELETE",f"/api/v1/documents/{identifier}",cookie=self.b)[0],404)
        for _ in range(2):
            status,result,_=self.request("DELETE",f"/api/v1/documents/{identifier}",cookie=self.a)
            self.assertEqual(status,200,result)
            self.assertEqual(result,{"status":"deleted","cleanupPending":False})
        self.assertFalse(path.exists())
        with closing(sqlite3.connect(self.db)) as db:
            self.assertEqual(db.execute("SELECT count(*) FROM audit_logs WHERE action='source_purged' AND json_extract(metadata_json,'$.id')=?",(identifier,)).fetchone()[0],1)

    def test_history_blocks_purge(self):
        identifier=self.withdrawn()
        with closing(sqlite3.connect(self.db)) as db,db:
            db.execute("INSERT INTO worker_jobs(id,owner_id,document_id,operation,idempotency_key,status) VALUES(?,?,?,'convert',?,'cancelled')",(secrets.token_hex(16),self.ids["a@test.local"],identifier,secrets.token_hex(12)))
        result=self.request("GET",f"/api/v1/documents/{identifier}/deletion-eligibility",cookie=self.a)[1]
        self.assertIn("processing_history",result["reasons"])
        self.assertEqual(self.request("DELETE",f"/api/v1/documents/{identifier}",cookie=self.a)[0],409)

    def test_all_content_dependencies_block_purge(self):
        scenarios=("version_sources","library_chunks","source_readers","document_grants","metadata")
        for kind in scenarios:
            with self.subTest(kind=kind):
                identifier=self.withdrawn()
                with closing(sqlite3.connect(self.db)) as db,db:
                    if kind=="version_sources":
                        version=db.execute("SELECT id FROM case_versions LIMIT 1").fetchone()[0]
                        db.execute("INSERT INTO version_sources(version_id,document_id,source_hash) VALUES(?,?,?)",(version,identifier,"synthetic"))
                    elif kind=="library_chunks":
                        db.execute("INSERT INTO library_chunks(document_id,page,text) VALUES(?,1,'synthetic')",(identifier,))
                    elif kind=="source_readers":
                        db.execute("INSERT INTO source_readers(document_id,user_id) VALUES(?,?)",(identifier,self.ids["a@test.local"]))
                    elif kind=="document_grants":
                        db.execute("INSERT INTO document_grants(document_id,user_id) VALUES(?,?)",(identifier,self.ids["b@test.local"]))
                    else:
                        case=db.execute("INSERT INTO clinical_cases(stable_key,title) VALUES(?,'Sintético')",(secrets.token_hex(8),)).lastrowid
                        db.execute("INSERT INTO case_versions(clinical_case_id,version_number,content_json,metadata_json) VALUES(?,1,'{}',?)",(case,json.dumps({"sourceId":identifier})))
                result=self.request("GET",f"/api/v1/documents/{identifier}/deletion-eligibility",cookie=self.a)[1]
                self.assertFalse(result["eligible"],result)
                self.assertEqual(self.request("DELETE",f"/api/v1/documents/{identifier}",cookie=self.a)[0],409)
                self.assertTrue((self.storage/f"{identifier}.pdf").exists())

    def test_admin_cannot_purge_other_institution(self):
        identifier=self.withdrawn()
        with closing(sqlite3.connect(self.db)) as db,db:
            institution=db.execute("SELECT institution_id FROM users WHERE id=?",(self.ids["a@test.local"],)).fetchone()[0]
            db.execute("UPDATE users SET institution_id='other-synthetic' WHERE id=?",(self.ids["a@test.local"],))
        try:
            self.assertEqual(self.request("DELETE",f"/api/v1/documents/{identifier}",cookie=self.admin)[0],404)
        finally:
            with closing(sqlite3.connect(self.db)) as db,db:
                db.execute("UPDATE users SET institution_id=? WHERE id=?",(institution,self.ids["a@test.local"]))

    def test_links_and_path_escape_rejected(self):
        for kind in ("symlink","hardlink","escape"):
            with self.subTest(kind=kind):
                identifier=self.withdrawn()
                path=self.storage/f"{identifier}.pdf"
                target=self.directory/f"outside-{identifier}.pdf"
                target.write_bytes(b"not to remove")
                if kind=="escape":
                    with closing(sqlite3.connect(self.db)) as db,db:
                        db.execute("UPDATE source_documents SET storage_path=? WHERE id=?",(str(target),identifier))
                else:
                    path.unlink()
                    if kind=="symlink": path.symlink_to(target)
                    else: os.link(target,path)
                status,result,_=self.request("DELETE",f"/api/v1/documents/{identifier}",cookie=self.a)
                self.assertEqual(status,409,result)
                self.assertEqual(target.read_bytes(),b"not to remove")

    def test_database_failure_restores_quarantined_file(self):
        identifier=self.withdrawn()
        path=self.storage/f"{identifier}.pdf"
        original=path.read_bytes()
        with closing(sqlite3.connect(self.db)) as db,db:
            db.execute("CREATE TRIGGER fail_purge BEFORE INSERT ON audit_logs WHEN NEW.action='source_purged' BEGIN SELECT RAISE(ABORT,'synthetic'); END")
        try:
            self.assertEqual(self.request("DELETE",f"/api/v1/documents/{identifier}",cookie=self.a)[0],409)
            self.assertEqual(path.read_bytes(),original)
            self.assertFalse(list(self.storage.glob(".purge-*")))
            self.assertEqual(self.request("GET",f"/api/v1/documents/{identifier}",cookie=self.a)[0],200)
        finally:
            with closing(sqlite3.connect(self.db)) as db,db: db.execute("DROP TRIGGER fail_purge")


def load_tests(loader, tests, pattern):
    """Não repete os testes herdados: usa apenas os contratos desta extensão."""
    suite=unittest.TestSuite()
    for cls in (ProtectedApiTests,PurgeApiTests):
        for name in cls.__dict__:
            if name.startswith("test_"): suite.addTest(cls(name))
    return suite

if __name__=="__main__":
    unittest.main()
