# Authenticated Property smoke

This suite targets only an explicitly isolated PostgreSQL E2E database. Start
the existing database service, create the isolated database once, then start an
E2E instance of the existing backend service:

```sh
docker compose -f docker-compose.dev.yml up -d db
docker exec db-dev sh -c 'createdb -U "$POSTGRES_USER" mylubd_e2e'
docker compose -f docker-compose.dev.yml run -d --name django-backend-e2e \
  -p 8001:8000 \
  -e SQL_DATABASE=mylubd_e2e \
  -e SQL_HOST=db \
  -e AUTH0_DOMAIN= \
  -e AUTH0_ISSUER= \
  -e AUTH0_ISSUER_BASE_URL= \
  -e AUTH0_AUDIENCE= \
  -e E2E_TESTING=1 \
  -e E2E_PASSWORD="$E2E_PASSWORD" \
  backend
docker exec -e E2E_TESTING=1 -e E2E_PASSWORD="$E2E_PASSWORD" django-backend-e2e \
  python manage.py seed_e2e_smoke
```

Export the values from `.env.e2e.example` with local test-only secrets. Run the
existing frontend with its normal session implementation pointed at the E2E
backend, then install and run Chromium from another terminal:

```sh
cd frontend/Lastnext
AUTH0_SESSION_SECRET="$E2E_SESSION_SECRET" \
  NEXT_PUBLIC_API_URL="$E2E_API_URL" \
  NEXT_PRIVATE_API_URL="$E2E_API_URL" \
  API_URL="$E2E_API_URL" \
  npm run dev
```

```sh
cd frontend/Lastnext
npx playwright install --with-deps chromium
npm run test:e2e
```

The frontend and test runner must share the same
`E2E_SESSION_SECRET`/`AUTH0_SESSION_SECRET`. Never point this workflow at a
development or production database. If the database already exists, omit the
one-time `createdb` command.

Reset only the owned smoke namespace with:

```sh
docker exec -e E2E_TESTING=1 -e E2E_PASSWORD="$E2E_PASSWORD" django-backend-e2e \
  python manage.py seed_e2e_smoke --reset
```
