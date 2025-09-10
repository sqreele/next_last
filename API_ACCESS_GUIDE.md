# API Access Guide for PCMS.live

## Overview
This Django REST Framework project provides a comprehensive API for the Property and Maintenance Management System (PCMS). The API is accessible at `https://pcms.live/api/v1/`.

## Base URL
- Production: `https://pcms.live/api/v1/`
- Local Development: `http://localhost:8000/api/v1/`

## Authentication

### Auth0 JWT Authentication
The primary authentication method uses Auth0 JWT tokens. The system validates JWT tokens from Auth0 and creates/updates local user accounts.

#### Getting an Access Token
1. **Login Endpoint**: `POST /api/v1/auth/login/`
   ```json
   {
     "username": "your_username",
     "password": "your_password"
   }
   ```

2. **Google OAuth**: `POST /api/v1/auth/google/`

3. **Token Refresh**: `POST /api/v1/token/refresh/`
   ```json
   {
     "refresh": "your_refresh_token"
   }
   ```

#### Using the Token
Include the JWT token in the Authorization header:
```
Authorization: Bearer YOUR_JWT_TOKEN
```

### Alternative Authentication
- **Session Authentication**: Available for browser-based requests
- **Django REST Framework JWT**: Fallback authentication method

## Available API Endpoints

### Authentication Endpoints
- `POST /api/v1/auth/login/` - User login
- `POST /api/v1/auth/register/` - User registration
- `POST /api/v1/auth/google/` - Google OAuth authentication
- `GET /api/v1/auth/providers/` - List available auth providers
- `GET /api/v1/auth/check/` - Check authentication status
- `POST /api/v1/auth/password/forgot/` - Request password reset
- `POST /api/v1/auth/password/reset/` - Reset password
- `PUT /api/v1/auth/profile/update/` - Update user profile

### Core API Resources (ViewSets)
All support standard REST operations (GET, POST, PUT, PATCH, DELETE):

- `/api/v1/properties/` - Property management
- `/api/v1/rooms/` - Room management
- `/api/v1/topics/` - Topic management
- `/api/v1/jobs/` - Job/task management
- `/api/v1/machines/` - Machine/equipment management
- `/api/v1/users/` - User management
- `/api/v1/user-profiles/` - User profile management
- `/api/v1/preventive-maintenance/` - Preventive maintenance records
- `/api/v1/maintenance-procedures/` - Maintenance procedure templates

### Specialized Endpoints

#### Preventive Maintenance
- `GET /api/v1/preventive-maintenance/jobs/` - Get PM jobs
- `GET /api/v1/preventive-maintenance/rooms/` - Get PM rooms
- `GET /api/v1/preventive-maintenance/topics/` - Get PM topics
- `POST /api/v1/preventive-maintenance/{pm_id}/upload-images/` - Upload images for PM

#### Reports
- `POST /api/v1/maintenance/report/pdf/` - Generate maintenance PDF report

#### Property Features
- `GET /api/v1/properties/{property_id}/is-preventivemaintenance/` - Check if property has PM enabled

#### Utility Endpoints
- `GET /api/v1/health/` - Health check endpoint
- `GET /api/v1/csrf-token/` - Get CSRF token for forms

#### Debug Endpoints (Development)
- `GET /api/v1/debug/rooms/` - Debug room data
- `GET /api/v1/test/rooms/all/` - Test all rooms

## Request Examples

### 1. Login and Get Token
```bash
curl -X POST https://pcms.live/api/v1/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"username": "your_username", "password": "your_password"}'
```

### 2. List Properties
```bash
curl -X GET https://pcms.live/api/v1/properties/ \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 3. Create a New Job
```bash
curl -X POST https://pcms.live/api/v1/jobs/ \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Fix AC Unit",
    "description": "Air conditioning not working",
    "property": "property_id",
    "room": "room_id",
    "status": "pending"
  }'
```

### 4. Upload Preventive Maintenance Images
```bash
curl -X POST https://pcms.live/api/v1/preventive-maintenance/{pm_id}/upload-images/ \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "images=@/path/to/image1.jpg" \
  -F "images=@/path/to/image2.jpg"
```

## Response Format

Successful responses typically return JSON data:
```json
{
  "id": "unique_id",
  "field1": "value1",
  "field2": "value2",
  ...
}
```

Error responses follow this format:
```json
{
  "detail": "Error message",
  "code": "error_code"
}
```

## CORS Configuration
The API allows cross-origin requests from:
- `https://pcms.live`
- Configured frontend domains

Allowed methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Allowed headers: Accept, Authorization, Cache-Control, Content-Type, Origin, X-Requested-With

## Rate Limiting
The nginx configuration implements rate limiting:
- General API: 10 requests/second with burst of 20
- Admin endpoints: 10 requests/second with burst of 10

## Media Files
- Media files are served from `/media/`
- Direct access via nginx for performance
- Supports maintenance job images and other uploads

## Security Headers
The API responses include security headers:
- X-Frame-Options: SAMEORIGIN
- X-XSS-Protection: 1; mode=block
- X-Content-Type-Options: nosniff
- Strict-Transport-Security: max-age=31536000; includeSubDomains; preload

## Troubleshooting

### Common Issues
1. **401 Unauthorized**: Check if your JWT token is valid and not expired
2. **403 Forbidden**: Verify you have permissions for the requested resource
3. **404 Not Found**: Ensure the endpoint URL is correct
4. **500 Server Error**: Check server logs or contact support

### Testing the API
You can test the API using:
- curl (command line)
- Postman
- Python requests library
- JavaScript fetch API

### Health Check
Test if the API is running:
```bash
curl https://pcms.live/api/v1/health/
```

## Development Setup
For local development:
1. The backend runs on port 8000
2. Use `http://localhost:8000/api/v1/` as the base URL
3. Django Debug Toolbar available at `/__debug__/` when DEBUG=True

## Additional Notes
- All timestamps are in UTC
- File uploads limited to 10MB
- Session timeout: 1 day
- JWT tokens should be refreshed before expiration