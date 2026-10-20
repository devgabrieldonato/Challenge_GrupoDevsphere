"""Ensaio opt-in: API, PDF, fila, FTS e Qwen/Gemma reais, só com fonte sintética.

No Linux/WSL, configurar DEVSPHERE_TEST_REAL_AI=1 e DEVSPHERE_TEST_API_BIN.
O Python que executa este módulo deve ser o venv Linux com dependências do worker
e ReportLab. Não aprova, materializa ou publica o caso gerado.

Cancelamento envia SIGINT ao worker para executar seu finally. Se for necessário
SIGKILL no pai, não é possível garantir a limpeza de filhos em sessões separadas;
o relatório registra essa limitação como falha e não a considera encerramento limpo.
"""

from __future__ import annotations

import base64
from contextlib import closing
import hashlib
import hmac
import http.client
import io
import json
import os
from pathlib import Path
import secrets
import signal
import socket
import sqlite3
import struct
import subprocess
import sys
import tempfile
import textwrap
import time
import unittest
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
ENABLED = os.environ.get("DEVSPHERE_TEST_REAL_AI") == "1"


def owned_loopback_listener(pid, port):
    """Confere inode LISTEN no Linux antes de qualquer HTTP; falha fechada sem /proc.

    False significa que ainda não há listener. Listener alheio, wildcard ou
    inventário inacessível geram erro sem realizar conexão na porta encontrada.
    A checagem é repetida antes de toda requisição, inclusive health.
    """
    try:
        rows = Path("/proc/net/tcp").read_text(encoding="ascii").splitlines()[1:]
        listeners = []
        for row in rows:
            fields = row.split()
            address, hexadecimal_port = fields[1].split(":")
            if fields[3] == "0A" and int(hexadecimal_port, 16) == port and address in {"0100007F", "00000000"}:
                listeners.append((address, fields[9]))
        if not listeners:
            return False
        descriptors = Path(f"/proc/{pid}/fd")
        socket_links = set()
        for descriptor in descriptors.iterdir():
            try:
                socket_links.add(os.readlink(descriptor))
            except FileNotFoundError:
                continue  # Descritor próprio pode ser fechado durante a observação.
        if len(listeners) != 1 or listeners[0][0] != "0100007F" or f"socket:[{listeners[0][1]}]" not in socket_links:
            raise PermissionError("Listener não pertence à API filha em loopback")
        return True
    except (OSError, ValueError, IndexError):
        raise PermissionError("Não foi possível confirmar posse exclusiva do listener via /proc") from None


@unittest.skipUnless(sys.platform.startswith("linux"), "Posse do listener requer /proc Linux")
class ListenerOwnershipTests(unittest.TestCase):
    """Só sockets próprios efêmeros; nenhuma requisição HTTP ou inferência."""

    def test_own_loopback_listener_is_recognized(self):
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            listener.listen(1)
            self.assertTrue(owned_loopback_listener(os.getpid(), listener.getsockname()[1]))

    def test_listener_cannot_be_attributed_to_another_process(self):
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            listener.listen(1)
            with self.assertRaises(PermissionError):
                owned_loopback_listener(os.getppid(), listener.getsockname()[1])


@unittest.skipUnless(ENABLED, "Inferência real exige DEVSPHERE_TEST_REAL_AI=1")
class RealAiPipelineTests(unittest.TestCase):
    """Nenhum provedor falso; falhas não imprimem caso, fonte, cookie ou senha."""

    def require(self, condition, label):
        if not condition:
            raise AssertionError(label)

    def api(self, method, path, body=None, cookie=None, content_type=None):
        headers = {"Origin": "http://127.0.0.1:5501", "X-PV-Request": "1"}
        if cookie:
            headers["Cookie"] = cookie
        if isinstance(body, dict):
            body = json.dumps(body).encode()
            content_type = "application/json"
        if content_type:
            headers["Content-Type"] = content_type
        # Nunca consulta health de um serviço desconhecido após a reserva efêmera.
        self.require(self.server.poll() is None, "API própria encerrou")
        self.require(owned_loopback_listener(self.server.pid, self.port), "API própria ainda não possui listener confirmado")
        client = http.client.HTTPConnection("127.0.0.1", self.port, timeout=15)
        try:
            client.request(method, path, body, headers)
            response = client.getresponse()
            raw = response.read(8_000_001)
            self.require(len(raw) <= 8_000_000, "Resposta HTTP excedeu limite")
            data = json.loads(raw) if raw else None
            return response.status, data, dict(response.getheaders())
        finally:
            client.close()

    def checked(self, method, path, body=None, cookie=None, expected=200):
        status, data, headers = self.api(method, path, body, cookie)
        self.require(status == expected, f"HTTP inesperado em operação técnica: {status}")
        return data

    def command(self, args, timeout=60):
        """Só encerra o subprocesso próprio; o worker controla seus filhos isolados."""
        process = subprocess.Popen(
            args, cwd=ROOT, env=self.environment, stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        try:
            code = process.wait(timeout=timeout)
            self.require(code == 0, f"Subprocesso técnico encerrou com código {code}")
        except BaseException:
            if process.poll() is None:
                # O worker usa finally para encerrar seu filho; SIGINT permite esse caminho.
                process.send_signal(signal.SIGINT)
                try:
                    process.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
                    self.report["status"] = "failed"
                    self.report["cleanupFailure"] = "worker_parent_force_killed_children_not_confirmed"
            raise

    def worker_once(self):
        self.command([
            sys.executable, "-m", "worker.run", "--once", "--db", str(self.db),
            "--storage", str(self.storage),
        ], timeout=1900)

    def job(self, document, operation, cookie, **fields):
        data = self.checked("POST", f"/api/v1/documents/{document}/jobs", {
            "operation": operation, "pages": [], "idempotencyKey": secrets.token_hex(16),
            **fields,
        }, cookie, expected=202)
        self.worker_once()
        result = self.checked("GET", f"/api/v1/jobs/{data['id']}", cookie=cookie)
        if result.get("status") != "completed":
            error = result.get("error") or {}
            self.report["jobFailure"] = {
                "operation": operation, "status": result.get("status"),
                "code": error.get("code") if isinstance(error, dict) else None,
            }
        self.require(result.get("status") == "completed", "Job real não concluiu")
        return data["id"], result["result"]

    def upload(self, text, cookie):
        from reportlab.pdfgen import canvas

        buffer = io.BytesIO()
        pdf = canvas.Canvas(buffer, pagesize=(595, 842), invariant=1)
        pdf.setFont("Helvetica", 10)
        y = 800
        # Texto é exclusivamente partição da fixture; sem cabeçalho duplicado de página.
        for line in textwrap.wrap(text, width=94):
            pdf.drawString(32, y, line)
            y -= 14
        pdf.save()
        content = buffer.getvalue()
        boundary = "pv-real-" + secrets.token_hex(16)
        parts = []
        for key, value in {"authorized": "true", "deidentified": "true", "area": "general"}.items():
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
        parts.extend([
            f'--{boundary}\r\nContent-Disposition: form-data; name="pdf"; filename="synthetic.pdf"\r\nContent-Type: application/pdf\r\n\r\n'.encode(),
            content, f"\r\n--{boundary}--\r\n".encode(),
        ])
        status, data, _ = self.api("POST", "/api/v1/documents", b"".join(parts), cookie,
                                   f"multipart/form-data; boundary={boundary}")
        self.require(status == 201, "Upload sintético não concluiu")
        return data["id"], hashlib.sha256(content).hexdigest()

    def test_real_pdf_rag_generation_and_revocation(self):
        self.require(os.name == "posix", "Este ensaio requer Linux/WSL/POSIX")
        binary = Path(os.environ.get("DEVSPHERE_TEST_API_BIN", "")).resolve()
        self.require(binary.is_file(), "Configure DEVSPHERE_TEST_API_BIN com API compilada")
        fixture_path = ROOT / "worker/fixtures/synthetic-benchmark.request.json"
        fixture_bytes = fixture_path.read_bytes()
        fixture = json.loads(fixture_bytes)
        self.report = {
            "status": "failed", "clinicalValidation": "pending_human_review",
            "fixtureSha256": hashlib.sha256(fixture_bytes).hexdigest(),
            "casePublished": False, "caseMaterialized": False,
            "memoryNote": "RAM/VRAM físicas não medidas por este harness",
        }
        reports = ROOT / "validation-reports"
        reports.mkdir(exist_ok=True)
        report_path = reports / ("real-ai-pipeline-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + secrets.token_hex(6) + ".json")
        started = time.monotonic()
        self.server = None
        self.environment = {key: value for key, value in os.environ.items()
                            if key in {"PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "SYSTEMROOT"}}
        self.environment.update({
            "PYTHONPATH": str(ROOT), "DEVSPHERE_PYTHON": sys.executable,
            "DEVSPHERE_OLLAMA_URL": "http://127.0.0.1:11434",
            "DEVSPHERE_GENERATOR_MODEL": "qwen3:8b", "DEVSPHERE_CRITIC_MODEL": "gemma3:4b",
            "DEVSPHERE_OLLAMA_CONTEXT": "8192", "DEVSPHERE_OLLAMA_MAX_TOKENS": "6000",
            "DEVSPHERE_OLLAMA_CRITIC_CONTEXT": "16384", "DEVSPHERE_OLLAMA_CRITIC_MAX_TOKENS": os.environ.get("DEVSPHERE_OLLAMA_CRITIC_MAX_TOKENS", "4096"),
            "DEVSPHERE_OLLAMA_BATCH": "64", "DEVSPHERE_OLLAMA_TIMEOUT": "900",
            "DEVSPHERE_HOST": "127.0.0.1", "DEVSPHERE_ENV": "development",
            "DEVSPHERE_MIGRATIONS_DIR": str(ROOT / "backend/migrations"),
            "DEVSPHERE_FRONTEND_DIR": str(ROOT / "frontend"),
            "DEVSPHERE_CASE_SEED": str(ROOT / "backend/seeds/legacy-cases.json"),
        })
        self.report["configuration"] = {key: value for key, value in self.environment.items()
                                         if key.startswith("DEVSPHERE_OLLAMA") or key.endswith("_MODEL")}
        try:
            with tempfile.TemporaryDirectory(prefix="pv-real-ai-") as folder:
                os.chmod(folder, 0o700)
                self.db = Path(folder) / "synthetic.db"
                self.storage = Path(folder) / "sources"
                password = secrets.token_urlsafe(28)
                secret = base64.b32encode(secrets.token_bytes(20)).decode()
                self.environment.update(DEVSPHERE_DB_PATH=str(self.db), DEVSPHERE_SOURCE_DIR=str(self.storage), DEVSPHERE_SEED_PASSWORD=password)
                for args in [
                    ["--create-admin", "Admin sintético", "admin@real-ai.local", "admin@real-ai.local"],
                    ["--create-user", "Aluno sintético", "student@real-ai.local", "student"],
                    ["--create-user", "Autor sintético", "author@real-ai.local", "student"],
                    ["--create-user", "Docente sintético", "teacher@real-ai.local", "teacher"],
                ]:
                    self.command([str(binary), *args])
                with closing(sqlite3.connect(self.db)) as db, db:
                    ids = dict(db.execute("SELECT email,id FROM users"))
                    db.execute("INSERT INTO reviewer_areas(user_id,area,enabled_by) VALUES(?, 'general', ?)",
                               (ids["teacher@real-ai.local"], ids["admin@real-ai.local"]))
                    baseline_versions = db.execute("SELECT COUNT(*) FROM case_versions").fetchone()[0]
                self.environment.pop("DEVSPHERE_SEED_PASSWORD")
                self.environment[f"DEVSPHERE_MFA_SECRET_{ids['admin@real-ai.local']}"] = secret
                with socket.socket() as guard:
                    guard.bind(("127.0.0.1", 0))
                    self.port = guard.getsockname()[1]
                    self.environment["DEVSPHERE_PORT"] = str(self.port)
                self.server = subprocess.Popen([str(binary)], cwd=ROOT, env=self.environment,
                                               stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                try:
                    for _ in range(100):
                        self.require(self.server.poll() is None, "API própria encerrou antes de estar pronta")
                        if not owned_loopback_listener(self.server.pid, self.port):
                            time.sleep(0.1)
                            continue
                        try:
                            if self.api("GET", "/api/v1/health")[0] == 200:
                                break
                        except OSError:
                            pass
                        time.sleep(0.1)
                    else:
                        raise AssertionError("API própria não iniciou")
                    cookies = {}
                    for role in ("student", "author", "teacher", "admin"):
                        payload = {"email": f"{role}@real-ai.local", "password": password}
                        if role == "admin":
                            digest = hmac.new(base64.b32decode(secret), struct.pack(">Q", int(time.time()) // 30), hashlib.sha1).digest()
                            offset = digest[-1] & 15
                            payload["otp"] = f"{(struct.unpack('>I', digest[offset:offset + 4])[0] & 0x7fffffff) % 1000000:06d}"
                        status, _, headers = self.api("POST", "/api/v1/auth/login", payload)
                        self.require(status == 200, "Login sintético falhou")
                        cookies[role] = headers["Set-Cookie"].split(";", 1)[0]
                    text = fixture["markdown"].split("\n", 1)[1]
                    split = text.index("Registro sintético:")
                    primary, primary_hash = self.upload(text[:split].strip(), cookies["student"])
                    secondary, secondary_hash = self.upload(text[split:].strip(), cookies["author"])
                    _, converted_primary = self.job(primary, "convert", cookies["student"])
                    _, converted_secondary = self.job(secondary, "convert", cookies["author"])
                    self.require(converted_primary["sourceHash"] == primary_hash and converted_secondary["sourceHash"] == secondary_hash, "Hash de PDF convertido divergente")
                    path = f"/api/v1/documents/{secondary}"
                    self.checked("POST", path + "/grants", {"userId": ids["teacher@real-ai.local"]}, cookies["admin"])
                    # Aprovação apenas de fonte artificial para exercitar FTS; não é parecer clínico.
                    self.checked("POST", path + "/approve", {"confirmed": True}, cookies["teacher"])
                    self.worker_once()
                    query = {"query": "glicemia"}
                    hidden_hits = self.checked("POST", "/api/v1/library/search", query, cookies["student"])
                    self.require(not any(hit["documentId"] == secondary for hit in hidden_hits), "FTS expôs fonte sem grant")
                    self.checked("POST", path + "/grants", {"userId": ids["student@real-ai.local"]}, cookies["admin"])
                    hits = self.checked("POST", "/api/v1/library/search", query, cookies["student"])
                    self.require(any(hit["documentId"] == secondary for hit in hits), "FTS não recuperou fonte autorizada")
                    job_id, result = self.job(primary, "generate", cookies["student"], query="glicemia", instructions=fixture["instructions"] + " Registre em references as duas fontes sintéticas autorizadas fornecidas, inclusive o trecho complementar recuperado.")
                    from worker.core import validate_case
                    validate_case(result["case"])
                    case, provenance = result["case"], result["provenance"]
                    self.require(case["status"] == "awaiting_human_review", "Estado do caso inválido")
                    self.require(provenance["sourceHash"] == primary_hash, "Hash primário divergente")
                    retrieved = provenance["retrievedSources"]
                    self.require(bool(retrieved) and all(source["document_id"] == secondary and source["sha256"] == secondary_hash and source["page"] == 1 and source["markdown_sha256"] == hashlib.sha256(converted_secondary["markdown"].encode()).hexdigest() for source in retrieved), "Proveniência RAG divergente")
                    allowed = {f"source:{primary}#page:1", f"source:{secondary}#page:1"}
                    self.require(set(case["references"]) == allowed, "Caso deve rastrear ambas as fontes reais e nenhuma referência adicional")
                    self.require(provenance["generator"]["model"] == "qwen3:8b" and provenance["critic"]["model"] == "gemma3:4b", "Modelos reais divergentes")
                    self.require(isinstance(result["criticReview"]["sourceFidelity"], str), "Crítica ausente")
                    self.checked("POST", path + "/grants", {"userId": ids["student@real-ai.local"], "enabled": False, "reason": "Revogação em ensaio exclusivamente sintético"}, cookies["admin"])
                    hidden = self.checked("GET", f"/api/v1/jobs/{job_id}", cookie=cookies["student"])
                    self.require(hidden["result"] is None and hidden["resultAccess"] == "revoked", "Resultado não foi restringido após revogação")
                    hits = self.checked("POST", "/api/v1/library/search", query, cookies["student"])
                    self.require(not any(hit["documentId"] == secondary for hit in hits), "Fonte revogada permaneceu na busca")
                    with closing(sqlite3.connect(self.db)) as db:
                        self.require(db.execute("SELECT COUNT(*) FROM case_versions").fetchone()[0] == baseline_versions, "Ensaio criou versão indevida")
                    self.report.update(status="completed", questions=sum(i["type"] == "question" for i in case["items"]), exams=sum(i["type"] == "exam" for i in case["items"]), schemaValid=True, ragRetrievedSources=len(retrieved), sourceHashesVerified=True, revocationRestrictedResult=True, generator=provenance["generator"], critic=provenance["critic"], promptVersion=provenance["promptVersion"])
                finally:
                    if self.server and self.server.poll() is None:
                        self.server.terminate()
                        try:
                            self.server.wait(timeout=10)
                        except subprocess.TimeoutExpired:
                            self.server.kill()
                            self.server.wait()
        finally:
            self.report["elapsedSeconds"] = round(time.monotonic() - started, 3)
            # Arquivo exclusivo e privado; nenhum texto de fonte/caso/crítica ou credencial.
            descriptor = os.open(report_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "w", encoding="utf-8") as output:
                json.dump(self.report, output, ensure_ascii=False, indent=2)
                output.write("\n")


if __name__ == "__main__":
    unittest.main()
