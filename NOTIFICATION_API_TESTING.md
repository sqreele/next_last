# Notification API Testing Guide

This guide provides multiple ways to test the notification API endpoints.

## Endpoints

1. **GET `/api/v1/notifications/overdue/`** - Get overdue maintenance tasks
2. **GET `/api/v1/notifications/upcoming/`** - Get upcoming maintenance alerts
3. **GET `/api/v1/notifications/all/`** - Get all notifications (overdue + upcoming)

## Authentication

All endpoints require authentication. You need to:
1. Get a JWT token from `/api/v1/token/`
2. Include the token in the `Authorization` header: `Bearer <token>`

## Testing Methods

### Method 1: Using Django Management Command

The easiest way to test locally:

```bash
cd backend/myLubd
python manage.py test_notifications
```

With custom parameters:
```bash
python manage.py test_notifications --username admin --password yourpassword --days 14
```

### Method 2: Using Shell Script

```bash
# Basic usage (defaults: localhost:8000, admin/sqreele1234, 7 days)
./test_notifications.sh

# Custom parameters
./test_notifications.sh http://localhost:8000 admin yourpassword 14
```

### Method 3: Using cURL

#### Step 1: Get Authentication Token
```bash
curl -X POST http://localhost:8000/api/v1/token/ \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "sqreele1234"}'
```

Response:
```json
{
  "access": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc..."
}
```

#### Step 2: Test Overdue Notifications
```bash
TOKEN="your_access_token_here"

curl -X GET http://localhost:8000/api/v1/notifications/overdue/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
```

#### Step 3: Test Upcoming Notifications
```bash
curl -X GET "http://localhost:8000/api/v1/notifications/upcoming/?days=7" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
```

#### Step 4: Test All Notifications
```bash
curl -X GET "http://localhost:8000/api/v1/notifications/all/?days=7" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
```

### Method 4: Using Python Requests

```python
import requests

BASE_URL = "http://localhost:8000"
USERNAME = "admin"
PASSWORD = "sqreele1234"

# Step 1: Get token
token_response = requests.post(
    f"{BASE_URL}/api/v1/token/",
    json={"username": USERNAME, "password": PASSWORD}
)
token_data = token_response.json()
access_token = token_data["access"]

headers = {
    "Authorization": f"Bearer {access_token}",
    "Content-Type": "application/json"
}

# Step 2: Test overdue notifications
overdue_response = requests.get(
    f"{BASE_URL}/api/v1/notifications/overdue/",
    headers=headers
)
print("Overdue:", overdue_response.json())

# Step 3: Test upcoming notifications
upcoming_response = requests.get(
    f"{BASE_URL}/api/v1/notifications/upcoming/?days=7",
    headers=headers
)
print("Upcoming:", upcoming_response.json())

# Step 4: Test all notifications
all_response = requests.get(
    f"{BASE_URL}/api/v1/notifications/all/?days=7",
    headers=headers
)
print("All:", all_response.json())
```

### Method 5: Using Postman/Insomnia

1. **Create a new request** for token:
   - Method: `POST`
   - URL: `http://localhost:8000/api/v1/token/`
   - Body (JSON):
     ```json
     {
       "username": "admin",
       "password": "sqreele1234"
     }
     ```

2. **Save the access token** from the response

3. **Create requests for notification endpoints**:
   - Method: `GET`
   - URL: `http://localhost:8000/api/v1/notifications/overdue/`
   - Headers:
     - `Authorization: Bearer <your_token>`
     - `Content-Type: application/json`

4. **Repeat for other endpoints**:
   - `/api/v1/notifications/upcoming/?days=7`
   - `/api/v1/notifications/all/?days=7`

### Method 6: Using Django REST Framework Browsable API

1. Navigate to: `http://localhost:8000/api/v1/notifications/overdue/`
2. Log in using the authentication form
3. Click "GET" to test the endpoint

## Expected Responses

### Overdue Notifications
```json
{
  "count": 5,
  "results": [
    {
      "pm_id": "PM-001",
      "pmtitle": "Monthly HVAC Inspection",
      "scheduled_date": "2025-01-10T10:00:00Z",
      "completed_date": null,
      ...
    }
  ]
}
```

### Upcoming Notifications
```json
{
  "count": 3,
  "days": 7,
  "results": [
    {
      "pm_id": "PM-002",
      "pmtitle": "Weekly Fire Safety Check",
      "scheduled_date": "2025-01-20T14:00:00Z",
      "completed_date": null,
      ...
    }
  ]
}
```

### All Notifications
```json
{
  "overdue_count": 5,
  "upcoming_count": 3,
  "total_count": 8,
  "days": 7,
  "results": [
    ...
  ]
}
```

## Query Parameters

### Upcoming and All Endpoints
- `days` (optional): Number of days to look ahead for upcoming tasks
  - Default: `7`
  - Example: `?days=14` for 2 weeks

## Error Responses

### 401 Unauthorized
```json
{
  "detail": "Authentication credentials were not provided."
}
```

### 500 Internal Server Error
```json
{
  "error": "Failed to fetch overdue notifications"
}
```

## Notes

- All endpoints require authentication
- Results are filtered based on user's property access
- Non-staff users only see notifications for properties they have access to
- Staff users see all notifications
- Tasks must be incomplete (`completed_date` is null) to appear in notifications

