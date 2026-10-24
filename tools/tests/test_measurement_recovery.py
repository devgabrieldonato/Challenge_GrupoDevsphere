"""Recuperação e watchdog com filhos leves; nenhum modelo ou pressão real de memória."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
from measurement_journal import Journal,recover_checkpoint
import guarded_process

class RecoveryTests(unittest.TestCase):
    def test_partial_record_recovers_completed_samples(self):
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)/'check.jsonl'
            journal=Journal(p,{'startedAt':'synthetic','notes':['no clinical data']})
            with patch('measurement_journal.os.fsync',wraps=os.fsync) as sync:
                journal.append('sample',{'elapsedSeconds':1,'models':None})
                self.assertEqual(sync.call_count,1)
            journal.append('transition',{'job':{'id':'synthetic','status':'running'}});journal.close()
            with p.open('ab') as f:f.write(b'{"kind":"sample"')
            r=recover_checkpoint(p)
            self.assertTrue(r['incomplete']);self.assertTrue(r['truncatedFinalRecord'])
            self.assertEqual(len(r['samples']),1);self.assertEqual(r['job']['status'],'running')
            self.assertEqual(p.stat().st_mode&0o777,0o600)
            with self.assertRaises(FileExistsError):Journal(p,{})
            link=Path(folder)/'link';link.symlink_to(p)
            with self.assertRaises(OSError):recover_checkpoint(link)

    def test_abrupt_writer_exit_does_not_lose_last_sample(self):
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)/'check.jsonl'
            script="from measurement_journal import Journal; import os; j=Journal(os.environ['TEST_JOURNAL'],{});j.append('sample',{'elapsedSeconds':1});os._exit(7)"
            env=dict(os.environ,PYTHONPATH=str(ROOT/'tools'),TEST_JOURNAL=str(p))
            r=subprocess.run([sys.executable,'-c',script],env=env,timeout=5)
            self.assertEqual(r.returncode,7);self.assertEqual(len(recover_checkpoint(p)['samples']),1)

    def test_watchdog_ends_only_owned_sleeping_child(self):
        with tempfile.TemporaryDirectory() as folder:
            report=Path(folder)/'watchdog.jsonl';pidfile=Path(folder)/'child.pid'
            command="import os,time;open("+repr(str(pidfile))+",'w').write(str(os.getpid()));time.sleep(10)"
            r=subprocess.run([sys.executable,str(ROOT/'tools/guarded_process.py'),'--timeout','.4','--min-free-percent','0','--report',str(report),'--',sys.executable,'-c',command],capture_output=True,text=True,timeout=5)
            self.assertEqual(r.returncode,1);self.assertEqual(json.loads(r.stdout)['stopReason'],'duration_limit')
            pid=int(pidfile.read_text())
            with self.assertRaises(ProcessLookupError):os.kill(pid,0)
            self.assertFalse(recover_checkpoint(report)['incomplete'])
            os.kill(os.getpid(),0) # O processo de teste não foi afetado.

    def test_mocked_low_headroom_interrupts_only_fixture(self):
        with tempfile.TemporaryDirectory() as folder:
            report=Path(folder)/'watchdog.jsonl'
            argv=['guarded_process','--timeout','5','--consecutive','1','--report',str(report),'--',sys.executable,'-c','import time;time.sleep(10)']
            with patch.object(sys,'argv',argv),patch.object(guarded_process,'free_percent',return_value=1):
                self.assertEqual(guarded_process.main(),1)
            self.assertEqual(recover_checkpoint(report)['stopReason'],'low_memory_headroom')

if __name__=='__main__':unittest.main()
