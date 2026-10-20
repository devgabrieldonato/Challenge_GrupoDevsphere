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

    def test_critic_format_keeps_bounds_without_mutating_strict_acceptance_schema(self):
        review = {"concerns": [], "sourceFidelity": "Conferir", "tagLeakage": "Conferir"}
        _, captured = BoundedCriticTests().run_review(review)
        schema = captured.review_schema
        original = json.loads(json.dumps(schema))
        self.provider.generate("test:1", [], schema)
        sent = self.calls[-1]["format"]
        expected = json.loads(json.dumps(original))
        for field in ("sourceFidelity", "tagLeakage"):
            expected["properties"][field].pop("pattern")
            self.assertEqual(sent["properties"][field]["minLength"], 1)
            self.assertEqual(sent["properties"][field]["maxLength"], 400)
        expected["properties"]["concerns"]["items"].pop("pattern")
        concerns = sent["properties"]["concerns"]
        self.assertEqual(concerns["maxItems"], 12)
        self.assertEqual(concerns["items"]["maxLength"], 240)
        self.assertEqual(concerns["items"]["minLength"], 1)
        self.assertEqual(sent, expected)
        self.assertEqual(schema, original)
        self.assertEqual(schema["properties"]["concerns"]["items"]["pattern"], r"\S")

    def test_format_preserves_generator_and_other_critic_patterns(self):
        generator = {"type": "object", "properties": {"name": {
            "type": "string", "pattern": r"\S", "minLength": 1, "maxLength": 20,
        }}}
        self.provider.generate("test:1", [], generator)
        self.assertEqual(self.calls[-1]["format"], generator)
        # A compatibilidade é específica ao padrão de espaços do resumo crítico.
        critic = {"type": "object", "properties": {
            "concerns": {"type": "array", "items": {"type": "string", "pattern": "^A+$"}},
            "sourceFidelity": {"type": "string", "pattern": "^B+$"},
        }}
        self.provider.generate("test:1", [], critic)
        self.assertEqual(self.calls[-1]["format"], critic)

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


class BoundedCriticTests(unittest.TestCase):
    """Regressões sintéticas do contrato crítico; não executam inferência."""

    def run_review(self, review):
        class ReviewProvider(FakeProvider):
            def generate(self, model, messages, schema):
                value, meta = super().generate(model, messages, schema)
                if len(self.calls) == 2:
                    self.review_schema = schema
                    self.review_prompt = messages[0]["content"]
                    value = review
                return value, meta

        provider = ReviewProvider(case_fixture())
        result = generate_case({
            "sourceId": "doc",
            "markdown": "## Página 1\n\n" + "Fonte sintética. " * 15,
        }, provider)
        return result, provider

    def test_rejects_empty_excessive_unknown_and_wrong_type_without_accepting_partial(self):
        valid = {"concerns": ["Conferir fonte"], "sourceFidelity": "Conferir", "tagLeakage": "Conferir"}
        invalid = [
            None, {}, {**valid, "concerns": [42]},
            {**valid, "concerns": [""]}, {**valid, "concerns": ["   "]},
            {**valid, "concerns": ["x" * 241]},
            # Regressão do comprimento observado na crítica real; nunca recortar para aceitar.
            {**valid, "concerns": ["x" * 265]},
            {**valid, "concerns": ["Alerta"] * 13},
            {**valid, "approved": True},
        ]
        for field in ("sourceFidelity", "tagLeakage"):
            for value in ("", "   ", "x" * 401, [], None):
                invalid.append({**valid, field: value})
            missing = dict(valid)
            missing.pop(field)
            invalid.append(missing)
        for index, review in enumerate(invalid):
            with self.subTest(invalid=index):
                with self.assertRaises(JobError) as error:
                    self.run_review(review)
                self.assertEqual(error.exception.code, "invalid_critic")
                self.assertTrue(error.exception.retryable)

    def test_accepts_boundary_summary_preserves_it_and_requires_human_review(self):
        review = {"concerns": ["x" * 240] * 12, "sourceFidelity": "x" * 400, "tagLeakage": "x" * 400}
        result, provider = self.run_review(review)
        self.assertEqual(result["criticReview"], review)
        self.assertEqual(result["provenance"]["promptVersion"], "next2026-v4")
        self.assertEqual(result["case"]["status"], "awaiting_human_review")
        self.assertEqual(sum(item["type"] == "question" for item in result["case"]["items"]), 18)
        self.assertEqual(sum(item["type"] == "exam" for item in result["case"]["items"]), 22)
        self.assertTrue(any("não exaustivo" in warning for warning in result["warnings"]))
        self.assertIn("12 alertas", provider.review_prompt)
        self.assertIn("240 caracteres", provider.review_prompt)
        self.assertIn("400 caracteres", provider.review_prompt)
        # O contrato explícito no prompt e no formato precisa ser o aplicado ao retorno.
        prompt_schema = json.loads(provider.review_prompt.split("Contrato JSON obrigatório: ", 1)[1])
        self.assertEqual(prompt_schema, provider.review_schema)
        self.assertFalse(provider.review_schema["additionalProperties"])
        example_text = provider.review_prompt.split("não copie suas conclusões: ", 1)[1].split("\nContrato JSON obrigatório: ", 1)[0]
        example = json.loads(example_text)
        import jsonschema
        jsonschema.validate(example, provider.review_schema)
        self.assertTrue(all(len(item) <= 160 for item in example["concerns"]))
        self.assertTrue(all(len(example[key]) <= 260 for key in ("sourceFidelity", "tagLeakage")))

    def test_accepts_no_identified_concerns_without_claiming_approval(self):
        review = {"concerns": [], "sourceFidelity": "Revisão humana necessária", "tagLeakage": "Conferir manualmente"}
        result, _ = self.run_review(review)
        self.assertEqual(result["criticReview"]["concerns"], [])
        self.assertEqual(result["case"]["status"], "awaiting_human_review")
