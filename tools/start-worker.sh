#!/usr/bin/env bash
# Serviço auxiliar separado: a API permanece disponível enquanto o worker processa.
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${TASK_ROOT}"
export DEVSPHERE_DB_PATH="${DEVSPHERE_DB_PATH:-${TASK_ROOT}/backend/data/devsphere.db}"
export DEVSPHERE_SOURCE_DIR="${DEVSPHERE_SOURCE_DIR:-$(dirname "${DEVSPHERE_DB_PATH}")/sources}"
# Prefere o ambiente privado já preparado; configuração explícita tem prioridade.
DEFAULT_WORKER_PYTHON="${TASK_ROOT}/.venv-worker/bin/python"
if [[ ! -x "${DEFAULT_WORKER_PYTHON}" ]]; then DEFAULT_WORKER_PYTHON=python3; fi
exec "${DEVSPHERE_PYTHON:-${DEFAULT_WORKER_PYTHON}}" -m worker.run --db "${DEVSPHERE_DB_PATH}" --storage "${DEVSPHERE_SOURCE_DIR}" "$@"
