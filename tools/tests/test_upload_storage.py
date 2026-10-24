"""Admissão HTTP de bytes reais sem arquivos grandes, disco cheio ou inferência."""
from contextlib import closing
import hashlib
import os
import sqlite3
import unittest
from unittest.mock import patch
from test_next_http import NextHttpTests

class UploadStorageTests(NextHttpTests):
    @classmethod
    def setUpClass(cls):
        with patch.dict(os.environ,{"DEVSPHERE_INFERENCE_ENABLED":"0","DEVSPHERE_STORAGE_USER_BYTES":"12000","DEVSPHERE_STORAGE_INSTITUTION_BYTES":"22000","DEVSPHERE_STORAGE_MIN_FREE_BYTES":"1"}):super().setUpClass()

    def setUp(self):
        # Somente esta base descartável e seus arquivos são limpos entre cenários.
        with closing(sqlite3.connect(self.db)) as db,db:
            db.execute("DELETE FROM source_documents")
        if self.storage.exists():
            for file in self.storage.iterdir():file.unlink()
        self.small=b"%PDF-1.4\n%fixture-storage\n"+b"X"*8950+b"\n%%EOF\n"

    def test_measured_payload_ignores_claimed_size_and_keeps_withdrawn_usage(self):
        status,doc,_=self.upload(pdf=self.small,extra={"byte_size":"0","ownerId":str(self.ids["b@test.local"]),"storageLimit":"99999999"})
        self.assertEqual(status,201,doc)
        with closing(sqlite3.connect(self.db)) as db:
            self.assertEqual(db.execute("SELECT byte_size,owner_id FROM source_documents WHERE id=?",(doc["id"],)).fetchone(),(len(self.small),self.ids["a@test.local"]))
        self.assertEqual(self.request("POST",f"/api/v1/documents/{doc['id']}/withdraw",{},cookie=self.a)[0],200)
        status,error,_=self.upload(pdf=self.small)
        self.assertEqual((status,error["error"]["code"]),(429,"storage_user_limit"))
        self.assertEqual(len(list(self.storage.iterdir())),1)

    def test_institution_aggregates_distinct_users_and_rollback_preserves_files(self):
        self.assertEqual(self.upload(pdf=self.small,cookie=self.a)[0],201)
        self.assertEqual(self.upload(pdf=self.small,cookie=self.b)[0],201)
        before=sorted(p.name for p in self.storage.iterdir())
        status,error,_=self.upload(pdf=self.small,cookie=self.admin)
        self.assertEqual((status,error["error"]["code"]),(429,"storage_institution_limit"))
        self.assertEqual(sorted(p.name for p in self.storage.iterdir()),before)
        with closing(sqlite3.connect(self.db)) as db:self.assertEqual(db.execute("SELECT sum(byte_size),count(*) FROM source_documents").fetchone(),(2*len(self.small),2))

    def test_legacy_hash_conference_preserves_source_and_records_real_size(self):
        status,doc,_=self.upload(pdf=self.small);self.assertEqual(status,201)
        with closing(sqlite3.connect(self.db)) as db,db:db.execute("UPDATE source_documents SET byte_size=NULL WHERE id=?",(doc["id"],))
        before=(self.storage/f"{doc['id']}.pdf").read_bytes()
        self.assertEqual(self.upload(pdf=self.pdf,cookie=self.b)[0],201)
        with closing(sqlite3.connect(self.db)) as db:self.assertEqual(db.execute("SELECT byte_size FROM source_documents WHERE id=?",(doc["id"],)).fetchone()[0],len(self.small))
        self.assertEqual((self.storage/f"{doc['id']}.pdf").read_bytes(),before)

    def test_unknown_corrupt_source_blocks_new_upload_instead_of_ignoring_it(self):
        status,doc,_=self.upload(pdf=self.small);self.assertEqual(status,201)
        path=self.storage/f"{doc['id']}.pdf";path.write_bytes(b"synthetic corruption")
        with closing(sqlite3.connect(self.db)) as db,db:db.execute("UPDATE source_documents SET byte_size=NULL WHERE id=?",(doc["id"],))
        status,error,_=self.upload(cookie=self.b)
        self.assertEqual((status,error["error"]["code"]),(503,"storage_accounting_required"))
        self.assertEqual(path.read_bytes(),b"synthetic corruption")
        with closing(sqlite3.connect(self.db)) as db:self.assertEqual(db.execute("SELECT count(*) FROM source_documents").fetchone()[0],1)

def load_tests(loader,tests,pattern):return unittest.TestSuite(UploadStorageTests(name) for name in UploadStorageTests.__dict__ if name.startswith('test_'))
if __name__=='__main__':unittest.main()
