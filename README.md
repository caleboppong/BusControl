# BusControl – Live Bus Diversion Management System

Final integrated project build.

## Included
- Live TfL road disruptions
- TfL bus route geometry and stops
- Route/incident matching
- Affected-section analysis
- Mapbox-based diversion proposal generation
- Controller safety-review workflow
- Status lifecycle: PROPOSED → AWAITING_APPROVAL → APPROVED → ACTIVE → ENDED (plus REJECTED/CANCELLED)
- Driver dashboard with acknowledgement and problem reporting
- Super Admin operational/audit view
- Local JSON persistence for diversions, acknowledgements, reports and audit events
- Responsive React/Mapbox interface

## Important operational note
Generated diversion paths are proposals only. A controller must verify road suitability, closures, bus dimensions/weight, turning space and local restrictions before approval. The project does not claim that a Mapbox route is automatically safe for a bus.

## 1. Configure server
Copy `server/.env.example` to `server/.env` and set:

```env
PORT=5000
MAPBOX_ACCESS_TOKEN=YOUR_MAPBOX_TOKEN
```

TfL endpoints used by the current build do not require a key in the project code. Empty TfL/Supabase placeholders are included for future configuration.

## 2. Configure client
Copy `client/.env.example` to `client/.env`:

```env
VITE_API_URL=http://localhost:5000/api
VITE_MAPBOX_TOKEN=YOUR_MAPBOX_PUBLIC_TOKEN
```

## 3. Install and run server
```powershell
cd server
npm install
npm run dev
```

Server: `http://localhost:5000`

## 4. Install and run client
Open another terminal:

```powershell
cd client
npm install
npm run dev
```

Client: `http://localhost:5173`

## Roles
Use the role selector at the top-right to switch between Controller, Driver and Super Admin views for local testing.

## Persistence
Runtime operational records are written to `server/src/data/store.json` automatically. It is intentionally local for this self-contained project build. Supabase environment placeholders remain available if cloud persistence/authentication is added later.
