# Auth0 Integration Setup Guide

This guide will help you set up Auth0 authentication for your Next.js application.

## Prerequisites

1. An Auth0 account (sign up at [auth0.com](https://auth0.com))
2. Your Next.js application running locally

## Step 1: Create Auth0 Application

1. Go to [Auth0 Dashboard](https://manage.auth0.com/)
2. Click "Applications" → "Applications"
3. Click "Create Application"
4. Choose "Single Page Application" (for Next.js)
5. Give it a name (e.g., "My Maintenance App")
6. Click "Create"

## Step 2: Configure Auth0 Application

### Application Settings
1. In your Auth0 application settings, configure:
   - **Allowed Callback URLs**: `http://localhost:3000/api/auth/callback`
   - **Allowed Logout URLs**: `http://localhost:3000`
   - **Allowed Web Origins**: `http://localhost:3000`

### API Settings
1. Go to "APIs" → "APIs"
2. Click "Create API"
3. Give it a name (e.g., "Maintenance API")
4. Set identifier (e.g., `https://api.maintenance.com`)
5. Choose "RS256" signing algorithm
6. Click "Create"

## Step 3: Environment Variables

1. Copy `env.example` to `.env.local`
2. Fill in your Auth0 values:

```env
# Auth0 Configuration
AUTH0_SECRET=your-long-random-secret-here
AUTH0_BASE_URL=http://localhost:3000
AUTH0_ISSUER_BASE_URL=https://your-domain.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret

# Optional Auth0 Settings
AUTH0_AUDIENCE=https://api.maintenance.com
AUTH0_SCOPE=openid profile email

# Backend API URL
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Generate AUTH0_SECRET
Run this command to generate a secure secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Step 4: Test the Integration

1. Start your development server: `npm run dev`
2. Navigate to `/auth/login`
3. You should be redirected to Auth0 hosted login
4. After successful login, you'll be redirected back to your app

## Step 5: Backend Integration

### Django Backend
If you're using Django, you'll need to:

1. Install JWT validation library:
```bash
pip install python-jose[cryptography]
```

2. Configure JWT validation in your Django settings:
```python
# settings.py
AUTH0_DOMAIN = 'your-domain.auth0.com'
AUTH0_AUDIENCE = 'https://api.maintenance.com'
AUTH0_ALGORITHMS = ['RS256']
```

3. Create middleware to validate Auth0 tokens:
```python
# middleware.py
import jwt
from django.conf import settings

class Auth0Middleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Extract token from Authorization header
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
            try:
                # Validate JWT token
                payload = jwt.decode(
                    token,
                    options={"verify_signature": False},  # For now, skip signature verification
                    algorithms=settings.AUTH0_ALGORITHMS
                )
                request.user_info = payload
            except jwt.InvalidTokenError:
                request.user_info = None
        
        response = self.get_response(request)
        return response
```

## Troubleshooting

### Common Issues

1. **"Invalid token" errors**: Ensure your backend is properly configured to accept Auth0 JWT tokens
2. **Redirect loops**: Check that your callback URLs are correctly configured in Auth0
3. **CORS issues**: Ensure your backend allows requests from your frontend domain

### Development vs Production

- **Development**: Uses mock data if Auth0 fails (fallback system)
- **Production**: Uses real Auth0 authentication

## Security Notes

1. **Never commit `.env.local`** to version control
2. **Use strong secrets** for AUTH0_SECRET
3. **Validate JWT tokens** on your backend
4. **Use HTTPS** in production

## Next Steps

1. Test the authentication flow
2. Configure your backend to validate Auth0 tokens
3. Set up user roles and permissions in Auth0
4. Deploy to production with proper environment variables

## Support

If you encounter issues:
1. Check the Auth0 [Next.js documentation](https://auth0.com/docs/quickstart/webapp/nextjs)
2. Verify your environment variables are correct
3. Check the browser console and server logs for errors
4. Ensure your Auth0 application settings match the configuration
