#!/usr/bin/env python3
"""Valida as regras estruturais de um caso clínico versionado."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


REQUIRED_ITEM_FIELDS = ("id", "type", "title", "answer", "quality", "why")


def validate_case(case: dict[str, Any]) -> list[str]:
    """Retorna todos os erros formais sem afirmar validade clínica."""
    errors: list[str] = []
    items = case.get("items")

    if case.get("schemaVersion") != "1.0":
        errors.append("schemaVersion deve ser '1.0'.")
    if not isinstance(items, list):
        return errors + ["items deve ser uma lista."]

    questions = [item for item in items if item.get("type") == "question"]
    exams = [item for item in items if item.get("type") == "exam"]
    unknown_types = [item.get("id", "<sem id>") for item in items if item.get("type") not in {"question", "exam"}]

    if len(items) != 40:
        errors.append(f"O caso deve conter 40 itens; recebeu {len(items)}.")
    if len(questions) != 18:
        errors.append(f"O caso deve conter 18 perguntas; recebeu {len(questions)}.")
    if len(exams) != 22:
        errors.append(f"O caso deve conter 22 exames; recebeu {len(exams)}.")
    if unknown_types:
        errors.append("Tipos de item inválidos: " + ", ".join(map(str, unknown_types)) + ".")

    ids: list[str] = []
    for position, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            errors.append(f"Item {position} deve ser um objeto.")
            continue
        missing = [field for field in REQUIRED_ITEM_FIELDS if not item.get(field)]
        if missing:
            errors.append(f"Item {position} não possui campos obrigatórios: {', '.join(missing)}.")
        item_id = item.get("id")
        if isinstance(item_id, str) and item_id:
            ids.append(item_id)

    duplicates = sorted({item_id for item_id in ids if ids.count(item_id) > 1})
    if duplicates:
        errors.append("IDs duplicados: " + ", ".join(duplicates) + ".")

    id_set = set(ids)
    parents: dict[str, str] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        item_id = item.get("id")
        parent = item.get("parent")
        if parent:
            if parent not in id_set:
                errors.append(f"O item '{item_id}' referencia parent inexistente '{parent}'.")
            elif item_id == parent:
                errors.append(f"O item '{item_id}' não pode depender de si mesmo.")
            elif isinstance(item_id, str):
                parents[item_id] = parent

    # Cada item possui no máximo um pai; seguir a cadeia basta para detectar ciclos.
    for start in parents:
        seen: set[str] = set()
        current = start
        while current in parents:
            if current in seen:
                errors.append(f"Ciclo de dependências detectado a partir de '{start}'.")
                break
            seen.add(current)
            current = parents[current]

    for evidence_id in case.get("priorityEvidenceIds", []):
        if evidence_id not in id_set:
            errors.append(f"Evidência prioritária inexistente: '{evidence_id}'.")

    hypotheses = case.get("hypotheses")
    if not isinstance(hypotheses, list) or len(hypotheses) < 2:
        errors.append("hypotheses deve conter ao menos duas alternativas.")
        hypothesis_ids: set[str] = set()
    else:
        hypothesis_ids = {hypothesis.get("id") for hypothesis in hypotheses if isinstance(hypothesis, dict)}
        if len(hypothesis_ids) != len(hypotheses):
            errors.append("As hipóteses devem possuir IDs únicos e válidos.")

    outcome = case.get("outcome")
    if not isinstance(outcome, dict) or not outcome.get("explanation"):
        errors.append("outcome deve conter hypothesisId e explanation.")
    elif outcome.get("hypothesisId") not in hypothesis_ids:
        errors.append("outcome.hypothesisId deve referenciar uma hipótese existente.")

    if not case.get("references"):
        errors.append("O caso deve registrar ao menos uma referência clínica.")
    if not case.get("learningObjectives"):
        errors.append("O caso deve registrar ao menos um objetivo de aprendizagem.")

    # Evita repetir a mesma mensagem quando um ciclo envolve vários nós.
    return list(dict.fromkeys(errors))


def main() -> int:
    parser = argparse.ArgumentParser(description="Valida um caso clínico JSON.")
    parser.add_argument("case_file", type=Path, help="Caminho do arquivo JSON")
    args = parser.parse_args()

    try:
        with args.case_file.open(encoding="utf-8") as source:
            clinical_case = json.load(source)
    except (OSError, json.JSONDecodeError) as error:
        print(f"Não foi possível ler o caso: {error}", file=sys.stderr)
        return 2

    if not isinstance(clinical_case, dict):
        print("A raiz do caso deve ser um objeto JSON.", file=sys.stderr)
        return 2

    errors = validate_case(clinical_case)
    if errors:
        for error in errors:
            print(f"ERRO: {error}")
        return 1

    print("Caso estruturalmente válido. A correção clínica ainda requer revisão humana.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
