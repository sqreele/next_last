#!/bin/bash

# Simple notification API test script
# Usage: ./test_notifications_simple.sh

BASE_URL="${1:-http://localhost:8000}"
USERNAME="${2:-admin}"
PASSWORD="${3:-sqreele1234}"

echo "🧪 Testing Notification API"
echo "============================"

# Get token
echo -e "\n[1/4] Getting authentication token..."
TOKEN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/token/" \
  -H "Content-Type: application/json" \
  -d "{\"username\": \"$USERNAME\", \"password\": \"$PASSWORD\"}")

ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"access":"[^"]*' | cut -d'"' -f4)

if [ -z "$ACCESS_TOKEN" ]; then
  echo "❌ Failed to get token"
  echo "Response: $TOKEN_RESPONSE"
  exit 1
fi

echo "✅ Token obtained"

# Test overdue
echo -e "\n[2/4] Testing overdue notifications..."
curl -s -X GET "$BASE_URL/api/v1/notifications/overdue/" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" | python3 -m json.tool | head -20

# Test upcoming
echo -e "\n[3/4] Testing upcoming notifications..."
curl -s -X GET "$BASE_URL/api/v1/notifications/upcoming/?days=7" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" | python3 -m json.tool | head -20

# Test all
echo -e "\n[4/4] Testing all notifications..."
curl -s -X GET "$BASE_URL/api/v1/notifications/all/?days=7" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" | python3 -m json.tool | head -30

echo -e "\n✅ Testing complete!"

