#!/bin/sh
set -eu

if [ -z "${DEVSPHERE_SEED_PASSWORD:-}" ]; then
  echo "Defina DEVSPHERE_SEED_PASSWORD com pelo menos 12 caracteres." >&2
  exit 2
fi

binary="${DEVSPHERE_BINARY:-./build/devsphere-api}"
"$binary" --create-user "Professor de demonstração" "professor@devsphere.local" teacher
"$binary" --create-user "Aluno de demonstração" "aluno@devsphere.local" student
