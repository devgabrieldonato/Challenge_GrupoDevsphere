"""Manutenção de armazenamento apenas em SQLite e PDFs sintéticos descartáveis."""
import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import socket
import sqlite3
import tempfile
import time
import unittest
from unittest.mock import patch
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools import reconcile_source_storage as reconciliation
from tools.audit_source_storage import ConfigurationError


class SourceReconciliationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="pv-reconcile-")
        self.root = Path(self.temporary.name).resolve()
        self.storage = self.root / "sources"
        self.storage.mkdir(mode=0o700)
        self.quarantine = self.root / "quarantine"
        self.database = self.root / "fixture.db"
        self.plan_path = self.root / "plan.json"
        self.pdf = b"%PDF-1.4\nSynthetic document only. 12 mg/dL.\n%%EOF\n"
        self.identity = "a" * 32
        self.orphan = "b" * 32
        with contextlib.closing(sqlite3.connect(self.database)) as db, db:
            db.executescript("""
                CREATE TABLE source_documents(id TEXT PRIMARY KEY,owner_id INTEGER,storage_path TEXT,sha256 TEXT,markdown TEXT DEFAULT '',status TEXT DEFAULT 'converted');
                CREATE TABLE worker_jobs(id TEXT,document_id TEXT,status TEXT);
                CREATE TABLE worker_runtime(instance_id TEXT,heartbeat_at INTEGER);
                CREATE TABLE version_sources(version_id INTEGER,document_id TEXT);
                CREATE TABLE library_chunks(document_id TEXT,text TEXT);
                CREATE TABLE case_versions(content_json TEXT,metadata_json TEXT);
            """)
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            self.port = sock.getsockname()[1]

    def tearDown(self):
        self.temporary.cleanup()

    def sql(self, text, values=()):
        with contextlib.closing(sqlite3.connect(self.database)) as db, db:
            return db.execute(text, values).fetchall()

    def register(self, *, present=True):
        path = self.storage / (self.identity + ".pdf")
        if present:
            path.write_bytes(self.pdf)
        self.sql("INSERT INTO source_documents(id,owner_id,storage_path,sha256,markdown) VALUES(?,7,?,?,?)", (self.identity, str(path), hashlib.sha256(self.pdf).hexdigest(), "Synthetic reviewed Markdown"))
        return path

    def orphan_file(self):
        result = self.storage / (self.orphan + ".pdf")
        result.write_bytes(self.pdf)
        return result

    def plan(self, restores=None):
        return reconciliation.build_plan(self.database, self.storage, self.quarantine, restores, self.port)

    def assertBlocked(self, code, callback):
        with self.assertRaises(ConfigurationError) as caught:
            callback()
        self.assertEqual(str(caught.exception), code)

    def test_dry_run_preserves_database_sources_and_only_saves_private_plan(self):
        present = self.register()
        orphan = self.orphan_file()
        before = self.database.read_bytes()
        plan = self.plan()
        self.assertEqual(len(plan["actions"]), 1)
        self.assertEqual(plan["actions"][0]["operation"], "quarantine")
        self.assertFalse(self.quarantine.exists())
        self.assertEqual(self.database.read_bytes(), before)
        self.assertEqual(present.read_bytes(), self.pdf)
        self.assertEqual(orphan.read_bytes(), self.pdf)
        reconciliation.write_plan(plan, self.plan_path)
        self.assertEqual(self.plan_path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(reconciliation.load_plan(self.plan_path), plan)
        self.assertRaises(FileExistsError, reconciliation.write_plan, plan, self.plan_path)

    def test_quarantine_and_repeat_preserve_content_and_history(self):
        registered = self.register()
        orphan = self.orphan_file()
        history = self.sql("SELECT * FROM source_documents")
        plan = self.plan()
        result = reconciliation.apply_plan(plan, confirmed=True)
        self.assertEqual(result["quarantined"], 1)
        self.assertFalse(orphan.exists())
        quarantined = list(self.quarantine.glob("*.pdf"))
        self.assertEqual(len(quarantined), 1)
        self.assertEqual(quarantined[0].read_bytes(), self.pdf)
        self.assertEqual(quarantined[0].stat().st_nlink, 1)
        self.assertEqual(self.quarantine.stat().st_mode & 0o777, 0o700)
        self.assertEqual(self.sql("SELECT * FROM source_documents"), history)
        self.assertEqual(registered.read_bytes(), self.pdf)
        self.assertEqual(reconciliation.apply_plan(plan, confirmed=True)["status"], "completed")
        self.assertEqual(len(list(self.quarantine.glob("*.pdf"))), 1)

    def test_link_interruption_and_partial_last_journal_line_recover(self):
        orphan = self.orphan_file()
        plan = self.plan()
        def interrupt(state, index):
            if state == "quarantine_linked":
                raise RuntimeError("fixture interruption")
        with patch.object(reconciliation, "fault_point", side_effect=interrupt):
            self.assertRaises(RuntimeError, reconciliation.apply_plan, plan, confirmed=True)
        self.assertTrue(orphan.exists())
        self.assertEqual(orphan.stat().st_nlink, 2)
        journal = next(self.quarantine.glob("*.jsonl"))
        with journal.open("ab") as output:
            output.write(b'{"partial":')
        result = reconciliation.apply_plan(plan, confirmed=True)
        self.assertEqual(result["status"], "completed")
        self.assertFalse(orphan.exists())
        self.assertEqual(next(self.quarantine.glob("*.pdf")).stat().st_nlink, 1)

    def test_interruption_after_removing_original_link_recovers(self):
        orphan = self.orphan_file()
        plan = self.plan()
        with patch.object(reconciliation, "fault_point", side_effect=RuntimeError("fixture interruption")):
            # Primeiro checkpoint de falha ocorre após link, não depois do unlink.
            self.assertRaises(RuntimeError, reconciliation.apply_plan, plan, confirmed=True)
        def interrupt(state, index):
            if state == "quarantine_unlinked":
                raise RuntimeError("fixture interruption after unlink")
        with patch.object(reconciliation, "fault_point", side_effect=interrupt):
            self.assertRaises(RuntimeError, reconciliation.apply_plan, plan, confirmed=True)
        self.assertFalse(orphan.exists())
        self.assertEqual(reconciliation.apply_plan(plan, confirmed=True)["status"], "completed")

    def test_missing_file_restores_exact_backup_without_changing_database(self):
        destination = self.register(present=False)
        backup = self.root / "explicit-backup.pdf"
        backup.write_bytes(self.pdf)
        before = self.database.read_bytes()
        plan = self.plan({self.identity: backup})
        self.assertEqual(plan["actions"][0]["operation"], "restore")
        self.assertEqual(reconciliation.apply_plan(plan, confirmed=True)["restored"], 1)
        self.assertEqual(destination.read_bytes(), self.pdf)
        self.assertEqual(destination.stat().st_mode & 0o777, 0o600)
        self.assertEqual(destination.stat().st_nlink, 1)
        self.assertEqual(backup.read_bytes(), self.pdf)
        self.assertEqual(self.database.read_bytes(), before)
        self.assertEqual(reconciliation.apply_plan(plan, confirmed=True)["status"], "completed")

    def test_restore_interruption_after_publish_is_idempotent(self):
        destination = self.register(present=False)
        backup = self.root / "backup.pdf"
        backup.write_bytes(self.pdf)
        plan = self.plan({self.identity: backup})
        def interrupt(state, index):
            if state == "restore_published":
                raise RuntimeError("fixture interruption")
        with patch.object(reconciliation, "fault_point", side_effect=interrupt):
            self.assertRaises(RuntimeError, reconciliation.apply_plan, plan, confirmed=True)
        self.assertEqual(destination.read_bytes(), self.pdf)
        self.assertEqual(destination.stat().st_nlink, 2)
        self.assertEqual(reconciliation.apply_plan(plan, confirmed=True)["restored"], 1)
        self.assertEqual(destination.stat().st_nlink, 1)
        self.assertEqual(list(self.quarantine.glob("*.pdf")), [])

    def test_missing_without_backup_and_divergence_remain_manual(self):
        missing = self.register(present=False)
        self.assertEqual(self.plan()["actions"], [])
        self.assertEqual(self.plan()["findings"][0]["reason"], "missing_file_needs_explicit_restore_source")
        missing.write_bytes(self.pdf + b"Changed")
        plan = self.plan()
        self.assertEqual(plan["actions"], [])
        self.assertEqual(plan["findings"][0]["reason"], "registered_file_divergent_no_automatic_move")
        reconciliation.apply_plan(plan, confirmed=True)
        self.assertEqual(missing.read_bytes(), self.pdf + b"Changed")

    def test_restore_mismatch_and_known_size_fail_without_creating_destination(self):
        destination = self.register(present=False)
        backup = self.root / "backup.pdf"
        backup.write_bytes(self.pdf + b"modified")
        self.assertBlocked("restore_hash_mismatch", lambda: self.plan({self.identity: backup}))
        backup.write_bytes(self.pdf)
        self.sql("ALTER TABLE source_documents ADD COLUMN byte_size INTEGER")
        self.sql("UPDATE source_documents SET byte_size=?", (len(self.pdf) + 1,))
        self.assertBlocked("restore_registered_size_mismatch", lambda: self.plan({self.identity: backup}))
        self.sql("UPDATE source_documents SET byte_size=?", (len(self.pdf),))
        self.assertEqual(self.plan({self.identity: backup})["actions"][0]["size"], len(self.pdf))
        self.assertFalse(destination.exists())

    def test_restored_source_changed_after_plan_is_rejected(self):
        destination = self.register(present=False)
        backup = self.root / "backup.pdf"
        backup.write_bytes(self.pdf)
        plan = self.plan({self.identity: backup})
        backup.write_bytes(self.pdf + b"changed")
        self.assertBlocked("restore_source_changed", lambda: reconciliation.apply_plan(plan, confirmed=True))
        self.assertFalse(destination.exists())

    def test_state_change_and_forged_plan_are_rejected(self):
        orphan = self.orphan_file()
        plan = self.plan()
        (self.storage / ("c" * 32 + ".pdf")).write_bytes(self.pdf)
        self.assertBlocked("storage_state_changed", lambda: reconciliation.apply_plan(plan, confirmed=True))
        self.assertTrue(orphan.exists())
        plan = self.plan()
        self.sql("INSERT INTO source_documents(id,owner_id,storage_path,sha256) VALUES(?,7,?,?)", (self.identity, str(self.storage / (self.identity + ".pdf")), hashlib.sha256(self.pdf).hexdigest()))
        self.assertBlocked("database_state_changed", lambda: reconciliation.apply_plan(plan, confirmed=True))
        plan["actions"] = []
        self.assertBlocked("plan_integrity_failed", lambda: reconciliation.apply_plan(plan, confirmed=True))

    def test_busy_database_live_queue_and_worker_block_apply(self):
        self.orphan_file()
        plan = self.plan()
        self.assertBlocked("services_stopped_confirmation_required", lambda: reconciliation.apply_plan(plan))
        with contextlib.closing(sqlite3.connect(self.database)) as lock:
            lock.execute("BEGIN IMMEDIATE")
            self.assertBlocked("database_busy", lambda: reconciliation.apply_plan(plan, confirmed=True))
        self.sql("INSERT INTO worker_jobs VALUES('job',?,'queued')", (self.orphan,))
        plan = self.plan()
        self.assertBlocked("active_jobs_block_maintenance", lambda: reconciliation.apply_plan(plan, confirmed=True))
        self.sql("DELETE FROM worker_jobs")
        self.sql("INSERT INTO worker_runtime VALUES('instance',?)", (int(time.time()),))
        plan = self.plan()
        self.assertBlocked("worker_heartbeat_still_active", lambda: reconciliation.apply_plan(plan, confirmed=True))

    def test_occupied_configured_api_port_blocks_without_stopping_process(self):
        self.orphan_file()
        plan = self.plan()
        with socket.socket() as server:
            server.bind(("127.0.0.1", self.port))
            server.listen()
            self.assertBlocked("api_port_not_available", lambda: reconciliation.apply_plan(plan, confirmed=True))
            self.assertNotEqual(server.fileno(), -1)
        self.assertTrue((self.storage / (self.orphan + ".pdf")).exists())

    def test_history_dependencies_and_misnamed_registered_file_never_move(self):
        path = self.orphan_file()
        self.sql("INSERT INTO worker_jobs VALUES('job',?,'completed')", (self.orphan,))
        self.assertEqual(self.plan()["actions"], [])
        self.sql("DELETE FROM worker_jobs")
        self.sql("INSERT INTO case_versions VALUES(?, '{}')", (json.dumps({"sourceId": self.orphan}),))
        self.assertEqual(self.plan()["actions"], [])
        self.sql("DELETE FROM case_versions")
        self.sql("INSERT INTO source_documents(id,owner_id,storage_path,sha256) VALUES(?,7,?,?)", (self.identity, str(path), hashlib.sha256(self.pdf).hexdigest()))
        self.assertEqual(self.plan()["actions"], [])
        self.assertTrue(path.exists())

    def test_links_unexpected_names_and_nested_entries_are_not_automated(self):
        outside = self.root / "outside.pdf"
        outside.write_bytes(self.pdf)
        linked = self.storage / (self.orphan + ".pdf")
        linked.symlink_to(outside)
        other = self.storage / ("c" * 32 + ".pdf")
        os.link(outside, other)
        (self.storage / "patient-original-name.pdf").write_bytes(self.pdf)
        (self.storage / "folder").mkdir()
        plan = self.plan()
        self.assertEqual(plan["actions"], [])
        self.assertNotIn("patient-original-name", json.dumps(plan))
        backup_link = self.root / "backup-link.pdf"
        backup_link.symlink_to(outside)
        self.register(present=False)
        self.assertBlocked("unsafe_restore_source", lambda: self.plan({self.identity: backup_link}))
        # Hard links são recusados também como fonte explícita de restauração.
        self.assertBlocked("unsafe_file", lambda: self.plan({self.identity: outside}))

    def test_quarantine_collision_and_symlink_never_overwrite(self):
        orphan = self.orphan_file()
        plan = self.plan()
        self.quarantine.mkdir(mode=0o700)
        collision = self.quarantine / (plan["planHash"][:20] + "-0.pdf")
        collision.write_bytes(b"Do not overwrite")
        self.assertBlocked("recovery_file_changed", lambda: reconciliation.apply_plan(plan, confirmed=True))
        self.assertEqual(collision.read_bytes(), b"Do not overwrite")
        self.assertTrue(orphan.exists())

    def test_journal_corruption_is_not_ignored(self):
        self.orphan_file()
        plan = self.plan()
        reconciliation.apply_plan(plan, confirmed=True)
        journal = next(self.quarantine.glob("*.jsonl"))
        records = journal.read_text().splitlines()
        record = json.loads(records[0])
        record["state"] = "tampered"
        journal.write_text(json.dumps(record) + "\n" + "\n".join(records[1:]) + "\n")
        self.assertBlocked("journal_integrity_failed", lambda: reconciliation.apply_plan(plan, confirmed=True))

    def test_restore_destination_appearing_after_plan_is_preserved(self):
        destination = self.register(present=False)
        backup = self.root / "backup.pdf"
        backup.write_bytes(self.pdf)
        plan = self.plan({self.identity: backup})
        destination.write_bytes(b"unexpected new upload")
        self.assertBlocked("storage_state_changed", lambda: reconciliation.apply_plan(plan, confirmed=True))
        self.assertEqual(destination.read_bytes(), b"unexpected new upload")

    def test_private_journal_lock_and_permissions_are_enforced(self):
        self.orphan_file()
        plan = self.plan()
        reconciliation.apply_plan(plan, confirmed=True)
        journal = next(self.quarantine.glob("*.jsonl"))
        import fcntl
        with journal.open("rb") as locked:
            fcntl.flock(locked.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assertBlocked("reconciliation_already_running", lambda: reconciliation.apply_plan(plan, confirmed=True))
        journal.chmod(0o644)
        self.assertBlocked("unsafe_journal", lambda: reconciliation.apply_plan(plan, confirmed=True))

    def test_interrupted_unrecorded_restore_stage_is_preserved_for_manual_review(self):
        destination = self.register(present=False)
        backup = self.root / "backup.pdf"
        backup.write_bytes(self.pdf)
        plan = self.plan({self.identity: backup})
        original = reconciliation.write_all
        def interrupt(fd, data):
            if data.startswith(b"%PDF-"):
                original(fd, data[:12])
                raise RuntimeError("fixture interrupted copy")
            return original(fd, data)
        with patch.object(reconciliation, "write_all", side_effect=interrupt):
            self.assertRaises(RuntimeError, reconciliation.apply_plan, plan, confirmed=True)
        staged = next(self.quarantine.glob("*.pdf"))
        self.assertEqual(staged.read_bytes(), self.pdf[:12])
        self.assertBlocked("recovery_file_changed", lambda: reconciliation.apply_plan(plan, confirmed=True))
        self.assertFalse(destination.exists())
        self.assertEqual(staged.read_bytes(), self.pdf[:12])
        self.assertEqual(backup.read_bytes(), self.pdf)

    def test_bounded_enumeration_and_plan_integrity(self):
        for letter in ("b", "c", "d"):
            (self.storage / (letter * 32 + ".pdf")).write_bytes(self.pdf)
        with patch.object(reconciliation, "MAX_ITEMS", 2):
            self.assertBlocked("entry_count_limit", self.plan)
        plan = self.plan()
        reconciliation.write_plan(plan, self.plan_path)
        saved = json.loads(self.plan_path.read_text())
        saved["actions"] = []
        self.plan_path.write_text(json.dumps(saved))
        self.assertBlocked("plan_integrity_failed", lambda: reconciliation.load_plan(self.plan_path))

    def test_paths_and_quarantine_directory_permissions_are_conservative(self):
        self.orphan_file()
        self.assertBlocked("invalid_path", lambda: reconciliation.build_plan(self.database, self.storage, self.storage / ".." / "quarantine", api_port=self.port))
        self.assertBlocked("private_destination_required", lambda: reconciliation.build_plan(self.database, self.storage, self.storage / "quarantine", api_port=self.port))
        plan = self.plan()
        self.quarantine.mkdir(mode=0o755)
        self.quarantine.chmod(0o755)
        self.assertBlocked("private_same_filesystem_quarantine_required", lambda: reconciliation.apply_plan(plan, confirmed=True))

    def test_reserve_configuration_change_and_invalid_values_are_denied(self):
        self.orphan_file()
        plan = self.plan()
        with patch.dict(os.environ, {"DEVSPHERE_STORAGE_MIN_FREE_BYTES": str(plan["minimumFreeBytes"] + 1)}):
            self.assertBlocked("storage_configuration_changed", lambda: reconciliation.apply_plan(plan, confirmed=True))
        for invalid in ("0", "-1", "1.5", "abc", str(1024**4 + 1)):
            with patch.dict(os.environ, {"DEVSPHERE_STORAGE_MIN_FREE_BYTES": invalid}):
                self.assertBlocked("invalid_storage_configuration", self.plan)

    def test_low_disk_reserves_restore_bytes_without_creating_partial_source(self):
        destination = self.register(present=False)
        backup = self.root / "backup.pdf"
        backup.write_bytes(self.pdf)
        plan = self.plan({self.identity: backup})
        class NearFloor:
            f_frsize = 1
            f_bavail = plan["minimumFreeBytes"] + len(self.pdf) - 1
        with patch.object(reconciliation.os, "fstatvfs", return_value=NearFloor()):
            self.assertBlocked("disk_reserve_required", lambda: reconciliation.apply_plan(plan, confirmed=True))
        self.assertFalse(destination.exists())
        self.assertEqual(list(self.quarantine.glob("*.pdf")), [])
        self.assertEqual(backup.read_bytes(), self.pdf)

    def test_cli_summary_is_sanitized_and_plan_is_not_public(self):
        self.orphan_file()
        output = io.StringIO()
        args = ["--db", str(self.database), "--storage", str(self.storage), "--quarantine", str(self.quarantine), "--plan", str(self.plan_path), "--api-port", str(self.port)]
        with contextlib.redirect_stdout(output):
            self.assertEqual(reconciliation.main(args), 0)
        self.assertEqual(json.loads(output.getvalue())["status"], "planned_no_changes")
        self.assertNotIn(str(self.root), output.getvalue())
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(reconciliation.main(["apply", "--plan", str(self.plan_path)]), 2)
            self.assertEqual(reconciliation.main(["apply", "--plan", str(self.plan_path), "--confirm-services-stopped"]), 0)
        self.assertBlocked("private_destination_required", lambda: reconciliation.write_plan(self.plan(), self.storage / "private-plan.json"))


if __name__ == "__main__":
    unittest.main()
