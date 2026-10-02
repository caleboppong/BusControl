# BusControl Final Revised Build

## Configuration
Create `server/.env` from `server/.env.example` and add your server Mapbox access token.
Create `client/.env` from `client/.env.example` and add your public Mapbox token.

Do not commit either `.env` file.

## Start
In `server`: `npm install` then `npm run dev`.
In `client`: `npm install` then `npm run dev`.

## Controller pages
Control Board, Incidents, Diversions, Routes, Drivers, Vehicles, Reports, History and Administration are now functional application views rather than decorative sidebar buttons.

## Roles
Use the top-right role selector for Controller, Driver and Super Admin views.

## Important operational limitation
Generated diversions are proposals only. A controller must verify road access, bridge/weight/height/width restrictions, turning suitability, temporary traffic management and operator-specific vehicle data before approval. The included local JSON persistence is suitable for project/demo use; production user management and organisation isolation require a real database/auth configuration such as Supabase.
