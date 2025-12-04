# Production Deployment Checklist

## ✅ Code Issues Fixed

### 1. Security Settings Added
- ✅ `SECURE_SSL_REDIRECT` - Set to `True` when `DEBUG=False`
- ✅ `SECURE_HSTS_SECONDS` - Set to 31536000 (1 year) when `DEBUG=False`
- ✅ `SESSION_COOKIE_SECURE` - Set to `True` when `DEBUG=False`
- ✅ `CSRF_COOKIE_SECURE` - Set to `True` when `DEBUG=False`
- ✅ `SECURE_CONTENT_TYPE_NOSNIFF` - Enabled in production
- ✅ `SECURE_BROWSER_XSS_FILTER` - Enabled in production
- ✅ `X_FRAME_OPTIONS` - Set to `DENY` in production

### 2. Django Admin Updates
- ✅ Added inventory usage display to Job admin
- ✅ Added inventory usage display to PreventiveMaintenance admin
- ✅ All imports verified (reverse, format_html, etc.)

### 3. Database Migrations
- ✅ No pending migrations detected
- ✅ Migration `0049_add_image_to_inventory.py` created and ready

## ⚠️ Environment Variables Required for Production

Set these environment variables before deploying:

```bash
# Required - Security
DEBUG=False
DJANGO_SECRET_KEY=<generate-a-strong-random-secret-key-min-50-chars>

# Required - Database
DB_NAME=mylubd_db
DB_USER=mylubd_user
DB_PASSWORD=<your-secure-password>
DB_HOST=db
DB_PORT=5432

# Required - Allowed Hosts (comma-separated)
DJANGO_ALLOWED_HOSTS=pcms.live,www.pcms.live

# Optional but Recommended - Security Headers
SECURE_HSTS_SECONDS=31536000
SECURE_SSL_REDIRECT=True

# Optional - Auth0 (if using)
AUTH0_DOMAIN=<your-auth0-domain>
AUTH0_AUDIENCE=<your-auth0-audience>
AUTH0_CLIENT_ID=<your-auth0-client-id>
AUTH0_CLIENT_SECRET=<your-auth0-client-secret>

# Optional - Email
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=<your-email>
EMAIL_HOST_PASSWORD=<your-email-password>

# Optional - Frontend URL
FRONTEND_BASE_URL=https://pcms.live
```

## 🔒 Security Checklist

- [ ] Set `DEBUG=False` in production
- [ ] Generate a strong `SECRET_KEY` (min 50 characters, random)
- [ ] Configure `ALLOWED_HOSTS` with your domain(s)
- [ ] Enable SSL/HTTPS (security settings auto-enabled when DEBUG=False)
- [ ] Set secure database credentials
- [ ] Configure CORS properly for your frontend domain
- [ ] Set up proper logging
- [ ] Configure static files serving (via nginx/CDN)
- [ ] Set up media files serving (via nginx/CDN)

## 📋 Pre-Deployment Steps

1. **Generate Secret Key:**
   ```python
   python3 -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
   ```

2. **Run Migrations:**
   ```bash
   python3 manage.py migrate
   ```

3. **Collect Static Files:**
   ```bash
   python3 manage.py collectstatic --noinput
   ```

4. **Check for Errors:**
   ```bash
   python3 manage.py check --deploy
   ```

5. **Test Database Connection:**
   ```bash
   python3 manage.py dbshell
   ```

## 🚀 Deployment Notes

- All security warnings from `check --deploy` are expected when `DEBUG=True`
- Security settings automatically apply when `DEBUG=False`
- Make sure to set `DEBUG=False` in production environment
- The application is ready for production deployment once environment variables are set

## 📝 Recent Changes

1. Added inventory image support (model, admin, serializer, frontend)
2. Added inventory usage tracking (job/PM linking)
3. Added inventory display in Job and PM admin pages
4. Fixed pagination in frontend inventory page
5. Added production security settings

