#!/usr/bin/env python3
"""Provisiona TOTP e recuperação por conta; arquivos privados fora do repositório."""

import argparse
import base64
import hashlib
import os
from pathlib import Path
import secrets
import sqlite3
from urllib.parse import quote


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--email", required=True)
    parser.add_argument("--env-output", type=Path, required=True)
    parser.add_argument("--recovery-output", type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    for dest in [args.env_output, args.recovery_output]:
        resolved = dest.resolve()
        if resolved == root or root in resolved.parents or dest.exists():
            parser.error("Destinos devem ser novos e fora do repositório.")
    with sqlite3.connect(
        args.database.resolve().as_uri() + "?mode=ro", uri=True
    ) as con:
        row = con.execute(
            "SELECT id,role FROM users WHERE email=? COLLATE NOCASE", (args.email,)
        ).fetchone()
        if not row or row[1] != "teacher":
            parser.error("Conta docente/administrativa não encontrada.")
    uid = row[0]
    secret = base64.b32encode(secrets.token_bytes(20)).decode()
    codes = [secrets.token_urlsafe(24) for _ in range(8)]
    recovery = ",".join(hashlib.sha256(code.encode()).hexdigest() for code in codes)
    args.env_output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    args.recovery_output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with args.env_output.open("x") as output:
        output.write(
            f"export DEVSPHERE_MFA_SECRET_{uid}={secret}\nexport DEVSPHERE_MFA_RECOVERY_{uid}={recovery}\n"
        )
    with args.recovery_output.open("x") as output:
        uri = f'otpauth://totp/{quote("Paciente Virtual:"+args.email)}?secret={secret}&issuer=Paciente%20Virtual&algorithm=SHA1&digits=6&period=30'
        output.write(
            "Importe no autenticador de forma privada:\n"
            + uri
            + "\n\nRecuperação (cada código só funciona uma vez):\n"
            + "\n".join(codes)
            + "\n"
        )
    print(
        "Arquivos privados criados. Entregue o cadastro ao titular por canal seguro; carregue o ambiente antes da API."
    )
    print(
        "Rotação exige verificação operacional de identidade. Não envie estes arquivos ao Git, Notion ou logs."
    )


if __name__ == "__main__":
    main()
