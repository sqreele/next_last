#!/bin/bash

# ============================================================================
# Script to Run the JPEG Path Fix Command
# ============================================================================

echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║                    JPEG Path Fix Command Runner                         ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo ""

# Navigate to the correct directory
cd /workspace/backend/myLubd/src

echo "📍 Current directory: $(pwd)"
echo ""

# Check if manage.py exists
if [ ! -f "manage.py" ]; then
    echo "❌ Error: manage.py not found!"
    echo "   Expected location: /workspace/backend/myLubd/src/manage.py"
    exit 1
fi

echo "✅ Found manage.py"
echo ""

# Determine Python command
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "❌ Error: Python not found!"
    exit 1
fi

echo "✅ Using Python: $PYTHON_CMD"
echo ""

# Show menu
echo "Choose an option:"
echo "  1) Dry-run (preview changes, safe)"
echo "  2) Apply fixes (actually update database)"
echo "  3) Exit"
echo ""
read -p "Enter choice [1-3]: " choice

case $choice in
    1)
        echo ""
        echo "=========================================="
        echo "Running in DRY-RUN mode (preview only)..."
        echo "=========================================="
        echo ""
        $PYTHON_CMD manage.py fix_jpeg_paths --dry-run
        echo ""
        echo "✅ Dry-run complete. No changes were made to the database."
        echo "   To apply the fixes, run this script again and choose option 2."
        ;;
    2)
        echo ""
        read -p "⚠️  This will UPDATE the database. Continue? [y/N]: " confirm
        if [[ $confirm == [yY] || $confirm == [yY][eE][sS] ]]; then
            echo ""
            echo "=========================================="
            echo "Applying fixes to database..."
            echo "=========================================="
            echo ""
            $PYTHON_CMD manage.py fix_jpeg_paths
            echo ""
            echo "✅ Fixes applied successfully!"
        else
            echo "❌ Cancelled. No changes made."
        fi
        ;;
    3)
        echo "Exiting..."
        exit 0
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "Done!"
