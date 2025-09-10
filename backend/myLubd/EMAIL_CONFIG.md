## Email configuration (Gmail SMTP or Gmail API)

Use one of the following methods.

- Gmail API (recommended): avoids SMTP quirks and app-passwords
- Gmail SMTP with App Password (simpler to set up)

### 1) Gmail API (OAuth2) — recommended

Prereqs:
- Your mailbox is a Google or Google Workspace Gmail account (e.g., no-reply@yourdomain.com)

#### Quick Setup:

**Option A: Using the setup script (Recommended)**
```bash
cd /workspace/backend/myLubd
python setup_gmail_api.py
```

**Option B: Using Django management command**
```bash
cd /workspace/backend/myLubd/src
python manage.py setup_gmail_api --test-email your@email.com
```

Both options will:
1. Guide you through the OAuth flow
2. Help you obtain credentials from Google Cloud Console
3. Generate the refresh token
4. Show you the environment variables to set

#### Manual Setup:
1. In Google Cloud Console, enable the Gmail API for your project.
2. Create OAuth 2.0 Client Credentials (Desktop App).
3. Download the credentials JSON file.
4. Run the setup script or management command (see above).
5. Set these env vars (see `.env.example`):
   - `GMAIL_CLIENT_ID`
   - `GMAIL_CLIENT_SECRET`
   - `GMAIL_REFRESH_TOKEN`
6. Optionally set `DEFAULT_FROM_EMAIL`/`SERVER_EMAIL` to the mailbox address.
7. Redeploy/restart. The app will use Gmail API automatically.

**For detailed instructions, see: [GMAIL_API_SETUP_GUIDE.md](GMAIL_API_SETUP_GUIDE.md)

### 2) Gmail SMTP with App Password

Prereqs:
- The address in `EMAIL_HOST_USER` must be a real Gmail/Workspace mailbox or an alias configured under Gmail "Send mail as".
- 2-Step Verification must be enabled on that mailbox.
- Create an App Password for "Mail".

Required env (see `.env.example`):
- `EMAIL_HOST=smtp.gmail.com`
- `EMAIL_PORT=587`
- `EMAIL_USE_TLS=True`
- `EMAIL_USE_SSL=False`
- `EMAIL_HOST_USER=no-reply@yourdomain.com`
- `EMAIL_HOST_PASSWORD=<16-character app password>`
- `DEFAULT_FROM_EMAIL` should match `EMAIL_HOST_USER` or a verified alias
- `EMAIL_REQUIRE_AUTH=True`

Notes:
- If your domain email is NOT on Google Workspace, do NOT use Gmail SMTP. Use your provider’s SMTP host/port instead.
- A 535 "Username and Password not accepted" means the credentials are wrong, 2FA/app password not set, or the mailbox is not a Gmail account.

### Testing

Using Docker:
```bash
docker compose exec backend python manage.py send_test_email you@example.com --subject "Test" --body "Hello"
```

Without Docker, from `backend/myLubd/src` (ensure env vars are set):
```bash
python manage.py send_test_email you@example.com --subject "Test" --body "Hello"
```

### Security and secret rotation

- Never commit real secrets. Use a private `.env` file based on `.env.example`.
- If a password or app password was exposed, revoke it immediately and generate a new one.
- Prefer a secret manager in production.

