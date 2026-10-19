#!/usr/bin/env bash
# Perfil opcional e isolado: reaproveita modelos, sem alterar o aplicativo Ollama.
# Cache q8_0 e margem de ajuste são parâmetros experimentais, sujeitos a avaliação.
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TASK_PORT="${DEVSPHERE_LOCAL_OLLAMA_PORT:-11435}"
if [[ ! "${TASK_PORT}" =~ ^[0-9]{4,5}$ ]] || ((10#${TASK_PORT} < 1024 || 10#${TASK_PORT} > 65535)); then
  echo "DEVSPHERE_LOCAL_OLLAMA_PORT deve ser uma porta entre1024 e65535." >&2
  exit 2
fi
TASK_OLLAMA="${DEVSPHERE_OLLAMA_BIN:-}"
if [[ -z "${TASK_OLLAMA}" ]]; then
  TASK_OLLAMA="$(command -v ollama || true)"
  if [[ -z "${TASK_OLLAMA}" && -x /Applications/Ollama.app/Contents/Resources/ollama ]]; then
    TASK_OLLAMA=/Applications/Ollama.app/Contents/Resources/ollama
  fi
fi
if [[ -z "${TASK_OLLAMA}" || ! -f "${TASK_OLLAMA}" || ! -x "${TASK_OLLAMA}" ]]; then
  echo "Ollama não encontrado. Instale o aplicativo ou configure DEVSPHERE_OLLAMA_BIN com o executável." >&2
  exit 2
fi
if [[ -n "${DEVSPHERE_PYTHON:-}" ]]; then
  TASK_PYTHON="${DEVSPHERE_PYTHON}"
elif [[ -x "${TASK_ROOT}/.venv-worker/bin/python" ]]; then
  TASK_PYTHON="${TASK_ROOT}/.venv-worker/bin/python"
else
  TASK_PYTHON=python3
fi
if ! command -v "${TASK_PYTHON}" >/dev/null 2>&1; then
  echo "Python configurado indisponível; prepare .venv-worker ou DEVSPHERE_PYTHON." >&2
  exit 2
fi
# A guarda não consulta serviços existentes nem encerra processos de terceiros.
"${TASK_PYTHON}" - "${TASK_PORT}" <<'PY'
import socket,sys
try:
    with socket.socket() as connection:
        connection.bind(('127.0.0.1',int(sys.argv[1])))
except OSError:
    print('Porta local indisponível; escolha outra porta. Nenhum serviço foi encerrado.',file=sys.stderr)
    raise SystemExit(2)
PY
printf 'Ollama isolado em http://127.0.0.1:%s; Ctrl+C encerra este processo.\n' "${TASK_PORT}"
printf 'No terminal do worker: export DEVSPHERE_OLLAMA_URL="http://127.0.0.1:%s"\n' "${TASK_PORT}"
# Fornece somente o ambiente necessário ao executor; não repassa segredos da API.
# NOPRUNE preserva os blobs existentes. NO_CLOUD mantém a execução local.
exec env -i HOME="${HOME}" PATH="${PATH}" TMPDIR="${TMPDIR:-/tmp}" \
  LANG="${LANG:-pt_BR.UTF-8}" \
  OLLAMA_HOST="127.0.0.1:${TASK_PORT}" \
  OLLAMA_MODELS="${OLLAMA_MODELS:-${HOME}/.ollama/models}" \
  OLLAMA_NOPRUNE=1 OLLAMA_NO_CLOUD=1 OLLAMA_NUM_PARALLEL=1 \
  OLLAMA_MAX_LOADED_MODELS=1 OLLAMA_FLASH_ATTENTION=1 \
  OLLAMA_KV_CACHE_TYPE=q8_0 LLAMA_ARG_FIT_TARGET=128 \
  OLLAMA_LOAD_TIMEOUT=60s "${TASK_OLLAMA}" serve
