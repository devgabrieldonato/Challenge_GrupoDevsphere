#!/usr/bin/env python3
"""Gera o PDF oficial exclusivamente a partir do histórico validado no backend."""

import base64
import json
from io import BytesIO
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
    from reportlab.platypus import SimpleDocTemplate, Paragraph
    from pypdf import PdfReader, PdfWriter
    from pypdf.generic import (
        ArrayObject, BooleanObject, DictionaryObject, NameObject,
        NumberObject, TextStringObject,
    )

    # Cada fragmento desenhado recebe MCID local à página. A mesma ordem de
    # desenho alimenta a árvore lógica; fragmentos partidos continuam marcados.
    tagged_fragments = []
    next_mcid = {}

    class SemanticParagraph(Paragraph):
        def draw(self):
            """Marca texto real sem tratar um título visual como prova de acessibilidade."""
            page = self.canv.getPageNumber() - 1
            mcid = next_mcid.get(page, 0)
            next_mcid[page] = mcid + 1
            role = {"Title": "H1", "Heading1": "H2", "Heading2": "H3"}.get(
                self.style.name, "P"
            )
            self.canv._code.append(f"/{role} <</MCID {mcid}>> BDC")
            try:
                super().draw()
            finally:
                self.canv._code.append("EMC")
            tagged_fragments.append((page, mcid, role))

    class NavigableDocument(SimpleDocTemplate):
        def afterFlowable(self, flowable):
            """Cria navegação de títulos, sem duplicar dados na página."""
            if isinstance(flowable, SemanticParagraph):
                level = {"Title": 0, "Heading1": 1, "Heading2": 2}.get(
                    flowable.style.name
                )
                if level is not None:
                    key = f"section-{len(tagged_fragments)}"
                    self.canv.bookmarkPage(key)
                    self.canv.addOutlineEntry(flowable.getPlainText(), key, level)

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
        # Espaçamento do próprio parágrafo mantém títulos ligados ao texto,
        # inclusive quando o próximo conteúdo precisa passar à página seguinte.
        style.spaceAfter = 0.2 * cm
        style.fontName = (
            "DevsphereBold"
            if style.name in {"Title", "Heading1", "Heading2"}
            else "Devsphere"
        )
    story = []

    def paragraph(value, style="BodyText"):
        # Textos clínicos/autorais são dados, inclusive se contiverem marcação HTML.
        story.append(
            SemanticParagraph(escape(str(value)).replace("\n", "<br/>"), styles[style])
        )

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
        # Paginação é artefato visual: leitores devem seguir o texto do relatório.
        canvas._code.append("/Artifact BMC")
        canvas.setFillColor(colors.grey)
        canvas.setFont("Devsphere", 8)
        canvas.drawRightString(19 * cm, 1 * cm, f"Página {doc.page}")
        canvas._code.append("EMC")

    rendered = BytesIO()
    NavigableDocument(
        rendered,
        title="Paciente Virtual — relatório oficial",
        author="Paciente Virtual",
        subject="Percurso educacional e hipóteses registrados no atendimento",
        lang="pt-BR",
        pagesize=(21 * cm, 29.7 * cm),
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    ).build(story, onFirstPage=footer, onLaterPages=footer)
    # O pós-processamento adiciona a árvore sem alterar conteúdo clínico ou a
    # ordem. Marked só é declarado depois de criar StructTreeRoot e ParentTree.
    # Isto facilita navegação assistiva, mas não declara certificação PDF/UA.
    rendered.seek(0)
    writer = PdfWriter(clone_from=PdfReader(rendered))
    writer.pdf_header = "%PDF-1.7"
    root = writer.root_object
    root[NameObject("/Lang")] = TextStringObject("pt-BR")
    root[NameObject("/ViewerPreferences")] = DictionaryObject({
        NameObject("/DisplayDocTitle"): BooleanObject(True),
    })
    structure = DictionaryObject({NameObject("/Type"): NameObject("/StructTreeRoot")})
    structure_ref = writer._add_object(structure)
    document = DictionaryObject({
        NameObject("/Type"): NameObject("/StructElem"),
        NameObject("/S"): NameObject("/Document"),
        NameObject("/P"): structure_ref,
    })
    document_ref = writer._add_object(document)
    children = ArrayObject()
    parent_arrays = {}
    for page, mcid, role in tagged_fragments:
        page_ref = writer.pages[page].indirect_reference
        element = DictionaryObject({
            NameObject("/Type"): NameObject("/StructElem"),
            NameObject("/S"): NameObject("/" + role),
            NameObject("/P"): document_ref,
            NameObject("/Pg"): page_ref,
            NameObject("/K"): NumberObject(mcid),
        })
        element_ref = writer._add_object(element)
        children.append(element_ref)
        parent_arrays.setdefault(page, ArrayObject()).append(element_ref)
    document[NameObject("/K")] = children
    nums = ArrayObject()
    for page, entries in sorted(parent_arrays.items()):
        writer.pages[page][NameObject("/StructParents")] = NumberObject(page)
        writer.pages[page][NameObject("/Tabs")] = NameObject("/S")
        nums.extend([NumberObject(page), entries])
    structure[NameObject("/K")] = ArrayObject([document_ref])
    structure[NameObject("/ParentTree")] = writer._add_object(
        DictionaryObject({NameObject("/Nums"): nums})
    )
    structure[NameObject("/ParentTreeNextKey")] = NumberObject(len(writer.pages))
    root[NameObject("/StructTreeRoot")] = structure_ref
    root[NameObject("/MarkInfo")] = DictionaryObject({
        NameObject("/Marked"): BooleanObject(True),
    })
    with open(output_path, "wb") as output:
        writer.write(output)
    # O marcador é compatível com a importação anterior e representa os dados
    # oficiais efetivamente utilizados na renderização.
    marker = base64.b64encode(raw.encode("utf-8"))
    with open(output_path, "ab") as output:
        output.write(b"\n%PV_REPORT_V1:" + marker + b"\n")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Uso: render_official_report.py entrada.json saida.pdf")
    render(sys.argv[1], sys.argv[2])
