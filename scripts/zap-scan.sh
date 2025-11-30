#!/bin/bash

# OWASP ZAP Security Scan Script
# Usage: ./scripts/zap-scan.sh [target-url] [report-name]

set -e

TARGET_URL=${1:-http://localhost:8000}
REPORT_NAME=${2:-zap-report}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORTS_DIR="reports"

# Create reports directory if it doesn't exist
mkdir -p "$REPORTS_DIR"

echo "🔍 Starting OWASP ZAP scan for: $TARGET_URL"
echo "📊 Report will be saved as: ${REPORT_NAME}_${TIMESTAMP}.html"

# Run ZAP baseline scan with host network mode
docker run -t --rm --network host \
  -v "$(pwd)/$REPORTS_DIR:/zap/wrk/:rw" \
  ghcr.io/zaproxy/zaproxy:stable zap-baseline.py \
  -t "$TARGET_URL" \
  -J "/zap/wrk/${REPORT_NAME}_${TIMESTAMP}.json" \
  -r "/zap/wrk/${REPORT_NAME}_${TIMESTAMP}.html" \
  -I

echo ""
echo "✅ Scan complete!"
echo "📄 HTML Report: $REPORTS_DIR/${REPORT_NAME}_${TIMESTAMP}.html"
echo "📄 JSON Report: $REPORTS_DIR/${REPORT_NAME}_${TIMESTAMP}.json"

