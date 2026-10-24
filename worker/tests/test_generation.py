"""Provedor falso apenas para testes: o produto nunca retorna esta fixture."""

import copy
import importlib.util
import unittest
from worker.core import JobError, Ollama, generate_case
from unittest.mock import patch


def case_fixture():
    """Caso estrutural sintético; nenhuma alegação clínica."""
    return {
        "schemaVersion": "1.0",
        "id": "synthetic",
        "version": 1,
        "status": "approved",
        "patient": {
            "displayName": "Pessoa fictícia",
            "age": 30,
            "chiefComplaint": "Queixa sintética",
            "context": "Teste de software",
        },
        "learningObjectives": ["Testar contrato"],
        "items": [
            {
                "id": f"i{i}",
                "type": "question" if i < 18 else "exam",
                "title": f"Item {i}",
                "answer": "Resposta sintética",
                "quality": "relevant" if i < 20 else "low_value",
                "why": "Justificativa sintética",
            }
            for i in range(40)
        ],
        "hypotheses": [
            {"id": "a", "label": "Hipótese sintética A"},
            {"id": "b", "label": "Hipótese sintética B"},
        ],
        "outcome": {"hypothesisId": "a", "explanation": "Explicação sintética"},
        "references": ["source:doc#page:1"],
    }


class FakeProvider:
    """Duas chamadas determinísticas representam gerador e crítico no teste."""

    def __init__(self, case=None):
        self.calls = []
        self.case = case or case_fixture()

    def generate(self, model, messages, schema):
        self.calls.append(model)
        return (
            copy.deepcopy(self.case)
            if len(self.calls) == 1
            else {
                "concerns": ["Exige revisão humana"],
                "sourceFidelity": "Teste",
                "tagLeakage": "Conferir",
            }
        ), {"model": model}


@unittest.skipUnless(
    importlib.util.find_spec("jsonschema"),
    "Instale worker/requirements.txt para testes de geração",
)
class GenerationTests(unittest.TestCase):
    def request(self):
        return {
            "sourceId": "doc",
            "sourceHash": "abc",
            "markdown": "## Página 1\n\n" + "Material educacional sintético. " * 8,
            "allowedReferences": ["source:doc#page:1"],
        }

    def test_forces_review_and_maps_canonical(self):
        provider = FakeProvider()
        result = generate_case(self.request(), provider)
        self.assertEqual(result["case"]["status"], "awaiting_human_review")
        self.assertEqual(len(provider.calls), 2)
        self.assertEqual(
            result["contribution"]["content"]["patient"]["name"], "Pessoa fictícia"
        )
        self.assertEqual(
            result["contribution"]["content"]["patient"]["complaint"],
            "Queixa sintética",
        )
        self.assertEqual(
            result["contribution"]["content"]["correctHypothesis"],
            "Hipótese sintética A",
        )
        self.assertEqual(
            result["contribution"]["content"]["scoring"]["items"]["i20"]["basePoints"],
            -8,
        )

    def test_invalid_model_limits_fail_before_network(self):
        with patch.dict("os.environ", {"DEVSPHERE_OLLAMA_CONTEXT": "inválido"}):
            with self.assertRaises(JobError) as failure:
                Ollama().generate("qwen3:8b", [], {})
        self.assertEqual(failure.exception.code, "invalid_model_config")

    def test_rejects_malformed_public_metadata(self):
        case = case_fixture()
        case["metadata"] = {"publicTags": "texto em vez de lista"}
        with self.assertRaises(JobError) as failure:
            generate_case(self.request(), FakeProvider(case))
        self.assertEqual(failure.exception.code, "invalid_case")

    def test_rejects_duplicate_hypothesis_labels(self):
        case = case_fixture()
        case["hypotheses"][1]["label"] = case["hypotheses"][0]["label"]
        with self.assertRaises(JobError):
            generate_case(self.request(), FakeProvider(case))

    def test_rejects_fake_reference(self):
        case = case_fixture()
        case["references"] = ["https://invented.example"]
        with self.assertRaises(JobError) as failure:
            generate_case(self.request(), FakeProvider(case))
        self.assertEqual(failure.exception.code, "unsupported_reference")

    def test_rejects_missing_item(self):
        case = case_fixture()
        case["items"].pop()
        with self.assertRaises(JobError):
            generate_case(self.request(), FakeProvider(case))

    def test_rejects_invalid_score(self):
        case = case_fixture()
        case["items"][0]["quality"] = "plus_one_million"
        with self.assertRaises(JobError):
            generate_case(self.request(), FakeProvider(case))





# Opt-in restrito às fixtures deste módulo; nunca habilita o daemon real.
def setUpModule():
    global _policy_patch
    from unittest.mock import patch
    _policy_patch = patch.dict("os.environ", {"DEVSPHERE_INFERENCE_ENABLED": "1"})
    _policy_patch.start()

def tearDownModule():
    _policy_patch.stop()


if __name__ == "__main__":
    unittest.main()
