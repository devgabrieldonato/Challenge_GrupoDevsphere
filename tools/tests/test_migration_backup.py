"""Verifica snapshot anterior à evolução usando somente SQLite temporário."""

import os
from pathlib import Path
from contextlib import closing
import sqlite3
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
BINARY = Path(
    os.environ.get("DEVSPHERE_TEST_API_BIN", "/private/tmp/pv-next-build/devsphere-api")
)


@unittest.skipUnless(BINARY.is_file(), "Compile a API antes do teste")
class MigrationBackupTests(unittest.TestCase):
    def test_preserves_existing_wal_and_skips_repeat(self):
        """O snapshot deve conter dados comprometidos no WAL e não repetir sem migration."""
        with tempfile.TemporaryDirectory(prefix="pv-migration-backup-") as folder:
            database = Path(folder) / "synthetic.db"
            with closing(sqlite3.connect(database)) as active, active:
                active.execute("PRAGMA journal_mode=WAL")
                active.execute("CREATE TABLE sentinel(value TEXT)")
                active.execute("INSERT INTO sentinel VALUES('preservado')")
                active.commit()
                env = dict(
                    os.environ,
                    DEVSPHERE_DB_PATH=str(database),
                    DEVSPHERE_ENV="development",
                    DEVSPHERE_MIGRATIONS_DIR=str(ROOT / "backend/migrations"),
                    DEVSPHERE_CASE_SEED=str(ROOT / "backend/seeds/legacy-cases.json"),
                )
                env.pop("DEVSPHERE_BACKUP_PASSWORD", None)
                result = subprocess.run(
                    [str(BINARY), "--migrate"],
                    env=env,
                    cwd=ROOT,
                    capture_output=True,
                    timeout=30,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                copies = list((Path(folder) / "backups").glob("*.db"))
                self.assertEqual(len(copies), 1)
                with closing(sqlite3.connect(copies[0])) as snapshot, snapshot:
                    self.assertEqual(
                        snapshot.execute("SELECT value FROM sentinel").fetchone()[0],
                        "preservado",
                    )
                    self.assertEqual(
                        snapshot.execute("PRAGMA integrity_check").fetchone()[0], "ok"
                    )
                self.assertEqual(copies[0].stat().st_mode & 0o777, 0o600)
                result = subprocess.run(
                    [str(BINARY), "--migrate"],
                    env=env,
                    cwd=ROOT,
                    capture_output=True,
                    timeout=30,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(len(list((Path(folder) / "backups").glob("*.db"))), 1)

    def test_wal_without_auxiliary_files_can_restart(self):
        """SQLite Apple precisa recriar SHM mesmo sem migration pendente."""
        with tempfile.TemporaryDirectory(prefix="pv-wal-restart-") as folder:
            database = Path(folder) / "synthetic.db"
            env = dict(
                os.environ,
                DEVSPHERE_DB_PATH=str(database),
                DEVSPHERE_ENV="development",
                DEVSPHERE_MIGRATIONS_DIR=str(ROOT / "backend/migrations"),
                DEVSPHERE_CASE_SEED=str(ROOT / "backend/seeds/legacy-cases.json"),
            )
            env.pop("DEVSPHERE_BACKUP_PASSWORD", None)
            for _ in range(2):
                result = subprocess.run(
                    [str(BINARY), "--migrate"],
                    env=env,
                    cwd=ROOT,
                    capture_output=True,
                    timeout=30,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                # A conexão Python encerra e remove WAL/SHM limpos antes do reinício C++.
                with closing(sqlite3.connect(database)) as db, db:
                    db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            self.assertFalse((Path(folder) / "backups").exists())

    def test_production_without_backup_secret_blocks_migration(self):
        """Falhar antes de alterar esquema é preferível a migrar sem backup cifrado."""
        with tempfile.TemporaryDirectory(prefix="pv-migration-block-") as folder:
            database = Path(folder) / "synthetic.db"
            with closing(sqlite3.connect(database)) as db, db:
                db.execute("CREATE TABLE sentinel(value TEXT)")
            env = dict(
                os.environ,
                DEVSPHERE_DB_PATH=str(database),
                DEVSPHERE_ENV="production",
                DEVSPHERE_MIGRATIONS_DIR=str(ROOT / "backend/migrations"),
            )
            env.pop("DEVSPHERE_BACKUP_PASSWORD", None)
            result = subprocess.run(
                [str(BINARY), "--migrate"],
                env=env,
                cwd=ROOT,
                capture_output=True,
                timeout=30,
            )
            self.assertNotEqual(result.returncode, 0)
            with closing(sqlite3.connect(database)) as db, db:
                self.assertIsNone(
                    db.execute(
                        "SELECT name FROM sqlite_master WHERE name='schema_migrations'"
                    ).fetchone()
                )


if __name__ == "__main__":
    unittest.main()
