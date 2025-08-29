# Auth0 Troubleshooting Guide

## Common Errors and Solutions

### 1. "Service not found: https://pcms.live" Error

**Cause**: The Auth0 audience parameter doesn't match any API configured in your Auth0 tenant.

**Solution**:
1. Go to Auth0 Dashboard > APIs
2. Create a new API or verify existing one has identifier: `https://pcms.live/api`
3. Ensure your `.env` file has: `AUTH0_AUDIENCE=https://pcms.live/api`
4. Check for spaces in environment variables

### 2. "401 Unauthorized" when fetching user profiles

**Cause**: The access token is missing, expired, or invalid.

**Solution**:
1. Verify the session cookie is being set correctly
2. Check that the backend is receiving the Authorization header
3. Ensure the Auth0 domain and audience match between frontend and backend
4. Check backend logs: `docker logs django-backend`

### 3. Auth0 Callback Errors

**Cause**: Misconfigured callback URLs or missing environment variables.

**Solution**:
1. In Auth0 Dashboard > Applications > Your App > Settings
2. Add to Allowed Callback URLs:
   - `https://pcms.live/api/auth/callback`
   - `http://localhost:3000/api/auth/callback`
3. Verify all NEXT_PUBLIC_AUTH0_* variables are set

### 4. Token Exchange Failed

**Cause**: Client secret mismatch or incorrect Auth0 configuration.

**Solution**:
1. Verify `NEXT_PUBLIC_AUTH0_CLIENT_SECRET` matches Auth0 dashboard
2. Ensure the redirect_uri in token exchange matches exactly
3. Check for trailing slashes in URLs

## Debugging Steps

### 1. Check Environment Variables
```bash
docker-compose exec frontend env | grep AUTH0
docker-compose exec backend env | grep AUTH0
```

### 2. Verify Auth0 Configuration
```bash
# Check if Auth0 variables are loaded
docker-compose exec frontend node -e "console.log(process.env.NEXT_PUBLIC_AUTH0_DOMAIN)"
```

### 3. Test Auth0 Connection
```bash
# Test Auth0 endpoint
curl https://YOUR_AUTH0_DOMAIN/.well-known/openid-configuration
```

### 4. Check Container Logs
```bash
# Frontend logs
docker logs nextjs-frontend --tail 50

# Backend logs
docker logs django-backend --tail 50
```

### 5. Verify Session Cookie
In browser DevTools:
1. Go to Application > Cookies
2. Look for `auth0_session` cookie
3. Check its value and expiration

## Required Auth0 Settings

### Application Settings
- **Application Type**: Single Page Application
- **Token Endpoint Authentication Method**: Post
- **Allowed Callback URLs**: 
  - `https://pcms.live/api/auth/callback`
  - `http://localhost:3000/api/auth/callback`
- **Allowed Logout URLs**:
  - `https://pcms.live`
  - `http://localhost:3000`
- **Allowed Web Origins**:
  - `https://pcms.live`
  - `http://localhost:3000`

### API Settings
- **Identifier**: `https://pcms.live/api`
- **Signing Algorithm**: RS256
- **RBAC Settings**:
  - Enable RBAC: Yes
  - Add Permissions in the Access Token: Yes

## Environment Variable Checklist

Frontend (.env):
```
NEXT_PUBLIC_AUTH0_BASE_URL=https://pcms.live
NEXT_PUBLIC_AUTH0_DOMAIN=your-tenant.auth0.com
NEXT_PUBLIC_AUTH0_CLIENT_ID=your-client-id
NEXT_PUBLIC_AUTH0_CLIENT_SECRET=your-client-secret
NEXT_PUBLIC_AUTH0_SECRET=your-generated-secret
AUTH0_AUDIENCE=https://pcms.live/api
```

Backend (.env):
```
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_ISSUER=https://your-tenant.auth0.com/
AUTH0_AUDIENCE=https://pcms.live/api
```

## Quick Fix Commands

### Rebuild and restart services
```bash
docker-compose down
docker-compose build --no-cache frontend backend
docker-compose up -d
```

### Clear Auth0 session
```bash
# In browser console
document.cookie = "auth0_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
```

### Test Auth0 login flow
1. Navigate to: `https://pcms.live/api/auth/[...auth0]?action=login`
2. Complete Auth0 login
3. Check if redirected to profile page

## Still Having Issues?

1. Double-check all environment variables for typos or extra spaces
2. Verify Auth0 tenant is active and not in trial expiration
3. Check Auth0 logs in Dashboard > Monitoring > Logs
4. Ensure your domain is properly configured in Auth0
5. Try creating a new Auth0 application from scratch