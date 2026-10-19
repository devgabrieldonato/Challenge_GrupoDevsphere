#!/usr/bin/env python3
"""Gera o PDF oficial exclusivamente a partir do histórico validado no backend."""

import base64
import json
import sys
from html import escape
from pathlib import Path


def render(input_path: str, output_path: str) -> None:
    """Formata identidade, escolhas, hipóteses e pontuação sem aceitar HTML externo."""
    import reportlab
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

    raw = Path(input_path).read_text(encoding="utf-8")
    report = json.loads(raw)
    # As fontes livres distribuídas pelo ReportLab mantêm os acentos do PT-BR
    # e são incorporadas ao documento para a leitura em outras máquinas.
    fonts = Path(reportlab.__file__).parent / "fonts"
    pdfmetrics.registerFont(TTFont("Devsphere", str(fonts / "Vera.ttf")))
    pdfmetrics.registerFont(TTFont("DevsphereBold", str(fonts / "VeraBd.ttf")))
    pdfmetrics.registerFontFamily("Devsphere", normal="Devsphere", bold="DevsphereBold")
    styles = getSampleStyleSheet()
    for style in styles.byName.values():
        style.fontName = (
            "DevsphereBold"
            if style.name in {"Title", "Heading1", "Heading2"}
            else "Devsphere"
        )
    story = []

    def paragraph(value, style="BodyText"):
        # Textos clínicos/autorais são dados, inclusive se contiverem marcação HTML.
        story.append(
            Paragraph(escape(str(value)).replace("\n", "<br/>"), styles[style])
        )
        story.append(Spacer(1, 0.2 * cm))

    paragraph("Paciente Virtual — relatório oficial", "Title")
    paragraph(f"Aluno: {report.get('studentName', '')}")
    paragraph(f"Caso: {report.get('case', report.get('caseId', ''))}")
    paragraph(f"Versão: {report.get('caseVersion', '')}")
    paragraph(
        "Identidade e histórico validados pelo backend. A justificativa requer avaliação docente."
    )
    score = report.get("score", {})
    paragraph(
        f"Pontuação inicial: {score.get('initial', 50)} · Final: {score.get('displayed', 0)} · Total bruto: {score.get('raw', 0)}"
    )
    paragraph("Percurso de investigação", "Heading1")
    for index, item in enumerate(report.get("path", []), 1):
        paragraph(f"{index}. {item.get('title', '')}", "Heading2")
        paragraph(item.get("answer", ""))
        paragraph(f"Orientação: {item.get('why', '')}")
        event = item.get("scoreEvent", {})
        paragraph(
            f"Variação: {event.get('delta', 0)} · Pontuação após a escolha: {event.get('displayedTotalAfter', '')}"
        )
    paragraph("Hipóteses registradas", "Heading1")
    for index, attempt in enumerate(report.get("attempts", []), 1):
        paragraph(f"Tentativa {index}: {attempt.get('hypothesis', '')}", "Heading2")
        paragraph(attempt.get("reason", ""))
        paragraph(
            "Hipótese compatível com o desfecho."
            if attempt.get("correct")
            else "Hipótese diferente do desfecho."
        )
        paragraph("Evidências disponíveis: " + ", ".join(attempt.get("actions", [])))

    def footer(canvas, doc):
        canvas.setFillColor(colors.grey)
        canvas.setFont("Devsphere", 8)
        canvas.drawRightString(19 * cm, 1 * cm, f"Página {doc.page}")

    SimpleDocTemplate(
        output_path,
        pagesize=(21 * cm, 29.7 * cm),
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    ).build(story, onFirstPage=footer, onLaterPages=footer)
    # O marcador é compatível com a importação anterior e representa os dados
    # oficiais efetivamente utilizados na renderização.
    marker = base64.b64encode(raw.encode("utf-8"))
    with open(output_path, "ab") as output:
        output.write(b"\n%PV_REPORT_V1:" + marker + b"\n")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Uso: render_official_report.py entrada.json saida.pdf")
    render(sys.argv[1], sys.argv[2])
