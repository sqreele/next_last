# How to Access Django REST Framework's Browsable API

## Quick Access Guide

Django REST Framework (DRF) provides a web-based browsable API interface that allows you to interact with your API directly in a web browser. Here's how to access it:

### 1. Login First
Go to: **https://pcms.live/api-auth/login/**
- Enter your Django username and password
- This creates a session cookie for authentication

### 2. Browse the API
After logging in, visit any API endpoint in your browser:

- **API Root**: https://pcms.live/api/v1/
- **Properties**: https://pcms.live/api/v1/properties/
- **Rooms**: https://pcms.live/api/v1/rooms/
- **Jobs**: https://pcms.live/api/v1/jobs/
- **Topics**: https://pcms.live/api/v1/topics/
- **Users**: https://pcms.live/api/v1/users/
- **Preventive Maintenance**: https://pcms.live/api/v1/preventive-maintenance/

### What You'll See

When you visit these URLs in a browser while logged in, instead of raw JSON, you'll see:

1. **A formatted HTML interface** with:
   - Pretty-printed JSON data
   - Interactive forms for creating/updating data
   - DELETE buttons for removing items
   - Links to related resources

2. **Available Actions**:
   - **GET**: View data (automatic when you visit the URL)
   - **POST**: Create new items (form at bottom of list views)
   - **PUT/PATCH**: Update items (forms on detail views)
   - **DELETE**: Remove items (button on detail views)

### Example Workflow

1. **View all properties**:
   ```
   https://pcms.live/api/v1/properties/
   ```

2. **View a specific property** (replace `123` with actual ID):
   ```
   https://pcms.live/api/v1/properties/123/
   ```

3. **Create a new property**:
   - Go to https://pcms.live/api/v1/properties/
   - Scroll to bottom
   - Fill in the form
   - Click "POST"

4. **Update a property**:
   - Go to https://pcms.live/api/v1/properties/123/
   - Scroll to bottom
   - Modify the JSON in the form
   - Click "PUT" (full update) or "PATCH" (partial update)

### Important Notes

1. **Authentication Required**: 
   - You MUST login via `/api-auth/login/` first
   - Without authentication, you'll only see raw JSON or get 401/403 errors

2. **Permissions**:
   - You can only see/modify data you have permissions for
   - Admin users have full access

3. **Default Behavior**:
   - DRF includes the browsable API renderer by default
   - If you're not seeing the HTML interface, make sure you're logged in

4. **Alternative Access**:
   - You can still use the API programmatically with JWT tokens
   - The browsable interface is just for convenience during development/testing

### Troubleshooting

**Only seeing JSON?**
- Make sure you're logged in via `/api-auth/login/`
- Try adding `?format=api` to the URL
- Clear your browser cache

**Getting 403 Forbidden?**
- You're not logged in or don't have permission
- Try logging in again

**Getting 401 Unauthorized?**
- Your session expired
- Login again at `/api-auth/login/`

### For Developers

To ensure the browsable API is enabled, check that your Django settings don't explicitly exclude the BrowsableAPIRenderer. By default, it's included when DEBUG=True.

The browsable API is one of DRF's best features for development and testing - it turns your API into an interactive web application!