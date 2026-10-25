#!/usr/bin/env bash
# Inventário somente de leitura: não inicia serviços, baixa modelos ou acessa a fila.
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${TASK_ROOT}"
DEFAULT_DOCTOR_PYTHON="${TASK_ROOT}/.venv-worker/bin/python"
if [[ ! -x "${DEFAULT_DOCTOR_PYTHON}" ]]; then DEFAULT_DOCTOR_PYTHON=python3; fi
DOCTOR_PYTHON="${DEVSPHERE_PYTHON:-${DEFAULT_DOCTOR_PYTHON}}"
if ! command -v "${DOCTOR_PYTHON}" >/dev/null 2>&1; then
  for argument in "$@"; do
    if [[ "${argument}" == "--json" ]]; then
      printf '%s\n' '{"status":"unavailable","generationCapability":"not_tested","inferencePerformed":false,"error":{"code":"python_unavailable","message":"Python configurado indisponível; prepare .venv-worker ou DEVSPHERE_PYTHON."}}'
      exit 2
    fi
  done
  echo "Python configurado indisponível. Prepare .venv-worker ou DEVSPHERE_PYTHON." >&2
  exit 2
fi
exec "${DOCTOR_PYTHON}" -m worker.doctor "$@"
