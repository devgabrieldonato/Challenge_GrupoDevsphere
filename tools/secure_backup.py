#!/usr/bin/env python3
"""Backup SQLite consistente, cifrado e autenticado; restauração em novo destino."""

from __future__ import annotations
import argparse
import getpass
import hashlib
import os
from pathlib import Path
from contextlib import closing
import sqlite3
import tempfile
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

MAGIC = b"PVBACKUP1"


def derive(password: str, salt: bytes) -> bytes:
    """Deriva chave sem armazenar senha junto ao backup."""
    if len(password) < 16:
        raise ValueError("Use uma senha de backup com pelo menos 16 caracteres.")
    return hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1, dklen=32)


def backup(source: Path, target: Path, password: str) -> None:
    """A API backup do SQLite incorpora WAL sem copiar arquivos inconsistentes."""
    if not source.is_file() or target.exists():
        raise ValueError("Origem ausente ou destino já existente.")
    with tempfile.TemporaryDirectory(prefix="pv-snapshot-") as directory:
        snap = Path(directory) / "snapshot.db"
        with closing(
            sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True)
        ) as src:
            with closing(sqlite3.connect(snap)) as dst, dst:
                src.backup(dst)
                if dst.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                    raise ValueError("Snapshot inválido.")
        salt, nonce = os.urandom(16), os.urandom(12)
        header = MAGIC + salt + nonce
        payload = header + AESGCM(derive(password, salt)).encrypt(
            nonce, snap.read_bytes(), header
        )
        target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with target.open("xb") as output:
            os.chmod(target, 0o600)
            output.write(payload)


def restore(source: Path, target: Path, password: str) -> None:
    """Autentica antes de gravar; não sobrescreve uma base em uso ou existente."""
    if target.exists():
        raise ValueError("Restaure para um novo arquivo; o destino já existe.")
    data = source.read_bytes()
    if len(data) < 53 or not data.startswith(MAGIC):
        raise ValueError("Formato de backup inválido.")
    header = data[:37]
    content = AESGCM(derive(password, data[9:25])).decrypt(
        data[25:37], data[37:], header
    )
    target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with tempfile.TemporaryDirectory(
        prefix="pv-restore-", dir=target.parent
    ) as directory:
        snap = Path(directory) / "restored.db"
        snap.write_bytes(content)
        with closing(sqlite3.connect(snap)) as con, con:
            if con.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise ValueError("Banco restaurado inválido.")
        # Hard link é atômico e falha se o destino surgir durante a verificação.
        os.chmod(snap, 0o600)
        os.link(snap, target)


def main() -> None:
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["backup", "restore"])
    parser.add_argument("source", type=Path)
    parser.add_argument("target", type=Path)
    args = parser.parse_args()
    password = os.environ.get("DEVSPHERE_BACKUP_PASSWORD") or getpass.getpass(
        "Senha do backup: "
    )
    try:
        (backup if args.operation == "backup" else restore)(
            args.source, args.target, password
        )
    except Exception:
        raise SystemExit(
            "Operação falhou: confira origem, destino, senha e integridade. Nenhum destino existente é substituído."
        )
    print("Operação concluída. Guarde a senha separadamente e teste a restauração.")


if __name__ == "__main__":
    main()
