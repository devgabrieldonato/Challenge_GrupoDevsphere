"""Verifica restauração, WAL e rejeição de corrupção sem tocar na base pessoal."""

import importlib.util
from pathlib import Path
from contextlib import closing
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location(
    "secure_backup", Path(__file__).parents[1] / "secure_backup.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BackupTests(unittest.TestCase):
    def test_snapshot_and_authenticated_restore(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.db"
            encrypted = root / "backup.pvb"
            target = root / "restore.db"
            with closing(sqlite3.connect(source)) as con, con:
                con.execute("PRAGMA journal_mode=WAL")
                con.execute("CREATE TABLE evidence(value TEXT)")
                con.execute("INSERT INTO evidence VALUES('persistente')")
                con.commit()
                module.backup(source, encrypted, "fixture-backup-secret-2026")
            self.assertNotIn(b"persistente", encrypted.read_bytes())
            with self.assertRaises(Exception):
                module.restore(encrypted, target, "wrong-password-long-enough")
            self.assertFalse(target.exists())
            module.restore(encrypted, target, "fixture-backup-secret-2026")
            with closing(sqlite3.connect(target)) as con, con:
                self.assertEqual(
                    con.execute("SELECT value FROM evidence").fetchone()[0],
                    "persistente",
                )
            with self.assertRaises(ValueError):
                module.restore(encrypted, target, "fixture-backup-secret-2026")
            encrypted.write_bytes(encrypted.read_bytes()[:-1] + b"!")
            with self.assertRaises(Exception):
                module.restore(encrypted, root / "bad.db", "fixture-backup-secret-2026")


if __name__ == "__main__":
    unittest.main()
