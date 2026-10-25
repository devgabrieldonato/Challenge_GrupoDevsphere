"""PDFs sintéticos verificam seleção e rejeição de conteúdo inválido, sem executar ações."""

from pathlib import Path
import tempfile
import unittest
from reportlab.pdfgen import canvas
from pypdf import PdfReader, PdfWriter
from worker.core import JobError, extract_pdf


class PdfValidationTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory(prefix="pv-pdf-validation-")
        self.path = Path(self.folder.name) / "source.pdf"
        pdf = canvas.Canvas(str(self.path))
        for n in range(1, 3):
            pdf.drawString(
                40,
                700,
                f"PAGINA FISICA {n} - Dados sinteticos 100 mg/dL para teste de extracao.",
            )
            pdf.showPage()
        pdf.save()

    def tearDown(self):
        self.folder.cleanup()

    def test_empty_optional_selection_converts_all_pages(self):
        result = extract_pdf(self.path, [])
        self.assertEqual([p["page"] for p in result["pages"]], [1, 2])
        self.assertIn("100 mg/dL", result["markdown"])
        self.assertEqual(result["markdown"], extract_pdf(self.path)["markdown"])

    def test_selection_preserves_physical_numbers_and_rejects_bad_values(self):
        result = extract_pdf(self.path, [2, 2])
        self.assertEqual([p["page"] for p in result["pages"]], [2])
        self.assertNotIn("## Página 1", result["markdown"])
        for pages in ([True], [0], [3], "1"):
            with self.subTest(pages=pages):
                with self.assertRaises(JobError) as error:
                    extract_pdf(self.path, pages)
                self.assertEqual(error.exception.code, "invalid_pages")

    def test_fake_header_and_password_protected_pdf_fail_safely(self):
        invalid = Path(self.folder.name) / "invalid.pdf"
        invalid.write_bytes(b"%PDF-1.7\nno valid document")
        with self.assertRaises(JobError) as error:
            extract_pdf(invalid)
        self.assertEqual(error.exception.code, "unreadable_pdf")
        encrypted = Path(self.folder.name) / "encrypted.pdf"
        writer = PdfWriter()
        for page in PdfReader(self.path).pages:
            writer.add_page(page)
        writer.encrypt("synthetic-test-only")
        with encrypted.open("wb") as stream:
            writer.write(stream)
        with self.assertRaises(JobError) as error:
            extract_pdf(encrypted)
        self.assertEqual(error.exception.code, "unreadable_pdf")
        self.assertNotIn("synthetic-test-only", error.exception.message)

    def test_page_limit_and_non_pdf_are_rejected(self):
        invalid = Path(self.folder.name) / "not-pdf.pdf"
        invalid.write_text("<html>not a PDF</html>")
        with self.assertRaises(JobError) as error:
            extract_pdf(invalid)
        self.assertEqual(error.exception.code, "invalid_pdf")
        many = Path(self.folder.name) / "many.pdf"
        writer = PdfWriter()
        for _ in range(101):
            writer.add_blank_page(width=100, height=100)
        with many.open("wb") as stream:
            writer.write(stream)
        with self.assertRaises(JobError) as error:
            extract_pdf(many, [1])
        self.assertEqual(error.exception.code, "page_limit")
