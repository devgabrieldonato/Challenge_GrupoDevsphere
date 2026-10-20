"""Inventário com HTTP e executáveis falsos somente nos testes; nenhuma inferência."""

import contextlib
import copy
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import io
import json
import os
import subprocess
import threading
import unittest
from unittest import mock

from worker import doctor

TAGS = {
    "models": [
        {"name": "qwen3:8b", "digest": "a" * 64, "size": 5_200_000_000},
        {"name": "gemma3:4b", "digest": "b" * 64, "size": 3_400_000_000},
    ]
}


class FakeInventory:
    """Servidor loopback de teste não implementa endpoints de chat, pull ou geração."""

    def __init__(self, responses=None):
        self.responses = {
            "/api/version": (200, {"version": "0.40.5"}),
            "/api/tags": (200, copy.deepcopy(TAGS)),
            "/api/ps": (200, {"models": []}),
        }
        self.responses.update(responses or {})
        self.requests = []

    def __enter__(self):
        fixture = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                fixture.requests.append(self.path)
                code, payload = fixture.responses.get(self.path, (404, {}))
                if code == 302:
                    self.send_response(code)
                    self.send_header("Location", "http://192.0.2.1/never-follow")
                    self.end_headers()
                    return
                encoded = (
                    payload
                    if isinstance(payload, bytes)
                    else json.dumps(payload).encode()
                )
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)

            def log_message(self, *args):
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = f"http://127.0.0.1:{self.server.server_port}"
        return self

    def __exit__(self, *args):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)


class DoctorTests(unittest.TestCase):
    def setUp(self):
        self.languages = (
            "List of available languages in /private/secret-path (3):\neng\nosd\npor\n"
        )
        self.hardware = {
            "system": "SyntheticOS",
            "architecture": "synthetic",
            "logicalCpuCount": 4,
            "physicalMemoryBytes": 8_589_934_592,
            "availableMemoryEstimateBytes": 1_000_000_000,
        }
        self.patches = [
            mock.patch.object(doctor, "hardware_snapshot", return_value=self.hardware),
            mock.patch.object(
                doctor.shutil,
                "which",
                side_effect=lambda name: (
                    f"/fake/{name}" if name in {"tesseract", "pdftoppm"} else None
                ),
            ),
            mock.patch.object(doctor, "command_output", side_effect=self.fake_command),
        ]
        for patch in self.patches:
            patch.start()
        self.addCleanup(lambda: [patch.stop() for patch in reversed(self.patches)])

    def fake_command(self, arguments, timeout):
        if "--list-langs" in arguments:
            return self.languages
        if "--version" in arguments:
            return "tesseract 5.5.1\n"
        return "pdftoppm version 25.10.0\n"

    def diagnose(self, fixture):
        return doctor.diagnose(
            timeout=1, url=fixture.url, generator="qwen3:8b", critic="gemma3:4b"
        )

    def test_full_inventory_without_inference_database_or_secret_output(self):
        with FakeInventory() as fixture, mock.patch(
            "sqlite3.connect", side_effect=AssertionError("Não acessar banco")
        ), mock.patch.dict(
            os.environ, {"DEVSPHERE_BACKUP_PASSWORD": "must-never-appear"}
        ):
            report = self.diagnose(fixture)
        self.assertEqual(report["status"], "available")
        self.assertEqual(report["generationCapability"], "not_tested")
        self.assertFalse(report["inferencePerformed"])
        self.assertFalse(report["databaseAccessed"])
        self.assertFalse(report["downloadsPerformed"])
        self.assertEqual(fixture.requests, ["/api/version", "/api/tags", "/api/ps"])
        self.assertEqual(report["checks"]["ollama"]["installedModelCount"], 2)
        self.assertEqual(
            report["checks"]["ollama"]["configuredModels"]["generator"]["digest"],
            "a" * 64,
        )
        self.assertNotIn("must-never-appear", json.dumps(report))
        self.assertNotIn("secret-path", json.dumps(report))

    def test_windows_tesseract_version_prefix_is_recognized(self):
        """O instalador Windows usa v antes da versão; isso não significa OCR indisponível."""
        def windows_command(arguments, timeout):
            if "--version" in arguments:
                return "tesseract v5.5.3.20260724\n leptonica-1.87.0\n"
            return self.fake_command(arguments, timeout)

        with FakeInventory() as fixture, mock.patch.object(
            doctor, "command_output", side_effect=windows_command
        ):
            report = self.diagnose(fixture)
        self.assertEqual(report["status"], "available")
        self.assertEqual(report["checks"]["ocr"]["status"], "available")
        self.assertEqual(report["checks"]["ocr"]["tesseractVersion"], "5.5.3.20260724")
        self.assertNotIn("tesseract_unavailable", [issue["code"] for issue in report["issues"]])

    def test_missing_model_is_not_success(self):
        with FakeInventory(
            {"/api/tags": (200, {"models": [TAGS["models"][0]]})}
        ) as fixture:
            report = self.diagnose(fixture)
        self.assertEqual(report["status"], "unavailable")
        self.assertIn("model_missing", [issue["code"] for issue in report["issues"]])

    def test_missing_language_and_poppler_are_reported(self):
        self.languages = "eng\nosd\n"
        with FakeInventory() as fixture, mock.patch.object(
            doctor.shutil,
            "which",
            side_effect=lambda name: "/fake/tesseract" if name == "tesseract" else None,
        ):
            report = self.diagnose(fixture)
        self.assertEqual(report["checks"]["ocr"]["status"], "unavailable")
        self.assertTrue(
            {"ocr_languages_missing", "poppler_missing"}.issubset(
                {issue["code"] for issue in report["issues"]}
            )
        )

    def test_remote_credential_and_non_http_provider_rejected_before_http(self):
        for url in [
            "https://127.0.0.1:11434",
            "http://127.0.0.1:0",
            "http://192.0.2.1",
            "http://secret@127.0.0.1",
            "http://127.0.0.1/api/chat",
            "http://127.0.0.1?token=secret",
        ]:
            with self.subTest(url=url), mock.patch.object(
                doctor.urllib.request,
                "build_opener",
                side_effect=AssertionError("Não criar HTTP"),
            ):
                report = doctor.diagnose(timeout=1, url=url)
            self.assertIn(
                "unsafe_provider", [issue["code"] for issue in report["issues"]]
            )
            self.assertNotIn("secret", json.dumps(report))

    def test_localhost_resolving_non_loopback_is_rejected(self):
        with mock.patch.object(
            doctor.socket,
            "getaddrinfo",
            return_value=[(2, 1, 6, "", ("192.0.2.1", 11434))],
        ):
            with self.assertRaises(doctor.CheckError):
                doctor.local_url("http://localhost:11434")

    def test_redirect_is_never_followed(self):
        with FakeInventory({"/api/version": (302, {})}) as fixture:
            report = self.diagnose(fixture)
        self.assertEqual(fixture.requests, ["/api/version"])
        self.assertIn("redirect_blocked", [issue["code"] for issue in report["issues"]])

    def test_proxy_environment_does_not_redirect_local_inventory(self):
        with FakeInventory() as fixture, mock.patch.dict(
            os.environ,
            {
                "HTTP_PROXY": "http://127.0.0.1:9",
                "HTTPS_PROXY": "http://127.0.0.1:9",
                "ALL_PROXY": "http://127.0.0.1:9",
                "NO_PROXY": "",
            },
        ):
            report = self.diagnose(fixture)
        self.assertEqual(report["status"], "available")
        self.assertEqual(len(fixture.requests), 3)

    def test_unknown_payload_fields_are_not_reported(self):
        running = {
            "models": [
                {
                    "model": "qwen3:8b",
                    "digest": "a" * 64,
                    "size": 5_200_000_000,
                    "size_vram": 4_000_000_000,
                    "context_length": 4096,
                    "secret": "do-not-echo",
                }
            ]
        }
        with FakeInventory({"/api/ps": (200, running)}) as fixture:
            report = self.diagnose(fixture)
        self.assertNotIn("do-not-echo", json.dumps(report))
        self.assertEqual(report["checks"]["ollama"]["runningModelCount"], 1)
        self.assertEqual(
            report["checks"]["ollama"]["runningModels"][0]["sizeVramBytes"],
            4_000_000_000,
        )

    def test_invalid_inventory_and_oversize_responses_fail(self):
        for endpoint, payload, code in [
            ("/api/tags", {"models": "wrong"}, "invalid_models"),
            ("/api/version", b"x" * 1_000_001, "response_limit"),
        ]:
            with self.subTest(endpoint=endpoint), FakeInventory(
                {endpoint: (200, payload)}
            ) as fixture:
                report = self.diagnose(fixture)
            self.assertIn(code, [issue["code"] for issue in report["issues"]])

    def test_unverified_digest_does_not_confirm_installation(self):
        tags = copy.deepcopy(TAGS)
        tags["models"][0]["digest"] = "not-a-digest"
        with FakeInventory({"/api/tags": (200, tags)}) as fixture:
            report = self.diagnose(fixture)
        self.assertEqual(report["status"], "unavailable")
        self.assertIn(
            "model_metadata_missing", [issue["code"] for issue in report["issues"]]
        )

    def test_only_read_inventory_endpoints_are_allowed(self):
        client = doctor.LocalOllama("http://127.0.0.1:11434", 1)
        for endpoint in ["chat", "generate", "pull", "delete"]:
            with self.assertRaises(doctor.CheckError):
                client.get(endpoint)

    def test_timeout_range_and_cli_json_exit_code(self):
        for value in [0, 11, True, "1"]:
            with self.assertRaises(ValueError):
                doctor.diagnose(timeout=value)
        report = {"status": "unavailable", "generationCapability": "not_tested"}
        output = io.StringIO()
        with mock.patch.object(
            doctor, "diagnose", return_value=report
        ), contextlib.redirect_stdout(output):
            self.assertEqual(doctor.main(["--json", "--timeout", "1"]), 1)
        self.assertEqual(json.loads(output.getvalue()), report)
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(
            SystemExit
        ) as result:
            doctor.main(["--timeout", "11"])
        self.assertEqual(result.exception.code, 2)

    def test_subprocess_environment_strips_application_secrets(self):
        # Interrompe somente o mock de command_output para testar o invólucro real, sem executar binário.
        original = self.patches[-1]
        original.stop()
        self.patches.pop()
        with mock.patch.dict(
            os.environ, {"DEVSPHERE_SEED_PASSWORD": "do-not-pass"}
        ), mock.patch.object(
            doctor.subprocess,
            "run",
            return_value=subprocess.CompletedProcess([], 0, "tesseract 5.5.1", ""),
        ) as run:
            self.assertIsNotNone(
                doctor.command_output(["/fake/tesseract", "--version"], 1)
            )
        kwargs = run.call_args.kwargs
        self.assertNotIn("DEVSPHERE_SEED_PASSWORD", kwargs["env"])
        self.assertFalse(kwargs.get("shell", False))
        self.assertEqual(kwargs["timeout"], 1)


if __name__ == "__main__":
    unittest.main()
