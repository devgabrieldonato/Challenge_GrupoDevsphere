"""Prévia real sem provedor; regressões de contexto e retentativas determinísticas."""
import json
import os
import sqlite3
from pathlib import Path
import unittest
from unittest.mock import patch
from worker.core import (JobError, context_budget, generate_case, generation_input,
                         prepare_generation_preview, require_context)
from worker.run import execute_child, claim, finish
from test_generation import FakeProvider


class ContextBudgetTests(unittest.TestCase):
    def request(self):
        return {
            'sourceId': 'doc', 'sourceHash': 'abc', 'pages': [1],
            'markdown': '## Página 1\n\n' + 'Fonte sintética, glicemia 100 mg/dL. ' * 5,
            'instructions': 'Caso sintético completo.',
        }

    def test_preview_uses_same_final_messages_without_provider(self):
        with patch('worker.core.Ollama.generate', side_effect=AssertionError('Inferência indevida')):
            report = prepare_generation_preview(self.request())
        _, messages, _ = generation_input(self.request())
        self.assertEqual(report['budget'], context_budget(messages))
        self.assertTrue(report['budgetPreview'])
        self.assertTrue(report['fits'])
        self.assertEqual(report['limits']['generation']['context'], 8192)
        self.assertEqual(report['limits']['generation']['output'], 6000)
        self.assertEqual(report['budget']['templateReserveTokens'], 512)
        self.assertEqual(report['review']['status'], 'requires_generated_case')
        self.assertNotIn('Fonte sintética', json.dumps(report))

    def test_changed_instructions_change_budget(self):
        one = prepare_generation_preview(self.request())
        two = prepare_generation_preview({**self.request(), 'instructions': 'x' * 2000})
        self.assertGreater(two['budget']['estimatedInputTokens'], one['budget']['estimatedInputTokens'])

    def test_over_budget_preview_completes_and_execution_does_not_call_model(self):
        env = {'DEVSPHERE_OLLAMA_CONTEXT':'8192', 'DEVSPHERE_OLLAMA_MAX_TOKENS':'6000'}
        req = {**self.request(), 'instructions':'x'*4000}
        with patch.dict(os.environ, env), patch('worker.core.Ollama.generate', side_effect=AssertionError('Inferência indevida')):
            report = execute_child({**req, 'operation': 'budget'})
            self.assertFalse(report['fits'])
            self.assertEqual(report['code'], 'select_fewer_pages')
            self.assertLess(report['budget']['remainingTokens'], 0)
            with self.assertRaises(JobError) as error:
                generate_case(req, FakeProvider())
            self.assertFalse(error.exception.retryable)

    def test_invalid_pages_and_configuration_are_deterministic(self):
        report = prepare_generation_preview({**self.request(), 'pages': [99]})
        self.assertFalse(report['fits'])
        self.assertEqual(report['code'], 'invalid_pages')
        with patch.dict(os.environ, {'DEVSPHERE_OLLAMA_CONTEXT':'bad'}):
            report = prepare_generation_preview(self.request())
        self.assertEqual(report['code'], 'invalid_model_config')
        self.assertFalse(report['fits'])

    def test_review_configuration_is_separate_and_effective(self):
        with patch.dict(os.environ, {'DEVSPHERE_OLLAMA_CRITIC_CONTEXT':'16384', 'DEVSPHERE_OLLAMA_TIMEOUT':'123'}):
            report = prepare_generation_preview({**self.request(), 'workerLoadedAt': 1234})
        self.assertEqual(report['limits']['review']['context'],16384)
        self.assertEqual(report['limits']['timeoutSeconds'],123)
        self.assertEqual(report['workerLoadedAt'],1234)

    def test_context_failure_is_not_queued_again(self):
        root = Path(__file__).resolve().parents[2]
        with sqlite3.connect(":memory:") as db:
            db.row_factory = sqlite3.Row
            db.executescript(
                "CREATE TABLE users(id INTEGER PRIMARY KEY,institution_id TEXT DEFAULT 'local');"
                "INSERT INTO users(id) VALUES(1);"
                + (root / "backend/migrations/008_pipeline.sql").read_text()
            )
            db.execute("INSERT INTO source_documents(id,owner_id,storage_path,original_name,sha256,authorized_use,deidentified) VALUES('doc',1,'safe.pdf','teste.pdf','abc',1,1)")
            db.execute("INSERT INTO worker_jobs(id,owner_id,document_id,operation,idempotency_key) VALUES('j',1,'doc','generate','j')")
            db.commit()
            job = claim(db)
            finish(db, job, {'status':'failed', 'error': {'code':'select_fewer_pages', 'message':'Contexto excedido.', 'retryable':False}})
            row = db.execute("SELECT status,attempts,error_json FROM worker_jobs WHERE id='j'").fetchone()
            self.assertEqual(row['status'], 'failed')
            self.assertEqual(row['attempts'], 1)
            self.assertFalse(json.loads(row['error_json'])['retryable'])
            self.assertIsNone(claim(db))
        db.close()

    def test_reserves_cannot_be_removed_to_fit(self):
        messages = [{'role':'user','content':'x'*6000}]
        budget = context_budget(messages)
        self.assertFalse(budget['fits'])
        with self.assertRaises(JobError) as error:
            require_context(messages)
        self.assertFalse(error.exception.retryable)


if __name__ == '__main__':
    unittest.main()


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
