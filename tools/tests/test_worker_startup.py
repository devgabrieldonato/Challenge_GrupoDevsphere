"""Inicialização do worker não cria banco nem processa fila sem schema pronto."""

from contextlib import closing
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
BINARY = Path(
    os.environ.get("DEVSPHERE_TEST_API_BIN", "/private/tmp/pv-next-build/devsphere-api")
)


class WorkerStartupTests(unittest.TestCase):
    def check(self, path):
        return subprocess.run(
            [sys.executable, "-m", "worker.run", "--db", str(path), "--check"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=15,
        )

    def test_missing_database_is_not_created(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "missing.db"
            result = self.check(path)
            self.assertEqual(result.returncode, 2)
            self.assertFalse(path.exists())
            self.assertNotIn("Traceback", result.stderr)

    def test_old_database_has_clear_error_and_preserves_rows(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "old.db"
            with closing(sqlite3.connect(path)) as db, db:
                db.execute("CREATE TABLE sentinel(value TEXT)")
                db.execute("INSERT INTO sentinel VALUES('preservado')")
            result = self.check(path)
            self.assertEqual(result.returncode, 2)
            self.assertIn("--migrate", result.stderr)
            self.assertIn("source_documents", result.stderr)
            self.assertNotIn("Traceback", result.stderr)
            with closing(sqlite3.connect(path)) as db:
                self.assertEqual(
                    db.execute("SELECT value FROM sentinel").fetchone()[0], "preservado"
                )
                self.assertIsNone(
                    db.execute(
                        "SELECT name FROM sqlite_master WHERE name='source_documents'"
                    ).fetchone()
                )

    @unittest.skipUnless(
        BINARY.is_file(), "Compile a API para testar migrations atuais"
    )
    def test_current_schema_check_does_not_consume_job(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "current.db"
            env = dict(
                os.environ,
                DEVSPHERE_DB_PATH=str(path),
                DEVSPHERE_MIGRATIONS_DIR=str(ROOT / "backend/migrations"),
                DEVSPHERE_CASE_SEED=str(ROOT / "backend/seeds/legacy-cases.json"),
            )
            subprocess.run(
                [str(BINARY), "--migrate"],
                cwd=ROOT,
                env=env,
                stdout=subprocess.DEVNULL,
                check=True,
                timeout=30,
            )
            with closing(sqlite3.connect(path)) as db, db:
                db.execute(
                    "INSERT INTO users(id,full_name,email,password_hash,role) VALUES(1,'Teste sintético','synthetic@test.local','not-a-login','student')"
                )
                db.execute(
                    "INSERT INTO source_documents(id,owner_id,storage_path,original_name,sha256,authorized_use,deidentified) VALUES('doc',1,'not-read.pdf','fixture.pdf','synthetic',1,1)"
                )
                db.execute(
                    "INSERT INTO worker_jobs(id,owner_id,document_id,operation,idempotency_key) VALUES('job',1,'doc','convert','startup-test')"
                )
            result = self.check(path)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("Nenhum trabalho processado", result.stdout)
            with closing(sqlite3.connect(path)) as db:
                self.assertEqual(
                    db.execute(
                        "SELECT status FROM worker_jobs WHERE id='job'"
                    ).fetchone()[0],
                    "queued",
                )


if __name__ == "__main__":
    unittest.main()
