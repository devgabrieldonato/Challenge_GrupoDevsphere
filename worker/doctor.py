"""Inventário local sem inferência, downloads, acesso ao banco ou aprovação clínica."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import ipaddress
import json
import os
from pathlib import Path
import platform
import re
import shutil
import socket
import subprocess
import urllib.error
import urllib.parse
import urllib.request

MODEL_NAME = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9._:/-]{0,199}$")
DIGEST = re.compile(r"^(?:sha256:)?[a-fA-F0-9]{64}$")
NOTE = "Instalação e memória instantânea não comprovam geração integral nem validade clínica. Nenhuma inferência foi executada."


class CheckError(Exception):
    """Mensagens públicas não incluem resposta bruta, caminhos, credenciais ou exceções externas."""

    def __init__(self, code, message):
        super().__init__(message)
        self.code, self.message = code, message


def local_url(value):
    """Permite somente loopback HTTP e rejeita credenciais, caminhos, query e fragmentos."""
    try:
        normalized = value.rstrip("/")
        parsed = urllib.parse.urlsplit(normalized)
        port = parsed.port if parsed.port is not None else 80
        if (
            parsed.scheme != "http"
            or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path
            or parsed.query
            or parsed.fragment
            or not (1 <= port <= 65535)
        ):
            raise ValueError
        # Um arquivo hosts alterado não deve transformar localhost em acesso remoto.
        addresses = socket.getaddrinfo(parsed.hostname, port, type=socket.SOCK_STREAM)
        if not addresses or any(
            not ipaddress.ip_address(address[4][0].split("%")[0]).is_loopback
            for address in addresses
        ):
            raise ValueError
        return normalized
    except (ValueError, TypeError, AttributeError, OSError):
        raise CheckError(
            "unsafe_provider",
            "Configure Ollama por HTTP em loopback, sem credenciais ou caminhos.",
        ) from None


class LocalOllama:
    """Consulta somente três endpoints de inventário; proxies e redirects ficam desativados."""

    def __init__(self, url, timeout):
        self.url, self.timeout = local_url(url), timeout

        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs):
                return None

        self.opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}), NoRedirect()
        )

    def get(self, endpoint):
        """Limita bytes e normaliza falhas sem expor corpo de resposta potencialmente sensível."""
        if endpoint not in {"version", "tags", "ps"}:
            raise CheckError(
                "unsafe_endpoint", "Operação não permitida no diagnóstico."
            )
        try:
            request = urllib.request.Request(f"{self.url}/api/{endpoint}", method="GET")
            with self.opener.open(request, timeout=self.timeout) as response:
                body = response.read(1_000_001)
            if len(body) > 1_000_000:
                raise CheckError(
                    "response_limit", "Inventário do Ollama excede o limite de leitura."
                )
            result = json.loads(body)
            if not isinstance(result, dict):
                raise ValueError
            return result
        except CheckError:
            raise
        except urllib.error.HTTPError as error:
            status = error.code
            error.close()
            if 300 <= status < 400:
                raise CheckError(
                    "redirect_blocked",
                    "Redirecionamento do Ollama bloqueado; use o endereço local direto.",
                ) from None
            raise CheckError(
                "provider_http_error",
                f"Ollama respondeu HTTP {status} ao consultar inventário.",
            ) from None
        except (socket.timeout, TimeoutError):
            raise CheckError(
                "provider_timeout", "Consulta ao Ollama excedeu o tempo configurado."
            ) from None
        except (OSError, ValueError, TypeError, UnicodeError):
            raise CheckError(
                "provider_unavailable",
                "Ollama indisponível ou inventário inválido; confira o serviço local.",
            ) from None


def positive_integer(value):
    """Não confunde bool ou ausência com uma medida válida de bytes."""
    return value if type(value) is int and value >= 0 else None


def model_record(entry):
    """Publica somente identificadores de modelo e medidas reconhecidas, nunca campos arbitrários."""
    name = entry.get("name") or entry.get("model")
    return {
        "name": name if isinstance(name, str) and MODEL_NAME.fullmatch(name) else None,
        "digest": (
            entry.get("digest")
            if isinstance(entry.get("digest"), str)
            and DIGEST.fullmatch(entry["digest"])
            else None
        ),
        "sizeBytes": positive_integer(entry.get("size")),
    }


def command_output(arguments, timeout):
    """Executáveis conhecidos recebem somente argumentos fixos e um ambiente mínimo, sem shell."""
    environment = {
        key: value
        for key, value in os.environ.items()
        if key in {"PATH", "LANG", "LC_ALL", "TESSDATA_PREFIX", "SYSTEMROOT"}
    }
    try:
        result = subprocess.run(
            arguments,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
            env=environment,
        )
        if result.returncode or len(result.stdout) + len(result.stderr) > 1_000_000:
            return None
        return result.stdout + "\n" + result.stderr
    except (OSError, subprocess.SubprocessError, UnicodeError):
        return None


def hardware_snapshot(timeout):
    """Memória é observação instantânea, não um teste de capacidade do modelo."""
    result = {
        "system": platform.system(),
        "architecture": platform.machine(),
        "logicalCpuCount": os.cpu_count(),
        "physicalMemoryBytes": None,
        "availableMemoryEstimateBytes": None,
    }
    try:
        result["physicalMemoryBytes"] = os.sysconf("SC_PHYS_PAGES") * os.sysconf(
            "SC_PAGE_SIZE"
        )
    except (AttributeError, OSError, ValueError):
        pass
    if platform.system() == "Darwin":
        executable = shutil.which("sysctl")
        output = (
            command_output([executable, "-n", "hw.memsize"], timeout)
            if executable
            else None
        )
        if output and output.strip().isdigit():
            result["physicalMemoryBytes"] = int(output.strip())
        executable = shutil.which("vm_stat")
        output = command_output([executable], timeout) if executable else None
        if output:
            page = re.search(r"page size of (\d+) bytes", output)
            counters = [
                re.search(rf"{label}:\s*(\d+)", output)
                for label in ["Pages free", "Pages inactive", "Pages speculative"]
            ]
            if page and all(counters):
                result["availableMemoryEstimateBytes"] = int(page[1]) * sum(
                    int(counter[1]) for counter in counters
                )
                result["memoryEstimateNote"] = (
                    "Estimativa de páginas livres, inativas e especulativas; não mede capacidade de inferência."
                )
    elif platform.system() == "Linux":
        try:
            memory = Path("/proc/meminfo").read_text(encoding="ascii")
            available = re.search(r"^MemAvailable:\s*(\d+) kB", memory, re.MULTILINE)
            if available:
                result["availableMemoryEstimateBytes"] = int(available[1]) * 1024
        except (OSError, UnicodeError):
            pass
    try:
        result["storageFreeBytes"] = shutil.disk_usage(
            Path(__file__).resolve().parent
        ).free
    except OSError:
        result["storageFreeBytes"] = None
    return result


def diagnose(timeout=3, url=None, generator=None, critic=None):
    """Agrega dependências; qualquer falha obrigatória produz status unavailable, sem tentar reparos."""
    if type(timeout) is not int or not 1 <= timeout <= 10:
        raise ValueError("timeout deve ser inteiro de 1 a 10 segundos")
    report = {
        "schemaVersion": "1.0",
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "status": "available",
        "generationCapability": "not_tested",
        "inferencePerformed": False,
        "databaseAccessed": False,
        "downloadsPerformed": False,
        "note": NOTE,
        "hardware": hardware_snapshot(timeout),
        "checks": {},
        "issues": [],
    }

    def issue(component, code, message):
        report["issues"].append(
            {"component": component, "code": code, "message": message}
        )

    models = {
        "generator": generator
        or os.environ.get("DEVSPHERE_GENERATOR_MODEL", "qwen3:8b"),
        "critic": critic or os.environ.get("DEVSPHERE_CRITIC_MODEL", "gemma3:4b"),
    }
    ollama = {
        "status": "unavailable",
        "version": None,
        "installedModelCount": None,
        "runningModelCount": None,
        "configuredModels": {},
        "runningModels": [],
    }
    report["checks"]["ollama"] = ollama
    try:
        if any(
            not isinstance(name, str) or not MODEL_NAME.fullmatch(name)
            for name in models.values()
        ):
            raise CheckError(
                "invalid_model_configuration",
                "Nome de modelo configurado inválido; confira gerador e crítico.",
            )
        provider = LocalOllama(
            url or os.environ.get("DEVSPHERE_OLLAMA_URL", "http://127.0.0.1:11434"),
            timeout,
        )
        version = provider.get("version").get("version")
        if not isinstance(version, str) or not re.fullmatch(
            r"[0-9][A-Za-z0-9._+-]{0,79}", version
        ):
            raise CheckError(
                "invalid_version", "Ollama não informou uma versão reconhecida."
            )
        ollama["version"] = version
        entries = provider.get("tags").get("models")
        if (
            not isinstance(entries, list)
            or len(entries) > 1000
            or any(not isinstance(entry, dict) for entry in entries)
        ):
            raise CheckError(
                "invalid_models",
                "Lista de modelos do Ollama inválida ou acima do limite.",
            )
        ollama["installedModelCount"] = len(entries)
        for role, name in models.items():
            aliases = {name, name + ":latest"}
            found = next(
                (
                    entry
                    for entry in entries
                    if entry.get("name") in aliases or entry.get("model") in aliases
                ),
                None,
            )
            record = {
                "name": name,
                "installed": found is not None,
                "digest": None,
                "sizeBytes": None,
            }
            if found:
                details = model_record(found)
                record.update(digest=details["digest"], sizeBytes=details["sizeBytes"])
                if not record["digest"] or not record["sizeBytes"]:
                    issue(
                        "ollama",
                        "model_metadata_missing",
                        f"Modelo {role} encontrado, mas digest ou tamanho não foram confirmados.",
                    )
            else:
                issue(
                    "ollama",
                    "model_missing",
                    f"Modelo {role} configurado não está instalado no Ollama local.",
                )
            ollama["configuredModels"][role] = record
        running = provider.get("ps").get("models")
        if (
            not isinstance(running, list)
            or len(running) > 1000
            or any(not isinstance(entry, dict) for entry in running)
        ):
            raise CheckError(
                "invalid_processes", "Inventário de processos do Ollama inválido."
            )
        for entry in running:
            record = model_record(entry)
            record.update(
                sizeVramBytes=positive_integer(entry.get("size_vram")),
                contextLength=positive_integer(entry.get("context_length")),
            )
            ollama["runningModels"].append(record)
        ollama["runningModelCount"] = len(running)
        ollama["status"] = (
            "available"
            if not any(item["component"] == "ollama" for item in report["issues"])
            else "unavailable"
        )
    except CheckError as error:
        issue("ollama", error.code, error.message)

    ocr = {
        "status": "unavailable",
        "tesseractInstalled": False,
        "tesseractVersion": None,
        "requiredLanguages": ["por", "eng"],
        "installedLanguages": [],
        "popplerInstalled": False,
        "popplerVersion": None,
    }
    report["checks"]["ocr"] = ocr
    tesseract, poppler = shutil.which("tesseract"), shutil.which("pdftoppm")
    if not tesseract:
        issue("ocr", "tesseract_missing", "Tesseract não encontrado no PATH.")
    else:
        ocr["tesseractInstalled"] = True
        output = command_output([tesseract, "--version"], timeout)
        # O instalador Windows prefixa a versão com v; as demais distribuições podem omiti-lo.
        match = re.search(
            r"\btesseract\s+v?([0-9][A-Za-z0-9._+-]{0,49})", output or "", re.IGNORECASE
        )
        if match:
            ocr["tesseractVersion"] = match[1]
        else:
            issue(
                "ocr",
                "tesseract_unavailable",
                "Tesseract foi encontrado, mas a consulta de versão falhou.",
            )
        output = command_output([tesseract, "--list-langs"], timeout)
        languages = sorted(
            {
                line.strip()
                for line in (output or "").splitlines()
                if re.fullmatch(r"[A-Za-z0-9_+-]{1,40}", line.strip())
            }
        )
        ocr["installedLanguages"] = languages
        if not all(language in languages for language in ocr["requiredLanguages"]):
            issue(
                "ocr",
                "ocr_languages_missing",
                "Instale os idiomas por e eng do Tesseract.",
            )
    if not poppler:
        issue("ocr", "poppler_missing", "Poppler/pdftoppm não encontrado no PATH.")
    else:
        ocr["popplerInstalled"] = True
        output = command_output([poppler, "-v"], timeout)
        match = re.search(
            r"\bpdftoppm\s+version\s+([0-9][A-Za-z0-9._+-]{0,49})",
            output or "",
            re.IGNORECASE,
        )
        if match:
            ocr["popplerVersion"] = match[1]
        else:
            issue(
                "ocr",
                "poppler_unavailable",
                "Poppler foi encontrado, mas a consulta de versão falhou.",
            )
    ocr["status"] = (
        "available"
        if not any(item["component"] == "ocr" for item in report["issues"])
        else "unavailable"
    )
    report["status"] = "unavailable" if report["issues"] else "available"
    return report


def timeout_argument(value):
    """A interface de linha de comando rejeita timeouts que tornariam a checagem bloqueante."""
    try:
        result = int(value)
    except ValueError:
        raise argparse.ArgumentTypeError("use um inteiro de 1 a 10") from None
    if not 1 <= result <= 10:
        raise argparse.ArgumentTypeError("use um inteiro de 1 a 10")
    return result


def main(argv=None):
    """Exibe JSON ou resumo PT-BR. Código zero significa dependências encontradas, não geração validada."""
    parser = argparse.ArgumentParser(
        description="Diagnóstico local sem inferência, downloads ou acesso ao banco."
    )
    parser.add_argument("--json", action="store_true", help="imprimir inventário JSON")
    parser.add_argument(
        "--timeout",
        type=timeout_argument,
        default=3,
        help="segundos por operação (1 a 10; padrão 3)",
    )
    args = parser.parse_args(argv)
    report = diagnose(args.timeout)
    if args.json:
        print(json.dumps(report, ensure_ascii=False))
    else:
        print(
            "Diagnóstico local: "
            + (
                "dependências encontradas"
                if report["status"] == "available"
                else "há componentes indisponíveis"
            )
        )
        ollama, ocr = report["checks"]["ollama"], report["checks"]["ocr"]
        print(
            f"Ollama: {ollama['version'] or 'não confirmado'}; modelos instalados: {ollama['installedModelCount']}; em memória: {ollama['runningModelCount']}."
        )
        for role, model in ollama["configuredModels"].items():
            print(
                f"Modelo {role}: {model['name']}; instalado: {'sim' if model['installed'] else 'não'}; bytes: {model['sizeBytes']}; digest: {model['digest'] or 'não confirmado'}."
            )
        print(
            f"OCR: Tesseract {ocr['tesseractVersion'] or 'não confirmado'}; idiomas: {', '.join(ocr['installedLanguages']) or 'não confirmados'}; Poppler {ocr['popplerVersion'] or 'não confirmado'}."
        )
        memory = report["hardware"]["physicalMemoryBytes"]
        print(
            f"Hardware: {report['hardware']['system']} {report['hardware']['architecture']}; RAM: {memory if memory is not None else 'não confirmada'} bytes."
        )
        for item in report["issues"]:
            print(f"- {item['message']}")
        print(NOTE)
    return 0 if report["status"] == "available" else 1


if __name__ == "__main__":
    raise SystemExit(main())
