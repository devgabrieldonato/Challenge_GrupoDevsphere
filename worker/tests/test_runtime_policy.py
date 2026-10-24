"""Política e validade com fontes sintéticas, sem inferência e sem banco pessoal."""
import json
import os
from pathlib import Path
import sqlite3
import unittest
from unittest.mock import patch
from worker.core import JobError, Ollama, generate_case, prepare_generation_preview
from worker.run import claim, execute, execute_child, validate_preview
from worker.runtime_policy import (config_hash, heartbeat, inference_enabled, input_hash,
                                   require_runtime_schema, runtime_config)


class RuntimePolicyTests(unittest.TestCase):
    def setUp(self):
        self.policy = patch.dict(os.environ, {"DEVSPHERE_INFERENCE_ENABLED": "0"})
        self.policy.start()
        self.addCleanup(self.policy.stop)
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        self.addCleanup(self.db.close)
        root = Path(__file__).resolve().parents[2]
        self.db.executescript("CREATE TABLE users(id INTEGER PRIMARY KEY,institution_id TEXT DEFAULT 'local'); INSERT INTO users VALUES(1,'local'),(2,'local');" + (root/'backend/migrations/008_pipeline.sql').read_text() + (root/'backend/migrations/012_library_index.sql').read_text())
        self.db.execute("INSERT INTO source_documents(id,owner_id,storage_path,original_name,sha256,status,markdown,pages_json,authorized_use,deidentified) VALUES('doc',1,'synthetic.pdf','synthetic.pdf','abc','converted',?, '[{\"page\":1}]',1,1)", (self.request()['markdown'],))
        self.db.commit()

    def request(self):
        return {'sourceId':'doc','sourceHash':'abc','markdown':'## Página 1\n\n'+'Fonte sintética com dado 100 mg/dL. '*8,'allowedReferences':['source:doc#page:1'],'pages':[1],'instructions':'Material sintético','query':''}

    def add_job(self, identity='real', request=None, status='queued', result=None, owner=1):
        request = {} if request is None else request
        self.db.execute("INSERT INTO worker_jobs(id,owner_id,document_id,operation,idempotency_key,request_json,status,result_json) VALUES(?,?,'doc','generate',?,?,?,?)",(identity,owner,identity,json.dumps(request),status,json.dumps(result) if result else None))
        self.db.commit()
        return dict(self.db.execute('SELECT * FROM worker_jobs WHERE id=?',(identity,)).fetchone())

    def test_requires_exact_explicit_opt_in(self):
        for value in ('0','true','yes',' 1','1 '):
            with patch.dict(os.environ, {'DEVSPHERE_INFERENCE_ENABLED':value}):
                self.assertFalse(inference_enabled())
        with patch.dict(os.environ, {'DEVSPHERE_INFERENCE_ENABLED':'1'}):
            self.assertTrue(inference_enabled())

    def test_direct_provider_has_no_network_when_disabled(self):
        with patch('urllib.request.build_opener',side_effect=AssertionError('Rede proibida')):
            with self.assertRaises(JobError) as caught:
                Ollama().generate('qwen3:8b',[],{})
        self.assertEqual(caught.exception.code,'inference_disabled')
        self.assertFalse(caught.exception.retryable)

    def test_core_child_and_execute_are_blocked(self):
        with patch('worker.run.subprocess.Popen', side_effect=AssertionError('Filho proibido')):
            for call in (lambda: generate_case(self.request()),lambda:execute_child({'operation':'generate',**self.request()}),lambda:execute(self.db,self.add_job(),'.')):
                with self.assertRaises(JobError) as caught:
                    call()
                self.assertEqual(caught.exception.code,'inference_disabled')

    def test_policy_is_checked_again_before_critic(self):
        from test_generation import FakeProvider
        class DisableAfterGenerator(FakeProvider):
            def generate(self, *args):
                result = super().generate(*args)
                os.environ['DEVSPHERE_INFERENCE_ENABLED'] = '0'
                return result
        provider = DisableAfterGenerator()
        with patch.dict(os.environ, {'DEVSPHERE_INFERENCE_ENABLED':'1'}):
            with self.assertRaises(JobError) as caught:
                generate_case(self.request(), provider)
        self.assertEqual(caught.exception.code, 'inference_disabled')
        self.assertEqual(len(provider.calls), 1)

    def test_claim_preserves_blocked_without_attempt_and_allows_budget(self):
        self.add_job()
        self.add_job('preview',{'operation':'budget'})
        self.assertEqual(claim(self.db)['id'],'preview')
        row = self.db.execute("SELECT status,attempts,error_json FROM worker_jobs WHERE id='real'").fetchone()
        self.assertEqual(tuple(row)[:2],('failed',0))
        self.assertEqual(json.loads(row['error_json'])['code'],'inference_disabled')
        self.assertIsNone(claim(self.db))

    def test_preview_has_config_input_expiry_without_inference(self):
        with patch('worker.core.Ollama.generate',side_effect=AssertionError('Modelo proibido')):
            report=execute_child({'operation':'budget',**self.request()})
        self.assertTrue(report['fits'])
        self.assertFalse(report['inferenceEnabled'])
        self.assertEqual(report['validUntil']-report['diagnosedAt'],120)
        self.assertEqual(report['inputHash'],input_hash(self.request()))
        self.assertEqual(report['configHash'],config_hash())
        self.assertNotIn('Fonte sintética',json.dumps(report))

    def preview(self):
        result=prepare_generation_preview(self.request())
        self.add_job('preview',{'operation':'budget'},'completed',result)
        return self.add_job(),result

    def test_preview_revalidated_with_owner_doc_and_expiry(self):
        with patch.dict(os.environ,{'DEVSPHERE_INFERENCE_ENABLED':'1'}):
            job,result=self.preview()
            validate_preview(self.db,job,'preview',self.request(),now=result['diagnosedAt'])
            for identity,request,now in [('missing',self.request(),result['diagnosedAt']),('preview',{**self.request(),'instructions':'changed'},result['diagnosedAt']),('preview',self.request(),result['validUntil'])]:
                with self.assertRaises(JobError) as caught:
                    validate_preview(self.db,job,identity,request,now=now)
                self.assertEqual(caught.exception.code,'stale_preview')
            with self.assertRaises(JobError):
                validate_preview(self.db,{**job,'owner_id':2},'preview',self.request())

    def test_configuration_and_source_change_invalidate(self):
        job,_result=self.preview()
        with patch.dict(os.environ,{'DEVSPHERE_OLLAMA_BATCH':'32'}):
            with self.assertRaises(JobError) as caught:
                validate_preview(self.db,job,'preview',self.request())
            self.assertEqual(caught.exception.code,'stale_config')
        for changed in ({'markdown':self.request()['markdown']+' alterado'},{'sources':[{'document_id':'new','page':1,'text':'trecho'}]}):
            with self.assertRaises(JobError):
                validate_preview(self.db,job,'preview',{**self.request(),**changed})

    def test_heartbeat_allowlist_and_schema_requirement(self):
        with self.assertRaises(RuntimeError):
            require_runtime_schema(self.db)
        self.db.execute('CREATE TABLE worker_runtime(instance_id TEXT PRIMARY KEY,started_at INTEGER,heartbeat_at INTEGER,config_json TEXT,config_hash TEXT)')
        require_runtime_schema(self.db)
        with patch.dict(os.environ,{'SECRET_SENTINEL':'should-not-appear'}):
            heartbeat(self.db,100)
            heartbeat(self.db,105)
        rows=self.db.execute('SELECT * FROM worker_runtime').fetchall()
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]['heartbeat_at'],105)
        config=json.loads(rows[0]['config_json'])
        self.assertEqual(config['inferenceEnabled'],False)
        self.assertNotIn('should-not-appear',rows[0]['config_json'])
        self.assertEqual(len(rows[0]['instance_id']),32)
        self.assertEqual(rows[0]['config_hash'],config_hash())

    def test_invalid_configuration_remains_safe_and_detectable(self):
        with patch.dict(os.environ,{'DEVSPHERE_OLLAMA_CONTEXT':'bad'}):
            self.assertEqual(runtime_config()['configurationError'],'invalid_model_config')
            self.assertFalse(prepare_generation_preview(self.request())['fits'])


if __name__=='__main__':
    unittest.main()
