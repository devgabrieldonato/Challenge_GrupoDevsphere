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

    def test_upgrades_main_schema_preserving_academic_history(self):
        """Evolui 001–005 com dados sintéticos e confere relações e backup anterior."""
        with tempfile.TemporaryDirectory(prefix="pv-main-upgrade-") as folder:
            database = Path(folder) / "synthetic-main.db"
            historical = sorted((ROOT / "backend/migrations").glob("*.sql"))[:5]
            self.assertEqual([p.name[:3] for p in historical],
                             ["001", "002", "003", "004", "005"])
            with closing(sqlite3.connect(database)) as db, db:
                db.execute("PRAGMA foreign_keys=ON")
                db.execute("PRAGMA journal_mode=WAL")
                db.execute("CREATE TABLE schema_migrations(version TEXT PRIMARY KEY, "
                           "applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)")
                for migration in historical:
                    db.executescript(migration.read_text(encoding="utf-8"))
                    db.execute("INSERT INTO schema_migrations(version) VALUES(?)",
                               (migration.name,))
                # IDs próprios mantêm as linhagens do teste separadas das sementes.
                # O hash e o PDF são marcadores sintéticos: este teste verifica
                # persistência byte a byte, sem autenticação ou renderização.
                db.executescript("""
                    INSERT INTO users(id,full_name,email,password_hash,role)
                      VALUES(10001,'Aluno sintético','aluno@migration.invalid','hash-fixture','student'),
                            (10002,'Docente sintético','docente@migration.invalid','hash-fixture','teacher');
                    INSERT INTO admin_accounts(user_id,notification_email)
                      VALUES(10002,'curadoria@migration.invalid');
                    INSERT INTO institutional_email_domains(id,domain,created_by)
                      VALUES(10001,'migration.invalid',10002);
                    INSERT INTO registration_requests(id,user_id,requested_role,status,reviewed_by)
                      VALUES(10001,10001,'student','approved',10002);
                    INSERT INTO email_outbox(id,recipient,template_key)
                      VALUES(10001,'aluno@migration.invalid','registro.fixture');
                    INSERT INTO classes(id,name,teacher_id) VALUES(10001,'Turma sintética',10002);
                    INSERT INTO class_enrollments(class_id,student_id) VALUES(10001,10001);
                    INSERT INTO clinical_cases(id,stable_key,title,status,author_id)
                      VALUES(10001,'migration-fixture','Caso sintético','published',10002);
                    INSERT INTO case_versions(id,clinical_case_id,version_number,content_json,created_by)
                      VALUES(10001,10001,1,'{"fixture":true}',10002);
                    UPDATE clinical_cases SET current_version_id=10001 WHERE id=10001;
                    INSERT INTO case_items(id,case_version_id,stable_key,item_type,position,title,answer)
                      VALUES(10001,10001,'fixture-question','question',1,'Pergunta sintética','Resposta sintética');
                    INSERT INTO case_hypotheses(id,case_version_id,stable_key,label,position)
                      VALUES(10001,10001,'fixture-hypothesis','Hipótese sintética',1);
                    INSERT INTO activities(id,title,case_version_id,teacher_id,class_id)
                      VALUES(10001,'Atividade sintética',10001,10002,10001);
                    INSERT INTO activity_assignments(activity_id,student_id) VALUES(10001,10001);
                    INSERT INTO uploaded_documents(id,uploaded_by,original_name,stored_path,sha256,mime_type,byte_size)
                      VALUES(10001,10001,'fixture.pdf','private-fixture','hash-fixture','application/pdf',13);
                    INSERT INTO ai_generation_jobs(id,requested_by,operation_type,status,source_document_id)
                      VALUES(10001,10002,'fixture','failed',10001);
                    INSERT INTO submissions(id,activity_id,student_id,case_version_id,
                      source_document_id,client_submission_id,submitted_by,reviewer_id,raw_score,displayed_score)
                      VALUES(10001,10001,10001,10001,10001,'fixture-idempotency',10001,10002,53,53);
                    INSERT INTO submission_steps(id,submission_id,sequence_number,item_key,item_type,title,response)
                      VALUES(10001,10001,1,'fixture-question','question','Pergunta sintética','Resposta sintética');
                    INSERT INTO diagnostic_attempts(id,submission_id,attempt_number,hypothesis_key,
                      hypothesis_label,justification,evidence_snapshot_json)
                      VALUES(10001,10001,1,'fixture-hypothesis','Hipótese sintética','Justificativa sintética','["fixture-question"]');
                    INSERT INTO submission_score_events(id,submission_id,sequence_number,item_key,item_type,
                      classification,rule_set_version,base_points,delta,raw_total_after,displayed_total_after)
                      VALUES(10001,10001,1,'fixture-question','question','relevant','fixture-1',3,3,53,53);
                    INSERT INTO submission_documents(submission_id,original_name,mime_type,sha256,byte_size,pdf_blob)
                      VALUES(10001,'fixture.pdf','application/pdf','hash-fixture',13,X'255044462D666978747572650A');
                    INSERT INTO teacher_feedback(id,submission_id,teacher_id,strengths,
                      next_attempt_guidance,status,completed_at)
                      VALUES(10001,10001,10002,'Ponto forte sintético','Orientação sintética','completed','2026-01-01 00:00:00');
                    INSERT INTO sessions(id,user_id,token_hash,expires_at)
                      VALUES(10001,10001,'fixture-token-hash','2099-01-01 00:00:00');
                    INSERT INTO audit_logs(id,user_id,action,entity_type,entity_id)
                      VALUES(10001,10002,'fixture.feedback','submission',10001);
                """)
                self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])
                # Guardar a projeção histórica permite novas colunas e sementes,
                # mas nenhuma alteração aos valores existentes ou seus vínculos.
                snapshots = {}
                tables = [r[0] for r in db.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' "
                    "AND name<>'schema_migrations' AND name NOT LIKE 'sqlite_%'")]
                for table in tables:
                    columns = [r[1] for r in db.execute(f'PRAGMA table_info("{table}")')]
                    projection = ",".join(f'"{column}"' for column in columns)
                    rows = db.execute(f'SELECT rowid,{projection} FROM "{table}" ORDER BY rowid').fetchall()
                    snapshots[table] = (projection, rows)
                db.commit()
            env = dict(os.environ, DEVSPHERE_DB_PATH=str(database),
                       DEVSPHERE_ENV="development", DEVSPHERE_INFERENCE_ENABLED="0",
                       DEVSPHERE_MIGRATIONS_DIR=str(ROOT / "backend/migrations"),
                       DEVSPHERE_CASE_SEED=str(ROOT / "backend/seeds/legacy-cases.json"))
            env.pop("DEVSPHERE_BACKUP_PASSWORD", None)
            for iteration in range(2):
                result = subprocess.run([str(BINARY), "--migrate"], env=env,
                                        cwd=ROOT, capture_output=True, timeout=30)
                self.assertEqual(result.returncode, 0, result.stderr)
                with closing(sqlite3.connect(database)) as db, db:
                    self.assertEqual(db.execute("PRAGMA integrity_check").fetchone()[0], "ok")
                    self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])
                    self.assertEqual(db.execute("SELECT COUNT(*) FROM schema_migrations").fetchone()[0], 17)
                    for table, (projection, rows) in snapshots.items():
                        ids = [row[0] for row in rows]
                        if ids:
                            parameters = ",".join("?" for _ in ids)
                            actual = db.execute(
                                f'SELECT rowid,{projection} FROM "{table}" '
                                f'WHERE rowid IN ({parameters}) ORDER BY rowid', ids).fetchall()
                            self.assertEqual(actual, rows, f"histórico alterado: {table}, execução {iteration}")
                    self.assertEqual(db.execute("SELECT institution_id FROM users WHERE id=10001").fetchone()[0], "local")
                    self.assertEqual(db.execute("SELECT COUNT(*) FROM clinical_sessions").fetchone()[0], 0)
                    self.assertEqual(db.execute("SELECT COUNT(*) FROM user_notifications").fetchone()[0], 0)
            backups = list((Path(folder) / "backups").glob("*.db"))
            self.assertEqual(len(backups), 1, "reaplicação não deve criar outro backup")
            with closing(sqlite3.connect(backups[0])) as snapshot, snapshot:
                self.assertEqual(snapshot.execute("SELECT COUNT(*) FROM schema_migrations").fetchone()[0], 5)
                self.assertEqual(snapshot.execute("SELECT next_attempt_guidance FROM teacher_feedback WHERE id=10001").fetchone()[0], "Orientação sintética")
                self.assertEqual(snapshot.execute("PRAGMA foreign_key_check").fetchall(), [])

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
