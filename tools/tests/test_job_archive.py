"""Arquivamento HTTP de trabalhos sintéticos sem excluir fontes ou usar modelos.

A API usa porta e SQLite temporários herdados da fixture. Os resultados de IA
inseridos diretamente são somente fixtures identificadas, nunca gerações reais.
"""
from __future__ import annotations

from contextlib import closing
import json
import os
import secrets
import sqlite3
import unittest
from unittest.mock import patch

from test_next_http import NextHttpTests


class JobArchiveTests(NextHttpTests):
    """Remover da listagem é reversível e não altera o histórico autoritativo."""

    @classmethod
    def setUpClass(cls):
        # Nem o modo protegido nem este teste iniciam worker ou provedor local.
        with patch.dict(os.environ, {"DEVSPHERE_INFERENCE_ENABLED": "0"}):
            super().setUpClass()

    def job(self, document, status="completed", *, contribution=None, operation="convert"):
        """Cria estado terminal/controlado somente no banco descartável do teste."""
        identifier = secrets.token_hex(16)
        with closing(sqlite3.connect(self.db)) as db, db:
            db.execute(
                "INSERT INTO worker_jobs(id,owner_id,document_id,operation,status,"
                "request_json,result_json,error_json,idempotency_key,attempts,"
                "next_attempt_at,contribution_id) VALUES(?,?,?,?,?,?,?,?,?,1,17,?)",
                (
                    identifier, self.ids["a@test.local"], document, operation, status,
                    json.dumps({"fixture": True, "pages": [1]}),
                    json.dumps({"fixture": True, "markdown": "Texto sintético"}),
                    json.dumps({"code": "fixture_transient", "message": "Falha sintética"}) if status == "failed" else None,
                    secrets.token_hex(16), contribution,
                ),
            )
        return identifier

    def row(self, table, identifier):
        """Snapshot completo permite detectar perda de resultados e vínculos."""
        self.assertIn(table, ("worker_jobs", "source_documents", "case_versions"))
        with closing(sqlite3.connect(self.db)) as db:
            db.row_factory = sqlite3.Row
            return dict(db.execute(f"SELECT * FROM {table} WHERE id=?", (identifier,)).fetchone())

    def archive(self, identifier, cookie=None):
        return self.request("POST", f"/api/v1/jobs/{identifier}/archive", {}, cookie=cookie or self.a)

    def audit_count(self, identifier, action):
        with closing(sqlite3.connect(self.db)) as db:
            return db.execute(
                "SELECT count(*) FROM audit_logs WHERE action=? AND json_extract(metadata_json,'$.id')=?",
                (action, identifier),
            ).fetchone()[0]

    def test_every_terminal_state_archives_and_restores_idempotently(self):
        document = self.document()
        for state in ("completed", "failed", "cancelled"):
            with self.subTest(state=state):
                identifier = self.job(document, state)
                original = self.row("worker_jobs", identifier)
                for _ in range(2):
                    status, result, _ = self.archive(identifier)
                    self.assertEqual(status, 200, result)
                archived = self.row("worker_jobs", identifier)
                self.assertIsNotNone(archived["archived_at"])
                # Apenas metadados de apresentação podem mudar, sem reiniciar trabalho.
                for key in original.keys() - {"archived_at", "updated_at"}:
                    self.assertEqual(archived[key], original[key], key)
                self.assertEqual(self.audit_count(identifier, "job_archived"), 1)
                listed = self.request("GET", "/api/v1/jobs", cookie=self.a)[1]
                entry = next(row for row in listed if row["id"] == identifier)
                self.assertEqual(entry["archivedAt"], archived["archived_at"])
                self.assertEqual(entry["status"], state)
                # Um reenvio de restauração não fabrica novos eventos de auditoria.
                for _ in range(2):
                    status, result, _ = self.request("POST", f"/api/v1/jobs/{identifier}/restore", {}, cookie=self.a)
                    self.assertEqual(status, 200, result)
                restored = self.row("worker_jobs", identifier)
                self.assertIsNone(restored["archived_at"])
                for key in original.keys() - {"updated_at"}:
                    self.assertEqual(restored[key], original[key], key)
                self.assertEqual(self.audit_count(identifier, "job_restored"), 1)

    def test_active_work_must_be_cancelled_before_archiving(self):
        document = self.document()
        for state in ("queued", "running"):
            with self.subTest(state=state):
                identifier = self.job(document, state)
                before = self.row("worker_jobs", identifier)
                status, result, _ = self.archive(identifier)
                self.assertEqual((status, result["error"]["code"]), (409, "job_active"))
                self.assertEqual(self.row("worker_jobs", identifier), before)
                self.assertEqual(self.audit_count(identifier, "job_archived"), 0)
                # Encerramento é feito apenas na fixture: não há worker real no teste.
                with closing(sqlite3.connect(self.db)) as db, db:
                    db.execute("UPDATE worker_jobs SET status='cancelled' WHERE id=?", (identifier,))
                self.assertEqual(self.archive(identifier)[0], 200)

    def test_owner_session_and_csrf_are_required_even_for_admin(self):
        identifier = self.job(self.document())
        for action in ("archive", "restore"):
            route = f"/api/v1/jobs/{identifier}/{action}"
            self.assertIn(self.request("POST", route, {})[0], (401, 403))
            for cookie in (self.b, self.teacher, self.admin):
                self.assertEqual(self.request("POST", route, {}, cookie=cookie)[0], 404)
            self.assertEqual(self.request("POST", route, {}, cookie=self.a, guard=False)[0], 403)
        self.assertIsNone(self.row("worker_jobs", identifier)["archived_at"])
        self.assertEqual(self.request("POST", f"/api/v1/jobs/{secrets.token_hex(16)}/archive", {}, cookie=self.a)[0], 404)

    def test_source_markdown_file_and_materialized_contribution_survive(self):
        document = self.document()
        with closing(sqlite3.connect(self.db)) as db, db:
            db.execute("UPDATE source_documents SET status='converted',markdown=? WHERE id=?", ("## Página 1\nConteúdo sintético 100 mg/dL.", document))
            case = db.execute("INSERT INTO clinical_cases(stable_key,title,author_id) VALUES(?,'Rascunho sintético',?)", (secrets.token_hex(12), self.ids["a@test.local"])).lastrowid
            version = db.execute("INSERT INTO case_versions(clinical_case_id,version_number,content_json,created_by) VALUES(?,1,?,?)", (case, json.dumps({"fixture": True}), self.ids["a@test.local"])).lastrowid
            db.execute("INSERT INTO version_sources(version_id,document_id,source_hash) VALUES(?,?,'fixture-hash')", (version, document))
        identifier = self.job(document, contribution=version)
        source_before = self.row("source_documents", document)
        version_before = self.row("case_versions", version)
        content_before = (self.storage / f"{document}.pdf").read_bytes()
        self.assertEqual(self.archive(identifier)[0], 200)
        self.assertEqual(self.row("source_documents", document), source_before)
        self.assertEqual(self.row("case_versions", version), version_before)
        self.assertEqual((self.storage / f"{document}.pdf").read_bytes(), content_before)
        with closing(sqlite3.connect(self.db)) as db:
            self.assertEqual(db.execute("SELECT count(*) FROM version_sources WHERE version_id=? AND document_id=?", (version, document)).fetchone()[0], 1)
        # Fonte permanece utilizável em nova solicitação; arquivo anterior não é refeito.
        status, result, _ = self.request("POST", f"/api/v1/documents/{document}/jobs", {"operation": "convert", "idempotencyKey": secrets.token_hex(12)}, cookie=self.a)
        self.assertEqual(status, 202, result)
        self.assertNotEqual(result["id"], identifier)
        self.request("POST", f"/api/v1/jobs/{result['id']}/cancel", {}, cookie=self.a)

    def test_archived_retry_cannot_reset_attempts_or_queue_the_job(self):
        identifier = self.job(self.document(), "failed")
        self.assertEqual(self.archive(identifier)[0], 200)
        before = self.row("worker_jobs", identifier)
        status, result, _ = self.request("POST", f"/api/v1/jobs/{identifier}/retry", {}, cookie=self.a)
        self.assertEqual((status, result["error"]["code"]), (409, "job_archived"))
        self.assertEqual(self.row("worker_jobs", identifier), before)
        self.assertEqual(self.audit_count(identifier, "job_retry_queued"), 0)

    def test_archived_history_does_not_hide_visible_jobs_after_list_limit(self):
        # Mais de cem resultados antigos não devem deslocar o trabalho visível.
        actor, cookie, document = self.quota_actor()
        visible = secrets.token_hex(16)
        with closing(sqlite3.connect(self.db)) as db, db:
            for _ in range(105):
                archived = secrets.token_hex(16)
                db.execute(
                    "INSERT INTO worker_jobs(id,owner_id,document_id,operation,status,"
                    "idempotency_key,archived_at) VALUES(?,?,?,'convert','completed',?,CURRENT_TIMESTAMP)",
                    (archived, actor, document, archived),
                )
            db.execute(
                "INSERT INTO worker_jobs(id,owner_id,document_id,operation,status,"
                "idempotency_key,created_at) VALUES(?,?,?,'convert','completed',?,datetime('now','-2 hours'))",
                (visible, actor, document, visible),
            )
        status, rows, _ = self.request("GET", "/api/v1/jobs", cookie=cookie)
        self.assertEqual(status, 200)
        self.assertEqual(len(rows), 100)
        self.assertEqual(rows[0]["id"], visible)
        self.assertIsNone(rows[0]["archivedAt"])
        self.assertTrue(all(row["archivedAt"] for row in rows[1:]))
        self.assertNotIn(visible, {row["id"] for row in self.request("GET", "/api/v1/jobs", cookie=self.b)[1]})

    def test_archiving_does_not_refund_creation_quota(self):
        # Conta exclusiva isola consumo de quota e preserva todos os registros aceitos.
        actor, cookie, document = self.quota_actor()
        for _ in range(12):
            status, result, _ = self.request("POST", f"/api/v1/documents/{document}/jobs", {"operation": "convert", "idempotencyKey": secrets.token_hex(12)}, cookie=cookie)
            self.assertEqual(status, 202, result)
            identifier = result["id"]
            self.assertEqual(self.request("POST", f"/api/v1/jobs/{identifier}/cancel", {}, cookie=cookie)[0], 200)
            self.assertEqual(self.archive(identifier, cookie)[0], 200)
        status, result, _ = self.request("POST", f"/api/v1/documents/{document}/jobs", {"operation": "convert", "idempotencyKey": secrets.token_hex(12)}, cookie=cookie)
        self.assertEqual((status, result["error"]["code"]), (429, "job_request_limit"))
        with closing(sqlite3.connect(self.db)) as db:
            self.assertEqual(db.execute("SELECT count(*) FROM worker_jobs WHERE owner_id=? AND archived_at IS NOT NULL", (actor,)).fetchone()[0], 12)


def load_tests(loader, tests, pattern):
    """Executa apenas os casos desta extensão, sem repetir toda a classe herdada."""
    return unittest.TestSuite(JobArchiveTests(name) for name in JobArchiveTests.__dict__ if name.startswith("test_"))


if __name__ == "__main__":
    unittest.main()
