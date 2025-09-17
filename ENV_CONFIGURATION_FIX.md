# Environment Configuration Issues & Fixes

## Issues Found in .env.local

### 1. **Duplicate Configuration**
Your `.env.local` has duplicate entries which can cause confusion:
- `NEXT_PUBLIC_API_URL` appears twice
- `AUTH0_*` variables appear twice
- Some variables have empty values

### 2. **Missing Critical Values**
- `AUTH0_CLIENT_SECRET` is empty
- `AUTH0_SECRET` is empty  
- `JWT_SECRET` is empty (appears twice, both empty)
- `POSTGRES_PASSWORD` is empty in second section

### 3. **Environment Mode Conflict**
- `NODE_ENV=production` but you're in development
- This affects API URL resolution and debug features

## Recommended .env.local Configuration

```bash
# Environment
NODE_ENV=development

# Domain Configuration
DOMAIN=pcms.live
APP_BASE_URL=https://pcms.live

# API URLs
NEXT_PUBLIC_API_URL=https://pcms.live
NEXT_PRIVATE_API_URL=http://backend:8000
NEXT_PUBLIC_MEDIA_URL=https://pcms.live
API_URL=http://backend:8000

# Auth0 Configuration
AUTH0_BASE_URL=https://pcms.live
AUTH0_ISSUER_BASE_URL=https://pcms.ca.auth0.com
AUTH0_DOMAIN=pcms.ca.auth0.com
AUTH0_CLIENT_ID=H5QKkdL5wsGPvdY6FEFGVmuBQCKKzSV7
AUTH0_CLIENT_SECRET=your_client_secret_here
AUTH0_SECRET=your_auth0_secret_here
AUTH0_AUDIENCE=https://pcms.live

# Google OAuth (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# JWT Security
JWT_SECRET=uhZ6biZK5PkeLMeJqoVVCgfWGLRwLPkLHi9vwKPMBCU=

# Database
POSTGRES_DB=mylubd_db
POSTGRES_USER=mylubd_user
POSTGRES_PASSWORD=Sqreele1234
SQL_DATABASE=mylubd_db
SQL_USER=mylubd_user
SQL_PASSWORD=Sqreele1234
SQL_HOST=db
SQL_PORT=5432
DATABASE_URL=postgresql://mylubd_user:Sqreele1234@db:5432/mylubd_db?schema=public

# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=pcms.live@gmail.com
EMAIL_HOST_PASSWORD=your_app_password_here
DEFAULT_FROM_EMAIL=pcms.live@gmail.com
```

## My Jobs Specific Impact

The environment issues might affect My Jobs functionality in these ways:

### 1. **API URL Resolution**
With `NODE_ENV=production`, the API config uses:
- Client-side: `NEXT_PUBLIC_API_URL` (https://pcms.live) ✅
- Server-side: `NEXT_PRIVATE_API_URL` (http://backend:8000) ✅

### 2. **Authentication Flow**
Missing Auth0 secrets might cause authentication issues:
- User might not be properly authenticated
- Access token might be invalid or missing

### 3. **Debug Features**
With `NODE_ENV=production`, debug features are disabled:
- MyJobsDebug component won't show
- Console logging might be reduced
