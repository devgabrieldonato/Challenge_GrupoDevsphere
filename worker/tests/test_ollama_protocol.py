"""Contrato HTTP do adaptador; servidor falso existe somente nestes testes."""

import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch
from worker.core import JobError, Ollama, generate_case
from test_generation import FakeProvider, case_fixture


class OllamaProtocolTests(unittest.TestCase):
    """Exercita transporte real local sem carregar modelos ou acessar o banco."""

    def setUp(self):
        self.calls = []
        self.reply = {
            "model": "test:1",
            "done": True,
            "done_reason": "stop",
            "message": {"content": '{"ok":true}'},
            "eval_count": 4,
            "prompt_eval_count": 12,
            "load_duration": 15,
        }
        self.http_status = 200
        self.models = [{"name": "test:1", "digest": "test-digest"}]
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass

            def do_GET(self):
                self.send_response(200)
                self.end_headers()
                self.wfile.write(json.dumps({"models": outer.models}).encode())

            def do_POST(self):
                outer.calls.append(
                    json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                )
                self.send_response(outer.http_status)
                self.end_headers()
                self.wfile.write(
                    outer.reply
                    if isinstance(outer.reply, bytes)
                    else json.dumps(outer.reply).encode()
                )

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.provider = Ollama(f"http://127.0.0.1:{self.server.server_port}", timeout=2)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(2)

    def call(self):
        return self.provider.generate("test:1", [], {"type": "object"})

    def assert_failure(self, expected):
        with self.assertRaises(JobError) as error:
            self.call()
        self.assertEqual(error.exception.code, expected)
        self.assertTrue(error.exception.retryable)

    def test_completed_json_records_metrics_and_sequential_unload_request(self):
        value, meta = self.call()
        self.assertEqual(value, {"ok": True})
        self.assertEqual(meta["digest"], "test-digest")
        self.assertEqual(meta["promptTokens"], 12)
        self.assertEqual(meta["loadDurationNs"], 15)
        self.assertEqual(self.calls[0]["keep_alive"], 0)
        self.assertIs(self.calls[0]["think"], False)

    def test_valid_json_without_done_is_incomplete(self):
        self.reply["done"] = False
        self.assert_failure("provider_incomplete")

    def test_token_limit_is_never_accepted_as_completion(self):
        self.reply["done_reason"] = "length"
        self.assert_failure("generation_truncated")

    def test_wrong_model_and_malformed_messages_are_rejected(self):
        for reply in (
            {"done": True, "model": "other:1"},
            {"done": True, "model": "test:1", "message": []},
            {"done": True, "model": "test:1", "message": {"content": "invalid"}},
            [],
            b"not-json",
        ):
            with self.subTest(reply=reply):
                self.reply = reply
                self.assert_failure("provider_invalid_response")

    def test_busy_provider_does_not_echo_untrusted_response(self):
        self.http_status = 503
        self.reply = {"error": "SENSITIVE_SOURCE_CONTENT"}
        with self.assertRaises(JobError) as error:
            self.call()
        self.assertEqual(error.exception.code, "provider_busy")
        self.assertNotIn("SENSITIVE", error.exception.message)

    def test_absent_model_fails_before_chat(self):
        self.models = []
        self.assert_failure("model_unavailable")
        self.assertEqual(self.calls, [])

    def test_timeout_configuration_is_explicit_and_bounded(self):
        with patch.dict("os.environ", {"DEVSPHERE_OLLAMA_TIMEOUT": "30"}):
            self.assertEqual(Ollama().timeout, 30)
        for value in ("invalid", "0", "901", True):
            with self.subTest(value=value):
                with self.assertRaises(JobError) as error:
                    Ollama(timeout=value)
                self.assertEqual(error.exception.code, "invalid_model_config")

    def test_critic_concerns_must_contain_only_text(self):
        class InvalidCritic(FakeProvider):
            def generate(self, *args):
                value, meta = super().generate(*args)
                if len(self.calls) == 2:
                    value["concerns"] = [42]
                return value, meta

        request = {
            "sourceId": "doc",
            "markdown": "## Página 1\n\n" + "Fonte sintética. " * 15,
        }
        with self.assertRaises(JobError) as error:
            generate_case(request, InvalidCritic(case_fixture()))
        self.assertEqual(error.exception.code, "invalid_critic")
