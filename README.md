# HotelCare Pro

HotelCare Pro is smart hotel maintenance and engineering management software
for work orders, preventive maintenance, assets, rooms, technicians and
engineering reports.

Production domain: `https://staymaint.com`

`hotelcarepro.com` is retained only as a legacy redirect.

## Scope

- Login
- Job list
- Create job
- Job detail
- Status update workflow
- Before and after photo upload
- Dashboard KPI
- PDF report
- Rooms
- Users
- Settings

## Stack

- Backend: Django REST Framework, PostgreSQL, Docker
- Frontend: Next.js, React, TypeScript
- Reverse proxy: Nginx

## Project Layout

- `backend/myLubd/src/`: Django project and app source
- `frontend/Lastnext/`: Next.js frontend
- `nginx/`: Nginx configuration
- `scripts/`: current development, deployment, and backup helpers

The `myLubd` and `Lastnext` directory names are legacy module paths kept for runtime compatibility.

## Development checks

Install backend runtime dependencies from `backend/myLubd/requirements.txt`.
For development and pytest, install `backend/myLubd/requirements-dev.txt`.
The `src/requirements.txt` path is a compatibility entry point to that development
file; dependency versions belong in the outer files only.

From `frontend/Lastnext`, run `npm run typecheck`, `npm run lint` and `npm test`.
ESLint uses `eslint.config.mjs`; lint currently permits at most 184 warnings.
Lower that budget as existing warnings are fixed, rather than raising it for new
code. Underscore-prefixed arguments explicitly preserve unused legacy parameters;
rest destructuring may intentionally omit properties.

From `backend/myLubd/src`, run `python manage.py test myappLubd` against a local
development database. Django creates a separate test database; never configure a
test database name to match the application database.

`scripts/deploy.sh` deploys the currently checked-out branch with a fast-forward
pull and requires a clean working tree. Set `DEPLOY_BRANCH` to require a specific
branch; check out that branch before running the script.
