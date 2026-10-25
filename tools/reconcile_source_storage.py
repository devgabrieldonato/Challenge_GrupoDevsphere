#!/usr/bin/env python3
"""Reconcilia fontes em manutenção: planeja por padrão, aplica somente com confirmação.

Nunca apaga fontes nem altera documentos, Markdown, estados ou histórico SQLite.
O plano contém caminhos privados: guarde-o fora da raiz pública e não versione.
"""
from __future__ import annotations

import argparse
from contextlib import closing, contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import sqlite3
import stat
import sys
import time

try:
    from .audit_source_storage import (ConfigurationError, StorageFinding, MAX_FILE_BYTES,
                                      open_beneath, roots, signature)
except ImportError:
    from audit_source_storage import (ConfigurationError, StorageFinding, MAX_FILE_BYTES,
                                     open_beneath, roots, signature)

MAX_ITEMS = 10000
MAX_HASH_BYTES = 256 * 1024 * 1024
MAX_JSON_BYTES = 8 * 1024 * 1024
ID = re.compile(r"[a-f0-9]{32}\Z")
HASH = re.compile(r"[a-f0-9]{64}\Z")


def encoded(value):
    """Serialização canônica permite detectar plano ou diário alterado acidentalmente."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()


def digest(value):
    return hashlib.sha256(encoded(value)).hexdigest()


def stamp():
    return datetime.now(timezone.utc).isoformat()


def minimum_free_bytes():
    """Usa a mesma reserva operacional do upload, com configuração inválida negada."""
    raw = os.environ.get("DEVSPHERE_STORAGE_MIN_FREE_BYTES", "536870912")
    if not re.fullmatch(r"[0-9]{1,16}", raw) or not 1 <= int(raw) <= 1024**4:
        raise ConfigurationError("invalid_storage_configuration")
    return int(raw)


def require_reserve(root_fd, minimum, additional=0):
    """Espaço disponível a este usuário, separado da quota lógica por instituição."""
    info = os.fstatvfs(root_fd)
    if not info.f_frsize or info.f_bavail < 0 or info.f_bavail * info.f_frsize < minimum + additional:
        raise ConfigurationError("disk_reserve_required")


def same_object(info):
    """ctime muda ao ligar/mover; identidade, tamanho e mtime permanecem verificáveis."""
    return [info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns]


def regular(fd, *, linked=False):
    info = os.fstat(fd)
    if not stat.S_ISREG(info.st_mode) or info.st_nlink not in ((1, 2) if linked else (1,)):
        raise ConfigurationError("unsafe_file")
    if info.st_size > MAX_FILE_BYTES:
        raise ConfigurationError("file_size_limit")
    return info


def hash_fd(fd, *, linked=False):
    """Hash limitado, sem ler toda a fonte em memória; verifica alterações concorrentes."""
    before = regular(fd, linked=linked)
    os.lseek(fd, 0, os.SEEK_SET)
    hasher = hashlib.sha256()
    total = 0
    while chunk := os.read(fd, 65536):
        total += len(chunk)
        if total > MAX_FILE_BYTES:
            raise ConfigurationError("file_size_limit")
        hasher.update(chunk)
    after = regular(fd, linked=linked)
    if signature(before) != signature(after) or total != before.st_size:
        raise ConfigurationError("file_changed")
    return hasher.hexdigest(), after


def absolute(value):
    path = Path(value).expanduser().absolute()
    if ".." in path.parts or "\0" in str(path):
        raise ConfigurationError("invalid_path")
    return path


def safe_external(value):
    """Abre arquivo fornecido explicitamente sem seguir links em nenhum componente."""
    path = absolute(value)
    base = os.open("/", os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
    try:
        fd, _ = open_beneath(base, path.parts[1:])
        regular(fd)
        return fd
    except StorageFinding:
        raise ConfigurationError("unsafe_restore_source") from None
    finally:
        os.close(base)


def private_parent(path, storage):
    """Artefatos não entram no armazenamento de PDFs nem no frontend público."""
    location = absolute(path)
    public = Path(__file__).resolve().parents[1] / "frontend"
    parent = location.parent.resolve(strict=True)
    candidate = parent / location.name
    for forbidden in (Path(storage).resolve(), public):
        if candidate.is_relative_to(forbidden):
            raise ConfigurationError("private_destination_required")
    if stat.S_ISLNK(location.parent.lstat().st_mode):
        raise ConfigurationError("unsafe_private_parent")
    return candidate


def database_snapshot(db):
    """Só campos operacionais entram no plano; documentos clínicos nunca são copiados."""
    cols = {row[1] for row in db.execute("PRAGMA table_info(source_documents)")}
    required = {"id", "owner_id", "storage_path", "sha256"}
    if not required <= cols:
        raise ConfigurationError("source_schema_missing")
    size = "CASE WHEN typeof(byte_size)='integer' THEN byte_size END" if "byte_size" in cols else "NULL"
    rows = db.execute(
        f"SELECT CASE WHEN typeof(id)='text' AND length(id)<=256 THEN id END,CASE WHEN typeof(owner_id)='integer' THEN owner_id END,"
        "CASE WHEN typeof(storage_path)='text' AND length(storage_path)<=4096 THEN storage_path END,"
        f"CASE WHEN typeof(sha256)='text' AND length(sha256)<=256 THEN sha256 END,{size} "
        "FROM source_documents ORDER BY id LIMIT ?",
        (MAX_ITEMS + 1,),
    ).fetchall()
    if len(rows) > MAX_ITEMS:
        raise ConfigurationError("document_count_limit")
    for row in rows:
        if any(not isinstance(row[index], str) for index in (0, 2, 3)):
            raise ConfigurationError("invalid_registered_value")
    # Inclui dependências para bloquear um órfão aparente ainda referenciado pelo histórico.
    dependencies = []
    tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    for table in ("worker_jobs", "version_sources", "library_chunks", "document_grants", "source_purge_receipts"):
        if table not in tables:
            continue
        columns = {r[1] for r in db.execute(f"PRAGMA table_info({table})")}
        if "document_id" not in columns:
            continue
        values = db.execute(f"SELECT DISTINCT CASE WHEN length(document_id)<=256 THEN document_id END FROM {table} ORDER BY document_id LIMIT ?", (MAX_ITEMS + 1,)).fetchall()
        if len(values) > MAX_ITEMS:
            raise ConfigurationError("dependency_count_limit")
        if any(row[0] is None for row in values):
            raise ConfigurationError("invalid_dependency_value")
        dependencies.extend([table, str(row[0])] for row in values)
    # Hashes de versões detectam mudança de referências sem guardar o conteúdo no plano.
    versions = []
    version_bytes = 0
    if "case_versions" in tables:
        columns = {r[1] for r in db.execute("PRAGMA table_info(case_versions)")}
        available = [c for c in ("content_json", "metadata_json") if c in columns]
        if available:
            selected = [f"CASE WHEN length(coalesce({column},''))<=2097152 THEN coalesce({column},'') END" for column in available]
            for row in db.execute("SELECT " + ",".join(selected) + " FROM case_versions LIMIT ?", (MAX_ITEMS + 1,)):
                if len(versions) >= MAX_ITEMS:
                    raise ConfigurationError("version_count_limit")
                if any(value is None for value in row):
                    raise ConfigurationError("version_size_limit")
                version_bytes += sum(len(str(v).encode()) for v in row)
                if version_bytes > MAX_JSON_BYTES:
                    raise ConfigurationError("version_read_budget_limit")
                versions.append(digest(list(row)))
                for value in row:
                    dependencies.extend(["case_versions", x] for x in sorted(set(re.findall(r"(?<![a-f0-9])[a-f0-9]{32}(?![a-f0-9])", str(value)))))
                    if len(dependencies) > MAX_ITEMS * 8:
                        raise ConfigurationError("dependency_count_limit")
    return {"documents": [list(row) for row in rows], "dependencies": sorted(dependencies), "versionHashes": sorted(versions)}


def storage_snapshot(root_fd, *, recovering_names=()):
    """Somente PDFs internos na raiz são automatizáveis; subpastas ficam para análise."""
    entries = []
    hashed = 0
    names = []
    with os.scandir(root_fd) as scan:
        for entry in scan:
            names.append(entry.name)
            if len(names) > MAX_ITEMS:
                raise ConfigurationError("entry_count_limit")
    names.sort()
    for name in names:
        info = os.stat(name, dir_fd=root_fd, follow_symlinks=False)
        internal_name = bool(re.fullmatch(r"[a-f0-9]{32}\.pdf", name))
        # Nomes inesperados podem conter dados pessoais: apenas impressão opaca entra no plano.
        item = {"name": name if internal_name else "entry-" + digest(name), "signature": list(signature(info)), "kind": "manual"}
        if stat.S_ISREG(info.st_mode) and internal_name and info.st_nlink in ((1, 2) if name in recovering_names else (1,)):
            if info.st_size > MAX_FILE_BYTES or hashed + info.st_size > MAX_HASH_BYTES:
                raise ConfigurationError("hash_read_budget_limit")
            fd, _ = open_beneath(root_fd, (name,))
            try:
                sha, checked = hash_fd(fd, linked=name in recovering_names)
                os.lseek(fd, 0, os.SEEK_SET)
                if os.read(fd, 5) == b"%PDF-":
                    item.update(kind="pdf", sha256=sha, object=same_object(checked))
                if signature(info) != signature(checked):
                    raise ConfigurationError("file_changed")
                hashed += checked.st_size
            finally:
                os.close(fd)
        entries.append(item)
    return entries


def connect(database, writable=False):
    path = absolute(database)
    if not stat.S_ISREG(path.lstat().st_mode):
        raise ConfigurationError("invalid_database")
    db = sqlite3.connect(path.as_uri() + ("?mode=rw" if writable else "?mode=ro"), uri=True, timeout=0.3)
    db.execute("PRAGMA trusted_schema=OFF")
    steps = [0]
    def bounded_query():
        steps[0] += 1
        return steps[0] > 10000
    db.set_progress_handler(bounded_query, 1000)
    if not writable:
        db.execute("PRAGMA query_only=ON")
    return db


def build_plan(database, storage, quarantine, restores=None, api_port=8080):
    """Dry-run: não cria quarentena nem altera arquivos, banco ou estados dos trabalhos."""
    if not 1 <= api_port <= 65535:
        raise ConfigurationError("invalid_api_port")
    original, canonical, root_fd = roots(storage)
    quarantine = private_parent(quarantine, canonical)
    if canonical.is_relative_to(quarantine):
        raise ConfigurationError("private_destination_required")
    restores = restores or {}
    try:
        with closing(connect(database)) as db:
            db.execute("BEGIN")
            snapshot = database_snapshot(db)
            entries = storage_snapshot(root_fd)
            database_info = Path(database).stat()
            actions, findings = [], []
            restore_bytes = 0
            registered_ids = {str(row[0]) for row in snapshot["documents"]}
            registered_paths = {str(row[2]) for row in snapshot["documents"]}
            dependent_ids = {row[1] for row in snapshot["dependencies"]}
            by_name = {item["name"]: item for item in entries}
            for item in entries:
                identity = item["name"][:-4]
                if item["kind"] == "pdf" and identity not in registered_ids and identity not in dependent_ids and str(canonical / item["name"]) not in registered_paths and str(original / item["name"]) not in registered_paths:
                    actions.append({"operation": "quarantine", "documentId": identity, "sha256": item["sha256"], "object": item["object"]})
                elif identity not in registered_ids:
                    findings.append({"entryId": digest(item["name"])[:20], "reason": "referenced_or_unsupported_entry"})
            for identity, _, path, expected, byte_size in snapshot["documents"]:
                if not isinstance(identity, str) or not ID.fullmatch(identity) or path not in (str(original / (identity + ".pdf")), str(canonical / (identity + ".pdf"))) or not isinstance(expected, str) or not HASH.fullmatch(expected):
                    findings.append({"entryId": digest(str(identity))[:20], "reason": "registered_metadata_requires_manual_review"})
                    continue
                item = by_name.get(identity + ".pdf")
                if item is not None:
                    if item.get("sha256") != expected:
                        findings.append({"documentId": identity, "reason": "registered_file_divergent_no_automatic_move"})
                    if identity in restores:
                        raise ConfigurationError("restore_destination_exists")
                    continue
                if identity not in restores:
                    findings.append({"documentId": identity, "reason": "missing_file_needs_explicit_restore_source"})
                    continue
                source = absolute(restores[identity])
                fd = safe_external(source)
                try:
                    if restore_bytes + regular(fd).st_size > MAX_HASH_BYTES:
                        raise ConfigurationError("restore_read_budget_limit")
                    actual, info = hash_fd(fd)
                    os.lseek(fd, 0, os.SEEK_SET)
                    if actual != expected or os.read(fd, 5) != b"%PDF-":
                        raise ConfigurationError("restore_hash_mismatch")
                    if byte_size is not None and info.st_size != byte_size:
                        raise ConfigurationError("restore_registered_size_mismatch")
                    restore_bytes += info.st_size
                    if restore_bytes > MAX_HASH_BYTES:
                        raise ConfigurationError("restore_read_budget_limit")
                    actions.append({"operation": "restore", "documentId": identity, "sha256": expected, "restorePath": str(source), "restoreObject": same_object(info), "size": info.st_size})
                finally:
                    os.close(fd)
            if set(restores) - registered_ids:
                raise ConfigurationError("restore_document_not_registered")
            body = {
                "schemaVersion": "source-reconciliation-v1",
                "createdAt": stamp(),
                "database": str(absolute(database)),
                "databaseObject": [database_info.st_dev, database_info.st_ino],
                "storage": str(canonical),
                "storageObject": list(same_object(os.fstat(root_fd)))[:2],
                "quarantine": str(quarantine),
                "apiPort": api_port,
                "minimumFreeBytes": minimum_free_bytes(),
                "databaseSnapshot": snapshot,
                "storageSnapshot": entries,
                "actions": actions,
                "findings": findings,
            }
            return {**body, "planHash": digest(body)}
    finally:
        os.close(root_fd)


def private_directory(path):
    """Ancora diretório canônico sem seguir links trocados entre validação e uso."""
    base = os.open("/", os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
    try:
        result, _ = open_beneath(base, Path(path).parts[1:], directory=True)
        return result
    except StorageFinding:
        raise ConfigurationError("unsafe_private_parent") from None
    finally:
        os.close(base)


def write_plan(plan, target):
    """Plano é novo e privado; recusa sobregravação e conteúdo fora do limite."""
    destination = private_parent(target, plan["storage"])
    if destination == Path(plan["database"]):
        raise ConfigurationError("private_destination_required")
    content = encoded(plan) + b"\n"
    if len(content) > MAX_JSON_BYTES:
        raise ConfigurationError("plan_size_limit")
    directory = private_directory(destination.parent)
    try:
        fd = os.open(destination.name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=directory)
        try:
            write_all(fd, content)
            os.fsync(fd)
        finally:
            os.close(fd)
        os.fsync(directory)
    finally:
        os.close(directory)


def load_plan(path):
    fd = safe_external(path)
    try:
        info = os.fstat(fd)
        if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o600 or info.st_size > MAX_JSON_BYTES:
            raise ConfigurationError("private_plan_required")
        data = os.read(fd, MAX_JSON_BYTES + 1)
    finally:
        os.close(fd)
    plan = json.loads(data)
    expected = plan.pop("planHash", None)
    if not isinstance(expected, str) or expected != digest(plan) or plan.get("schemaVersion") != "source-reconciliation-v1":
        raise ConfigurationError("plan_integrity_failed")
    plan["planHash"] = expected
    return plan


def write_all(fd, content):
    while content:
        count = os.write(fd, content)
        if count <= 0:
            raise ConfigurationError("write_failed")
        content = content[count:]


class Journal:
    """Registro privado append+fsync; encadeamento e reparo apenas da última linha incompleta."""
    def __init__(self, root_fd, name, plan_hash):
        self.fd = os.open(name, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=root_fd)
        info = os.fstat(self.fd)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o600 or info.st_size > MAX_JSON_BYTES:
            os.close(self.fd)
            raise ConfigurationError("unsafe_journal")
        try:
            fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            os.close(self.fd)
            raise ConfigurationError("reconciliation_already_running") from None
        self.events, self.previous = [], ""
        raw = os.read(self.fd, MAX_JSON_BYTES + 1)
        complete = raw.rfind(b"\n") + 1
        try:
            for line in raw[:complete].splitlines():
                record = json.loads(line)
                if not isinstance(record, dict):
                    raise ValueError("invalid record")
                saved = record.pop("hash", None)
                if record.get("previous") != self.previous or saved != digest(record) or record.get("planHash") != plan_hash:
                    raise ValueError("invalid chain")
                self.events.append(record)
                self.previous = saved
        except (ValueError, TypeError):
            self.close()
            raise ConfigurationError("journal_integrity_failed") from None
        if complete != len(raw):
            os.ftruncate(self.fd, complete)
            os.fsync(self.fd)
        os.lseek(self.fd, 0, os.SEEK_END)
        self.plan_hash = plan_hash
        if not self.events:
            self.append("opened")

    def append(self, state, index=None, **details):
        record = {"state": state, "index": index, "at": stamp(), "planHash": self.plan_hash, "previous": self.previous, **details}
        record["hash"] = digest(record)
        content = encoded(record) + b"\n"
        if os.fstat(self.fd).st_size + len(content) > MAX_JSON_BYTES:
            raise ConfigurationError("journal_size_limit")
        write_all(self.fd, content)
        os.fsync(self.fd)
        self.previous = record["hash"]
        self.events.append(record)

    def close(self):
        os.close(self.fd)


def check_maintenance(db, confirmed):
    """Lock SQLite não trava escrita de PDFs: a parada operacional continua obrigatória."""
    if not confirmed:
        raise ConfigurationError("services_stopped_confirmation_required")
    if db.execute("SELECT count(*) FROM worker_jobs WHERE status IN ('queued','running')").fetchone()[0]:
        raise ConfigurationError("active_jobs_block_maintenance")
    exists = db.execute("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='worker_runtime'").fetchone()[0]
    if exists and db.execute("SELECT count(*) FROM worker_runtime WHERE heartbeat_at>=?", (int(time.time()) - 35,)).fetchone()[0]:
        raise ConfigurationError("worker_heartbeat_still_active")


@contextmanager
def port_reservation(port):
    """Retém a porta informada durante a manutenção, sem finalizar qualquer processo."""
    if type(port) is not int or not 1 <= port <= 65535:
        raise ConfigurationError("invalid_api_port")
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        try:
            server.bind(("127.0.0.1", port))
            server.listen(1)
        except OSError:
            raise ConfigurationError("api_port_not_available") from None
        yield
    finally:
        server.close()


def inspect_file(root, name, expected_hash, expected_object=None):
    try:
        fd, _ = open_beneath(root, (name,))
    except StorageFinding as error:
        if str(error) == "missing_file":
            return None
        raise ConfigurationError("unsafe_recovery_file") from None
    try:
        sha, info = hash_fd(fd, linked=True)
        if sha != expected_hash or expected_object is not None and same_object(info) != expected_object:
            raise ConfigurationError("recovery_file_changed")
        return info
    finally:
        os.close(fd)


def fault_point(state, index):
    """Ponto interno coberto por fixtures de queda; não habilita falhas por configuração."""


def reconcile_action(action, index, root_fd, quarantine_fd, journal, plan_hash, minimum):
    """Publicação sem sobrescrever: link exclusivo e remoção só da ligação original verificada."""
    name = action["documentId"] + ".pdf"
    internal = f"{plan_hash[:20]}-{index}.pdf"
    history = [e for e in journal.events if e.get("index") == index]
    operation = action["operation"]
    if operation == "quarantine":
        expected = action["object"]
        source = inspect_file(root_fd, name, action["sha256"], expected)
        target = inspect_file(quarantine_fd, internal, action["sha256"], expected)
        if not history:
            if source is None or source.st_nlink != 1 or target is not None:
                raise ConfigurationError("quarantine_state_changed")
            journal.append("intent", index)
        elif source is None and target is None:
            raise ConfigurationError("quarantine_content_missing")
        if target is None:
            os.link(name, internal, src_dir_fd=root_fd, dst_dir_fd=quarantine_fd, follow_symlinks=False)
            os.fsync(quarantine_fd)
            fault_point("quarantine_linked", index)
        # Uma queda depois do link é recuperável somente se ambas as ligações são do objeto previsto.
        target = inspect_file(quarantine_fd, internal, action["sha256"], expected)
        source = inspect_file(root_fd, name, action["sha256"], expected)
        if source is not None:
            if source.st_ino != target.st_ino or source.st_dev != target.st_dev or source.st_nlink != 2:
                raise ConfigurationError("quarantine_link_changed")
            journal.append("linked", index)
            os.unlink(name, dir_fd=root_fd)
            os.fsync(root_fd)
            fault_point("quarantine_unlinked", index)
        journal.append("completed", index)
        return
    if operation != "restore":
        raise ConfigurationError("invalid_plan_action")
    staged = inspect_file(quarantine_fd, internal, action["sha256"])
    restored = inspect_file(root_fd, name, action["sha256"])
    staged_events = [e for e in history if e.get("state") == "staged"]
    expected = staged_events[-1].get("object") if staged_events else None
    if restored is not None:
        if expected is None or same_object(restored) != expected:
            raise ConfigurationError("restore_destination_exists")
    if staged is not None:
        if expected is None:
            # Stage interrompido antes do fsync/registro não autoriza aproveitamento nem remoção.
            raise ConfigurationError("restore_stage_requires_manual_review")
        if same_object(staged) != expected:
            raise ConfigurationError("restore_stage_changed")
    if restored is None and staged is None:
        if staged_events:
            raise ConfigurationError("restore_content_missing")
        require_reserve(root_fd, minimum, action["size"])
        original = safe_external(action["restorePath"])
        try:
            actual, metadata = hash_fd(original)
            if actual != action["sha256"] or same_object(metadata) != action["restoreObject"]:
                raise ConfigurationError("restore_source_changed")
            journal.append("intent", index)
            staged_fd = os.open(internal, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=quarantine_fd)
            try:
                os.lseek(original, 0, os.SEEK_SET)
                copied = 0
                while chunk := os.read(original, 65536):
                    copied += len(chunk)
                    if copied > MAX_FILE_BYTES:
                        raise ConfigurationError("file_size_limit")
                    write_all(staged_fd, chunk)
                os.fsync(staged_fd)
                if signature(metadata) != signature(os.fstat(original)):
                    raise ConfigurationError("restore_source_changed")
                expected = same_object(os.fstat(staged_fd))
            finally:
                os.close(staged_fd)
            os.fsync(quarantine_fd)
            # Revalida o conteúdo efetivamente copiado, não apenas o arquivo de entrada.
            inspect_file(quarantine_fd, internal, action["sha256"], expected)
            journal.append("staged", index, object=expected)
        finally:
            os.close(original)
    if restored is None:
        journal.append("publishing", index, object=expected)
        os.link(internal, name, src_dir_fd=quarantine_fd, dst_dir_fd=root_fd, follow_symlinks=False)
        os.fsync(root_fd)
        fault_point("restore_published", index)
    restored = inspect_file(root_fd, name, action["sha256"], expected)
    staged = inspect_file(quarantine_fd, internal, action["sha256"], expected)
    if staged is not None:
        if restored.st_nlink != 2 or staged.st_ino != restored.st_ino:
            raise ConfigurationError("restore_link_changed")
        journal.append("published", index)
        # Remove somente a ligação transitória criada pela ferramenta, preservando backup e PDF restaurado.
        os.unlink(internal, dir_fd=quarantine_fd)
        os.fsync(quarantine_fd)
    journal.append("completed", index)


def apply_plan(plan, *, confirmed=False):
    """Revalida plano inteiro e mantém exclusão mútua durante a janela de manutenção."""
    body = {key: value for key, value in plan.items() if key != "planHash"}
    if plan.get("planHash") != digest(body):
        raise ConfigurationError("plan_integrity_failed")
    if not confirmed:
        raise ConfigurationError("services_stopped_confirmation_required")
    minimum = minimum_free_bytes()
    if plan.get("minimumFreeBytes") != minimum:
        raise ConfigurationError("storage_configuration_changed")
    _, canonical, root_fd = roots(plan["storage"])
    quarantine_fd = -1
    journal = None
    db = None
    try:
        if list(same_object(os.fstat(root_fd)))[:2] != plan["storageObject"]:
            raise ConfigurationError("storage_root_changed")
        require_reserve(root_fd, minimum)
        path = private_parent(plan["quarantine"], canonical)
        parent_fd = private_directory(path.parent)
        try:
            try:
                os.mkdir(path.name, 0o700, dir_fd=parent_fd)
                os.fsync(parent_fd)
            except FileExistsError:
                pass
            quarantine_fd = os.open(path.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=parent_fd)
        finally:
            os.close(parent_fd)
        info = os.fstat(quarantine_fd)
        if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700 or info.st_dev != os.fstat(root_fd).st_dev:
            raise ConfigurationError("private_same_filesystem_quarantine_required")
        journal = Journal(quarantine_fd, plan["planHash"] + ".jsonl", plan["planHash"])
        os.fsync(quarantine_fd)
        db = connect(plan["database"], writable=True)
        try:
            db.execute("BEGIN IMMEDIATE")
        except sqlite3.OperationalError:
            raise ConfigurationError("database_busy") from None
        info = Path(plan["database"]).stat()
        if [info.st_dev, info.st_ino] != plan["databaseObject"] or database_snapshot(db) != plan["databaseSnapshot"]:
            raise ConfigurationError("database_state_changed")
        check_maintenance(db, confirmed)
        with port_reservation(plan["apiPort"]):
            touched = {a["documentId"] + ".pdf" for index, a in enumerate(plan["actions"]) if any(e.get("index") == index for e in journal.events)}
            current = {e["name"]: e for e in storage_snapshot(root_fd, recovering_names=touched)}
            before = {e["name"]: e for e in plan["storageSnapshot"]}
            # Apenas ações iniciadas pelo próprio diário explicam diferenças após uma interrupção.
            for name in set(before) | set(current):
                if name not in touched and before.get(name) != current.get(name):
                    raise ConfigurationError("storage_state_changed")
            for index, action in enumerate(plan["actions"]):
                if not isinstance(action.get("documentId"), str) or not ID.fullmatch(action["documentId"]):
                    raise ConfigurationError("invalid_plan_action")
                reconcile_action(action, index, root_fd, quarantine_fd, journal, plan["planHash"], minimum)
            journal.append("finished")
        db.rollback()  # O lock foi operacional: nenhuma linha SQLite foi alterada.
        return {"status": "completed", "planHash": plan["planHash"], "actions": len(plan["actions"]), "quarantined": sum(a["operation"] == "quarantine" for a in plan["actions"]), "restored": sum(a["operation"] == "restore" for a in plan["actions"]), "findingsRequiringManualReview": len(plan["findings"])}
    finally:
        if db is not None:
            db.close()
        if journal is not None:
            journal.close()
        if quarantine_fd >= 0:
            os.close(quarantine_fd)
        os.close(root_fd)


class SafeParser(argparse.ArgumentParser):
    def error(self, message):
        raise ConfigurationError("invalid_arguments")


def main(argv=None):
    parser = SafeParser(description=__doc__)
    parser.add_argument("operation", nargs="?", choices=("plan", "apply"), default="plan")
    parser.add_argument("--db")
    parser.add_argument("--storage")
    parser.add_argument("--quarantine")
    parser.add_argument("--plan", required=True)
    parser.add_argument("--api-port", type=int, default=8080)
    parser.add_argument("--restore", action="append", default=[], metavar="ID=PDF")
    parser.add_argument("--confirm-services-stopped", action="store_true")
    try:
        args = parser.parse_args(argv)
        if args.operation == "apply":
            if args.db or args.storage or args.quarantine or args.restore:
                raise ConfigurationError("apply_uses_saved_plan_only")
            result = apply_plan(load_plan(args.plan), confirmed=args.confirm_services_stopped)
        else:
            if not args.db or not args.storage or not args.quarantine:
                raise ConfigurationError("plan_arguments_required")
            restores = {}
            for item in args.restore:
                identity, separator, path = item.partition("=")
                if not separator or not ID.fullmatch(identity) or identity in restores:
                    raise ConfigurationError("invalid_restore_argument")
                restores[identity] = path
            plan = build_plan(args.db, args.storage, args.quarantine, restores, args.api_port)
            write_plan(plan, args.plan)
            result = {"status": "planned_no_changes", "planHash": plan["planHash"], "actions": len(plan["actions"]), "findingsRequiringManualReview": len(plan["findings"])}
        print(json.dumps(result))
        return 0
    except ConfigurationError as error:
        print(json.dumps({"status": "blocked", "error": {"code": str(error)}}))
        return 2
    except (OSError, sqlite3.Error, ValueError, TypeError, KeyError):
        print(json.dumps({"status": "blocked", "error": {"code": "reconciliation_unavailable"}}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
