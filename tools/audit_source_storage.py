#!/usr/bin/env python3
"""Audita fontes PDF sem alterar registros, reparar arquivos ou remover conteúdo.

Use uma janela sem gravações da API/worker para um resultado operacional estável.
A conexão SQLite é mode=ro/query_only; o hash usa descritores ancorados na raiz,
nunca resolve links de fontes. A saída contém IDs internos, categorias e bytes,
sem nomes originais, texto clínico ou caminhos externos. Não é uma quota imposta.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
import errno
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
import sys

MAX_FILE_BYTES = 10 * 1024 * 1024


class ConfigurationError(Exception):
    """Erro público sanitizado: não carrega caminhos nem mensagens do sistema."""


class StorageFinding(Exception):
    """Categoria de inconsistência, sem copiar o caminho que a provocou."""


@dataclass(frozen=True)
class Limits:
    """Todos os orçamentos são finitos, inclusive em uma raiz adulterada."""

    max_documents: int = 10000
    max_files: int = 10000
    max_entries: int = 20000
    max_hash_bytes: int = 256 * 1024 * 1024
    max_depth: int = 32

    def validate(self):
        for value, maximum in (
            (self.max_documents, 50000),
            (self.max_files, 50000),
            (self.max_entries, 100000),
            (self.max_hash_bytes, 1024**3),
            (self.max_depth, 64),
        ):
            if type(value) is not int or not 1 <= value <= maximum:
                raise ConfigurationError("invalid_limits")


def internal_id(value):
    """IDs fora do formato interno são pseudonimizados, nunca ecoados livremente."""
    value = str(value)
    if re.fullmatch(r"[A-Za-z0-9_-]{1,80}", value):
        return value
    return (
        "document-" + hashlib.sha256(value.encode("utf-8", "replace")).hexdigest()[:20]
    )


def entry_id(parts):
    """Identificador opaco estável permite localizar achados sem divulgar nomes."""
    return hashlib.sha256("/".join(parts).encode("utf-8", "surrogatepass")).hexdigest()[
        :20
    ]


def roots(storage):
    """A raiz escolhida deve ser diretório real, não um link simbólico."""
    original = Path(storage).expanduser().absolute()
    try:
        if stat.S_ISLNK(original.lstat().st_mode):
            raise ConfigurationError("storage_root_symlink")
        canonical = original.resolve(strict=True)
        descriptor = os.open(
            canonical, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
        )
    except OSError:
        raise ConfigurationError("storage_unavailable") from None
    return original, canonical, descriptor


def relative_parts(value, original, canonical, max_depth):
    """Valida o texto antes de abrir; nenhum resolve é aplicado ao caminho da fonte."""
    if not isinstance(value, str) or not value or "\0" in value or len(value) > 4096:
        raise StorageFinding("invalid_registered_path")
    location = Path(value)
    if not location.is_absolute() or ".." in location.parts:
        raise StorageFinding("outside_storage_root")
    for root in (original, canonical):
        try:
            parts = location.relative_to(root).parts
        except ValueError:
            continue
        if not parts or len(parts) > max_depth:
            raise StorageFinding("invalid_registered_path")
        return parts
    raise StorageFinding("outside_storage_root")


def open_beneath(root_fd, parts, directory=False):
    """openat com NOFOLLOW em cada segmento impede links e trocas por FIFO."""
    current = os.dup(root_fd)
    try:
        for index, name in enumerate(parts):
            last = index == len(parts) - 1
            metadata = os.stat(name, dir_fd=current, follow_symlinks=False)
            if stat.S_ISLNK(metadata.st_mode):
                raise StorageFinding("symlink_reference")
            wants_directory = not last or directory
            if wants_directory and not stat.S_ISDIR(metadata.st_mode):
                raise StorageFinding("invalid_registered_path")
            if not wants_directory and not stat.S_ISREG(metadata.st_mode):
                raise StorageFinding("unsupported_file_type")
            flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK
            if wants_directory:
                flags |= os.O_DIRECTORY
            following = os.open(name, flags, dir_fd=current)
            os.close(current)
            current = following
        metadata = os.fstat(current)
        if not directory and not stat.S_ISREG(metadata.st_mode):
            raise StorageFinding("unsupported_file_type")
        result = current
        current = -1
        return result, metadata
    except FileNotFoundError:
        raise StorageFinding("missing_file") from None
    except PermissionError:
        raise StorageFinding("unreadable_file") from None
    except OSError as error:
        category = (
            "symlink_or_path_changed"
            if error.errno in (errno.ELOOP, errno.ENOTDIR)
            else "unreadable_file"
        )
        raise StorageFinding(category) from None
    finally:
        if current >= 0:
            os.close(current)


def signature(metadata):
    return (
        metadata.st_dev,
        metadata.st_ino,
        metadata.st_size,
        metadata.st_mtime_ns,
        metadata.st_ctime_ns,
    )


def read_documents(database, limits):
    """Lê apenas colunas operacionais com limite; nenhum conteúdo clínico é consultado."""
    path = Path(database).expanduser().absolute()
    try:
        if not stat.S_ISREG(path.lstat().st_mode):
            raise ConfigurationError("invalid_database")
        connection = sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=2)
        connection.execute("PRAGMA query_only=ON")
        connection.execute("PRAGMA trusted_schema=OFF")
        steps = [0]

        def stop_unbounded_query():
            steps[0] += 1
            return steps[0] > 1000

        connection.set_progress_handler(stop_unbounded_query, 1000)
        try:
            columns = {
                row[1]
                for row in connection.execute("PRAGMA table_info(source_documents)")
            }
            if not {"id", "owner_id", "storage_path", "sha256"} <= columns:
                raise ConfigurationError("source_schema_missing")
            connection.execute("BEGIN")
            rows = connection.execute(
                "SELECT substr(CAST(id AS TEXT),1,256),CASE WHEN typeof(owner_id)='integer' THEN owner_id ELSE NULL END,"
                "CASE WHEN length(storage_path)<=4096 THEN storage_path ELSE NULL END,"
                "CASE WHEN length(sha256)=64 THEN sha256 ELSE NULL END "
                "FROM source_documents LIMIT ?",
                (limits.max_documents + 1,),
            ).fetchall()
            return rows[: limits.max_documents], len(rows) > limits.max_documents
        finally:
            connection.close()
    except ConfigurationError:
        raise
    except (OSError, sqlite3.Error, ValueError):
        raise ConfigurationError("database_unavailable") from None


def audit_storage(database, storage, limits=Limits()):
    """Compara catálogo, arquivos e hashes, sem seguir links ou modificar fontes."""
    limits.validate()
    original, canonical, root_fd = roots(storage)
    report = {
        "schemaVersion": "1.0",
        "auditedAt": datetime.now(timezone.utc).isoformat(),
        "status": "consistent",
        "complete": True,
        "limits": {**vars(limits), "max_file_bytes": MAX_FILE_BYTES},
        "summary": {
            "documentsChecked": 0,
            "entriesScanned": 0,
            "filesObserved": 0,
            "bytesHashed": 0,
            "observedBytes": 0,
            "registeredBytes": 0,
            "orphanBytes": 0,
        },
        "usage": {
            "kind": "observed_logical_source_bytes",
            "enforcedQuota": False,
            "byOwner": [],
        },
        "findings": [],
    }
    summaries = report["summary"]
    known = {}
    file_budget = set()
    owners = {}

    def finding(category, document=None, parts=None, incomplete=False):
        item = {"category": category}
        if document is not None:
            item["documentId"] = document
        if parts is not None:
            item["entryId"] = entry_id(parts)
        report["findings"].append(item)
        if incomplete:
            report["complete"] = False

    def claim_file(parts):
        if parts in file_budget:
            return True
        if len(file_budget) >= limits.max_files:
            finding("file_count_limit", incomplete=True)
            return False
        file_budget.add(parts)
        return True

    try:
        rows, truncated = read_documents(database, limits)
        if truncated:
            finding("document_count_limit", incomplete=True)
        for raw_id, owner, stored_path, expected_hash in rows:
            document = internal_id(raw_id)
            summaries["documentsChecked"] += 1
            try:
                parts = relative_parts(
                    stored_path, original, canonical, limits.max_depth
                )
            except StorageFinding as error:
                finding(str(error), document)
                continue
            known.setdefault(parts, []).append((document, owner))
            if not claim_file(parts):
                continue
            fd = -1
            try:
                fd, before = open_beneath(root_fd, parts)
                if before.st_nlink != 1:
                    finding("hardlinked_file", document)
                    continue
                if before.st_size > MAX_FILE_BYTES:
                    finding("file_size_limit", document, incomplete=True)
                    continue
                if not isinstance(expected_hash, str) or not re.fullmatch(
                    r"[a-fA-F0-9]{64}", expected_hash
                ):
                    finding("invalid_registered_sha256", document)
                    continue
                if summaries["bytesHashed"] + before.st_size > limits.max_hash_bytes:
                    finding("hash_read_budget_limit", document, incomplete=True)
                    continue
                digest = hashlib.sha256()
                remaining = before.st_size
                while remaining:
                    chunk = os.read(fd, min(65536, remaining))
                    if not chunk:
                        raise StorageFinding("file_changed_during_audit")
                    summaries["bytesHashed"] += len(chunk)
                    digest.update(chunk)
                    remaining -= len(chunk)
                after = os.fstat(fd)
                check_fd, current = open_beneath(root_fd, parts)
                os.close(check_fd)
                if signature(before) != signature(after) or signature(
                    before
                ) != signature(current):
                    finding("file_changed_during_audit", document, incomplete=True)
                elif digest.hexdigest() != expected_hash.lower():
                    finding("sha256_mismatch", document)
            except StorageFinding as error:
                finding(str(error), document)
            except OSError:
                finding("unreadable_file", document)
            finally:
                if fd >= 0:
                    os.close(fd)

        # Enumerar é separado da leitura do conteúdo: órfãos só recebem ID opaco.
        stack = [()]
        while stack:
            directory = stack.pop()
            descriptor = -1
            try:
                descriptor, _ = open_beneath(root_fd, directory, directory=True)
                with os.scandir(descriptor) as entries:
                    for entry in entries:
                        if summaries["entriesScanned"] >= limits.max_entries:
                            finding("entry_count_limit", incomplete=True)
                            stack.clear()
                            break
                        summaries["entriesScanned"] += 1
                        parts = directory + (entry.name,)
                        try:
                            info = os.stat(
                                entry.name, dir_fd=descriptor, follow_symlinks=False
                            )
                        except OSError:
                            finding("unreadable_entry", parts=parts, incomplete=True)
                            continue
                        if stat.S_ISLNK(info.st_mode):
                            finding("symlink_entry", parts=parts)
                        elif stat.S_ISDIR(info.st_mode):
                            if len(parts) >= limits.max_depth:
                                finding(
                                    "directory_depth_limit",
                                    parts=parts,
                                    incomplete=True,
                                )
                            else:
                                stack.append(parts)
                        elif stat.S_ISREG(info.st_mode):
                            if not claim_file(parts):
                                stack.clear()
                                break
                            summaries["filesObserved"] += 1
                            summaries["observedBytes"] += info.st_size
                            if parts in known:
                                summaries["registeredBytes"] += info.st_size
                                for _, owner in known[parts]:
                                    key = owner if type(owner) is int else None
                                    owners.setdefault(
                                        key,
                                        {"ownerId": key, "documents": 0, "bytes": 0},
                                    )
                                    owners[key]["documents"] += 1
                                    owners[key]["bytes"] += info.st_size
                            elif not truncated:
                                finding("orphan_file", parts=parts)
                                summaries["orphanBytes"] += info.st_size
                            if not entry.name.lower().endswith(".pdf"):
                                finding("unexpected_file_extension", parts=parts)
                        else:
                            finding("unsupported_entry_type", parts=parts)
            except StorageFinding as error:
                finding(str(error), parts=directory, incomplete=True)
            except OSError:
                finding("unreadable_directory", parts=directory, incomplete=True)
            finally:
                if descriptor >= 0:
                    os.close(descriptor)
        report["usage"]["byOwner"] = sorted(
            owners.values(),
            key=lambda item: (item["ownerId"] is None, item["ownerId"] or 0),
        )
        if report["findings"]:
            report["status"] = "findings"
        return report
    finally:
        os.close(root_fd)


class SafeParser(argparse.ArgumentParser):
    def error(self, message):
        raise ConfigurationError("invalid_arguments")


def write_report(report, destination, database, storage):
    """Relatório opcional é novo, privado e fica fora da raiz auditada."""
    text = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if destination is None or destination == "-":
        sys.stdout.write(text)
        return
    target = Path(destination).expanduser().absolute()
    root = Path(storage).expanduser().resolve()
    canonical_target = target.parent.resolve() / target.name
    if (
        canonical_target.is_relative_to(root)
        or canonical_target == Path(database).expanduser().resolve()
    ):
        raise ConfigurationError("invalid_report_destination")
    try:
        descriptor = os.open(
            target,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
            0o600,
        )
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            output.write(text)
    except OSError:
        raise ConfigurationError("report_unavailable") from None


def main(argv=None):
    """0 consistente; 1 achados/limites; 2 configuração ou execução indisponível."""
    parser = SafeParser(description=__doc__)
    parser.add_argument("--db", required=True)
    parser.add_argument("--storage", required=True)
    parser.add_argument("--report")
    parser.add_argument("--max-documents", type=int, default=10000)
    parser.add_argument("--max-files", type=int, default=10000)
    parser.add_argument("--max-entries", type=int, default=20000)
    parser.add_argument("--max-hash-bytes", type=int, default=256 * 1024 * 1024)
    try:
        args = parser.parse_args(argv)
        limits = Limits(
            args.max_documents, args.max_files, args.max_entries, args.max_hash_bytes
        )
        report = audit_storage(args.db, args.storage, limits)
        write_report(report, args.report, args.db, args.storage)
        return 0 if report["status"] == "consistent" else 1
    except ConfigurationError as error:
        sys.stdout.write(
            json.dumps(
                {
                    "schemaVersion": "1.0",
                    "status": "configuration_error",
                    "error": {"code": str(error)},
                }
            )
            + "\n"
        )
        return 2
    except Exception:
        sys.stdout.write(
            json.dumps(
                {
                    "schemaVersion": "1.0",
                    "status": "configuration_error",
                    "error": {"code": "audit_unavailable"},
                }
            )
            + "\n"
        )
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
