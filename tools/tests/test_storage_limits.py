"""Quota C++ real com SQLite/arquivos pequenos isolados; não consome espaço real."""
from __future__ import annotations
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
BUILD = Path(os.environ.get("DEVSPHERE_TEST_API_BIN", "/private/tmp/pv-protected-build/devsphere-api")).parent
HARNESS = r"""
#include "storage_limits.hpp"
#include <iostream>
#include <thread>
#include <chrono>
int main(int argc,char**argv) {
 sqlite3*db{};sqlite3_open(argv[1],&db);sqlite3_busy_timeout(db,5000);
 try {
  const std::string op=argv[5];
  if(op!="no-transaction" && op!="snapshot") {
   if(sqlite3_exec(db,"BEGIN IMMEDIATE",nullptr,nullptr,nullptr)!=SQLITE_OK) return 3;
  }
  if(op!="snapshot") devsphere::requireStorageAdmission(db,std::stoll(argv[2]),std::stoull(argv[3]),argv[4]);
  if(op=="insert") {
   std::this_thread::sleep_for(std::chrono::milliseconds(100));
   sqlite3_stmt*q{};
   sqlite3_prepare_v2(db,"INSERT INTO source_documents VALUES(lower(hex(randomblob(16))),?,'unused','unused','uploaded',?)",-1,&q,nullptr);
   sqlite3_bind_int64(q,1,std::stoll(argv[2]));sqlite3_bind_int64(q,2,std::stoll(argv[3]));
   if(sqlite3_step(q)!=SQLITE_DONE)return 4;sqlite3_finalize(q);
  }
  auto s=devsphere::storageSnapshot(db,std::stoll(argv[2]),argv[4]);
  std::cout<<"{\"code\":\"ok\",\"used\":"<<s.userUsedBytes<<",\"institution\":"<<s.institutionUsedBytes<<",\"unknown\":"<<s.unknownSizes<<",\"available\":"<<s.availableBytes<<"}";
  if(op=="rollback")sqlite3_exec(db,"ROLLBACK",nullptr,nullptr,nullptr);
  else if(op!="snapshot"&&op!="no-transaction")sqlite3_exec(db,"COMMIT",nullptr,nullptr,nullptr);
 }catch(const devsphere::StorageLimitError&e){
  sqlite3_exec(db,"ROLLBACK",nullptr,nullptr,nullptr);
  std::cout<<"{\"code\":\""<<e.code<<"\",\"status\":"<<e.status<<"}";
 }sqlite3_close(db);
}
"""

@unittest.skipUnless((BUILD / "libdevsphere_core.a").is_file(), "Compile a API e defina DEVSPHERE_TEST_API_BIN")
class StorageLimitsTests(unittest.TestCase):
    """Executa o helper real sem hooks de ambiente para simular disco em produção."""
    @classmethod
    def setUpClass(cls):
        cls.compilation = tempfile.TemporaryDirectory(prefix="pv-storage-helper-")
        cls.harness = Path(cls.compilation.name)/"admission"
        source = cls.harness.with_suffix(".cpp")
        source.write_text(HARNESS,encoding="utf-8")
        command=["c++","-std=c++20","-I",str(ROOT/"backend/include"),str(source),str(ROOT/"backend/src/storage_limits.cpp"),str(BUILD/"libdevsphere_core.a"),str(BUILD/"libargon2.a"),"-lsqlite3","-o",str(cls.harness)]
        command += ["-framework","Security"] if sys.platform=="darwin" else ["-lcrypto","-pthread"]
        subprocess.run(command,check=True,capture_output=True,timeout=90)

    @classmethod
    def tearDownClass(cls): cls.compilation.cleanup()

    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix="pv-storage-limits-")
        self.root=Path(self.tmp.name)/"sources"
        self.root.mkdir(mode=0o700)
        self.db=Path(self.tmp.name)/"isolated.db"
        with closing(sqlite3.connect(self.db)) as db, db:
            db.executescript("CREATE TABLE users(id INTEGER PRIMARY KEY,institution_id TEXT); INSERT INTO users VALUES(1,'a'),(2,'a'),(3,'b'); CREATE TABLE source_documents(id TEXT PRIMARY KEY,owner_id INTEGER,storage_path TEXT,sha256 TEXT,status TEXT,byte_size INTEGER CHECK(byte_size IS NULL OR byte_size>=0));")
        self.env=dict(os.environ,DEVSPHERE_STORAGE_USER_BYTES="1000",DEVSPHERE_STORAGE_INSTITUTION_BYTES="2000",DEVSPHERE_STORAGE_MIN_FREE_BYTES="1")

    def tearDown(self): self.tmp.cleanup()

    def invoke(self,uid=1,size=100,operation="admit",env=None):
        result=subprocess.run([str(self.harness),str(self.db),str(uid),str(size),str(self.root),operation],env=env or self.env,check=True,capture_output=True,text=True,timeout=15)
        return json.loads(result.stdout)

    def source(self,uid=1,known=None,content=b"%PDF-1.4\nsynthetic\n%%EOF",status="uploaded"):
        identifier=secrets.token_hex(16);path=self.root/f"{identifier}.pdf"
        path.write_bytes(content)
        with closing(sqlite3.connect(self.db)) as db, db:
            db.execute("INSERT INTO source_documents VALUES(?,?,?,?,?,?)",(identifier,uid,str(path.absolute()),hashlib.sha256(content).hexdigest(),status,known))
        return identifier,path

    def test_defaults_and_positive_limits_enforced(self):
        self.assertEqual(self.invoke()["code"],"ok")
        for value in ("", "0","-1","abc","1.5"," 20","999999999999999999999"):
            with self.subTest(value=value):
                env=dict(self.env,DEVSPHERE_STORAGE_USER_BYTES=value)
                self.assertEqual(self.invoke(env=env)["code"],"invalid_storage_configuration")

    def test_owner_and_institution_quotas_include_withdrawn(self):
        self.source(known=950,status="withdrawn")
        self.assertEqual(self.invoke()["code"],"storage_user_limit")
        self.assertEqual(self.invoke(uid=2)["code"],"ok")
        self.source(uid=2,known=1000)
        self.assertEqual(self.invoke(uid=2)["code"],"storage_user_limit")
        env=dict(self.env,DEVSPHERE_STORAGE_USER_BYTES="4000")
        self.assertEqual(self.invoke(uid=2,env=env)["code"],"storage_institution_limit")
        self.assertEqual(self.invoke(uid=3)["code"],"ok")

    def test_legacy_integrity_measurement_and_rollback(self):
        identifier,path=self.source()
        self.assertEqual(self.invoke(operation="snapshot")["unknown"],1)
        self.assertEqual(self.invoke(operation="rollback")["unknown"],0)
        with closing(sqlite3.connect(self.db)) as db, db:
            self.assertIsNone(db.execute("SELECT byte_size FROM source_documents WHERE id=?",(identifier,)).fetchone()[0])
        self.assertEqual(self.invoke()["used"],path.stat().st_size)
        with closing(sqlite3.connect(self.db)) as db, db:
            self.assertEqual(db.execute("SELECT byte_size FROM source_documents WHERE id=?",(identifier,)).fetchone()[0],path.stat().st_size)

    def test_missing_and_corrupt_legacy_block_without_mutation(self):
        for kind in ("missing","corrupt","symlink","hardlink","escape"):
            with self.subTest(kind=kind):
                identifier,path=self.source()
                content=path.read_bytes();outside=Path(self.tmp.name)/f"outside-{identifier}.pdf"
                outside.write_bytes(content)
                if kind=="missing":path.unlink()
                elif kind=="corrupt":path.write_bytes(b"modified")
                elif kind=="symlink":path.unlink();path.symlink_to(outside)
                elif kind=="hardlink":path.unlink();os.link(outside,path)
                else:
                    with closing(sqlite3.connect(self.db)) as db, db:db.execute("UPDATE source_documents SET storage_path=? WHERE id=?",(str(outside),identifier))
                self.assertEqual(self.invoke()["code"],"storage_accounting_required")
                with closing(sqlite3.connect(self.db)) as db, db:
                    self.assertIsNone(db.execute("SELECT byte_size FROM source_documents WHERE id=?",(identifier,)).fetchone()[0])
                    db.execute("DELETE FROM source_documents WHERE id=?",(identifier,))

    def test_other_institution_unknown_is_not_opened_or_counted(self):
        _,path=self.source(uid=3);path.unlink()
        self.assertEqual(self.invoke()["code"],"ok")
        self.assertEqual(self.invoke(uid=3)["code"],"storage_accounting_required")

    def test_low_disk_reserve_without_consuming_disk(self):
        env=dict(self.env,DEVSPHERE_STORAGE_MIN_FREE_BYTES=str(1024**4))
        state=self.invoke(operation="snapshot",env=env)
        if state["available"]>=1024**4: self.skipTest("Fixture de reserva requer menos de 1 TiB livre")
        self.assertEqual(self.invoke(env=env)["code"],"storage_disk_reserve")
        self.assertEqual(list(self.root.iterdir()),[])

    def test_transaction_and_actual_size_required(self):
        self.assertEqual(self.invoke(operation="no-transaction")["code"],"storage_transaction_required")
        self.assertEqual(self.invoke(size=0)["code"],"invalid_pdf_size")
        self.assertEqual(self.invoke(size=10*1024**2+1)["code"],"invalid_pdf_size")

    def test_concurrent_admission_serializes_count_and_insert(self):
        env=dict(self.env,DEVSPHERE_STORAGE_USER_BYTES="150")
        with ThreadPoolExecutor(max_workers=2) as pool:
            results=list(pool.map(lambda _:self.invoke(operation="insert",env=env),range(2)))
        self.assertEqual(sorted(item["code"] for item in results),["ok","storage_user_limit"])
        with closing(sqlite3.connect(self.db)) as db, db:self.assertEqual(db.execute("SELECT sum(byte_size),count(*) FROM source_documents").fetchone(),(100,1))

    def test_bounded_legacy_batch_fails_without_partial_accounting(self):
        for _ in range(129): self.source()
        self.assertEqual(self.invoke()["code"],"storage_accounting_required")
        with closing(sqlite3.connect(self.db)) as db, db:
            self.assertEqual(db.execute("SELECT count(*) FROM source_documents WHERE byte_size IS NULL").fetchone()[0],129)

    def test_migration_keeps_legacy_unknown(self):
        with closing(sqlite3.connect(":memory:")) as db, db:
            db.executescript("CREATE TABLE source_documents(id TEXT);INSERT INTO source_documents VALUES('legacy');")
            db.executescript((ROOT/"backend/migrations/017_storage_bytes.sql").read_text())
            self.assertIsNone(db.execute("SELECT byte_size FROM source_documents").fetchone()[0])
            with self.assertRaises(sqlite3.IntegrityError):db.execute("UPDATE source_documents SET byte_size=-1")

if __name__=="__main__":unittest.main()
