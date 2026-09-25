"""Verifica a inicialização e a apresentação do resultado na interface."""
from pathlib import Path
import unittest
from io import BytesIO
from unittest.mock import patch
from test_converter import pdf_bytes
from streamlit.testing.v1 import AppTest
from converter import ConversionResult

APP = str(Path(__file__).resolve().parents[1] / 'app.py')


class AppTests(unittest.TestCase):
    def test_initial_state(self):
        app = AppTest.from_file(APP).run()
        self.assertEqual(len(app.exception), 0)
        self.assertTrue(app.button[0].disabled)
        self.assertEqual(len(app.code), 0)

    def test_conversion_button(self):
        upload = BytesIO(pdf_bytes())
        upload.name = 'exemplo.pdf'
        with patch('streamlit.file_uploader', return_value=upload):
            app = AppTest.from_file(APP).run()
            app.button[0].click().run()
            self.assertEqual(len(app.exception), 0)
            self.assertIn('10 mg', app.code[0].value)
            self.assertEqual(app.session_state['result'].filename, 'exemplo.md')

    def test_invalid_upload_message(self):
        upload = BytesIO(b'invalido')
        upload.name = 'exemplo.pdf'
        with patch('streamlit.file_uploader', return_value=upload):
            app = AppTest.from_file(APP).run()
            app.button[0].click().run()
            self.assertEqual(len(app.exception), 0)
            self.assertEqual(len(app.error), 1)
            self.assertEqual(len(app.code), 0)

    def test_result_and_clear(self):
        app = AppTest.from_file(APP)
        app.session_state['result'] = ConversionResult('# Caso fictício\n', 'caso.md', ('Revisar',))
        app.run()
        self.assertEqual(len(app.exception), 0)
        self.assertEqual(app.code[0].value, '# Caso fictício')
        self.assertEqual(app.warning[0].value, 'Revisar')
        app.button[1].click().run()
        self.assertEqual(len(app.code), 0)


if __name__ == '__main__':
    unittest.main()
