#!/usr/bin/env bash

# Inicia a API usada pelo frontend servido pelo Live Server. O script pode ser
# executado várias vezes: se a porta 8080 já responder, ele encerra sem criar
# outro processo.
set -euo pipefail

SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIRECTORY}/.." && pwd)"
BUILD_DIRECTORY="${PROJECT_ROOT}/build/backend"
API_BINARY="${BUILD_DIRECTORY}/devsphere-api"
HEALTH_URL="http://127.0.0.1:8080/api/v1/health"

# Evita recompilar e iniciar uma segunda API quando a instância local já está
# saudável. O timeout curto também impede que a abertura do VS Code fique presa.
if curl --silent --show-error --fail --max-time 1 "${HEALTH_URL}" >/dev/null 2>&1; then
  echo "Devsphere API já está disponível em http://127.0.0.1:8080"
  exit 0
fi

echo "Preparando a API local da Devsphere..."

# Configura o CMake apenas no primeiro uso. Builds posteriores reutilizam a
# pasta existente e recompilam somente fontes que realmente mudaram.
if [[ ! -f "${BUILD_DIRECTORY}/CMakeCache.txt" ]]; then
  cmake -S "${PROJECT_ROOT}/backend" -B "${BUILD_DIRECTORY}" -DBUILD_TESTING=ON
fi
cmake --build "${BUILD_DIRECTORY}"

# Caminhos absolutos tornam a inicialização independente do diretório atual do
# terminal e garantem que a mesma base SQLite seja usada em todas as execuções.
export DEVSPHERE_DB_PATH="${PROJECT_ROOT}/backend/data/devsphere.db"
export DEVSPHERE_MIGRATIONS_DIR="${PROJECT_ROOT}/backend/migrations"
export DEVSPHERE_FRONTEND_DIR="${PROJECT_ROOT}/frontend"
export DEVSPHERE_HOST="127.0.0.1"
export DEVSPHERE_PORT="8080"

exec "${API_BINARY}"
