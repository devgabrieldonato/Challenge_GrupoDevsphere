"""Fixtures sintéticas: métricas não exigem inferência nem banco pessoal."""
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("macos_measurement", Path(__file__).resolve().parents[1] / "measure_macos_job.py")
measure = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(measure)


class MeasurementTests(unittest.TestCase):
    def test_vm_units_and_missing_values(self):
        data = measure.parse_vm('Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free: 12.\nSwapouts: 2.\n')
        self.assertEqual(data['freePagesBytes'], 196608)
        self.assertEqual(data['swapoutsPages'], 2)
        self.assertNotIn('availableBytes', data)
        self.assertIsNone(measure.parse_vm(None))

    def test_swap_units_and_permission_denied(self):
        self.assertEqual(measure.parse_swap('total = 1024.00M used = 1.50G free = 2.00M')['usedBytes'], 1610612736)
        self.assertIsNone(measure.parse_swap(None))

    def test_rss_only_ollama_not_other_processes(self):
        data = '/Applications/Ollama.app/Contents/MacOS/Ollama 100\n/usr/bin/python 900\n/opt/ollama-runner 200\ninvalid\n'
        self.assertEqual(measure.parse_rss(data), 300*1024)
        self.assertIsNone(measure.parse_rss('/usr/bin/python 900'))

    def test_private_metrics_allowlist(self):
        metrics = measure.safe_metrics({'model': 'qwen3:8b', 'promptTokens': 10, 'prompt': 'SECRET', 'options': {'password': 'SECRET'}, 'durationNs': -1})
        self.assertEqual(metrics, {'model': 'qwen3:8b', 'promptTokens': 10})

    def test_new_jobs_only_readonly_and_sanitized(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'synthetic.db'
            db = sqlite3.connect(path)
            db.execute('CREATE TABLE worker_jobs(id TEXT,document_id TEXT,operation TEXT,status TEXT,attempts INTEGER,cancel_requested INTEGER,error_json TEXT,result_json TEXT,created_at TEXT)')
            db.execute("INSERT INTO worker_jobs VALUES('old','doc','generate','failed',1,0,?,NULL,'2026-01-01')", (json.dumps({'code':'select_fewer_pages','message':'SECRET'}),))
            db.commit()
            db.close()
            before = path.read_bytes()
            readonly = measure.open_database(path)
            self.assertIsNone(measure.read_job(readonly, 'doc', {'old'}))
            observed = measure.read_job(readonly, 'doc', set())
            self.assertEqual(observed['error']['code'], 'select_fewer_pages')
            self.assertNotIn('SECRET', json.dumps(observed))
            with self.assertRaises(sqlite3.OperationalError):
                readonly.execute('DELETE FROM worker_jobs')
            readonly.close()
            self.assertEqual(before, path.read_bytes())
            with self.assertRaises(sqlite3.OperationalError):
                measure.open_database(Path(folder)/'missing.db')
            self.assertFalse((Path(folder)/'missing.db').exists())

    def test_completed_result_does_not_export_clinical_text(self):
        row = {'id': 'safeid', 'operation': 'generate', 'status': 'completed', 'attempts': 1, 'cancel_requested': 0, 'error_json': None,
               'result_json': json.dumps({'case': {'name':'SECRET', 'items':[{'type':'question','text':'SECRET'},{'type':'exam'}]}, 'provenance': {'generator': {'model':'qwen3:8b','promptTokens':42,'prompt':'SECRET'},'sourceId':'SECRET'}})}
        result = measure.safe_job(row)
        self.assertEqual(result['counts'], {'question':1,'exam':1})
        self.assertEqual(result['provenance']['generator']['promptTokens'],42)
        self.assertNotIn('SECRET',json.dumps(result))

    def test_report_private_no_overwrite_no_symlink(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/'report.json'
            measure.write_report(path, {'safe': True})
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError):
                measure.write_report(path, {'safe': False})
            link = Path(folder)/'link'
            link.symlink_to(path)
            with self.assertRaises(FileExistsError):
                measure.write_report(link, {})
            self.assertEqual(json.loads(path.read_text()), {'safe':True})


if __name__ == '__main__':
    unittest.main()
