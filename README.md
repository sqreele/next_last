# HotelCare Pro

HotelCare Pro is smart hotel maintenance and engineering management software
for work orders, preventive maintenance, assets, rooms, technicians and
engineering reports.

Production domain: `https://hotelcarepro.com`

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
