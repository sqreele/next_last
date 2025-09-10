# Django REST Framework Browsable API Guide

## Overview
Django REST Framework (DRF) provides a built-in browsable API interface that allows you to interact with your API directly through a web browser. This is extremely useful for testing and development.

## Accessing the DRF Browsable API

### 1. Authentication via DRF Login
The project has DRF's authentication URLs configured at `/api-auth/`:

```
https://pcms.live/api-auth/login/
```

This provides a simple login form where you can enter your Django user credentials to authenticate for the browsable API.

### 2. Direct API Endpoints with Browsable Interface

Once authenticated, you can access any API endpoint directly in your browser:

#### ViewSet Endpoints (Full CRUD Operations):
- **Properties**: `https://pcms.live/api/v1/properties/`
- **Rooms**: `https://pcms.live/api/v1/rooms/`
- **Jobs**: `https://pcms.live/api/v1/jobs/`
- **Topics**: `https://pcms.live/api/v1/topics/`
- **Machines**: `https://pcms.live/api/v1/machines/`
- **Users**: `https://pcms.live/api/v1/users/`
- **User Profiles**: `https://pcms.live/api/v1/user-profiles/`
- **Preventive Maintenance**: `https://pcms.live/api/v1/preventive-maintenance/`
- **Maintenance Procedures**: `https://pcms.live/api/v1/maintenance-procedures/`

### 3. Browsable API Features

When you visit these endpoints in a browser while authenticated, DRF provides:

1. **HTML Interface**: A user-friendly HTML interface instead of raw JSON
2. **Forms**: Interactive forms for POST, PUT, and PATCH operations
3. **Response Formatting**: Pretty-printed JSON responses
4. **Options**: Shows available HTTP methods and required fields
5. **Filters**: Query parameter filtering (if configured)

## How to Use the Browsable API

### Step 1: Login
1. Navigate to `https://pcms.live/api-auth/login/`
2. Enter your Django username and password
3. You'll be redirected back to the API

### Step 2: Browse Endpoints
Visit any endpoint URL in your browser:
```
https://pcms.live/api/v1/properties/
```

### Step 3: Perform Operations

#### GET (List/Retrieve)
- Simply visit the URL to see all items
- Click on an item ID to view details: `https://pcms.live/api/v1/properties/123/`

#### POST (Create)
1. Scroll to the bottom of the list view
2. You'll see an HTML form with all available fields
3. Fill in the required fields
4. Click "POST"

#### PUT/PATCH (Update)
1. Navigate to a specific item: `https://pcms.live/api/v1/properties/123/`
2. Scroll to the bottom
3. You'll see forms for PUT and PATCH
4. Modify the fields
5. Click "PUT" or "PATCH"

#### DELETE
1. Navigate to a specific item
2. Click the "DELETE" button
3. Confirm the deletion

## Authentication Methods in DRF

### 1. Session Authentication (Browser)
- Login via `/api-auth/login/`
- Cookie-based session authentication
- Best for browsable API testing

### 2. JWT Token Authentication (Programmatic)
The API uses JWT tokens for programmatic access:

```python
import requests

# Get JWT token
response = requests.post('https://pcms.live/api/v1/token/', {
    'username': 'your_username',
    'password': 'your_password'
})
token = response.json()['access']

# Use token in requests
headers = {'Authorization': f'Bearer {token}'}
response = requests.get('https://pcms.live/api/v1/properties/', headers=headers)
```

### 3. Testing with ModHeader (Browser Extension)
1. Install ModHeader browser extension
2. Add Request Header:
   - Name: `Authorization`
   - Value: `Bearer YOUR_JWT_TOKEN`
3. Now browse the API with token authentication

## Enabling Full Browsable API Features

To ensure the browsable API renderer is enabled, add this to your Django settings:

```python
REST_FRAMEWORK = {
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
        'rest_framework.renderers.BrowsableAPIRenderer',  # This enables the HTML interface
    ],
    # ... other settings
}
```

## Using DRF with Different Tools

### 1. cURL
```bash
# Session auth (after getting sessionid cookie)
curl -H "Cookie: sessionid=your_session_id" https://pcms.live/api/v1/properties/

# JWT auth
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" https://pcms.live/api/v1/properties/
```

### 2. HTTPie
```bash
# JWT auth
http https://pcms.live/api/v1/properties/ "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 3. Postman
1. Set Authorization header: `Bearer YOUR_JWT_TOKEN`
2. Or use Cookie: `sessionid=your_session_id`

## API Documentation Features

### OPTIONS Request
DRF automatically provides OPTIONS endpoint that describes:
- Allowed HTTP methods
- Required/optional fields
- Field types and validation

```bash
curl -X OPTIONS https://pcms.live/api/v1/properties/
```

### Schema Generation
DRF can generate OpenAPI schemas:
```python
# In urls.py
from rest_framework.schemas import get_schema_view

urlpatterns = [
    path('openapi/', get_schema_view(
        title="PCMS API",
        description="API for Property and Maintenance Management",
        version="1.0.0"
    ), name='openapi-schema'),
]
```

## Filtering and Pagination

### Query Parameters
Most endpoints support filtering:
```
https://pcms.live/api/v1/rooms/?property=property_id
https://pcms.live/api/v1/jobs/?status=pending
```

### Pagination
Results are paginated. Use page parameter:
```
https://pcms.live/api/v1/properties/?page=2
```

## Common Issues and Solutions

### 1. No Browsable Interface (Only JSON)
- Ensure you're authenticated via `/api-auth/login/`
- Check that BrowsableAPIRenderer is enabled
- Try adding `?format=api` to the URL

### 2. 403 Forbidden
- You're not authenticated
- Your user doesn't have the required permissions

### 3. 401 Unauthorized
- Your session has expired
- JWT token is invalid or expired

### 4. CSRF Token Issues
For session auth POST requests:
1. GET the CSRF token: `https://pcms.live/api/v1/csrf-token/`
2. Include in POST requests as `X-CSRFToken` header

## Development Tips

1. **Use Django Admin**: Create test data at `https://pcms.live/admin/`
2. **Debug Mode**: In development, DRF shows more detailed error messages
3. **API Root**: Visit `https://pcms.live/api/v1/` to see all available endpoints
4. **Hyperlinked APIs**: DRF can show clickable links between related resources

## Summary

The Django REST Framework browsable API is accessible at:
- Login: `https://pcms.live/api-auth/login/`
- API Root: `https://pcms.live/api/v1/`
- Individual endpoints: Add endpoint path to the base URL

This provides an interactive, browser-based interface for testing and exploring your API without needing external tools.