"""Daemon de fila SQLite; uma tarefa isolada por vez, sem acesso de rede ao parser."""

from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import resource
import signal
import sqlite3
import subprocess
import sys
import tempfile
import time
import uuid
from .core import JobError, generate_case, extract_pdf, private_file, prepare_generation_preview

WORKER_LOADED_AT = int(time.time())


def connect(path):
    """Valida o schema antes da fila; migrations pertencem ao backend C++20.

    mode=rw nunca cria banco vazio se o caminho estiver errado. A conferência
    precede indexação/claim para não modificar bases antigas nem pegar trabalhos.
    """
    location = Path(path).resolve()
    if not location.is_file():
        raise RuntimeError(
            f"Banco não existe: {location}. Inicie a API/migrations antes do worker."
        )
    db = sqlite3.connect(location.as_uri() + "?mode=rw", uri=True, timeout=10)
    try:
        tables = {
            row[0]
            for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        required = {
            "users",
            "source_documents",
            "worker_jobs",
            "library_chunks",
            "library_index_state",
            "document_grants",
        }
        missing = required - tables
        if not missing:
            for table, column in [
                ("users", "institution_id"),
                ("source_documents", "area"),
            ]:
                if column not in {
                    row[1] for row in db.execute(f"PRAGMA table_info({table})")
                }:
                    missing.add(table + "." + column)
        if missing:
            raise RuntimeError(
                f"Banco desatualizado: {location}. Faltam tabelas/colunas do NEXT_2026: {', '.join(sorted(missing))}. Execute ./tools/start-local-api.sh --migrate e use o mesmo DEVSPHERE_DB_PATH na API e no worker."
            )
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("PRAGMA busy_timeout=10000")
        return db
    except Exception:
        db.close()
        raise


def claim(db, now=None):
    """Claim atômico com lease e recuperação de interrupção, sem duplicar execução."""
    now = int(time.time()) if now is None else now
    db.execute("BEGIN IMMEDIATE")
    try:
        db.execute(
            "UPDATE worker_jobs SET status='failed',lease_until=NULL,error_json=?,updated_at=CURRENT_TIMESTAMP WHERE status IN ('queued','running') AND expires_at<=?",
            (
                json.dumps(
                    {
                        "code": "job_expired",
                        "message": "Prazo de 24 horas expirou; crie um novo trabalho.",
                        "retryable": False,
                    }
                ),
                now,
            ),
        )
        db.execute(
            "UPDATE worker_jobs SET status=CASE WHEN cancel_requested=1 THEN 'cancelled' WHEN attempts>=max_attempts THEN 'failed' ELSE 'queued' END,error_json=CASE WHEN attempts>=max_attempts THEN ? ELSE error_json END,lease_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE status='running' AND lease_until<?",
            (
                json.dumps(
                    {
                        "code": "lease_expired",
                        "message": "Processo interrompido; limite de tentativas atingido.",
                        "retryable": True,
                    }
                ),
                now,
            ),
        )
        db.execute(
            "UPDATE worker_jobs SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE status='queued' AND cancel_requested=1"
        )
        job = db.execute(
            "SELECT * FROM worker_jobs WHERE status='queued' AND attempts<max_attempts AND next_attempt_at<=? ORDER BY created_at,id LIMIT 1",
            (now,),
        ).fetchone()
        if job:
            db.execute(
                "UPDATE worker_jobs SET status='running',attempts=attempts+1,lease_until=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (now + 1900, job["id"]),
            )
        db.commit()
        return dict(job) if job else None
    except Exception:
        db.rollback()
        raise


def retrieve(db, owner_id, query, limit=8):
    """FTS usa somente fontes aprovadas e autorizadas, inclusive para administradores."""
    terms = [
        term
        for term in __import__("re").findall(
            r"\w+", query, flags=__import__("re").UNICODE
        )
        if len(term) > 1
    ][:12]
    if not terms:
        return []
    match = " OR ".join('"' + term.replace('"', '""') + '"' for term in terms)
    rows = db.execute(
        """SELECT c.id,c.document_id,c.page,c.text,d.sha256,d.markdown AS canonical_markdown
      FROM library_chunks_fts JOIN library_chunks c ON c.id=library_chunks_fts.rowid
      JOIN source_documents d ON d.id=c.document_id
      WHERE library_chunks_fts MATCH ? AND d.status='approved' AND d.authorized_use=1 AND d.deidentified=1
      AND (SELECT institution_id FROM users WHERE id=d.owner_id)=(SELECT institution_id FROM users WHERE id=?)
      AND (d.owner_id=? OR EXISTS(SELECT 1 FROM document_grants g WHERE g.document_id=d.id AND g.user_id=?))
      ORDER BY rank LIMIT ?""",
        (match, owner_id, owner_id, owner_id, min(max(limit, 1), 12)),
    ).fetchall()
    result = []
    for row in rows:
        item = dict(row)
        item["markdown_sha256"] = (
            __import__("hashlib")
            .sha256(item.pop("canonical_markdown").encode())
            .hexdigest()
        )
        result.append(item)
    return result


def index_document(db, document_id):
    """Reindexa trechos apenas após aprovação explícita; fonte retirada desaparece da busca."""
    doc = db.execute(
        "SELECT * FROM source_documents WHERE id=?", (document_id,)
    ).fetchone()
    db.execute("DELETE FROM library_chunks WHERE document_id=?", (document_id,))
    if (
        doc
        and doc["status"] == "approved"
        and doc["authorized_use"]
        and doc["deidentified"]
    ):
        # Indexa o Markdown canônico revisado, não a extração antiga em pages_json.
        import re

        sections = list(
            re.finditer(r"^## Página ([1-9][0-9]*)\s*$", doc["markdown"], re.MULTILINE)
        )
        for position, section in enumerate(sections):
            number = int(section.group(1))
            end = (
                sections[position + 1].start()
                if position + 1 < len(sections)
                else len(doc["markdown"])
            )
            text = doc["markdown"][section.end() : end].strip()
            for offset in range(0, len(text), 1800):
                db.execute(
                    "INSERT INTO library_chunks(document_id,page,text) VALUES(?,?,?)",
                    (document_id, number, text[offset : offset + 2000]),
                )


def sync_library(db):
    """Reindexa apenas mudanças de fonte; retirada nunca aguarda a sincronização para bloquear busca."""
    import hashlib

    for doc in db.execute(
        "SELECT id,markdown,status,authorized_use,deidentified FROM source_documents"
    ).fetchall():
        digest = hashlib.sha256(
            (
                doc["markdown"]
                + doc["status"]
                + str(doc["authorized_use"])
                + str(doc["deidentified"])
            ).encode()
        ).hexdigest()
        state = db.execute(
            "SELECT content_hash FROM library_index_state WHERE document_id=?",
            (doc["id"],),
        ).fetchone()
        if not state or state[0] != digest:
            with db:
                index_document(db, doc["id"])
                db.execute(
                    "INSERT INTO library_index_state(document_id,content_hash) VALUES(?,?) ON CONFLICT(document_id) DO UPDATE SET content_hash=excluded.content_hash",
                    (doc["id"], digest),
                )


def finish(db, job, result):
    """Publica resultado somente se ainda autorizado e não cancelado; jamais publica caso."""
    db.execute("BEGIN IMMEDIATE")
    try:
        current = db.execute(
            "SELECT * FROM worker_jobs WHERE id=?", (job["id"],)
        ).fetchone()
        if (
            not current
            or current["status"] != "running"
            or current["attempts"] != job["attempts"] + 1
        ):
            db.rollback()
            return
        doc = db.execute(
            "SELECT * FROM source_documents WHERE id=?", (job["document_id"],)
        ).fetchone()
        allowed = (
            doc
            and doc["status"] != "withdrawn"
            and (
                doc["owner_id"] == job["owner_id"]
                or db.execute(
                    "SELECT 1 FROM document_grants WHERE document_id=? AND user_id=?",
                    (doc["id"], job["owner_id"]),
                ).fetchone()
            )
        )
        same_institution = (
            doc
            and db.execute(
                "SELECT (SELECT institution_id FROM users WHERE id=?)=(SELECT institution_id FROM users WHERE id=?)",
                (doc["owner_id"], job["owner_id"]),
            ).fetchone()[0]
        )
        if current["cancel_requested"] or not allowed or not same_institution:
            db.execute(
                "UPDATE worker_jobs SET status='cancelled',lease_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (job["id"],),
            )
        elif result["status"] == "completed":
            if (
                result.get("provenance", {}).get("sourceHash", doc["sha256"])
                != doc["sha256"]
            ):
                raise JobError(
                    "source_changed", "Fonte modificada durante o processamento.", True
                )
            if (
                result.get("provenance", {}).get(
                    "markdownHash",
                    __import__("hashlib").sha256(doc["markdown"].encode()).hexdigest(),
                )
                != __import__("hashlib").sha256(doc["markdown"].encode()).hexdigest()
            ):
                raise JobError(
                    "source_changed",
                    "Extração revisada durante o processamento; gere novamente.",
                    True,
                )
            # Revalida todos os grants usados pelo RAG, inclusive durante inferência longa.
            for source in result.get("provenance", {}).get("retrievedSources", []):
                source_doc = db.execute(
                    "SELECT * FROM source_documents WHERE id=?",
                    (source["document_id"],),
                ).fetchone()
                grant = db.execute(
                    "SELECT 1 FROM document_grants WHERE document_id=? AND user_id=?",
                    (source["document_id"], job["owner_id"]),
                ).fetchone()
                source_institution = (
                    source_doc
                    and db.execute(
                        "SELECT (SELECT institution_id FROM users WHERE id=?)=(SELECT institution_id FROM users WHERE id=?)",
                        (source_doc["owner_id"], job["owner_id"]),
                    ).fetchone()[0]
                )
                if (
                    not source_doc
                    or not source_institution
                    or source_doc["status"] != "approved"
                    or source_doc["sha256"] != source["sha256"]
                    or __import__("hashlib")
                    .sha256(source_doc["markdown"].encode())
                    .hexdigest()
                    != source.get("markdown_sha256")
                    or (source_doc["owner_id"] != job["owner_id"] and not grant)
                ):
                    raise JobError(
                        "source_changed",
                        "Fonte retirada ou permissão alterada durante processamento.",
                        True,
                    )
            db.execute(
                "UPDATE worker_jobs SET status='completed',result_json=?,error_json=NULL,lease_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (json.dumps(result, ensure_ascii=False), job["id"]),
            )
            if job["operation"] == "convert":
                db.execute(
                    "UPDATE source_documents SET status='converted',markdown=?,pages_json=?,warnings_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='uploaded'",
                    (
                        result["markdown"],
                        json.dumps(result["pages"], ensure_ascii=False),
                        json.dumps(result["warnings"], ensure_ascii=False),
                        job["document_id"],
                    ),
                )
        else:
            error = result.get(
                "error",
                {
                    "code": "processing_failed",
                    "message": "Processamento falhou.",
                    "retryable": False,
                },
            )
            retry = (
                error.get("retryable") and current["attempts"] < current["max_attempts"]
            )
            db.execute(
                "UPDATE worker_jobs SET status=?,error_json=?,lease_until=NULL,next_attempt_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (
                    "queued" if retry else "failed",
                    json.dumps(error, ensure_ascii=False),
                    int(time.time()) + 30 * current["attempts"],
                    job["id"],
                ),
            )
        db.commit()
    except Exception:
        db.rollback()
        raise


def restricted_limits():
    """Limites locais de recurso; contêiner sem rede é obrigatório para produção."""
    os.umask(0o077)
    resource.setrlimit(resource.RLIMIT_CPU, (1200, 1200))
    resource.setrlimit(resource.RLIMIT_FSIZE, (32 * 1024 * 1024, 32 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_NOFILE, (128, 128))
    if sys.platform.startswith("linux"):
        resource.setrlimit(resource.RLIMIT_AS, (2 * 1024**3, 2 * 1024**3))


def execute_child(request):
    """Fronteira de processo: parser não recebe credenciais ou acesso ao SQLite."""
    operation = request.get("operation")
    if operation == "convert":
        # Proíbe rede Python; isolamento OS adicional é documentado para produção.
        import socket

        def no_network(*args, **kwargs):
            raise OSError("Rede desativada no conversor")

        socket.socket = no_network
        return extract_pdf(Path(request["documentPath"]), request.get("pages"))
    if operation == "budget":
        return prepare_generation_preview(request)
    if operation == "generate":
        return generate_case(request)
    raise JobError("invalid_operation", "Operação desconhecida.")


def execute(db, job, storage_root):
    """Prepara entrada confiável e monitora subprocesso, timeout e cancelamento."""
    document = db.execute(
        "SELECT * FROM source_documents WHERE id=?", (job["document_id"],)
    ).fetchone()
    if not document or document["status"] == "withdrawn":
        raise JobError("source_unavailable", "Fonte retirada ou inexistente.")
    if not db.execute(
        "SELECT (SELECT institution_id FROM users WHERE id=?)=(SELECT institution_id FROM users WHERE id=?)",
        (document["owner_id"], job["owner_id"]),
    ).fetchone()[0]:
        raise JobError(
            "source_forbidden", "Fonte não pertence à instituição do usuário."
        )
    if (
        document["owner_id"] != job["owner_id"]
        and not db.execute(
            "SELECT 1 FROM document_grants WHERE document_id=? AND user_id=?",
            (document["id"], job["owner_id"]),
        ).fetchone()
    ):
        raise JobError("source_forbidden", "Sem autorização para esta fonte.")
    if not document["authorized_use"] or not document["deidentified"]:
        raise JobError(
            "source_declarations",
            "Confirme autorização de uso e desidentificação do material.",
        )
    req = json.loads(job["request_json"])
    # A API persiste a prévia como generate sem alterar CHECK/schema; nunca executa inferência.
    preview = (job["operation"] == "generate" and req.get("operation") == "budget")
    # Nunca confia em caminhos, identidade, modelos ou conteúdo enviados no payload público.
    req = {key: req[key] for key in ("pages", "instructions", "query") if key in req}
    req.update(
        operation="budget" if preview else job["operation"],
        workerLoadedAt=WORKER_LOADED_AT,
        sourceId=document["id"],
        sourceHash=document["sha256"],
        area=dict(document).get("area", "general"),
    )
    if job["operation"] == "convert":
        req["documentPath"] = str(private_file(document["storage_path"], storage_root))
        import hashlib

        if (
            hashlib.sha256(Path(req["documentPath"]).read_bytes()).hexdigest()
            != document["sha256"]
        ):
            raise JobError(
                "source_changed",
                "O hash do documento não corresponde ao upload registrado.",
            )
    else:
        req["markdown"] = document["markdown"]
        req["markdownHash"] = (
            __import__("hashlib").sha256(document["markdown"].encode()).hexdigest()
        )
        if len(req.get("instructions", "")) > 4000 or len(req.get("query", "")) > 1000:
            raise JobError("request_limit", "Instruções ou consulta excedem o limite.")
        if document["status"] not in {"converted", "approved"}:
            raise JobError(
                "not_converted", "Converta e confira a fonte antes da geração."
            )
        chunks = retrieve(db, job["owner_id"], req.get("query", ""))
        req["sources"] = chunks
        # Páginas físicas vieram da extração, não de cabeçalhos arbitrários da prévia editada.
        req["allowedReferences"] = [
            f"source:{document['id']}#page:{p['page']}"
            for p in json.loads(document["pages_json"])
        ] + [f"source:{c['document_id']}#page:{c['page']}" for c in chunks]
    with tempfile.TemporaryDirectory(prefix="devsphere-job-") as directory:
        os.chmod(directory, 0o700)
        source = Path(directory) / "input.json"
        output = Path(directory) / "output.json"
        source.write_text(json.dumps(req, ensure_ascii=False), encoding="utf-8")
        environment = {
            key: value
            for key, value in os.environ.items()
            if key
            in {
                "PATH",
                "LANG",
                "LC_ALL",
                "TMPDIR",
                "SYSTEMROOT",
                "DEVSPHERE_OLLAMA_URL",
                "DEVSPHERE_OLLAMA_CONTEXT",
                "DEVSPHERE_OLLAMA_MAX_TOKENS",
                "DEVSPHERE_OLLAMA_CRITIC_MAX_TOKENS",
                "DEVSPHERE_OLLAMA_CRITIC_CONTEXT",
                "DEVSPHERE_SOURCE_MAX_BYTES",
                "DEVSPHERE_OLLAMA_BATCH",
                "DEVSPHERE_OLLAMA_TIMEOUT",
                "DEVSPHERE_GENERATOR_MODEL",
                "DEVSPHERE_CRITIC_MODEL",
            }
        }
        environment["PYTHONPATH"] = str(Path(__file__).resolve().parents[1])
        process = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "worker.run",
                "--child-input",
                str(source),
                "--child-output",
                str(output),
            ],
            env=environment,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        started = time.monotonic()
        try:
            while process.poll() is None:
                cancelled = db.execute(
                    "SELECT cancel_requested,expires_at,status FROM worker_jobs WHERE id=?",
                    (job["id"],),
                ).fetchone()
                if (
                    not cancelled
                    or cancelled[0]
                    or cancelled[1] <= int(time.time())
                    or cancelled[2] != "running"
                    or time.monotonic() - started > 1800
                ):
                    raise JobError(
                        "cancelled_or_timeout",
                        "Processamento cancelado ou tempo máximo excedido.",
                        True,
                    )
                time.sleep(0.25)
            if not output.exists() or output.stat().st_size > 8 * 1024 * 1024:
                raise JobError(
                    "child_failed",
                    "Processo auxiliar encerrou sem resultado válido.",
                    True,
                )
            result = json.loads(output.read_text(encoding="utf-8"))
            if job["operation"] == "generate" and result.get("status") == "completed":
                result.setdefault("provenance", {})["markdownHash"] = req[
                    "markdownHash"
                ]
            return result
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
            process.wait()


def main():
    """Executa um job ou acompanha a fila; saída nunca inclui texto clínico."""
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--db", default=os.environ.get("DEVSPHERE_DB_PATH", "backend/data/devsphere.db")
    )
    parser.add_argument(
        "--storage",
        default=os.environ.get("DEVSPHERE_SOURCE_DIR", "backend/data/sources"),
    )
    parser.add_argument("--once", action="store_true")
    parser.add_argument(
        "--check", action="store_true", help="Valida banco/schema sem consumir a fila"
    )
    parser.add_argument("--child-input")
    parser.add_argument("--child-output")
    args = parser.parse_args()
    if args.child_input:
        restricted_limits()
        try:
            result = dict(
                status="completed",
                **execute_child(
                    json.loads(Path(args.child_input).read_text(encoding="utf-8"))
                ),
            )
        except JobError as error:
            result = {
                "status": "failed",
                "error": {
                    "code": error.code,
                    "message": error.message,
                    "retryable": error.retryable,
                    "metrics": getattr(error, "metrics", None),
                },
            }
        except Exception:
            result = {
                "status": "failed",
                "error": {
                    "code": "processing_failed",
                    "message": "Falha no processo auxiliar; conteúdo não registrado.",
                    "retryable": False,
                },
            }
        Path(args.child_output).write_text(
            json.dumps(result, ensure_ascii=False), encoding="utf-8"
        )
        return
    try:
        db = connect(args.db)
    except (RuntimeError, sqlite3.Error) as error:
        parser.exit(2, f"Não foi possível iniciar o worker: {error}\n")
    if args.check:
        print(
            f"Banco do worker validado: {Path(args.db).resolve()}. Nenhum trabalho processado.",
            flush=True,
        )
        db.close()
        return
    print(
        f"Worker iniciado. Banco: {Path(args.db).resolve()}. Aguardando trabalhos…",
        flush=True,
    )
    while True:
        sync_library(db)
        job = claim(db)
        if job:
            try:
                result = execute(db, job, args.storage)
            except JobError as error:
                result = {
                    "status": "failed",
                    "error": {
                        "code": error.code,
                        "message": error.message,
                        "retryable": error.retryable,
                    },
                }
            try:
                finish(db, job, result)
            except JobError as error:
                finish(
                    db,
                    job,
                    {
                        "status": "failed",
                        "error": {
                            "code": error.code,
                            "message": error.message,
                            "retryable": error.retryable,
                        },
                    },
                )
        if args.once:
            break
        time.sleep(1)


if __name__ == "__main__":
    main()
