"""API e worker reais em base sintética, sem provedor de inferência disponível."""
from contextlib import closing
import io
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import unittest
from unittest.mock import patch
from test_next_http import NextHttpTests,ROOT

class ProtectedPipelineTests(NextHttpTests):
    @classmethod
    def setUpClass(cls):
        with patch.dict(os.environ,{'DEVSPHERE_INFERENCE_ENABLED':'0','DEVSPHERE_OLLAMA_URL':'http://127.0.0.1:1'}):
            super().setUpClass()

    def run_worker_once(self):
        env=dict(self.env,DEVSPHERE_INFERENCE_ENABLED='0',DEVSPHERE_OLLAMA_URL='http://127.0.0.1:1')
        result=subprocess.run([sys.executable,'-m','worker.run','--db',str(self.db),'--storage',str(self.storage),'--once'],env=env,cwd=ROOT,capture_output=True,text=True,timeout=30)
        self.assertEqual(result.returncode,0,result.stderr)

    def test_conversion_budget_and_protection_real_pipeline(self):
        from reportlab.pdfgen import canvas
        output=io.BytesIO();pdf=canvas.Canvas(output)
        for page in range(1,4):
            pdf.drawString(30,740,f'Pagina sintetica {page}: dados exclusivamente ficticios para teste de software.')
            pdf.drawString(30,710,'Temperatura 37.2 C; glicemia 100 mg/dL; texto educacional autorizado.')
            pdf.showPage()
        pdf.save()
        status,doc,_=self.upload(pdf=output.getvalue());self.assertEqual(status,201)
        url=f"/api/v1/documents/{doc['id']}/jobs"
        status,conversion,_=self.request('POST',url,{'operation':'convert'},cookie=self.a);self.assertEqual(status,202)
        self.run_worker_once()
        converted=self.request('GET',f"/api/v1/jobs/{conversion['id']}",cookie=self.a)[1]
        self.assertEqual(converted['status'],'completed',converted)
        markdown=converted['result']['markdown']
        self.assertIn('100 mg/dL',markdown);self.assertIn('## Página 3',markdown)
        status,preview,_=self.request('POST',url,{'operation':'budget','pages':[2,3],'instructions':'Caso sintetico com fontes rastreaveis.'},cookie=self.a);self.assertEqual(status,202)
        self.run_worker_once()
        state=self.request('GET',f"/api/v1/jobs/{preview['id']}",cookie=self.a)[1]
        self.assertEqual(state['status'],'completed',state)
        result=state['result'];self.assertTrue(result['budgetPreview']);self.assertTrue(result['fits'],result)
        self.assertFalse(result['inferenceEnabled']);self.assertEqual(result['selection']['selectedPages'],[2,3])
        self.assertGreater(result['validUntil'],result['diagnosedAt'])
        runtime=self.request('GET','/api/v1/runtime',cookie=self.a)[1]
        self.assertFalse(runtime['apiInferenceEnabled']);self.assertEqual(runtime['worker']['status'],'alive')
        self.assertEqual(runtime['worker']['configHash'],result['configHash']);self.assertNotIn('config',runtime['worker'])
        status,denied,_=self.request('POST',url,{'operation':'generate','previewJobId':preview['id'],'inferenceEnabled':True},cookie=self.a)
        self.assertEqual(status,403);self.assertEqual(denied['error']['code'],'inference_disabled')
        self.assertEqual(self.request('GET',f"/api/v1/jobs/{preview['id']}",cookie=self.b)[0],404)
        with closing(sqlite3.connect(self.db)) as db:
            self.assertEqual(db.execute("SELECT count(*) FROM worker_jobs WHERE document_id=?",(doc['id'],)).fetchone()[0],2)

def load_tests(loader,tests,pattern):
    return unittest.TestSuite(ProtectedPipelineTests(name) for name in ProtectedPipelineTests.__dict__ if name.startswith('test_'))

if __name__=='__main__':unittest.main()
