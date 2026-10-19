"""Auditoria readonly exclusivamente com PDFs opacos e SQLite sintéticos."""

import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.audit_source_storage import audit_storage, Limits, main


class SourceStorageAuditTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="pv-storage-audit-")
        self.root = Path(self.temporary.name)
        self.storage = self.root / "sources"
        self.storage.mkdir(mode=0o700)
        self.database = self.root / "fixture.db"
        with contextlib.closing(
            sqlite3.connect(self.database)
        ) as connection, connection:
            connection.execute(
                "CREATE TABLE source_documents(id TEXT,owner_id INTEGER,storage_path TEXT,sha256 TEXT,original_name TEXT)"
            )
        self.pdf = b"%PDF-1.4\nSynthetic fixture, no patient information.\n%%EOF\n"

    def tearDown(self):
        self.temporary.cleanup()

    def register(self, identity="fixture-a", path=None, data=None, create=True):
        path = path or self.storage / (identity + ".pdf")
        data = self.pdf if data is None else data
        if create:
            path.write_bytes(data)
        with contextlib.closing(
            sqlite3.connect(self.database)
        ) as connection, connection:
            connection.execute(
                "INSERT INTO source_documents VALUES(?,7,?,?,?)",
                (
                    identity,
                    str(path),
                    hashlib.sha256(data).hexdigest(),
                    "NEVER-PRINT-original-clinical-name.pdf",
                ),
            )
        return path

    @staticmethod
    def categories(report):
        return {item["category"] for item in report["findings"]}

    def test_consistent_readonly_and_observed_bytes(self):
        path = self.register()
        database_before = self.database.read_bytes()
        files_before = sorted(item.name for item in self.storage.iterdir())
        result = audit_storage(self.database, self.storage)
        self.assertEqual(result["status"], "consistent")
        self.assertTrue(result["complete"])
        self.assertEqual(result["summary"]["bytesHashed"], len(self.pdf))
        self.assertEqual(result["summary"]["observedBytes"], len(self.pdf))
        self.assertEqual(
            result["usage"]["byOwner"],
            [{"ownerId": 7, "documents": 1, "bytes": len(self.pdf)}],
        )
        self.assertFalse(result["usage"]["enforcedQuota"])
        self.assertEqual(self.database.read_bytes(), database_before)
        self.assertEqual(path.read_bytes(), self.pdf)
        self.assertEqual(
            sorted(item.name for item in self.storage.iterdir()), files_before
        )
        self.assertNotIn("NEVER-PRINT", json.dumps(result))

    def test_missing_orphan_and_hash_divergence_are_detected_without_names(self):
        self.register("missing", create=False)
        changed = self.register("changed")
        changed.write_bytes(b"%PDF-1.4\nModified synthetic content\n%%EOF")
        (self.storage / "sensitive-name-do-not-print.pdf").write_bytes(self.pdf)
        result = audit_storage(self.database, self.storage)
        self.assertTrue(
            {"missing_file", "orphan_file", "sha256_mismatch"}
            <= self.categories(result)
        )
        encoded = json.dumps(result)
        self.assertNotIn(str(self.root), encoded)
        self.assertNotIn("sensitive-name", encoded)
        self.assertEqual(
            len(
                [
                    item
                    for item in result["findings"]
                    if item["category"] == "orphan_file"
                ]
            ),
            1,
        )

    def test_external_paths_and_symlinks_are_never_read(self):
        outside = self.root / "external-secret.pdf"
        outside.write_bytes(b"DO NOT READ EXTERNAL CONTENT")
        self.register("outside", path=outside, create=False)
        direct = self.storage / "direct.pdf"
        direct.symlink_to(outside)
        self.register("symlink", path=direct, create=False)
        external_directory = self.root / "external-dir"
        external_directory.mkdir()
        (external_directory / "inside.pdf").write_bytes(outside.read_bytes())
        linked_directory = self.storage / "linked-directory"
        linked_directory.symlink_to(external_directory, target_is_directory=True)
        self.register("nested-link", path=linked_directory / "inside.pdf", create=False)
        external_inodes = {
            outside.stat().st_ino,
            (external_directory / "inside.pdf").stat().st_ino,
        }
        real_read = os.read

        def forbid_external_read(descriptor, count):
            self.assertNotIn(os.fstat(descriptor).st_ino, external_inodes)
            return real_read(descriptor, count)

        with patch(
            "tools.audit_source_storage.os.read", side_effect=forbid_external_read
        ):
            result = audit_storage(self.database, self.storage)
        self.assertTrue(
            {"outside_storage_root", "symlink_reference", "symlink_entry"}
            <= self.categories(result)
        )
        self.assertEqual(result["summary"]["bytesHashed"], 0)
        self.assertNotIn(str(outside), json.dumps(result))
        self.assertTrue(direct.is_symlink())

    def test_file_and_global_read_budgets_fail_incomplete(self):
        self.register()
        result = audit_storage(self.database, self.storage, Limits(max_hash_bytes=1))
        self.assertIn("hash_read_budget_limit", self.categories(result))
        self.assertEqual(result["summary"]["bytesHashed"], 0)
        self.assertFalse(result["complete"])
        oversized = self.storage / "oversized.pdf"
        with oversized.open("wb") as output:
            output.truncate(10 * 1024 * 1024 + 1)
        self.register("oversized", path=oversized, create=False)
        result = audit_storage(self.database, self.storage)
        self.assertIn("file_size_limit", self.categories(result))
        self.assertFalse(result["complete"])
        result = audit_storage(self.database, self.storage, Limits(max_entries=1))
        self.assertIn("entry_count_limit", self.categories(result))
        self.assertLessEqual(result["summary"]["entriesScanned"], 1)
        result = audit_storage(self.database, self.storage, Limits(max_documents=1))
        self.assertIn("document_count_limit", self.categories(result))
        self.assertEqual(result["summary"]["documentsChecked"], 1)

    def test_cli_exit_codes_private_new_report_and_no_repairs(self):
        self.register()
        arguments = ["--db", str(self.database), "--storage", str(self.storage)]
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            self.assertEqual(main(arguments), 0)
        self.assertEqual(json.loads(stdout.getvalue())["status"], "consistent")
        report = self.root / "audit.json"
        self.assertEqual(main(arguments + ["--report", str(report)]), 0)
        self.assertEqual(report.stat().st_mode & 0o777, 0o600)
        before = report.read_bytes()
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            self.assertEqual(main(arguments + ["--report", str(report)]), 2)
        self.assertEqual(report.read_bytes(), before)
        self.assertEqual(
            json.loads(stdout.getvalue())["error"]["code"], "report_unavailable"
        )
        (self.storage / "orphan.pdf").write_bytes(self.pdf)
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(main(arguments), 1)
        self.assertTrue((self.storage / "orphan.pdf").is_file())
        absent = self.root / "does-not-exist.db"
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(
                main(["--db", str(absent), "--storage", str(self.storage)]), 2
            )
            self.assertEqual(
                main(arguments + ["--report", str(self.storage / "invalid.json")]), 2
            )
        self.assertFalse(absent.exists())
        self.assertFalse((self.storage / "invalid.json").exists())

    def test_symlink_root_and_invalid_limits_are_configuration_errors(self):
        linked = self.root / "linked-root"
        linked.symlink_to(self.storage, target_is_directory=True)
        for arguments in (
            ["--db", str(self.database), "--storage", str(linked)],
            [
                "--db",
                str(self.database),
                "--storage",
                str(self.storage),
                "--max-files",
                "0",
            ],
        ):
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main(arguments), 2)


if __name__ == "__main__":
    unittest.main()
