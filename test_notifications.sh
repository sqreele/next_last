#!/bin/bash

# Test script for notification API endpoints
# Usage: ./test_notifications.sh [BASE_URL] [USERNAME] [PASSWORD]

BASE_URL="${1:-http://localhost:8000}"
USERNAME="${2:-admin}"
PASSWORD="${3:-sqreele1234}"
DAYS="${4:-7}"

echo "🧪 Testing Notification API Endpoints"
echo "Base URL: $BASE_URL"
echo "Username: $USERNAME"
echo "Days: $DAYS"
echo "============================================================"

# Step 1: Get authentication token
echo ""
echo "1️⃣ Getting authentication token..."
TOKEN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/token/" \
  -H "Content-Type: application/json" \
  -d "{\"username\": \"$USERNAME\", \"password\": \"$PASSWORD\"}")

ACCESS_TOKEN=$(echo $TOKEN_RESPONSE | grep -o '"access":"[^"]*' | cut -d'"' -f4)

if [ -z "$ACCESS_TOKEN" ]; then
  echo "❌ Authentication failed!"
  echo "Response: $TOKEN_RESPONSE"
  exit 1
fi

echo "✅ Authentication successful"
echo "Token: ${ACCESS_TOKEN:0:50}..."

# Step 2: Test overdue notifications
echo ""
echo "2️⃣ Testing GET /api/v1/notifications/overdue/"
OVERDUE_RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
  -X GET "$BASE_URL/api/v1/notifications/overdue/" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json")

HTTP_STATUS=$(echo "$OVERDUE_RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$OVERDUE_RESPONSE" | sed '/HTTP_STATUS/d')

echo "Status Code: $HTTP_STATUS"
if [ "$HTTP_STATUS" = "200" ]; then
  COUNT=$(echo "$BODY" | grep -o '"count":[0-9]*' | cut -d: -f2)
  echo "✅ Success! Found $COUNT overdue tasks"
  echo "$BODY" | python3 -m json.tool | head -30
else
  echo "❌ Failed: $BODY"
fi

# Step 3: Test upcoming notifications
echo ""
echo "3️⃣ Testing GET /api/v1/notifications/upcoming/?days=$DAYS"
UPCOMING_RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
  -X GET "$BASE_URL/api/v1/notifications/upcoming/?days=$DAYS" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json")

HTTP_STATUS=$(echo "$UPCOMING_RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$UPCOMING_RESPONSE" | sed '/HTTP_STATUS/d')

echo "Status Code: $HTTP_STATUS"
if [ "$HTTP_STATUS" = "200" ]; then
  COUNT=$(echo "$BODY" | grep -o '"count":[0-9]*' | cut -d: -f2)
  echo "✅ Success! Found $COUNT upcoming tasks"
  echo "$BODY" | python3 -m json.tool | head -30
else
  echo "❌ Failed: $BODY"
fi

# Step 4: Test all notifications
echo ""
echo "4️⃣ Testing GET /api/v1/notifications/all/?days=$DAYS"
ALL_RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
  -X GET "$BASE_URL/api/v1/notifications/all/?days=$DAYS" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json")

HTTP_STATUS=$(echo "$ALL_RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$ALL_RESPONSE" | sed '/HTTP_STATUS/d')

echo "Status Code: $HTTP_STATUS"
if [ "$HTTP_STATUS" = "200" ]; then
  OVERDUE_COUNT=$(echo "$BODY" | grep -o '"overdue_count":[0-9]*' | cut -d: -f2)
  UPCOMING_COUNT=$(echo "$BODY" | grep -o '"upcoming_count":[0-9]*' | cut -d: -f2)
  TOTAL_COUNT=$(echo "$BODY" | grep -o '"total_count":[0-9]*' | cut -d: -f2)
  echo "✅ Success!"
  echo "  Overdue: $OVERDUE_COUNT"
  echo "  Upcoming: $UPCOMING_COUNT"
  echo "  Total: $TOTAL_COUNT"
  echo "$BODY" | python3 -m json.tool | head -40
else
  echo "❌ Failed: $BODY"
fi

echo ""
echo "============================================================"
echo "✅ Testing completed!"

