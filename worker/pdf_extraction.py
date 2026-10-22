"""Extração por geometria: uma célula de moldura não é uma tabela clínica."""

from __future__ import annotations

import hashlib
from pathlib import Path


def _genuine_grid(rows):
    """Exige duas linhas/colunas preenchidas; quadros simples continuam como texto.

    Não se deduplicam frases por semelhança. Estruturas esparsas continuam no
    texto original, evitando eliminar valores por uma classificação incerta.
    """
    occupied = [(i, j) for i, row in enumerate(rows) for j, cell in enumerate(row)
                if cell and str(cell).strip()]
    return len({i for i, _ in occupied}) >= 2 and len({j for _, j in occupied}) >= 2


def _in_box(char, box):
    """Usa centro do caractere para não apagar texto vizinho ao contorno da tabela."""
    x = (char["x0"] + char["x1"]) / 2
    y = (char["top"] + char["bottom"]) / 2
    return box[0] <= x <= box[2] and box[1] <= y <= box[3]


def _table_markdown(rows, sanitize):
    """Mantém células, números e unidades; escapa HTML e delimitadores Markdown."""
    cells = [[sanitize(cell or "").replace("|", "\\|").replace("\n", " ")
              for cell in row] for row in rows]
    width = max(map(len, cells))
    cells = [row + [""] * (width - len(row)) for row in cells]
    lines = ["| " + " | ".join(row) + " |" for row in cells]
    lines.insert(1, "| " + " | ".join(["---"] * width) + " |")
    return "\n".join(lines)


def _page_content(page, number, sanitize, warnings):
    """Separa tabelas do texto pela posição, sem comparar ou remover frases.

    As faixas verticais mantêm a ordem básica de leitura entre parágrafos e
    tabelas. Layouts de colunas exigem revisão, assim como no extrator original.
    """
    accepted = []
    for table in page.find_tables():
        rows = table.extract() or []
        if _genuine_grid(rows):
            accepted.append((table.bbox, _table_markdown(rows, sanitize)))
        else:
            warnings.append(f"Página {number}: estrutura sem grade tabular suficiente; "
                            "conteúdo mantido somente como texto, sem duplicar moldura.")
    accepted.sort(key=lambda item: (item[0][1], item[0][0]))
    if not accepted:
        text = (page.extract_text() or "").strip()
        return text, [], [sanitize(text)] if text else []

    # Remove somente caracteres das regiões tabulares efetivamente representadas.
    outside = page.filter(lambda obj: obj.get("object_type") != "char" or
                          not any(_in_box(obj, box) for box, _ in accepted))
    text = (outside.extract_text() or "").strip()
    segments, previous_top = [], float("-inf")
    for box, markdown in accepted:
        upper = box[1]
        band = outside.filter(lambda obj, lo=previous_top, hi=upper:
                              obj.get("object_type") != "char" or
                              lo <= (obj["top"] + obj["bottom"]) / 2 < hi)
        content = (band.extract_text() or "").strip()
        if content:
            segments.append(sanitize(content))
        segments.append(markdown)
        previous_top = upper
    tail = outside.filter(lambda obj: obj.get("object_type") != "char" or
                          (obj["top"] + obj["bottom"]) / 2 >= previous_top)
    content = (tail.extract_text() or "").strip()
    if content:
        segments.append(sanitize(content))
    return text, [markdown for _, markdown in accepted], segments


def extract_pdf(path, pages=None, *, error_class, ocr, sanitize,
                max_bytes=10 * 1024 * 1024, max_text=120_000):
    """Preserva o contrato público; dependências explícitas evitam importação circular.

    OCR é usado quando não há texto nem grade textual utilizável. Texto curto
    nativo não é substituído por OCR, que pode introduzir ruído em capas. Páginas
    com texto curto e imagem recebem aviso: não se promete leitura da imagem.
    """
    try:
        import pdfplumber
    except ImportError:
        raise error_class("missing_dependency",
                          "Instale worker/requirements.txt para converter PDFs.", True)
    path = Path(path)
    if path.stat().st_size > max_bytes or path.read_bytes()[:5] != b"%PDF-":
        raise error_class("invalid_pdf", "Envie PDF válido de até 10 MiB.")
    results, warnings, rendered = [], [], []
    try:
        with pdfplumber.open(path) as pdf:
            if not pdf.pages or len(pdf.pages) > 100:
                raise error_class("page_limit", "O documento deve possuir de 1 a 100 páginas.")
            selected = (list(range(1, len(pdf.pages) + 1))
                        if pages is None or (isinstance(pages, list) and not pages) else pages)
            if (not isinstance(selected, list) or not selected or
                any(type(n) is not int or n < 1 or n > len(pdf.pages) for n in selected)):
                raise error_class("invalid_pages", "Seleção de páginas inválida.")
            for number in sorted(set(selected)):
                page = pdf.pages[number - 1]
                text, tables, segments = _page_content(page, number, sanitize, warnings)
                method = "text"
                if not text and not tables:
                    text = ocr(path, number)
                    method = "ocr"
                    segments = [sanitize(text)]
                    warnings.append(f"Página {number}: OCR; revise números, unidades e ordem de leitura.")
                elif len(text) < 20 and page.images:
                    warnings.append(f"Página {number}: texto nativo curto com imagem; não houve OCR "
                                    "automático. Confira se há conteúdo relevante na imagem.")
                results.append({"page": number, "method": method,
                                "text": sanitize(text), "tables": tables})
                rendered.append(f"## Página {number}\n\n" + "\n\n".join(segments))
    except error_class:
        raise
    except Exception:
        raise error_class("unreadable_pdf",
                          "Não foi possível ler o PDF; confira integridade e proteção por senha.")
    markdown = "\n\n".join(rendered)
    if len(markdown) > max_text:
        raise error_class("text_limit", "Texto excede o limite; selecione menos páginas.")
    warnings.append("Confira tabelas, unidades, imagens e fidelidade antes de gerar. "
                    "Não houve anonimização automática.")
    return {"markdown": markdown, "pages": results, "warnings": warnings,
            "sourceHash": hashlib.sha256(path.read_bytes()).hexdigest()}
