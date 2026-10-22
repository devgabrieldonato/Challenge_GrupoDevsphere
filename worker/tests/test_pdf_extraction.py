"""Regressões geométricas com fontes sintéticas; OCR simulado somente nestes testes."""

from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock

from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image

from worker.core import JobError, safe_text
from worker.pdf_extraction import extract_pdf


class PdfGeometryTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory(prefix="pv-geometry-")
        self.path = Path(self.folder.name) / "synthetic.pdf"
        self.ocr = Mock(return_value="Digitalizado 100 mg/dL e 37.2 C")

    def tearDown(self):
        self.folder.cleanup()

    def extract(self, pages=None):
        return extract_pdf(self.path, pages, error_class=JobError, ocr=self.ocr,
                           sanitize=safe_text)

    @staticmethod
    def grid(pdf):
        """Grade 2x2, separada do texto acima e abaixo na página."""
        for x in (40, 190, 340):
            pdf.line(x, 550, x, 650)
        for y in (550, 600, 650):
            pdf.line(40, y, 340, y)
        for x, y, text in ((50, 620, "Exame"), (200, 620, "Valor"),
                           (50, 570, "Glicemia"), (200, 570, "100 mg/dL")):
            pdf.drawString(x, y, text)

    def test_frame_is_not_repeated_as_table(self):
        pdf = canvas.Canvas(str(self.path))
        pdf.rect(30, 500, 400, 220)
        pdf.line(400, 500, 400, 720)
        pdf.drawString(40, 690, "Texto em moldura 100 mg/dL e 37.2 C")
        pdf.save()
        result = self.extract()
        self.assertEqual(result["markdown"].count("100 mg/dL"), 1)
        self.assertEqual(result["pages"][0]["tables"], [])
        self.assertTrue(any("moldura" in w for w in result["warnings"]))
        self.ocr.assert_not_called()

    def test_real_table_keeps_cells_once_and_avoids_ocr(self):
        pdf = canvas.Canvas(str(self.path))
        self.grid(pdf)
        pdf.save()
        result = self.extract()
        self.assertEqual(len(result["pages"][0]["tables"]), 1)
        self.assertEqual(result["markdown"].count("100 mg/dL"), 1)
        self.assertIn("| Glicemia | 100 mg/dL |", result["markdown"])
        self.assertNotIn("100 mg/dL", result["pages"][0]["text"])
        self.ocr.assert_not_called()

    def test_mixed_text_and_table_preserves_order_and_units(self):
        pdf = canvas.Canvas(str(self.path))
        pdf.drawString(40, 700, "ANTES temperatura 37.2 C")
        self.grid(pdf)
        pdf.drawString(40, 500, "DEPOIS dose 5 mg")
        pdf.save()
        result = self.extract()
        md = result["markdown"]
        self.assertLess(md.index("ANTES"), md.index("| Exame"))
        self.assertLess(md.index("| Glicemia"), md.index("DEPOIS"))
        for value in ("37.2 C", "100 mg/dL", "5 mg"):
            self.assertEqual(md.count(value), 1)

    def test_repetition_on_different_pages_is_preserved(self):
        pdf = canvas.Canvas(str(self.path))
        for _ in range(2):
            pdf.drawString(40, 700, "Valor repetido legitimamente 100 mg/dL")
            pdf.showPage()
        pdf.save()
        result = self.extract([2, 1, 2])
        self.assertEqual(result["markdown"].count("100 mg/dL"), 2)
        self.assertEqual([p["page"] for p in result["pages"]], [1, 2])
        self.assertIn("## Página 2", result["markdown"])

    def test_short_native_cover_keeps_text_without_ocr(self):
        pdf = canvas.Canvas(str(self.path))
        pdf.drawString(40, 700, "CASO CLINICO")
        pdf.drawImage(ImageReader(Image.new("RGB", (100, 100), "white")), 40, 500)
        pdf.save()
        result = self.extract()
        self.assertIn("CASO CLINICO", result["markdown"])
        self.assertEqual(result["pages"][0]["method"], "text")
        self.assertTrue(any("texto nativo curto" in w for w in result["warnings"]))
        self.ocr.assert_not_called()

    def test_scanned_page_calls_ocr_and_preserves_reference(self):
        pdf = canvas.Canvas(str(self.path))
        pdf.drawImage(ImageReader(Image.new("RGB", (100, 100), "white")), 40, 500)
        pdf.save()
        result = self.extract()
        self.ocr.assert_called_once_with(self.path, 1)
        self.assertEqual(result["pages"][0]["method"], "ocr")
        self.assertIn("## Página 1", result["markdown"])
        self.assertIn("100 mg/dL", result["markdown"])
        self.assertTrue(any("OCR" in w for w in result["warnings"]))

    def test_boolean_pages_are_rejected(self):
        pdf = canvas.Canvas(str(self.path))
        pdf.drawString(40, 700, "Sintetico")
        pdf.save()
        with self.assertRaises(JobError) as error:
            self.extract([True])
        self.assertEqual(error.exception.code, "invalid_pages")


if __name__ == "__main__":
    unittest.main()
