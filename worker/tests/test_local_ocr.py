"""Integração OCR real com PDF de imagem sintética; sem documentos pessoais."""

import shutil
import tempfile
from pathlib import Path
import unittest

from worker.core import extract_pdf


@unittest.skipUnless(
    shutil.which("tesseract") and shutil.which("pdftoppm"),
    "Instale Tesseract e Poppler para OCR real",
)
class LocalOcrTests(unittest.TestCase):
    def test_scanned_pdf_preserves_values_and_page_reference(self):
        """Imagem sem camada textual exige OCR e aviso para revisão humana."""
        from PIL import Image, ImageDraw, ImageFont

        fonts = [
            "/System/Library/Fonts/Supplemental/Arial.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ]
        fontpath = next((p for p in fonts if Path(p).is_file()), None)
        if not fontpath:
            self.skipTest("Fonte legível de teste não disponível")
        image = Image.new("RGB", (1600, 1100), "white")
        draw = ImageDraw.Draw(image)
        font = ImageFont.truetype(fontpath, 42)
        for y, line in enumerate(
            [
                "DOCUMENTO SINTETICO PARA TESTE",
                "Temperatura: 37.2 C",
                "Glicemia: 100 mg/dL",
                "Sem dados pessoais.",
            ]
        ):
            draw.text((80, 100 + y * 100), line, fill="black", font=font)
        with tempfile.TemporaryDirectory(prefix="pv-ocr-real-") as folder:
            pdf = Path(folder) / "synthetic-scanned.pdf"
            image.save(pdf, "PDF", resolution=150)
            result = extract_pdf(pdf)
        self.assertEqual(result["pages"][0]["method"], "ocr")
        self.assertIn("## Página 1", result["markdown"])
        self.assertIn("37.2", result["markdown"])
        self.assertIn("100", result["markdown"])
        self.assertIn("mg/dL", result["markdown"])
        self.assertTrue(any("OCR" in warning for warning in result["warnings"]))


if __name__ == "__main__":
    unittest.main()
