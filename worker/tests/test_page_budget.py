"""Seleção e orçamento: fontes sintéticas e provedor falso somente em testes."""

import importlib.util
import unittest
from unittest.mock import patch
from worker.core import JobError, prepare_generation_request, generate_case
from test_generation import FakeProvider, case_fixture


class PageBudgetTests(unittest.TestCase):
    def request(self):
        return {
            "sourceId": "doc",
            "sourceHash": "abc",
            "pages": [1],
            "markdown": "## Página 1\n\n"
            + "Material sintético. " * 10
            + "\n\n## Página 2\n\nPAGINA_EXCLUIDA",
        }

    def test_selection_excludes_whole_page_and_its_reference(self):
        result = prepare_generation_request(self.request())
        self.assertNotIn("PAGINA_EXCLUIDA", result["markdown"])
        self.assertEqual(result["allowedReferences"], ["source:doc#page:1"])
        self.assertEqual(result["selection"]["selectedPages"], [1])

    def test_page_must_exist_and_selection_cannot_be_boolean_or_empty(self):
        for pages in ([3], [True], "1"):
            with self.subTest(pages=pages):
                with self.assertRaises(JobError) as caught:
                    prepare_generation_request({**self.request(), "pages": pages})
                self.assertEqual(caught.exception.code, "invalid_pages")

    def test_empty_selection_means_all_converted_pages(self):
        result = prepare_generation_request({**self.request(), "pages": []})
        self.assertEqual(result["selection"]["selectedPages"], [1, 2])

    def test_edited_header_cannot_invent_authorized_page(self):
        request = {
            **self.request(),
            "pages": [2],
            "allowedReferences": ["source:doc#page:1"],
        }
        with self.assertRaises(JobError) as caught:
            prepare_generation_request(request)
        self.assertEqual(caught.exception.code, "invalid_pages")

    def test_duplicate_headers_and_unpaged_prefix_are_rejected(self):
        for text in (
            "Texto sem página",
            "Introdução sem página\n## Página 1\nTexto",
            "## Página 1\nA\n## Página 1\nB",
        ):
            with self.assertRaises(JobError):
                prepare_generation_request({**self.request(), "markdown": text})

    def test_rag_keeps_whole_excerpts_and_reports_omissions(self):
        def source(doc, text, page=3):
            return {
                "document_id": doc,
                "page": page,
                "text": text,
                "sha256": "abc",
                "markdown_sha256": "def",
            }

        req = {
            **self.request(),
            "sources": [
                source("doc", "PAGINA_EXCLUIDA", 2),
                source("allowed", "Trecho completo; sem corte."),
                source("too-large", "x" * 6001),
            ],
        }
        with patch.dict("os.environ", {"DEVSPHERE_OLLAMA_CONTEXT": "16384"}):
            result = prepare_generation_request(req)
        self.assertEqual(
            [source["document_id"] for source in result["sources"]], ["allowed"]
        )
        self.assertEqual(result["sources"][0]["text"], "Trecho completo; sem corte.")
        self.assertEqual(len(result["selection"]["supplementalOmitted"]), 2)
        self.assertEqual(
            result["allowedReferences"], ["source:doc#page:1", "source:allowed#page:3"]
        )

    @unittest.skipUnless(
        importlib.util.find_spec("jsonschema"), "Instale requisitos worker"
    )
    def test_excessive_source_never_calls_provider(self):
        provider = FakeProvider()
        with self.assertRaises(JobError) as caught:
            generate_case(
                {**self.request(), "markdown": "## Página 1\n\n" + "x" * 6001}, provider
            )
        self.assertEqual(caught.exception.code, "select_fewer_pages")
        self.assertEqual(provider.calls, [])
        self.assertFalse(caught.exception.retryable)

    @unittest.skipUnless(
        importlib.util.find_spec("jsonschema"), "Instale requisitos worker"
    )
    def test_context_budget_is_checked_before_provider(self):
        provider = FakeProvider()
        with patch.dict(
            "os.environ",
            {"DEVSPHERE_OLLAMA_CONTEXT": "4096", "DEVSPHERE_OLLAMA_MAX_TOKENS": "3500"},
        ):
            with self.assertRaises(JobError) as caught:
                generate_case(self.request(), provider)
        self.assertEqual(caught.exception.code, "select_fewer_pages")
        self.assertEqual(provider.calls, [])

    @unittest.skipUnless(
        importlib.util.find_spec("jsonschema"), "Instale requisitos worker"
    )
    def test_excluded_page_reference_cannot_be_invented(self):
        case = case_fixture()
        case["references"] = ["source:doc#page:2"]
        provider = FakeProvider(case)
        with self.assertRaises(JobError) as caught:
            generate_case(self.request(), provider)
        self.assertEqual(caught.exception.code, "unsupported_reference")
        self.assertEqual(len(provider.calls), 1)

    @unittest.skipUnless(
        importlib.util.find_spec("jsonschema"), "Instale requisitos worker"
    )
    def test_records_selection_and_separate_review_budget(self):
        result = generate_case(self.request(), FakeProvider())
        self.assertEqual(result["provenance"]["selection"]["selectedPages"], [1])
        self.assertEqual(
            result["provenance"]["contextBudget"]["review"]["reservedOutputTokens"], 768
        )





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
