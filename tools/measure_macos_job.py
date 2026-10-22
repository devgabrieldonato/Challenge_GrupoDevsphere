#!/usr/bin/env python3
"""Observa um trabalho real sem inferência própria, mutações no banco ou conteúdo clínico."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
try:
    from worker.doctor import LocalOllama, CheckError, local_url
except ImportError:
    # Permite executar a cópia privada antes da integração pelo coordenador.
    sys.path.insert(0, os.getcwd())
    from worker.doctor import LocalOllama, CheckError, local_url

TOKEN = re.compile(r"^[A-Za-z0-9_.:/-]{1,200}$")
TERMINAL = {"completed", "failed", "cancelled"}


def command(argv):
    """Comandos fixos, sem shell ou argumentos de processos; ausência de permissão vira null."""
    try:
        result = subprocess.run(argv, capture_output=True, text=True, timeout=1, check=True)
        return result.stdout[:100_000]
    except (OSError, subprocess.SubprocessError):
        return None


def parse_vm(text):
    """Preserva contadores Mach sem chamar memória livre de memória disponível."""
    if not text:
        return None
    match = re.search(r"page size of (\d+) bytes", text)
    if not match:
        return None
    size = int(match[1])
    result = {"pageSizeBytes": size}
    names = {"Pages free": "freePagesBytes", "Pages inactive": "inactivePagesBytes",
             "Pages speculative": "speculativePagesBytes", "Pages wired down": "wiredBytes",
             "Pages occupied by compressor": "compressorBytes", "Swapins": "swapinsPages",
             "Swapouts": "swapoutsPages", "Pageouts": "pageoutsPages"}
    for source, target in names.items():
        match = re.search(r"^" + re.escape(source) + r":\s*(\d+)\.", text, re.M)
        if match:
            value = int(match[1])
            result[target] = value if target.endswith("Pages") else value * size
    return result


def parse_swap(text):
    """Usa unidade explicitamente; sysctl negado nunca é interpretado como swap zero."""
    if not text:
        return None
    result = {}
    for field in ("total", "used", "free"):
        match = re.search(r"\b" + field + r"\s*=\s*([0-9.]+)([KMGT])", text)
        if match:
            result[field + "Bytes"] = round(float(match[1]) * 1024 ** ("KMGT".index(match[2]) + 1))
    return result or None


def parse_rss(text):
    """Soma aproximada do RSS dos executáveis Ollama, sem coletar argumentos ou PIDs."""
    values = []
    for line in (text or "").splitlines():
        try:
            comm, rss = line.rsplit(None, 1)
            if "ollama" in comm.lower() or Path(comm).name in {"llama-server", "ollama-runner"}:
                value = int(rss)
                if value >= 0:
                    values.append(value * 1024)
        except (ValueError, TypeError):
            pass
    return sum(values) if values else None


def safe_metrics(value):
    """Lista fechada: descarta fontes, mensagens, prompts, nomes de paciente e opções arbitrárias."""
    if not isinstance(value, dict):
        return {}
    out = {}
    for key in ("durationNs", "evaluationTokens", "promptTokens", "loadDurationNs",
                "promptDurationNs", "evaluationDurationNs", "elapsedSeconds"):
        number = value.get(key)
        if type(number) in (int, float) and 0 <= number < 10**20:
            out[key] = number
    for key in ("model", "digest"):
        text = value.get(key)
        if isinstance(text, str) and TOKEN.fullmatch(text):
            out[key] = text
    return out


def safe_job(row):
    """O SELECT nunca lê request_json; result_json limitado só é aberto para métricas terminais."""
    if row is None:
        return None
    out = {key: row[key] for key in ("id", "operation", "status", "attempts", "cancel_requested")}
    try:
        error = json.loads(row["error_json"] or "{}")
        code = error.get("code")
        if isinstance(code, str) and TOKEN.fullmatch(code):
            out["error"] = {"code": code, "retryable": error.get("retryable") is True}
            metrics = error.get("metrics")
            if isinstance(metrics,dict):
                phase=metrics.get("phase")
                if phase in ("qwen","gemma"):out["error"]["phase"]=phase
                out["error"]["metrics"]={k:v for k,v in metrics.items() if k in ("elapsedSeconds","preparationSeconds","qwenSeconds","validationSeconds") and type(v) in (int,float) and 0<=v<10000}
    except (ValueError, AttributeError):
        pass
    try:
        result = json.loads(row["result_json"] or "{}")
        provenance = result.get("provenance", {})
        out["provenance"] = {key: safe_metrics(provenance.get(key)) for key in ("generator", "critic")}
        case = result.get("case", {})
        items = case.get("items", [])
        if row["status"] == "completed" and isinstance(items, list):
            out["counts"] = {kind: sum(isinstance(item, dict) and item.get("type") == kind for item in items)
                             for kind in ("question", "exam")}
    except (ValueError, AttributeError, TypeError):
        pass
    return out


def open_database(path):
    """mode=ro impede criar banco; query_only e trusted_schema limitam efeitos de SQL."""
    db = sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True, timeout=0.2)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA query_only=ON")
    db.execute("PRAGMA trusted_schema=OFF")
    return db


def read_job(db, document, excluded):
    rows = db.execute("""SELECT id,operation,status,attempts,cancel_requested,
      CASE WHEN length(error_json)<=8192 THEN error_json END AS error_json,
      CASE WHEN status='completed' AND length(result_json)<=1048576 THEN result_json END AS result_json
      FROM worker_jobs WHERE document_id=? AND operation='generate'
      ORDER BY created_at DESC,rowid DESC LIMIT 100""", (document,)).fetchall()
    return next((safe_job(row) for row in rows if row["id"] not in excluded), None)


def sample(provider, api):
    """Instrumentação somente leitura; métricas independentes não devem ser somadas."""
    vm = parse_vm(command(["/usr/bin/vm_stat"]))
    swap = parse_swap(command(["/usr/sbin/sysctl", "vm.swapusage"]))
    pressure = command(["/usr/bin/memory_pressure", "-Q"])
    match = re.search(r"memory free percentage:\s*(\d+)%", pressure or "")
    sample = {"monotonic": time.monotonic(), "vm": vm, "swap": swap,
              "memoryPressureFreePercent": int(match[1]) if match else None,
              "ollamaApproxRssBytes": parse_rss(command(["/bin/ps", "-axo", "comm=,rss="])),
              "models": None, "apiHealth": None}
    try:
        models = provider.get("ps").get("models", [])
        sample["models"] = []
        for model in models[:8]:
            if not isinstance(model, dict):
                continue
            entry = {}
            for key in ("name", "model", "digest"):
                if isinstance(model.get(key), str) and TOKEN.fullmatch(model[key]):
                    entry[key] = model[key]
            for key in ("size", "size_vram", "context_length"):
                if type(model.get(key)) is int and model[key] >= 0:
                    entry[key] = model[key]
            sample["models"].append(entry)
    except (CheckError, AttributeError, TypeError):
        pass
    started = time.monotonic()
    try:
        request = urllib.request.Request(api + "/api/v1/health")
        with provider.opener.open(request, timeout=1) as response:
            sample["apiHealth"] = {"httpStatus": response.status, "latencySeconds": round(time.monotonic()-started, 4)}
    except (OSError, ValueError):
        sample["apiHealth"] = {"httpStatus": None, "latencySeconds": round(time.monotonic()-started, 4)}
    return sample


def write_report(path, report):
    """Cria relatório privado sem sobrescrever arquivo existente nem seguir symlink final."""
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    with os.fdopen(os.open(path, flags, 0o600), "w", encoding="utf-8") as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.write("\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, required=True)
    parser.add_argument("--document-id", required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--duration", type=int, default=600)
    parser.add_argument("--interval", type=float, default=1)
    parser.add_argument("--ollama-url", default="http://127.0.0.1:11434")
    parser.add_argument("--api-url", default="http://127.0.0.1:8080")
    args = parser.parse_args()
    if not 1 <= args.duration <= 600 or not 0.5 <= args.interval <= 10 or not TOKEN.fullmatch(args.document_id):
        parser.error("Duração 1..600, intervalo 0.5..10 e identificador opaco são obrigatórios.")
    if sys.platform != "darwin":
        parser.error("Instrumentação destinada ao macOS.")
    api = local_url(args.api_url)
    provider = LocalOllama(args.ollama_url, 1)
    # Não cria diretórios privados nem toca o banco quando o destino já está ocupado.
    if args.report.exists() or args.report.is_symlink() or not args.report.parent.is_dir():
        parser.error("Escolha um arquivo novo em diretório privado existente.")
    db = open_database(args.db)
    excluded = {row[0] for row in db.execute("SELECT id FROM worker_jobs WHERE document_id=? AND operation='generate'", (args.document_id,))}
    start = time.monotonic()
    report = {"startedAt": datetime.now(timezone.utc).isoformat(), "maximumDurationSeconds": args.duration,
              "requestedIntervalSeconds": args.interval, "samples": [], "transitions": [], "job": None,
              "stopReason": "duration_limit", "clinicalValidation": "pending_human_review",
              "notes": ["Observador não inicia inferência, não modifica o banco, não cancela trabalhos e não encerra processos.",
                        "Fases inferidas apenas pelos modelos carregados; carregamento não comprova inferência nem sua autoria.",
                        "RSS pode contar páginas compartilhadas. size_vram é alocação reportada, não medição física independente.",
                        "freePagesBytes não é memória disponível; free percent é saída de memory_pressure -Q, não prova de pressão crítica.",
                        "Amostragem sequencial pode exceder intervalo e perder picos. null significa sem medição; swap pode ser negado pelo sistema.",
                        "Conversão anterior, preparação, validação e salvamento não têm tempos independentes sem instrumentação da aplicação."]}
    print(json.dumps({"event": "ready", "existingJobsExcluded": len(excluded)}), flush=True)
    previous = None
    low_count = 0
    try:
        while time.monotonic() - start < args.duration:
            point = sample(provider, api)
            point["elapsedSeconds"] = round(point.pop("monotonic") - start, 3)
            report["samples"].append(point)
            job = read_job(db, args.document_id, excluded)
            report["job"] = job
            state = (job.get("id"), job.get("status"), job.get("attempts")) if job else None
            if state != previous:
                transition = {"elapsedSeconds": point["elapsedSeconds"], "job": job}
                report["transitions"].append(transition)
                print(json.dumps({"event": "job_transition", **transition}), flush=True)
                previous = state
            free = point["memoryPressureFreePercent"]
            low_count = low_count + 1 if free is not None and free <= 5 else 0
            if low_count == 3:
                print(json.dumps({"event": "low_memory_headroom", "action": "Revisar pressão no macOS e cancelar somente este trabalho pela interface se necessário; observador não cancela."}), flush=True)
            if job and job["status"] in TERMINAL:
                report["stopReason"] = "job_terminal"
                break
            time.sleep(args.interval)
    except KeyboardInterrupt:
        report["stopReason"] = "observer_interrupted"
    except sqlite3.Error:
        report["stopReason"] = "database_read_failed"
    finally:
        db.close()
        report["elapsedSeconds"] = round(time.monotonic() - start, 3)
        write_report(args.report, report)
    print(json.dumps({"event": "finished", "stopReason": report["stopReason"], "elapsedSeconds": report["elapsedSeconds"]}), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
