#!/bin/bash
# Simple fix: Remove all migrations 0040+ and re-apply them
# This is the nuclear option but should work

set -e

echo "=========================================="
echo "Simple Migration Fix (Nuclear Option)"
echo "=========================================="
echo ""
echo "This will remove ALL migrations 0040+ and re-apply them."
echo "Press Ctrl+C to cancel, or Enter to continue..."
read

# Connect to database and remove migrations
echo ""
echo "Removing migrations 0040+ from database..."
PGPASSWORD="${SQL_PASSWORD:-mylubd_password}" psql -h db -U mylubd_user -d mylubd_db <<EOF
DELETE FROM django_migrations 
WHERE app = 'myappLubd' 
AND name >= '0040_rename_myapplubd_mp_category_idx_myapplubd_m_categor_14f487_idx_and_more';

SELECT 'Removed all migrations 0040+' as result;
EOF

# Clear cache
echo ""
echo "Clearing Python cache..."
find . -name "*.pyc" -delete 2>/dev/null || true
find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true

# Now try to run migrations normally
echo ""
echo "Running migrations..."
python manage.py migrate || {
    echo ""
    echo "If migrations fail, you may need to fake apply them manually:"
    echo "  python manage.py migrate myappLubd 0040 --fake"
    echo "  python manage.py migrate myappLubd 0041 --fake"
    echo "  # ... continue for all migrations"
}

echo ""
echo "=========================================="
echo "Done!"
echo "=========================================="

