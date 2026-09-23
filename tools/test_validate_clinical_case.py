#!/usr/bin/env python3
"""Testes das invariantes formais dos casos gerados."""

import unittest

from validate_clinical_case import validate_case


def make_case() -> dict:
    items = []
    for index in range(18):
        items.append({
            "id": f"q{index}",
            "type": "question",
            "title": f"Pergunta {index}",
            "answer": "Resposta simulada",
            "quality": "Pertinente",
            "why": "Justificativa pedagógica",
        })
    for index in range(22):
        items.append({
            "id": f"e{index}",
            "type": "exam",
            "title": f"Exame {index}",
            "answer": "Resultado simulado",
            "quality": "Complementar",
            "why": "Justificativa pedagógica",
        })
    items[1]["parent"] = "q0"
    return {
        "schemaVersion": "1.0",
        "items": items,
        "priorityEvidenceIds": ["q0", "e0"],
        "hypotheses": [
            {"id": "h1", "label": "Hipótese 1"},
            {"id": "h2", "label": "Hipótese 2"},
        ],
        "outcome": {"hypothesisId": "h1", "explanation": "Desfecho esperado"},
        "references": ["Referência clínica"],
        "learningObjectives": ["Objetivo didático"],
    }


class ClinicalCaseValidatorTest(unittest.TestCase):
    def test_accepts_valid_structure(self):
        self.assertEqual(validate_case(make_case()), [])

    def test_rejects_wrong_counts(self):
        case = make_case()
        case["items"].pop()
        errors = validate_case(case)
        self.assertTrue(any("40 itens" in error for error in errors))
        self.assertTrue(any("22 exames" in error for error in errors))

    def test_rejects_duplicate_and_missing_parent(self):
        case = make_case()
        case["items"][2]["id"] = "q0"
        case["items"][3]["parent"] = "ausente"
        errors = validate_case(case)
        self.assertTrue(any("IDs duplicados" in error for error in errors))
        self.assertTrue(any("parent inexistente" in error for error in errors))

    def test_rejects_dependency_cycle(self):
        case = make_case()
        case["items"][0]["parent"] = "q1"
        case["items"][1]["parent"] = "q0"
        errors = validate_case(case)
        self.assertTrue(any("Ciclo de dependências" in error for error in errors))

    def test_rejects_unknown_priority_evidence(self):
        case = make_case()
        case["priorityEvidenceIds"].append("inexistente")
        self.assertTrue(any("Evidência prioritária inexistente" in error for error in validate_case(case)))

    def test_rejects_unknown_outcome_hypothesis(self):
        case = make_case()
        case["outcome"]["hypothesisId"] = "inexistente"
        self.assertTrue(any("outcome.hypothesisId" in error for error in validate_case(case)))


if __name__ == "__main__":
    unittest.main()
