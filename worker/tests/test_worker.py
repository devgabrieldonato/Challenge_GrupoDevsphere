"""Fixtures sintéticas: nenhuma aprovação clínica é inferida destes testes."""

import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from worker.core import JobError, Ollama, private_file, safe_text
from worker.run import claim, finish, retrieve, index_document, sync_library


class WorkerTests(unittest.TestCase):
    """Verifica recuperação, autorização da busca e isolamento de caminhos."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.executescript(
            "CREATE TABLE users(id INTEGER PRIMARY KEY,institution_id TEXT DEFAULT 'local'); INSERT INTO users(id) VALUES(1),(2);"
            + (
                Path(__file__).resolve().parents[2]
                / "backend/migrations/008_pipeline.sql"
            ).read_text()
            + (
                Path(__file__).resolve().parents[2]
                / "backend/migrations/012_library_index.sql"
            ).read_text()
        )
        self.db.execute(
            "INSERT INTO source_documents(id,owner_id,storage_path,original_name,sha256,authorized_use,deidentified) VALUES('doc',1,'safe.pdf','teste.pdf','abc',1,1)"
        )
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def job(self, key="j"):
        self.db.execute(
            "INSERT INTO worker_jobs(id,owner_id,document_id,operation,idempotency_key) VALUES(?,1,'doc','convert',?)",
            (key, key),
        )
        self.db.commit()

    def test_claim_and_expired_lease(self):
        self.job()
        self.assertEqual(claim(self.db, 100)["id"], "j")
        self.assertIsNone(claim(self.db, 101))
        self.assertEqual(claim(self.db, 2101)["id"], "j")
        self.assertIsNone(claim(self.db, 4102))
        self.assertEqual(
            self.db.execute("SELECT status FROM worker_jobs").fetchone()[0], "failed"
        )

    def test_cancelled_job_never_exposes_output(self):
        self.job()
        job = claim(self.db)
        self.db.execute("UPDATE worker_jobs SET cancel_requested=1")
        self.db.commit()
        finish(
            self.db,
            job,
            {"status": "completed", "markdown": "secret", "pages": [], "warnings": []},
        )
        row = self.db.execute("SELECT status,result_json FROM worker_jobs").fetchone()
        self.assertEqual(tuple(row), ("cancelled", None))

    def test_source_withdrawal_cancels_result(self):
        self.job()
        job = claim(self.db)
        self.db.execute("UPDATE source_documents SET status='withdrawn'")
        self.db.commit()
        finish(
            self.db,
            job,
            {"status": "completed", "markdown": "secret", "pages": [], "warnings": []},
        )
        self.assertEqual(
            self.db.execute("SELECT status FROM worker_jobs").fetchone()[0], "cancelled"
        )

    def test_rag_filters_before_retrieval_and_after_withdrawal(self):
        self.db.execute(
            "UPDATE source_documents SET status='approved',markdown='## Página 2\n\nEvidência sintética de investigação educacional',pages_json=?",
            (
                json.dumps(
                    [
                        {
                            "page": 2,
                            "text": "Evidência sintética de investigação educacional",
                        }
                    ]
                ),
            ),
        )
        index_document(self.db, "doc")
        self.db.commit()
        self.assertEqual(len(retrieve(self.db, 1, "investigação")), 1)
        self.assertEqual(retrieve(self.db, 2, "investigação"), [])
        self.db.execute("INSERT INTO document_grants VALUES('doc',2)")
        self.assertEqual(len(retrieve(self.db, 2, "investigação")), 1)
        self.db.execute("UPDATE users SET institution_id='other' WHERE id=2")
        self.assertEqual(retrieve(self.db, 2, "investigação"), [])
        self.db.execute("UPDATE source_documents SET status='withdrawn'")
        self.assertEqual(retrieve(self.db, 1, "investigação"), [])

    def test_retry_limit_and_error_only(self):
        self.job()
        job = claim(self.db)
        finish(
            self.db,
            job,
            {
                "status": "failed",
                "error": {
                    "code": "missing_dependency",
                    "message": "Instale dependência.",
                    "retryable": True,
                },
            },
        )
        row = self.db.execute(
            "SELECT status,error_json,result_json FROM worker_jobs"
        ).fetchone()
        self.assertEqual(row["status"], "queued")
        self.assertIsNone(row["result_json"])

    def test_idempotency(self):
        self.job()
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO worker_jobs(id,owner_id,document_id,operation,idempotency_key) VALUES('other',1,'doc','convert','j')"
            )

    def test_paths_and_html(self):
        root = Path(self.tmp.name)
        inside = root / "file.pdf"
        inside.write_bytes(b"%PDF-test")
        self.assertEqual(private_file(inside, root), inside.resolve())
        link = root / "link.pdf"
        link.symlink_to(inside)
        with self.assertRaises(JobError):
            private_file(link, root)
        with self.assertRaises(JobError):
            private_file(Path(__file__), root)
        self.assertEqual(safe_text("<script>"), "&lt;script&gt;")

    def test_provider_rejects_remote(self):
        for url in [
            "https://example.org",
            "http://evil.test:11434",
            "http://localhost@evil.test",
            "http://127.0.0.1:11434/x",
        ]:
            with self.assertRaises(JobError):
                Ollama(url)


if __name__ == "__main__":
    unittest.main()
