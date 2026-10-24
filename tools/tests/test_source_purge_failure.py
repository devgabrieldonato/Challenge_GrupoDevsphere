"""Falha física pós-commit reproduzida somente na API filha e nos PDFs sintéticos."""
from contextlib import closing
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from test_protected_api import PurgeApiTests

@unittest.skipUnless(sys.platform=='darwin','Interposição desta fixture é específica do macOS; não é chamada em produção.')
class PendingCleanupTests(PurgeApiTests):
    @classmethod
    def setUpClass(cls):
        cls.library_directory=tempfile.TemporaryDirectory(prefix='pv-purge-fault-')
        folder=Path(cls.library_directory.name);source=folder/'failure.c';library=folder/'failure.dylib'
        # Interposição somente no filho descartável. Não injeta ganchos no código de produção.
        source.write_text('''#include <unistd.h>
#include <errno.h>
#include <string.h>
#include <dlfcn.h>
static int fail_purge_unlink(int fd,const char *name,int flags) {
 if(name && strncmp(name,".purge-",7)==0) {errno=EACCES;return -1;}
 int (*original)(int,const char*,int)=dlsym(RTLD_NEXT,"unlinkat");
 if(!original) {errno=EIO;return -1;}
 return original(fd,name,flags);
}
__attribute__((used)) static struct {const void *replacement;const void *original;} interpose
 __attribute__((section("__DATA,__interpose")))={(const void*)fail_purge_unlink,(const void*)unlinkat};
''')
        subprocess.run(['cc','-dynamiclib','-o',str(library),str(source)],capture_output=True,check=True,timeout=20)
        with patch.dict(os.environ,{'DYLD_INSERT_LIBRARIES':str(library)}):super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        try:super().tearDownClass()
        finally:cls.library_directory.cleanup()

    def test_post_commit_unlink_failure_is_visible_and_idempotent(self):
        identifier=self.withdrawn();path=self.storage/f'{identifier}.pdf'
        status,result,_=self.request('DELETE',f'/api/v1/documents/{identifier}',cookie=self.a)
        self.assertEqual(status,202,result);self.assertTrue(result['cleanupPending'])
        self.assertFalse(path.exists())
        with closing(sqlite3.connect(self.db)) as db:
            receipt=db.execute('SELECT quarantine_name,cleanup_pending FROM source_purge_receipts WHERE document_id=?',(identifier,)).fetchone()
            self.assertEqual(receipt[1],1);self.assertTrue((self.storage/receipt[0]).is_file())
            self.assertEqual(db.execute('SELECT count(*) FROM source_documents WHERE id=?',(identifier,)).fetchone()[0],0)
        again=self.request('DELETE',f'/api/v1/documents/{identifier}',cookie=self.a)
        self.assertEqual(again[0],200);self.assertTrue(again[1]['cleanupPending'])
        self.assertEqual(self.request('DELETE',f'/api/v1/documents/{identifier}',cookie=self.b)[0],404)
        self.assertNotIn(receipt[0],str(result))

def load_tests(loader,tests,pattern):return unittest.TestSuite([PendingCleanupTests('test_post_commit_unlink_failure_is_visible_and_idempotent')])
if __name__=='__main__':unittest.main()
