import io
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from myappLubd.demo_documents import validate_documents


def upload(name='manual.pdf', content=b'%PDF-1.7\n%%EOF', size=None):
    file = io.BytesIO(content)
    file.name = name
    file.size = size if size is not None else len(content)
    return file


class DemoDocumentsTests(unittest.TestCase):
    def test_pdf_is_accepted_and_stream_rewound(self):
        file = upload()
        self.assertEqual(validate_documents([file]), '')
        self.assertEqual(file.tell(), 0)

    def test_non_pdf_content_or_extension_is_rejected(self):
        self.assertTrue(validate_documents([upload(content=b'<html>')]))
        self.assertTrue(validate_documents([upload(name='manual.html')]))

    def test_size_and_count_limits(self):
        self.assertTrue(validate_documents([upload(size=2 * 1024 * 1024 + 1)]))
        self.assertTrue(validate_documents([upload() for _ in range(4)]))
        self.assertEqual(validate_documents([upload() for _ in range(3)]), '')


if __name__ == '__main__':
    unittest.main()
