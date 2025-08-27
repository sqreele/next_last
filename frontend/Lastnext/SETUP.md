# Setup Guide - Fix Dashboard Loading Error

## 🚨 Current Issue
The dashboard is showing "Error Loading Dashboard" because of missing or incorrect environment variables.

## 🔧 Required Environment Variables

Create a `.env.local` file in the project root with the following variables:

```bash
# Authentication Configuration (REQUIRED)
AUTH0_SECRET=your-random-32-characters
AUTH0_BASE_URL=http://localhost:3000
AUTH0_ISSUER_BASE_URL=https://your-tenant.us.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
AUTH0_AUDIENCE=https://your-api-identifier  # optional if using API access

# API Configuration (REQUIRED)
NEXT_PUBLIC_API_URL=http://localhost:8000

# Database Configuration (REQUIRED)
DATABASE_URL="postgresql://username:password@localhost:5432/database_name"
```

## 🔑 Generate a Secure Secret

Run this command to generate a secure AUTH0_SECRET:

```bash
# Generate a 32-character random string
openssl rand -base64 32

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## 🚀 Quick Setup Steps

1. **Create environment file:**
```bash
cd next_project/Lastnext
touch .env.local
```

2. **Add the required variables** (copy the example above and replace with your values)

3. **Restart the development server:**
```bash
npm run dev
```

4. **Check the console** for debug information

## 🔍 Debug Information

The updated dashboard will now show detailed debug information in the console:

- ✅ Configuration status
- 🔍 Session information
- 📊 API response details
- ❌ Error details (if any)

## 🐛 Common Issues

### 1. Missing AUTH0_SECRET
**Error:** "AUTH0_SECRET is not set"
**Solution:** Add a secure secret (random 32+ characters)

### 2. Wrong API URL
**Error:** "Request failed with status 404"
**Solution:** Verify your API server is running and the URL is correct

### 3. Database Connection
**Error:** "Database connection failed"
**Solution:** Check your DATABASE_URL and ensure the database is running

### 4. Token Issues
**Error:** "Unauthorized" or "401"
**Solution:** Check if your API server is properly configured for authentication

## 📋 Verification Checklist

- [ ] `.env.local` file created
- [ ] `AUTH0_SECRET` is set (random 32+ characters)
- [ ] `NEXT_PUBLIC_API_URL` points to your API server
- [ ] `DATABASE_URL` is correct
- [ ] API server is running
- [ ] Database is accessible
- [ ] Development server restarted

## 🆘 Still Having Issues?

1. Check the browser console for detailed error messages
2. Verify your API server is running and accessible
3. Test the API endpoints directly (e.g., `curl http://localhost:8000/api/properties/`)
4. Check the network tab in browser dev tools for failed requests

## 📞 Support

If you're still experiencing issues, check:
1. API server logs
2. Database connection
3. Network connectivity
4. Environment variable syntax 