from pathlib import Path


def validate_documents(documents):
    """Validate bounded PDF uploads before storing any public demo data."""
    if len(documents) > 3:
        return 'Attach up to 3 PDF documents.'
    for document in documents:
        header = document.read(5)
        document.seek(0)
        if document.size > 2 * 1024 * 1024 or Path(document.name).suffix.lower() != '.pdf' or header != b'%PDF-':
            return 'Documents must be PDF files of 2 MB or less.'
    return ''
