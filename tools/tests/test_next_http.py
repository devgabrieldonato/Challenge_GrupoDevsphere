"""Integração HTTP NEXT_2026 com base, usuários e PDFs sintéticos descartáveis.

Executar com Python contendo reportlab. Nunca conecta à API pessoal na porta 8080.
DEVSPHERE_TEST_API_BIN permite selecionar o binário compilado para a verificação.
"""

from __future__ import annotations
import base64
import hashlib
import hmac
import http.client
import io
import json
import os
from pathlib import Path
import secrets
import socket
from contextlib import closing
import sqlite3
import struct
import subprocess
import sys
import tempfile
import time
import unittest
import uuid
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[2]
BINARY = Path(
    os.environ.get("DEVSPHERE_TEST_API_BIN", "/private/tmp/pv-next-build/devsphere-api")
)


def totp(secret, timestamp=None):
    """Implementação independente RFC 6238 para testar o verificador C++."""
    counter = int(time.time() if timestamp is None else timestamp) // 30
    digest = hmac.new(
        base64.b32decode(secret), struct.pack(">Q", counter), hashlib.sha1
    ).digest()
    offset = digest[-1] & 15
    return f"{(struct.unpack('>I',digest[offset:offset+4])[0]&0x7fffffff)%1000000:06d}"


def fixture_pdf():
    """Gera documento sem informações clínicas pessoais."""
    try:
        from reportlab.pdfgen import canvas
    except ImportError:
        raise unittest.SkipTest("reportlab necessário para fixture PDF sintética")
    output = io.BytesIO()
    pdf = canvas.Canvas(output)
    pdf.drawString(
        35, 700, "Material sintetico: temperatura 37.2 C; glicemia 100 mg/dL."
    )
    pdf.save()
    return output.getvalue()


@unittest.skipUnless(BINARY.is_file(), "Compile a API ou defina DEVSPHERE_TEST_API_BIN")
class NextHttpTests(unittest.TestCase):
    """Confere API real: autenticação, isolamento, fila e arquivos protegidos."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(prefix="pv-next-http-")
        cls.directory = Path(cls.tmp.name)
        cls.db = cls.directory / "test.db"
        cls.storage = cls.directory / "sources"
        cls.password = secrets.token_urlsafe(24)
        cls.secret = base64.b32encode(secrets.token_bytes(20)).decode()
        cls.recovery = secrets.token_urlsafe(32)
        cls.env = dict(
            os.environ,
            DEVSPHERE_DB_PATH=str(cls.db),
            DEVSPHERE_SOURCE_DIR=str(cls.storage),
            DEVSPHERE_MIGRATIONS_DIR=str(ROOT / "backend/migrations"),
            DEVSPHERE_CASE_SEED=str(ROOT / "backend/seeds/legacy-cases.json"),
            DEVSPHERE_FRONTEND_DIR=str(ROOT / "frontend"),
            DEVSPHERE_HOST="127.0.0.1",
            DEVSPHERE_ENV="development",
            DEVSPHERE_SEED_PASSWORD=cls.password,
            # Fixture HTTP não inicia worker/modelos; permite testar contratos legados de fila.
            DEVSPHERE_INFERENCE_ENABLED=os.environ.get("DEVSPHERE_INFERENCE_ENABLED", "1"),
            DEVSPHERE_JOB_REQUEST_LIMIT="12",
            DEVSPHERE_JOB_WINDOW_SECONDS="3600",
            DEVSPHERE_JOB_INSTITUTION_PENDING_LIMIT="12",
            DEVSPHERE_JOB_GLOBAL_PENDING_LIMIT="24",
            DEVSPHERE_PYTHON=sys.executable,
        )
        # Somente comandos locais com base temporária; a senha nunca vai em argv.
        for args in [
            (
                "--create-admin",
                "Admin sintético",
                "admin@test.local",
                "admin@test.local",
            ),
            ("--create-user", "Aluno A", "a@test.local", "student"),
            ("--create-user", "Aluno B", "b@test.local", "student"),
            ("--create-user", "Docente teste", "teacher@test.local", "teacher"),
        ]:
            subprocess.run(
                [str(BINARY), *args],
                env=cls.env,
                cwd=ROOT,
                stdout=subprocess.DEVNULL,
                check=True,
                timeout=30,
            )
        with closing(sqlite3.connect(cls.db)) as db, db:
            cls.ids = {
                email: uid for uid, email in db.execute("SELECT id,email FROM users")
            }
            db.execute(
                "INSERT INTO reviewer_areas(user_id,area,enabled_by) VALUES(?, 'general', ?)",
                (cls.ids["teacher@test.local"], cls.ids["admin@test.local"]),
            )
        uid = cls.ids["admin@test.local"]
        cls.env[f"DEVSPHERE_MFA_SECRET_{uid}"] = cls.secret
        cls.env[f"DEVSPHERE_MFA_RECOVERY_{uid}"] = hashlib.sha256(
            cls.recovery.encode()
        ).hexdigest()
        cls.env.pop("DEVSPHERE_SEED_PASSWORD", None)
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            cls.port = sock.getsockname()[1]
        cls.env["DEVSPHERE_PORT"] = str(cls.port)
        cls.log = (cls.directory / "server.log").open("w+")
        cls.server = subprocess.Popen(
            [str(BINARY)], env=cls.env, cwd=ROOT, stdout=cls.log, stderr=cls.log
        )
        for _ in range(160):
            try:
                if cls.request("GET", "/api/v1/health")[0] == 200:
                    break
            except OSError:
                pass
            if cls.server.poll() is not None:
                cls.log.seek(0)
                raise RuntimeError("API teste encerrou: " + cls.log.read())
            time.sleep(0.05)
        else:
            raise RuntimeError("API teste não iniciou")
        cls.a = cls.login("a@test.local")
        cls.b = cls.login("b@test.local")
        cls.teacher = cls.login("teacher@test.local")
        cls.admin_code = totp(cls.secret)
        cls.admin = cls.login("admin@test.local", cls.admin_code)
        cls.pdf = fixture_pdf()

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, "server"):
            cls.server.terminate()
            try:
                cls.server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                cls.server.kill()
                cls.server.wait()
        if hasattr(cls, "log"):
            cls.log.close()
        if hasattr(cls, "tmp"):
            cls.tmp.cleanup()

    @classmethod
    def request(
        cls,
        method,
        path,
        body=None,
        cookie=None,
        headers=None,
        guard=True,
        origin="http://127.0.0.1:5501",
    ):
        """Cliente bruto permite tentar payloads que a interface não produziria."""
        request_headers = {"Origin": origin}
        if guard:
            request_headers["X-PV-Request"] = "1"
        if cookie:
            request_headers["Cookie"] = cookie
        if isinstance(body, dict):
            body = json.dumps(body).encode()
            request_headers["Content-Type"] = "application/json"
        request_headers.update(headers or {})
        client = http.client.HTTPConnection("127.0.0.1", cls.port, timeout=15)
        try:
            client.request(method, path, body=body, headers=request_headers)
            response = client.getresponse()
            payload = response.read()
            status = response.status
            result_headers = dict(response.getheaders())
            try:
                data = json.loads(payload)
            except (ValueError, UnicodeDecodeError):
                data = payload
            return status, data, result_headers
        finally:
            client.close()

    @classmethod
    def login(cls, email, otp=None):
        payload = {"email": email, "password": cls.password}
        if otp:
            payload["otp"] = otp
        status, body, headers = cls.request("POST", "/api/v1/auth/login", payload)
        if status != 200:
            raise AssertionError(f"Login fixture {email}: {status} {body}")
        return headers["Set-Cookie"].split(";", 1)[0]

    def upload(self, cookie=None, pdf=None, extra=None):
        """Formulário multipart real, inclusive declarações verificadas no backend."""
        boundary = "pv-fixture-" + secrets.token_hex(12)
        fields = {
            "authorized": "true",
            "deidentified": "true",
            "area": "general",
            **(extra or {}),
        }
        chunks = []
        for key, value in fields.items():
            chunks.append(
                f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode()
            )
        chunks.extend(
            [
                f'--{boundary}\r\nContent-Disposition: form-data; name="pdf"; filename="fixture.pdf"\r\nContent-Type: application/pdf\r\n\r\n'.encode(),
                self.pdf if pdf is None else pdf,
                f"\r\n--{boundary}--\r\n".encode(),
            ]
        )
        return self.request(
            "POST",
            "/api/v1/documents",
            b"".join(chunks),
            cookie=cookie or self.a,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        )

    def document(self):
        status, data, _ = self.upload()
        self.assertEqual(status, 201, data)
        return data["id"]

    def clinical_report(self):
        """Obtém percurso aceito do servidor e registra hipótese sintética."""
        status, session, _ = self.request(
            "POST", "/api/v1/clinical-sessions", {"caseKey": "joao"}, cookie=self.a
        )
        self.assertEqual(status, 201, session)
        status, session, _ = self.request(
            "POST",
            f"/api/v1/clinical-sessions/{session['id']}/hypotheses",
            {
                "hypothesis": session["hypotheses"][0],
                "justification": "Justificativa sintética de teste de integridade.",
            },
            cookie=self.a,
        )
        self.assertEqual(status, 200, session)
        return {
            **session,
            "schemaVersion": 2,
            "reportType": "patient-virtual-submission",
            "ruleSetVersion": "1.0.0",
        }

    def submit_report(self, report, activity=None):
        """Tenta enviar PDF e marcador arbitrários; servidor deve reconstruir o oficial."""
        raw = json.dumps(report, separators=(",", ":"), ensure_ascii=False)
        pdf = self.pdf + b"\n%PV_REPORT_V1:" + base64.b64encode(raw.encode()) + b"\n"
        boundary = "pv-report-" + secrets.token_hex(12)
        fields = {"clientSubmissionId": str(uuid.uuid4()), "report": raw}
        if activity is not None:
            fields["activityId"] = str(activity)
        chunks = []
        for key, value in fields.items():
            chunks.append(
                f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode()
            )
        chunks.extend(
            [
                f'--{boundary}\r\nContent-Disposition: form-data; name="pdf"; filename="fixture.pdf"\r\nContent-Type: application/pdf\r\n\r\n'.encode(),
                pdf,
                f"\r\n--{boundary}--\r\n".encode(),
            ]
        )
        return self.request(
            "POST",
            "/api/v1/submissions",
            b"".join(chunks),
            cookie=self.a,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        )

    def test_activity_cannot_be_injected_at_finalization(self):
        report = self.clinical_report()
        with closing(sqlite3.connect(self.db)) as db, db:
            cursor = db.execute(
                "INSERT INTO activities(title,case_version_id,teacher_id) VALUES('Atividade sintética',?,?)",
                (report["versionId"], self.ids["teacher@test.local"]),
            )
            activity = cursor.lastrowid
            db.execute(
                "INSERT INTO activity_assignments(activity_id,student_id) VALUES(?,?)",
                (activity, self.ids["a@test.local"]),
            )
            db.execute(
                "INSERT OR IGNORE INTO case_exposures(user_id,case_version_id,reason) VALUES(?,?,'source_seen_fixture')",
                (self.ids["a@test.local"], report["versionId"]),
            )
        status, data, _ = self.request(
            "POST",
            "/api/v1/clinical-sessions",
            {"caseKey": "joao", "activityId": activity},
            cookie=self.a,
        )
        self.assertEqual(status, 400, data)
        status, data, _ = self.submit_report(report, activity)
        self.assertEqual(status, 400, data)
        self.assertIn("atividade", data["error"]["message"])

    def test_submission_pdf_is_regenerated_and_score_is_authoritative(self):
        report = self.clinical_report()
        report.update(
            studentId=self.ids["b@test.local"],
            studentName="Nome forjado",
            source="forged",
            isTest=True,
            scoring={"gains": 999999, "losses": 999999, "events": [{"delta": 999999}]},
            scoreEvents=[{"delta": 999999}],
            score={"raw": 999999, "displayed": 999999},
        )
        status, data, _ = self.submit_report(report)
        self.assertEqual(status, 201, data)
        self.assertEqual(data["score"]["raw"], 50)
        status, pdf, _ = self.request(
            "GET", f"/api/v1/submissions/{data['id']}/pdf", cookie=self.a
        )
        self.assertEqual(status, 200)
        embedded = json.loads(
            base64.b64decode(pdf.rsplit(b"%PV_REPORT_V1:", 1)[1].strip())
        )
        self.assertEqual(embedded["studentId"], self.ids["a@test.local"])
        self.assertEqual(embedded["score"]["raw"], 50)
        self.assertNotEqual(embedded["studentName"], "Nome forjado")
        import jsonschema

        jsonschema.validate(
            embedded,
            json.loads(
                (ROOT / "docs/schemas/submission-report.schema.json").read_text()
            ),
        )
        self.assertFalse(embedded["isTest"])
        self.assertEqual(embedded["source"], "platform")
        self.assertEqual(embedded["scoreEvents"], [])
        self.assertEqual(embedded["scoring"]["gains"], 0)
        self.assertEqual(embedded["scoring"]["losses"], 0)
        self.assertEqual(
            self.request("GET", f"/api/v1/submissions/{data['id']}/pdf", cookie=self.b)[
                0
            ],
            404,
        )
        # Finalização com outra chave não produz segunda submissão.
        self.assertEqual(self.submit_report(report)[0], 400)

    def test_feedback_requires_current_submission_authorization(self):
        """Revalida vínculo e instituição após abrir um rascunho autorizado."""
        teacher_id = self.ids["teacher@test.local"]
        student_id = self.ids["a@test.local"]
        with closing(sqlite3.connect(self.db)) as db:
            original_institution = db.execute("SELECT institution_id FROM users WHERE id=?", (student_id,)).fetchone()[0]
            version_id = db.execute("SELECT id FROM case_versions LIMIT 1").fetchone()[0]
        for revoked in ("assignment", "institution"):
            # Cada revogação usa um rascunho novo, sem desligar os triggers imutáveis.
            with closing(sqlite3.connect(self.db)) as db, db:
                activity_id = db.execute(
                    "INSERT INTO activities(title,case_version_id,teacher_id) VALUES('Vínculo sintético revogável',?,?)",
                    (version_id, teacher_id),
                ).lastrowid
                submission_id = db.execute(
                    "INSERT INTO submissions(student_id,case_version_id,activity_id) VALUES(?,?,?)",
                    (student_id, version_id, activity_id),
                ).lastrowid
            status, feedback, _ = self.request(
                "POST", f"/api/v1/submissions/{submission_id}/feedback",
                {"strengths": "Rascunho sintético preservado."}, cookie=self.teacher,
            )
            self.assertEqual(status, 201, feedback)
            feedback_id = feedback["id"]
            try:
                with closing(sqlite3.connect(self.db)) as db, db:
                    if revoked == "assignment":
                        db.execute("UPDATE activities SET teacher_id=? WHERE id=?", (self.ids["admin@test.local"], activity_id))
                    else:
                        db.execute("UPDATE users SET institution_id='feedback-isolated-institution' WHERE id=?", (student_id,))
                    before = db.execute("SELECT * FROM teacher_feedback WHERE id=?", (feedback_id,)).fetchone()
                self.assertEqual(self.request("GET", f"/api/v1/submissions/{submission_id}", cookie=self.teacher)[0], 404)
                for method, suffix, payload in (("PUT", "", {"strengths": "Alteração indevida."}),
                                                 ("POST", "/complete", {})):
                    with self.subTest(revoked=revoked, method=method):
                        self.assertEqual(self.request(method, f"/api/v1/feedback/{feedback_id}{suffix}", payload, cookie=self.teacher)[0], 403)
                        with closing(sqlite3.connect(self.db)) as db:
                            self.assertEqual(db.execute("SELECT * FROM teacher_feedback WHERE id=?", (feedback_id,)).fetchone(), before)
            finally:
                with closing(sqlite3.connect(self.db)) as db, db:
                    db.execute("UPDATE users SET institution_id=? WHERE id=?", (original_institution, student_id))
                    db.execute("UPDATE activities SET teacher_id=? WHERE id=?", (teacher_id, activity_id))

    def test_feedback_post_preserves_draft_authorship_and_completed_content(self):
        """POST repetido só atualiza rascunho próprio; conflitos não alteram o registro."""
        with closing(sqlite3.connect(self.db)) as db, db:
            version_id = db.execute("SELECT id FROM case_versions LIMIT 1").fetchone()[0]
            submission_id = db.execute(
                "INSERT INTO submissions(student_id,case_version_id,reviewer_id) VALUES(?,?,?)",
                (self.ids["a@test.local"], version_id, self.ids["teacher@test.local"]),
            ).lastrowid
        path = f"/api/v1/submissions/{submission_id}/feedback"
        status, feedback, _ = self.request("POST", path, {"strengths": "Rascunho sintético original."}, cookie=self.teacher)
        self.assertEqual(status, 201, feedback)
        feedback_id = feedback["id"]
        status, updated, _ = self.request("POST", path, {"strengths": "Rascunho próprio atualizado."}, cookie=self.teacher)
        self.assertEqual(status, 201, updated)
        self.assertEqual(updated["id"], feedback_id)
        with closing(sqlite3.connect(self.db)) as db:
            self.assertEqual(db.execute("SELECT strengths FROM teacher_feedback WHERE id=?", (feedback_id,)).fetchone()[0],
                             "Rascunho próprio atualizado.")
        for state, actors in (("draft", (self.admin,)), ("completed", (self.teacher, self.admin))):
            if state == "completed":
                self.assertEqual(self.request("POST", f"/api/v1/feedback/{feedback_id}/complete", {}, cookie=self.teacher)[0], 200)
            with closing(sqlite3.connect(self.db)) as db:
                before = db.execute("SELECT * FROM teacher_feedback WHERE id=?", (feedback_id,)).fetchone()
            for actor in actors:
                with self.subTest(state=state, author=actor == self.teacher):
                    status, conflict, _ = self.request("POST", path, {"strengths": "Sobrescrita sintética indevida."}, cookie=actor)
                    self.assertEqual(status, 409, conflict)
                    self.assertEqual(conflict["error"]["code"], "feedback_conflict")
                    with closing(sqlite3.connect(self.db)) as db:
                        self.assertEqual(db.execute("SELECT * FROM teacher_feedback WHERE id=?", (feedback_id,)).fetchone(), before)
                        self.assertEqual(db.execute("SELECT COUNT(*) FROM teacher_feedback WHERE submission_id=?", (submission_id,)).fetchone()[0], 1)

    def test_feedback_edit_metadata_preserves_authorship(self):
        """Administrador consulta rascunho alheio sem assumir autoria de edição."""
        with closing(sqlite3.connect(self.db)) as db, db:
            version_id = db.execute("SELECT id FROM case_versions LIMIT 1").fetchone()[0]
            submission_id = db.execute(
                "INSERT INTO submissions(student_id,case_version_id,reviewer_id) VALUES(?,?,?)",
                (self.ids["a@test.local"], version_id, self.ids["teacher@test.local"]),
            ).lastrowid
        status, feedback, _ = self.request("POST", f"/api/v1/submissions/{submission_id}/feedback",
                                          {"strengths": "Autoria docente preservada."}, cookie=self.teacher)
        self.assertEqual(status, 201, feedback)
        feedback_id = feedback["id"]
        path = f"/api/v1/students/{self.ids['a@test.local']}/feedback"
        for actor, expected in ((self.teacher, True), (self.admin, False)):
            with self.subTest(canEdit=expected):
                status, listed, _ = self.request("GET", path, cookie=actor)
                self.assertEqual(status, 200, listed)
                visible = next(item for item in listed if item["id"] == feedback_id)
                self.assertIs(visible.get("canEdit"), expected)
        self.assertEqual(self.request("PUT", f"/api/v1/feedback/{feedback_id}",
                                      {"strengths": "Tentativa administrativa alheia."}, cookie=self.admin)[0], 404)
        self.assertEqual(self.request("POST", f"/api/v1/feedback/{feedback_id}/complete", {}, cookie=self.admin)[0], 404)
        self.assertEqual(self.request("POST", f"/api/v1/feedback/{feedback_id}/complete", {}, cookie=self.teacher)[0], 200)
        for actor in (self.teacher, self.admin, self.a):
            status, listed, _ = self.request("GET", path, cookie=actor)
            self.assertEqual(status, 200, listed)
            visible = next(item for item in listed if item["id"] == feedback_id)
            self.assertIs(visible.get("canEdit"), False)
            self.assertEqual(visible["strengths"], "Autoria docente preservada.")

    def test_admin_can_restore_feedback_only_within_institution(self):
        """Listar rascunhos permite retomada administrativa sem atravessar instituições."""
        status, submission, _ = self.submit_report(self.clinical_report())
        self.assertEqual(status, 201, submission)
        submission_id = submission["id"]
        status, feedback, _ = self.request("POST", f"/api/v1/submissions/{submission_id}/feedback",
                                          {"strengths": "Rascunho administrativo sintético."}, cookie=self.admin)
        self.assertEqual(status, 201, feedback)
        student_id = self.ids["a@test.local"]
        path = f"/api/v1/students/{student_id}/feedback"
        status, visible, _ = self.request("GET", path, cookie=self.admin)
        self.assertEqual(status, 200, visible)
        restored = next(item for item in visible if item["id"] == feedback["id"])
        self.assertEqual(restored["strengths"], "Rascunho administrativo sintético.")
        self.assertEqual(restored["status"], "draft")
        self.assertFalse(any(item["id"] == feedback["id"] for item in self.request("GET", path, cookie=self.a)[1]))
        with closing(sqlite3.connect(self.db)) as db, db:
            institution = db.execute("SELECT institution_id FROM users WHERE id=?", (student_id,)).fetchone()[0]
            db.execute("UPDATE users SET institution_id='feedback-other-institution' WHERE id=?", (student_id,))
        try:
            self.assertEqual(self.request("GET", path, cookie=self.admin)[0], 404)
            self.assertEqual(self.request("GET", f"/api/v1/submissions/{submission_id}", cookie=self.admin)[0], 404)
        finally:
            with closing(sqlite3.connect(self.db)) as db, db:
                db.execute("UPDATE users SET institution_id=? WHERE id=?", (institution, student_id))

    def test_upload_owner_is_session_and_cross_user_denied(self):
        status, data, _ = self.upload(
            extra={"ownerId": str(self.ids["b@test.local"]), "role": "admin"}
        )
        self.assertEqual(status, 201, data)
        doc = data["id"]
        status, data, _ = self.request("GET", f"/api/v1/documents/{doc}", cookie=self.a)
        self.assertEqual(status, 200, data)
        self.assertEqual(data["ownerId"], self.ids["a@test.local"])
        for path in (f"/api/v1/documents/{doc}", f"/api/v1/documents/{doc}/pdf"):
            self.assertEqual(self.request("GET", path, cookie=self.b)[0], 404)
        self.assertEqual(
            self.request(
                "POST",
                f"/api/v1/documents/{doc}/jobs",
                {"operation": "convert"},
                cookie=self.b,
            )[0],
            404,
        )

    def test_catalog_includes_patient_images_and_serves_public_pngs(self):
        """A tela inicia pelo catálogo; a imagem precisa existir nesse contrato."""
        status, catalog, _ = self.request("GET", "/api/v1/cases", cookie=self.a)
        self.assertEqual(status, 200, catalog)
        cases = {item["key"]: item for item in catalog}
        for key in ("joao", "marina"):
            with self.subTest(case=key):
                expected = f"/assets/images/{key}-atendimento.png"
                self.assertEqual(cases[key].get("image"), expected)
                detail = self.request("GET", f"/api/v1/cases/{key}/public", cookie=self.a)[1]
                self.assertEqual(detail["image"], expected)
                image_status, data, headers = self.request("GET", expected)
                self.assertEqual(image_status, 200)
                self.assertIn("image/png", headers.get("Content-Type", ""))
                self.assertTrue(data.startswith(b"\x89PNG\r\n\x1a\n"))

    def test_cross_institution_public_metadata_and_existing_grants_are_blocked(self):
        doc = self.document()
        with closing(sqlite3.connect(self.db)) as db, db:
            db.execute(
                "INSERT INTO document_grants(document_id,user_id) VALUES(?,?)",
                (doc, self.ids["b@test.local"]),
            )
            db.execute(
                "UPDATE source_documents SET status='approved',markdown='## Página 1\n\nInformação sintética glicemia' WHERE id=?",
                (doc,),
            )
            db.execute(
                "INSERT INTO library_chunks(document_id,page,text) VALUES(?,1,'glicemia sintética')",
                (doc,),
            )
            db.execute(
                "UPDATE users SET institution_id='other-test-institution' WHERE id=?",
                (self.ids["b@test.local"],),
            )
        try:
            status, data, _ = self.request("GET", "/api/v1/cases", cookie=self.b)
            self.assertEqual(status, 200, data)
            self.assertEqual(data, [])
            self.assertNotEqual(
                self.request("GET", "/api/v1/cases/joao/public", cookie=self.b)[0], 200
            )
            self.assertEqual(
                self.request("GET", f"/api/v1/documents/{doc}", cookie=self.b)[0], 404
            )
            self.assertEqual(
                self.request(
                    "POST",
                    "/api/v1/library/search",
                    {"query": "glicemia"},
                    cookie=self.b,
                )[1],
                [],
            )
        finally:
            with closing(sqlite3.connect(self.db)) as db, db:
                db.execute(
                    "UPDATE users SET institution_id='local' WHERE id=?",
                    (self.ids["b@test.local"],),
                )
                db.execute("DELETE FROM document_grants WHERE document_id=?", (doc,))
                db.execute(
                    "UPDATE source_documents SET status='withdrawn' WHERE id=?", (doc,)
                )
                db.execute("DELETE FROM library_chunks WHERE document_id=?", (doc,))

    def test_invalid_pdf_and_missing_declarations(self):
        self.assertEqual(self.upload(pdf=b"not-a-pdf")[0], 400)
        self.assertEqual(self.upload(extra={"authorized": "false"})[0], 400)

    def test_request_guard_and_origin(self):
        self.assertEqual(
            self.request("POST", "/api/v1/documents", {}, cookie=self.a, guard=False)[
                0
            ],
            403,
        )
        self.assertEqual(
            self.request(
                "POST",
                "/api/v1/auth/login",
                {"email": "a@test.local", "password": self.password},
                origin="https://untrusted.example",
            )[0],
            403,
        )
        status, _, headers = self.request(
            "OPTIONS",
            "/api/v1/documents",
            headers={
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "X-PV-Request,Content-Type",
            },
        )
        self.assertEqual(status, 204)
        self.assertIn("X-PV-Request", headers["Access-Control-Allow-Headers"])

    def test_private_and_legacy_static_paths_not_served(self):
        for path in (
            "/.git/config",
            "/backend/data/devsphere.db",
            "/backend/seeds/legacy-cases.json",
            "/scripts/cases/clinical-cases.js",
            "/scripts/scoring/clinical-scoring-rules.js",
            "/%2e%2e/backend/seeds/legacy-cases.json",
            "/worker/core.py",
        ):
            with self.subTest(path=path):
                self.assertNotEqual(self.request("GET", path)[0], 200)
        self.assertEqual(self.request("GET", "/pages/student-cases.html")[0], 200)

    def test_jobs_idempotency_cross_access_cancel_and_retry_bound(self):
        doc = self.document()
        body = {"operation": "convert", "idempotencyKey": secrets.token_hex(10)}
        status, job, _ = self.request(
            "POST", f"/api/v1/documents/{doc}/jobs", body, cookie=self.a
        )
        self.assertEqual(status, 202, job)
        status, same, _ = self.request(
            "POST", f"/api/v1/documents/{doc}/jobs", body, cookie=self.a
        )
        self.assertEqual(status, 200, same)
        self.assertEqual(job["id"], same["id"])
        self.assertEqual(
            self.request("GET", f"/api/v1/jobs/{job['id']}", cookie=self.b)[0], 404
        )
        self.assertEqual(
            self.request("POST", f"/api/v1/jobs/{job['id']}/cancel", {}, cookie=self.a)[
                0
            ],
            200,
        )
        self.assertEqual(
            self.request("GET", f"/api/v1/jobs/{job['id']}", cookie=self.a)[1][
                "status"
            ],
            "cancelled",
        )
        with closing(sqlite3.connect(self.db)) as db, db:
            db.execute(
                "UPDATE worker_jobs SET status='failed',attempts=max_attempts WHERE id=?",
                (job["id"],),
            )
        self.assertEqual(
            self.request("POST", f"/api/v1/jobs/{job['id']}/retry", {}, cookie=self.a)[
                0
            ],
            409,
        )

    def test_budget_job_is_owner_only_idempotent_and_not_a_case(self):
        doc = self.document()
        body = {"operation":"budget", "pages":[1], "idempotencyKey":secrets.token_hex(10)}
        self.assertEqual(self.request("POST", f"/api/v1/documents/{doc}/jobs", body, cookie=self.a)[0],409)
        with closing(sqlite3.connect(self.db)) as db, db:
            db.execute("UPDATE source_documents SET status='converted',markdown='## Página 1\nMaterial sintético.' WHERE id=?",(doc,))
        self.assertEqual(self.request("POST", f"/api/v1/documents/{doc}/jobs",body,cookie=self.b)[0],404)
        status,job,_=self.request("POST", f"/api/v1/documents/{doc}/jobs",body,cookie=self.a)
        self.assertEqual(status,202,job)
        self.assertEqual(self.request("POST",f"/api/v1/documents/{doc}/jobs",body,cookie=self.a)[1]['id'],job['id'])
        with closing(sqlite3.connect(self.db)) as db, db:
            db.execute("UPDATE worker_jobs SET status='completed',result_json=? WHERE id=?",(json.dumps({'budgetPreview':True,'fits':True}),job['id']))
        self.assertNotEqual(self.request("POST",f"/api/v1/jobs/{job['id']}/contribution",{},cookie=self.a)[0],201)

    def quota_actor(self):
        """Conta sintética exclusiva evita interferência na quota de outros testes."""
        email = f"quota-{uuid.uuid4().hex}@test.local"
        with closing(sqlite3.connect(self.db)) as db, db:
            db.execute(
                "INSERT INTO users(full_name,email,password_hash,role,is_active) "
                "SELECT 'Aluno quota sintético',?,password_hash,'student',1 "
                "FROM users WHERE email='a@test.local'",
                (email,),
            )
            actor_id = db.execute(
                "SELECT id FROM users WHERE email=?", (email,)
            ).fetchone()[0]
            document_id = secrets.token_hex(16)
            # A fixture de quota precisa representar uma fonte íntegra: um legado
            # fictício ausente bloquearia corretamente novos uploads da instituição.
            self.storage.mkdir(parents=True, exist_ok=True)
            source = self.storage / f"{document_id}.pdf"
            source.write_bytes(self.pdf)
            source.chmod(0o600)
            db.execute(
                "INSERT INTO source_documents(id,owner_id,storage_path,original_name,sha256,status,authorized_use,deidentified,markdown,byte_size) "
                "VALUES(?,?,?,'synthetic.pdf',?,'converted',1,1,'## Página 1\nConteúdo sintético',?)",
                (document_id, actor_id, str(source), hashlib.sha256(self.pdf).hexdigest(), len(self.pdf)),
            )
        return actor_id, self.login(email), document_id

    def create_cancelled_quota_job(self, cookie, document, operation="convert"):
        """Libera a concorrência, preservando o consumo persistente da janela."""
        body = {"operation": operation, "idempotencyKey": secrets.token_hex(10)}
        status, job, _ = self.request(
            "POST", f"/api/v1/documents/{document}/jobs", body, cookie=cookie
        )
        self.assertEqual(status, 202, job)
        self.assertEqual(
            self.request("POST", f"/api/v1/jobs/{job['id']}/cancel", {}, cookie=cookie)[
                0
            ],
            200,
        )
        return body, job

    def test_job_quota_survives_cancellation_and_replay_is_free(self):
        actor, cookie, document = self.quota_actor()
        # Configuração padrão: 12/h, compartilhada por geração e conversão.
        for number in range(12):
            body, job = self.create_cancelled_quota_job(
                cookie, document, "generate" if number % 2 else "convert"
            )
        with closing(sqlite3.connect(self.db)) as db:
            audit_before = db.execute(
                "SELECT COUNT(*) FROM audit_logs WHERE user_id=?", (actor,)
            ).fetchone()[0]
        status, blocked, _ = self.request(
            "POST",
            f"/api/v1/documents/{document}/jobs",
            {"operation": "convert", "idempotencyKey": secrets.token_hex(10)},
            cookie=cookie,
        )
        self.assertEqual(status, 429, blocked)
        self.assertEqual(blocked["error"]["code"], "job_request_limit")
        with closing(sqlite3.connect(self.db)) as db:
            self.assertEqual(
                db.execute(
                    "SELECT COUNT(*) FROM worker_jobs WHERE owner_id=?", (actor,)
                ).fetchone()[0],
                12,
            )
            self.assertEqual(
                db.execute(
                    "SELECT COUNT(*) FROM audit_logs WHERE user_id=?", (actor,)
                ).fetchone()[0],
                audit_before,
            )
        status, replayed, _ = self.request(
            "POST", f"/api/v1/documents/{document}/jobs", body, cookie=cookie
        )
        self.assertEqual(status, 200, replayed)
        self.assertEqual(replayed["id"], job["id"])
        _, other_cookie, other_document = self.quota_actor()
        self.create_cancelled_quota_job(other_cookie, other_document)
        # A quota é baseada no SQLite, não em estado efêmero da página.
        with closing(sqlite3.connect(self.db)) as db, db:
            db.execute(
                "UPDATE worker_jobs SET created_at=datetime('now','-2 hours') WHERE id=?",
                (job["id"],),
            )
        self.create_cancelled_quota_job(cookie, document)

    def test_retry_consumes_persistent_quota_and_denial_keeps_failed_state(self):
        actor, cookie, document = self.quota_actor()
        _, job = self.create_cancelled_quota_job(cookie, document)
        with closing(sqlite3.connect(self.db)) as db, db:
            db.execute(
                "UPDATE worker_jobs SET status='failed',attempts=0 WHERE id=?",
                (job["id"],),
            )
        self.assertEqual(
            self.request("POST", f"/api/v1/jobs/{job['id']}/retry", {}, cookie=cookie)[
                0
            ],
            200,
        )
        # Repetir em queued é inválido e não acrescenta consumo.
        self.assertEqual(
            self.request("POST", f"/api/v1/jobs/{job['id']}/retry", {}, cookie=cookie)[
                0
            ],
            409,
        )
        self.request("POST", f"/api/v1/jobs/{job['id']}/cancel", {}, cookie=cookie)
        with closing(sqlite3.connect(self.db)) as db, db:
            db.execute(
                "UPDATE worker_jobs SET status='failed',attempts=1 WHERE id=?",
                (job["id"],),
            )
        for _ in range(10):
            self.create_cancelled_quota_job(cookie, document)
        status, error, _ = self.request(
            "POST", f"/api/v1/jobs/{job['id']}/retry", {}, cookie=cookie
        )
        self.assertEqual(status, 429, error)
        with closing(sqlite3.connect(self.db)) as db:
            self.assertEqual(
                db.execute(
                    "SELECT status FROM worker_jobs WHERE id=?", (job["id"],)
                ).fetchone()[0],
                "failed",
            )
            self.assertEqual(
                db.execute(
                    "SELECT COUNT(*) FROM audit_logs WHERE user_id=? AND action='job_retry_queued'",
                    (actor,),
                ).fetchone()[0],
                1,
            )

    def pending_fixture(self, owner, document, status="queued", cancel_requested=0):
        """Ocupa fila apenas no SQLite sintético; nenhum worker é executado."""
        identity = secrets.token_hex(16)
        with closing(sqlite3.connect(self.db)) as db, db:
            db.execute(
                "INSERT INTO worker_jobs(id,owner_id,document_id,operation,status,request_json,idempotency_key,cancel_requested) VALUES(?,?,?,'convert',?,'{}',?,?)",
                (identity, owner, document, status, identity, cancel_requested),
            )
        return identity

    def test_pending_capacity_is_shared_by_institution_and_retry_obeys_it(self):
        actor, cookie, document = self.quota_actor()
        helper, _, helper_doc = self.quota_actor()
        external, external_cookie, external_doc = self.quota_actor()
        institution = "capacity-" + uuid.uuid4().hex
        with closing(sqlite3.connect(self.db)) as db, db:
            db.execute(
                "UPDATE users SET institution_id=? WHERE id IN (?,?)",
                (institution, actor, helper),
            )
            db.execute(
                "UPDATE users SET institution_id=? WHERE id=?",
                (institution + "-other", external),
            )
        jobs = []
        body = {"operation": "convert", "idempotencyKey": secrets.token_hex(10)}
        try:
            status, original, _ = self.request(
                "POST", f"/api/v1/documents/{document}/jobs", body, cookie=cookie
            )
            self.assertEqual(status, 202, original)
            jobs.append(original["id"])
            for number in range(11):
                jobs.append(
                    self.pending_fixture(
                        helper,
                        helper_doc,
                        "running" if number == 0 else "queued",
                        1 if number == 0 else 0,
                    )
                )
            status, error, _ = self.request(
                "POST",
                f"/api/v1/documents/{document}/jobs",
                {"operation": "convert", "idempotencyKey": secrets.token_hex(10)},
                cookie=cookie,
            )
            self.assertEqual(status, 429, error)
            self.assertEqual(error["error"]["code"], "institution_queue_full")
            self.assertEqual(
                self.request(
                    "POST", f"/api/v1/documents/{document}/jobs", body, cookie=cookie
                )[0],
                200,
            )
            # Outra instituição continua podendo usar a capacidade global livre.
            status, outside, _ = self.request(
                "POST",
                f"/api/v1/documents/{external_doc}/jobs",
                {"operation": "convert", "idempotencyKey": secrets.token_hex(10)},
                cookie=external_cookie,
            )
            self.assertEqual(status, 202, outside)
            jobs.append(outside["id"])
            with closing(sqlite3.connect(self.db)) as db, db:
                db.execute(
                    "UPDATE worker_jobs SET status='failed',attempts=0 WHERE id=?",
                    (original["id"],),
                )
            jobs.append(self.pending_fixture(helper, helper_doc))
            status, error, _ = self.request(
                "POST", f"/api/v1/jobs/{original['id']}/retry", {}, cookie=cookie
            )
            self.assertEqual(status, 429, error)
            self.assertEqual(error["error"]["code"], "institution_queue_full")
            with closing(sqlite3.connect(self.db)) as db, db:
                self.assertEqual(
                    db.execute(
                        "SELECT status FROM worker_jobs WHERE id=?", (original["id"],)
                    ).fetchone()[0],
                    "failed",
                )
                self.assertEqual(
                    db.execute(
                        "SELECT COUNT(*) FROM audit_logs WHERE user_id=? AND action='job_retry_queued'",
                        (actor,),
                    ).fetchone()[0],
                    0,
                )
                db.execute(
                    "UPDATE worker_jobs SET status='cancelled' WHERE id=?", (jobs[-1],)
                )
            self.assertEqual(
                self.request(
                    "POST", f"/api/v1/jobs/{original['id']}/retry", {}, cookie=cookie
                )[0],
                200,
            )
        finally:
            with closing(sqlite3.connect(self.db)) as db, db:
                db.executemany(
                    "UPDATE worker_jobs SET status='cancelled' WHERE id=?",
                    [(identity,) for identity in jobs],
                )

    def test_pending_global_capacity_applies_across_institutions(self):
        actor, cookie, document = self.quota_actor()
        helper, _, helper_doc = self.quota_actor()
        with closing(sqlite3.connect(self.db)) as db, db:
            db.execute(
                "UPDATE users SET institution_id=? WHERE id=?",
                ("global-target-" + uuid.uuid4().hex, actor),
            )
            db.execute(
                "UPDATE users SET institution_id=? WHERE id=?",
                ("global-helper-" + uuid.uuid4().hex, helper),
            )
        jobs = []
        body = {"operation": "convert", "idempotencyKey": secrets.token_hex(10)}
        try:
            status, original, _ = self.request(
                "POST", f"/api/v1/documents/{document}/jobs", body, cookie=cookie
            )
            self.assertEqual(status, 202, original)
            jobs.append(original["id"])
            with closing(sqlite3.connect(self.db)) as db:
                pending = db.execute(
                    "SELECT COUNT(*) FROM worker_jobs WHERE status IN ('queued','running')"
                ).fetchone()[0]
            for _ in range(24 - pending):
                jobs.append(self.pending_fixture(helper, helper_doc))
            status, error, _ = self.request(
                "POST",
                f"/api/v1/documents/{document}/jobs",
                {"operation": "convert", "idempotencyKey": secrets.token_hex(10)},
                cookie=cookie,
            )
            self.assertEqual(status, 429, error)
            self.assertEqual(error["error"]["code"], "global_queue_full")
            self.assertEqual(
                self.request(
                    "POST", f"/api/v1/documents/{document}/jobs", body, cookie=cookie
                )[0],
                200,
            )
            with closing(sqlite3.connect(self.db)) as db, db:
                db.execute(
                    "UPDATE worker_jobs SET status='failed',attempts=0 WHERE id=?",
                    (original["id"],),
                )
            jobs.append(self.pending_fixture(helper, helper_doc))
            status, error, _ = self.request(
                "POST", f"/api/v1/jobs/{original['id']}/retry", {}, cookie=cookie
            )
            self.assertEqual(status, 429, error)
            self.assertEqual(error["error"]["code"], "global_queue_full")
            with closing(sqlite3.connect(self.db)) as db, db:
                db.execute(
                    "UPDATE worker_jobs SET status='cancelled' WHERE id=?", (jobs[-1],)
                )
            self.assertEqual(
                self.request(
                    "POST", f"/api/v1/jobs/{original['id']}/retry", {}, cookie=cookie
                )[0],
                200,
            )
        finally:
            with closing(sqlite3.connect(self.db)) as db, db:
                db.executemany(
                    "UPDATE worker_jobs SET status='cancelled' WHERE id=?",
                    [(identity,) for identity in jobs],
                )

    def test_upload_failure_rolls_back_document_audit_and_private_file(self):
        actor, cookie, _ = self.quota_actor()
        self.storage.mkdir(parents=True, exist_ok=True)
        for table, condition in [
            ("source_documents", f"NEW.owner_id={actor}"),
            ("audit_logs", f"NEW.user_id={actor} AND NEW.action='source_uploaded'"),
        ]:
            before_files = {path.name for path in self.storage.iterdir()}
            with closing(sqlite3.connect(self.db)) as db, db:
                before_documents = db.execute(
                    "SELECT COUNT(*) FROM source_documents WHERE owner_id=?", (actor,)
                ).fetchone()[0]
                before_audits = db.execute(
                    "SELECT COUNT(*) FROM audit_logs WHERE user_id=? AND action='source_uploaded'",
                    (actor,),
                ).fetchone()[0]
                db.execute(
                    f"CREATE TRIGGER fixture_upload_failure BEFORE INSERT ON {table} WHEN {condition} BEGIN SELECT RAISE(ABORT,'synthetic upload failure'); END"
                )
            try:
                status, error, _ = self.upload(cookie=cookie)
                self.assertGreaterEqual(status, 400, error)
                self.assertEqual(
                    {path.name for path in self.storage.iterdir()}, before_files
                )
                with closing(sqlite3.connect(self.db)) as db:
                    self.assertEqual(
                        db.execute(
                            "SELECT COUNT(*) FROM source_documents WHERE owner_id=?",
                            (actor,),
                        ).fetchone()[0],
                        before_documents,
                    )
                    self.assertEqual(
                        db.execute(
                            "SELECT COUNT(*) FROM audit_logs WHERE user_id=? AND action='source_uploaded'",
                            (actor,),
                        ).fetchone()[0],
                        before_audits,
                    )
            finally:
                with closing(sqlite3.connect(self.db)) as db, db:
                    db.execute("DROP TRIGGER fixture_upload_failure")
        # Simula falha de armazenamento sem modificar permissões do host.
        backup = self.directory / ("sources-fixture-backup-" + uuid.uuid4().hex)
        self.storage.rename(backup)
        self.storage.write_bytes(b"synthetic-not-a-directory")
        try:
            status, error, _ = self.upload(cookie=cookie)
            self.assertEqual(status, 503, error)
            self.assertEqual(error["error"]["code"], "storage_unavailable")
        finally:
            self.storage.unlink()
            backup.rename(self.storage)
        # Nenhuma transação fica presa após erro: a próxima gravação funciona.
        status, document, _ = self.upload(cookie=cookie)
        self.assertEqual(status, 201, document)
        with closing(sqlite3.connect(self.db)) as db:
            path = Path(
                db.execute(
                    "SELECT storage_path FROM source_documents WHERE id=?",
                    (document["id"],),
                ).fetchone()[0]
            )
        self.assertEqual(path.read_bytes(), self.pdf)
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_real_conversion_approval_and_permission_filtered_search(self):
        doc = self.document()
        status, job, _ = self.request(
            "POST",
            f"/api/v1/documents/{doc}/jobs",
            {
                "operation": "convert",
                "pages": [],
                "idempotencyKey": secrets.token_hex(10),
            },
            cookie=self.a,
        )
        self.assertEqual(status, 202, job)
        completed = subprocess.run(
            [
                sys.executable,
                "-m",
                "worker.run",
                "--once",
                "--db",
                str(self.db),
                "--storage",
                str(self.storage),
            ],
            env=self.env,
            cwd=ROOT,
            timeout=45,
            capture_output=True,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr.decode())
        status, result, _ = self.request(
            "GET", f"/api/v1/jobs/{job['id']}", cookie=self.a
        )
        self.assertEqual(result["status"], "completed", result)
        self.assertIn("37.2", result["result"]["markdown"])
        self.assertEqual(
            self.request(
                "POST",
                f"/api/v1/documents/{doc}/approve",
                {"confirmed": True},
                cookie=self.a,
            )[0],
            403,
        )
        self.assertEqual(
            self.request(
                "POST",
                f"/api/v1/documents/{doc}/grants",
                {"userId": self.ids["teacher@test.local"]},
                cookie=self.admin,
            )[0],
            200,
        )
        status, data, _ = self.request(
            "POST",
            f"/api/v1/documents/{doc}/approve",
            {"confirmed": True},
            cookie=self.teacher,
        )
        self.assertEqual(status, 200, data)
        subprocess.run(
            [
                sys.executable,
                "-m",
                "worker.run",
                "--once",
                "--db",
                str(self.db),
                "--storage",
                str(self.storage),
            ],
            env=self.env,
            cwd=ROOT,
            timeout=20,
            check=True,
            capture_output=True,
        )
        status, data, _ = self.request(
            "POST", "/api/v1/library/search", {"query": "glicemia"}, cookie=self.a
        )
        self.assertEqual(status, 200, data)
        self.assertTrue(any(item["documentId"] == doc for item in data), data)
        self.assertEqual(
            self.request(
                "POST", "/api/v1/library/search", {"query": "glicemia"}, cookie=self.b
            )[1],
            [],
        )
        self.request("POST", f"/api/v1/documents/{doc}/withdraw", {}, cookie=self.a)
        self.assertEqual(
            self.request(
                "POST", "/api/v1/library/search", {"query": "glicemia"}, cookie=self.a
            )[1],
            [],
        )

    def test_mfa_required_correct_and_replay(self):
        payload = {"email": "admin@test.local", "password": self.password}
        status, data, _ = self.request("POST", "/api/v1/auth/login", payload)
        self.assertEqual(status, 403, data)
        self.assertEqual(data["error"]["code"], "mfa_required")
        self.assertEqual(
            self.request("GET", "/api/v1/auth/session", cookie=self.admin)[0], 200
        )
        payload["otp"] = self.admin_code
        status, data, _ = self.request("POST", "/api/v1/auth/login", payload)
        self.assertEqual(status, 403, data)
        self.assertEqual(data["error"]["code"], "mfa_invalid")
        payload["otp"] = self.recovery
        status, data, _ = self.request("POST", "/api/v1/auth/login", payload)
        self.assertEqual(status, 200, data)
        self.assertEqual(self.request("POST", "/api/v1/auth/login", payload)[0], 403)

    def test_document_grants_can_be_revoked_and_generated_result_is_restricted(self):
        """Revogação vale para PDF, busca e resultado derivado antes de materializar."""
        primary = self.document()
        status, secondary, _ = self.upload(cookie=self.b)
        self.assertEqual(status, 201, secondary)
        secondary = secondary["id"]
        job_id = secrets.token_hex(16)
        result = {
            "case": {"restrictedMarker": "conteudo-sintetico-da-fonte"},
            "provenance": {
                "retrievedSources": [
                    {"document_id": secondary, "page": 1, "sha256": "fixture"}
                ]
            },
        }
        with closing(sqlite3.connect(self.db)) as db, db:
            db.execute(
                "UPDATE source_documents SET status='converted',markdown='## Página 1\nBase sintética' WHERE id=?",
                (primary,),
            )
            db.execute(
                "UPDATE source_documents SET status='approved',markdown='## Página 1\nComplemento sintético' WHERE id=?",
                (secondary,),
            )
            db.execute(
                "INSERT INTO worker_jobs(id,owner_id,document_id,operation,status,result_json,idempotency_key) VALUES(?,?,?,'generate','completed',?,?)",
                (job_id, self.ids["a@test.local"], primary, json.dumps(result), job_id),
            )
            version = db.execute(
                "SELECT id FROM case_versions ORDER BY id LIMIT 1"
            ).fetchone()[0]
            db.execute(
                "INSERT INTO version_sources(version_id,document_id,source_hash,markdown_hash) VALUES(?,?, 'fixture','fixture')",
                (version, secondary),
            )
        grant = {"userId": self.ids["a@test.local"]}
        path = f"/api/v1/documents/{secondary}/grants"
        self.assertNotEqual(self.request("POST", path, grant, cookie=self.b)[0], 200)
        self.assertEqual(self.request("POST", path, grant, cookie=self.admin)[0], 200)
        self.assertEqual(
            self.request("GET", f"/api/v1/jobs/{job_id}", cookie=self.a)[1]["result"][
                "case"
            ]["restrictedMarker"],
            "conteudo-sintetico-da-fonte",
        )
        self.assertEqual(
            self.request(
                "GET", f"/api/v1/documents/{secondary}/dependencies", cookie=self.a
            )[0],
            403,
        )
        status, dependencies, _ = self.request(
            "GET", f"/api/v1/documents/{secondary}/dependencies", cookie=self.b
        )
        self.assertEqual(status, 200, dependencies)
        self.assertEqual(dependencies[0]["id"], version)
        self.assertNotIn("content", dependencies[0])
        self.assertEqual(
            self.request("GET", path, cookie=self.b)[1][0]["userId"],
            self.ids["a@test.local"],
        )
        self.assertEqual(
            self.request(
                "POST", path, {**grant, "enabled": "false"}, cookie=self.admin
            )[0],
            400,
        )
        self.assertEqual(
            self.request("POST", path, {**grant, "enabled": False}, cookie=self.admin)[
                0
            ],
            400,
        )
        self.assertEqual(
            self.request(
                "POST",
                path,
                {**grant, "enabled": False, "reason": "Fim da colaboração sintética"},
                cookie=self.admin,
            )[0],
            200,
        )
        self.assertEqual(
            self.request("GET", f"/api/v1/documents/{secondary}", cookie=self.a)[0], 404
        )
        response = self.request("GET", f"/api/v1/jobs/{job_id}", cookie=self.a)[1]
        self.assertIsNone(response["result"])
        self.assertEqual(response["resultAccess"], "revoked")
        rows = self.request("GET", "/api/v1/jobs", cookie=self.a)[1]
        self.assertIsNone(next(row for row in rows if row["id"] == job_id)["result"])
        self.assertEqual(self.request("POST", path, grant, cookie=self.admin)[0], 200)
        self.assertEqual(
            self.request("GET", f"/api/v1/jobs/{job_id}", cookie=self.a)[1][
                "resultAccess"
            ],
            "available",
        )
        self.request(
            "POST", f"/api/v1/documents/{secondary}/withdraw", {}, cookie=self.b
        )
        self.assertIsNone(
            self.request("GET", f"/api/v1/jobs/{job_id}", cookie=self.a)[1]["result"]
        )
        with closing(sqlite3.connect(self.db)) as db:
            self.assertEqual(
                db.execute(
                    "SELECT COUNT(*) FROM audit_logs WHERE action='source_access_revoked' AND json_extract(metadata_json,'$.id')=? AND json_extract(metadata_json,'$.userId')=?",
                    (secondary, self.ids["a@test.local"]),
                ).fetchone()[0],
                1,
            )

    def test_withdrawn_document_blocks_grant_holder_but_preserves_owner_history(self):
        """Retirada interrompe novos acessos de colaboradores, sem excluir PDF/histórico."""
        status, source, _ = self.upload(cookie=self.b)
        self.assertEqual(status, 201, source)
        path = f"/api/v1/documents/{source['id']}"
        grant = {"userId": self.ids["a@test.local"]}
        self.assertEqual(
            self.request("POST", path + "/grants", grant, cookie=self.admin)[0], 200
        )
        self.assertEqual(self.request("GET", path + "/pdf", cookie=self.a)[0], 200)
        self.assertEqual(
            self.request("POST", path + "/withdraw", {}, cookie=self.b)[0], 200
        )
        for suffix in ("", "/pdf", "/dependencies", "/grants"):
            self.assertEqual(self.request("GET", path + suffix, cookie=self.a)[0], 404)
        rows = self.request("GET", "/api/v1/documents", cookie=self.a)[1]
        self.assertFalse(any(row["id"] == source["id"] for row in rows))
        self.assertEqual(
            self.request("GET", path, cookie=self.b)[1]["status"], "withdrawn"
        )
        self.assertEqual(self.request("GET", path + "/pdf", cookie=self.b)[0], 200)
        self.assertEqual(self.request("GET", path + "/pdf", cookie=self.admin)[0], 200)
        self.assertEqual(
            self.request("GET", path + "/grants", cookie=self.b)[1][0]["userId"],
            grant["userId"],
        )

    def test_reviewer_revocation_blocks_assigned_access_over_http(self):
        """Interface não é autoridade: a revogação também impede chamada direta."""
        content = json.loads((ROOT / "backend/seeds/legacy-cases.json").read_text())[0]
        body = {
            "key": "revocation-" + secrets.token_hex(6),
            "title": "Teste sintético de governança",
            "content": content,
            "metadata": {"area": "general"},
        }
        status, contribution, _ = self.request(
            "POST", "/api/v1/contributions", body, cookie=self.a
        )
        self.assertEqual(status, 201, contribution)
        version = contribution["id"]
        teacher = self.ids["teacher@test.local"]
        payload = {"userId": teacher, "area": "general"}
        try:
            status, data, _ = self.request(
                "POST",
                "/api/v1/admin/review-assignments",
                {"versionId": version, "reviewerId": teacher},
                cookie=self.admin,
            )
            self.assertEqual(status, 200, data)
            self.assertEqual(
                self.request(
                    "GET", f"/api/v1/contributions/{version}", cookie=self.teacher
                )[0],
                200,
            )
            self.assertNotEqual(
                self.request("GET", "/api/v1/admin/reviewer-areas", cookie=self.a)[0],
                200,
            )
            self.assertEqual(
                self.request(
                    "POST",
                    "/api/v1/admin/reviewer-areas",
                    {**payload, "enabled": False},
                    cookie=self.admin,
                )[0],
                200,
            )
            self.assertNotEqual(
                self.request(
                    "GET", f"/api/v1/contributions/{version}", cookie=self.teacher
                )[0],
                200,
            )
            self.assertNotEqual(
                self.request(
                    "POST",
                    f"/api/v1/case-versions/{version}/review",
                    {"action": "approve", "note": "não autorizado"},
                    cookie=self.teacher,
                )[0],
                200,
            )
            self.assertEqual(
                self.request("GET", f"/api/v1/contributions/{version}", cookie=self.a)[
                    0
                ],
                200,
            )
            status, assignments, _ = self.request(
                "GET", "/api/v1/admin/review-assignments", cookie=self.admin
            )
            self.assertEqual(status, 200, assignments)
            self.assertFalse(
                next(row for row in assignments if row["versionId"] == version)[
                    "reviewerEnabled"
                ]
            )
        finally:
            self.request(
                "POST",
                "/api/v1/admin/reviewer-areas",
                {**payload, "enabled": True},
                cookie=self.admin,
            )

    def test_z_revoke_sessions_invalidates_old_cookie(self):
        fresh = self.login("a@test.local")
        self.assertEqual(
            self.request("POST", "/api/v1/auth/revoke-sessions", {}, cookie=fresh)[0],
            200,
        )
        self.assertEqual(
            self.request("GET", "/api/v1/auth/session", cookie=fresh)[0], 401
        )
        self.assertEqual(
            self.request("GET", "/api/v1/auth/session", cookie=self.a)[0], 401
        )


if __name__ == "__main__":
    unittest.main()
