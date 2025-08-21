#!/bin/bash

echo "Installing dependencies for Maintenance PDF Report System..."

# Install Python dependencies
echo "Installing Python packages..."
pip install -r requirements.txt

# Check if key packages are installed
echo "Verifying installations..."

python -c "import reportlab; print('✓ ReportLab installed successfully')" || echo "✗ ReportLab installation failed"
python -c "import PIL; print('✓ Pillow installed successfully')" || echo "✗ Pillow installation failed"
python -c "import requests; print('✓ Requests installed successfully')" || echo "✗ Requests installation failed"

echo ""
echo "Dependencies installation completed!"
echo ""
echo "To test the PDF generation system:"
echo "1. Start Django: python manage.py runserver"
echo "2. Run test script: python test_pdf_generation.py"
echo "3. Access API: http://localhost:8000/api/v1/maintenance/report/pdf/"
