"""Verificações estruturais do PDF oficial com dados sintéticos, sem inferência.

Tags e extração não comprovam leitura compreensível por VoiceOver/PDF/UA.
"""
import base64
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

from pypdf import PdfReader
from pypdf.generic import ContentStream

SPEC = importlib.util.spec_from_file_location(
    "official_report", Path(__file__).resolve().parents[1] / "render_official_report.py"
)
renderer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(renderer)


def synthetic_report(long=False):
    """Exercita acentos, unidade, ordem e marcação externa tratada como texto."""
    return {
        "studentName": "Estudante sintético de acessibilidade",
        "case": "Paciente fictício José", "caseVersion": 2,
        "score": {"initial": 50, "displayed": 65, "raw": 65},
        "path": [{"title": f"Escolha {i}: Avaliação clínica",
                  "answer": "Temperatura 37,2 °C; glicemia 100 mg/dL. " +
                            ("Texto clínico sintético para conferir fragmentação. " * 70 if long else ""),
                  "why": "Conservar números e associação aos achados.",
                  "scoreEvent": {"delta": 1, "displayedTotalAfter": 51}}
                 for i in range(1, 5 if long else 2)],
        "attempts": [{"hypothesis": "Hipótese sintética", "correct": False,
                      "reason": '<script>alert("dado literal")</script>',
                      "actions": ["pergunta-1", "exame-1"]}],
    }


class OfficialPdfAccessibilityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(prefix="pv-pdf-a11y-")
        cls.directory = Path(cls.tmp.name)
        cls.report = synthetic_report(long=True)
        cls.raw = json.dumps(cls.report, ensure_ascii=False)
        source = cls.directory / "synthetic.json"
        source.write_text(cls.raw, encoding="utf-8")
        cls.output = cls.directory / "official.pdf"
        renderer.render(str(source), str(cls.output))
        cls.reader = PdfReader(cls.output, strict=True)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_language_title_fonts_and_bookmarks(self):
        root = self.reader.trailer["/Root"]
        self.assertEqual(root["/Lang"], "pt-BR")
        self.assertIn("relatório oficial", self.reader.metadata.title)
        self.assertEqual(self.reader.metadata.author, "Paciente Virtual")
        self.assertTrue(root["/ViewerPreferences"]["/DisplayDocTitle"])
        self.assertTrue(self.reader.outline)
        embedded_fonts = []
        for page in self.reader.pages:
            for font in page["/Resources"]["/Font"].values():
                font = font.get_object()
                if "/FontDescriptor" in font:
                    embedded_fonts.append(font["/FontDescriptor"])
        self.assertTrue(embedded_fonts)
        self.assertTrue(all("/FontFile2" in font for font in embedded_fonts))

    def test_actual_structure_matches_each_page_mcid(self):
        root = self.reader.trailer["/Root"]
        self.assertTrue(root["/MarkInfo"]["/Marked"])
        structure = root["/StructTreeRoot"]
        self.assertEqual(structure["/Type"], "/StructTreeRoot")
        document = structure["/K"][0].get_object()
        self.assertEqual(document["/S"], "/Document")
        children = [child.get_object() for child in document["/K"]]
        roles = [child["/S"] for child in children]
        self.assertEqual(roles[0], "/H1")
        self.assertIn("/H2", roles)
        self.assertIn("/H3", roles)
        self.assertIn("/P", roles)
        parents = structure["/ParentTree"]["/Nums"]
        mapping = {int(parents[i]): parents[i + 1] for i in range(0, len(parents), 2)}
        self.assertGreater(len(self.reader.pages), 1)
        for page in self.reader.pages:
            page_index = int(page["/StructParents"])
            entries = mapping[page_index]
            content = ContentStream(page.get_contents(), self.reader)
            mcids = []
            artifacts = 0
            marking_depth = 0
            for operands, operator in content.operations:
                if operator in {b"BDC", b"BMC"}:
                    marking_depth += 1
                elif operator == b"EMC":
                    marking_depth -= 1
                    self.assertGreaterEqual(marking_depth, 0)
                elif operator in {b"Tj", b"TJ", b"\'", b'"'}:
                    self.assertGreater(marking_depth, 0, "Texto visível não marcado")
                if operator == b"BDC":
                    mcids.append(int(operands[1]["/MCID"]))
                if operator == b"BMC" and str(operands[0]) == "/Artifact":
                    artifacts += 1
            self.assertEqual(marking_depth, 0)
            self.assertEqual(mcids, list(range(len(entries))))
            self.assertEqual(artifacts, 1, "Paginação deve ser artefato, não conteúdo lógico")
            for mcid, reference in enumerate(entries):
                item = reference.get_object()
                self.assertEqual(item["/K"], mcid)
                self.assertEqual(item.raw_get("/Pg"), page.indirect_reference)

    def test_text_order_accents_units_and_html_are_preserved(self):
        text = "\n".join(page.extract_text() for page in self.reader.pages)
        self.assertIn("José", text)
        self.assertIn("37,2 °C", text)
        self.assertIn("100 mg/dL", text)
        self.assertIn('<script>alert("dado literal")</script>', text)
        self.assertLess(text.index("Escolha 1:"), text.index("Escolha 2:"))
        self.assertLess(text.index("Percurso de investigação"), text.index("Hipóteses registradas"))
        root = self.reader.trailer["/Root"]
        self.assertNotIn("/OpenAction", root)
        self.assertNotIn("/JavaScript", root.get("/Names", {}))
        self.assertTrue(all(not page.get("/Annots") for page in self.reader.pages))

    def test_import_marker_keeps_exact_official_payload(self):
        data = self.output.read_bytes()
        marker = b"%PV_REPORT_V1:"
        self.assertEqual(data.count(marker), 1)
        raw = base64.b64decode(data.split(marker)[1].splitlines()[0]).decode("utf-8")
        self.assertEqual(raw, self.raw)
        self.assertEqual(json.loads(raw), self.report)


if __name__ == "__main__":
    unittest.main()
