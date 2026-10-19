"""Benchmark real local; relatório contém métricas, nunca texto do caso ou das fontes."""

from __future__ import annotations
import argparse
import json
import os
from pathlib import Path

# resource não existe no Python nativo do Windows; a inferência continua mensurável por /api/ps.
try:
    import resource
except ImportError:
    resource = None
import subprocess
import threading
import time
from .core import JobError, generate_case
from .doctor import LocalOllama, CheckError


def client_max_rss_bytes():
    """Ausência da métrica não impede testar modelos nem é registrada como consumo zero."""
    if resource is None:
        return None
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return rss if __import__("sys").platform == "darwin" else rss * 1024


def process_rss_bytes(output):
    """Ignora linhas não mensuráveis sem perder as demais; não inspeciona argumentos."""
    values = []
    for line in output.splitlines():
        try:
            command, rss = line.rsplit(None, 1)
            value = int(rss)
        except (ValueError, TypeError):
            continue
        executable = Path(command).name.lower()
        if value >= 0 and (
            "ollama" in command.lower()
            or executable in {"llama-server", "ollama-runner"}
        ):
            values.append(value * 1024)
    return sum(values) if values else None


def model_allocation_bytes(payload):
    """Memória reportada pelo executor é estimativa de alocação, distinta de RSS/VRAM real."""
    models = payload.get("models") if isinstance(payload, dict) else None
    if not isinstance(models, list) or not models:
        return None
    if any(
        not isinstance(m, dict)
        or type(m.get("size")) is not int
        or m["size"] < 0
        or type(m.get("size_vram")) is not int
        or not 0 <= m["size_vram"] <= m["size"]
        for m in models
    ):
        return None
    return sum(m["size"] for m in models), sum(m["size_vram"] for m in models)


def main():
    """Mede cliente e soma aproximada RSS dos processos Ollama; não aprova resultados."""
    parser = argparse.ArgumentParser(
        description="Benchmark local sem mock e sem download automático"
    )
    parser.add_argument(
        "--input",
        required=True,
        type=Path,
        help="JSON privado com markdown, sourceId e allowedReferences",
    )
    parser.add_argument("--report", required=True, type=Path)
    args = parser.parse_args()
    if args.input.stat().st_size > 200000:
        raise SystemExit("Entrada excede 200 KB; selecione menos páginas.")
    request = json.loads(args.input.read_text(encoding="utf-8"))
    stop = threading.Event()
    peak = [None]
    allocation_peak = [None, None]
    allocation_samples = [0]
    # Configuração inválida será relatada pelo gerador; o sampler nunca amplia acesso.
    try:
        provider = LocalOllama(
            os.environ.get("DEVSPHERE_OLLAMA_URL", "http://127.0.0.1:11434"), 1
        )
    except CheckError:
        provider = None

    def sample():
        # ps recebe argumentos fixos; RSS é soma aproximada, pode contar páginas compartilhadas.
        while not stop.is_set():
            try:
                output = subprocess.run(
                    ["ps", "-axo", "comm=,rss="],
                    capture_output=True,
                    text=True,
                    timeout=2,
                    check=True,
                ).stdout
                total = process_rss_bytes(output)
                if total is not None:
                    peak[0] = max(peak[0] or 0, total)
            except (OSError, ValueError, subprocess.SubprocessError):
                pass
            try:
                allocation = (
                    model_allocation_bytes(provider.get("ps")) if provider else None
                )
                if allocation is not None:
                    allocation_samples[0] += 1
                    for i, value in enumerate(allocation):
                        allocation_peak[i] = max(allocation_peak[i] or 0, value)
            except CheckError:
                pass
            stop.wait(0.5)

    thread = threading.Thread(target=sample, daemon=True)
    thread.start()
    started = time.monotonic()
    report = {
        "status": "failed",
        "clinicalValidation": "pending_human_review",
        "generator": os.environ.get("DEVSPHERE_GENERATOR_MODEL", "qwen3:8b"),
        "critic": os.environ.get("DEVSPHERE_CRITIC_MODEL", "gemma3:4b"),
    }
    try:
        result = generate_case(request)
        report.update(
            status="completed",
            schemaValid=True,
            items=len(result["case"]["items"]),
            questions=sum(
                item["type"] == "question" for item in result["case"]["items"]
            ),
            exams=sum(item["type"] == "exam" for item in result["case"]["items"]),
            provenance={
                key: value
                for key, value in result["provenance"].items()
                if key in {"generator", "critic", "promptVersion", "elapsedSeconds"}
            },
        )
    except JobError as error:
        report["error"] = {
            "code": error.code,
            "message": error.message,
            "retryable": error.retryable,
        }
    finally:
        stop.set()
        thread.join(timeout=3)
    report["elapsedSeconds"] = round(time.monotonic() - started, 3)
    report["clientMaxRssBytes"] = client_max_rss_bytes()
    report["ollamaApproxPeakRssBytes"] = peak[0]
    report["ollamaReportedPeakSizeBytes"] = allocation_peak[0]
    report["ollamaReportedPeakVramBytes"] = allocation_peak[1]
    report["ollamaAllocationSamples"] = allocation_samples[0]
    report["memoryNote"] = (
        "RSS do cliente/processos e alocação reportada por /api/ps são medidas distintas. A amostragem pode perder picos, incluir outras execuções e contar páginas compartilhadas. size_vram do executor não é medição física independente. null indica ausência de amostra válida."
    )
    args.report.parent.mkdir(parents=True, exist_ok=True)
    with open(
        args.report,
        "w",
        encoding="utf-8",
        opener=lambda name, flags: os.open(name, flags, 0o600),
    ) as output:
        output.write(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    os.chmod(args.report, 0o600)
    print(
        json.dumps(
            {"status": report["status"], "report": str(args.report)}, ensure_ascii=False
        )
    )
    return 0 if report["status"] == "completed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
