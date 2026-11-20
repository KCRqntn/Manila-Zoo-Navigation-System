# Manila Zoo Navigation and Information System

An interactive digital guide for Manila Zoo. Visitors can browse the animals, find their way with a
2D/3D map and GPS, scan the QR codes at exhibits, play games and earn rewards, chat with ZooBot, a
bilingual (English / Filipino) AI guide, and see events and announcements. Zoo staff manage all of it
from an admin panel.

Live site: **https://manilazoonavigationsystem.com** (served from the project laptop through a Cloudflare tunnel)

---

## How it fits together

```
Phone / browser
      │  https://manilazoonavigationsystem.com
      ▼
Cloudflare tunnel ──► Website  :4173   (React + Vite, built files in artifacts/manila-zoo/dist)
                         │ /api is forwarded to
                         ▼
                      API server :5000 (Express 5)
                         ├──► PostgreSQL (localhost:5432)  all app data
                         ├──► Supabase                     logins and photo storage
                         └──► AI service :8000 (FastAPI)   ZooBot intent model
```

| Part | Folder | Port |
|---|---|---|
| Website (visitor and admin pages) | `artifacts/manila-zoo/` | 4173 |
| API server | `artifacts/api-server/` | 5000 |
| AI intent service (ZooBot) | `ai-training/` (`predict_api.py`) | 8000 |
| Database schema (Drizzle) | `lib/db/` | — |

### Where the data lives

- **PostgreSQL** (`DATABASE_URL`, currently `localhost:5432`) holds all app data: animals, map, QR
  codes, events, chat history, games, visitor registrations, settings and audit logs. It's opened in
  `lib/db/src/index.ts`.
- **Supabase** (`VITE_SUPABASE_URL`) handles **user accounts and logins** (admins, staff, visitors) and
  **file storage** (animal photos and uploads). The API uses the service role key
  (`artifacts/api-server/src/lib/supabase.ts`); the website uses the public anon key
  (`artifacts/manila-zoo/src/lib/supabase.ts`).

---

## Setup

Requirements: Node.js 22+, pnpm, PostgreSQL, Python 3 (for the AI service), and a Supabase project.

1. Install dependencies:
   ```
   pnpm install
   pip install -r ai-training/requirements.txt
   ```
2. Create `.env` in this folder:
   ```
   PORT=5000
   DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/DBNAME
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ```
   Optional: `AI_SERVICE_URL` (default `http://127.0.0.1:8000`).
   Keep `.env` private. The service role key gives full admin access to the Supabase project.
3. Create the tables and seed data:
   ```
   pnpm --filter @workspace/db run push
   pnpm --filter @workspace/api-server run migrate
   ```
4. Create the first admin login:
   ```
   pnpm run create-admin
   ```
   `pnpm run create-director` and `pnpm run create-tourist` create the other account types.

---

## Running it

### Everyday (the laptop that serves the live site)

| Script | What it does |
|---|---|
| `start-zoo.cmd` | Starts the AI service, API and website, each in a window that restarts it if it stops |
| `start-domain.cmd` | Connects https://manilazoonavigationsystem.com to this laptop (permanent tunnel) |
| `start-zoo-autostart.cmd` | Runs both of the above at Windows sign-in (shortcut in `shell:startup`) |
| `start-tunnel.cmd` | Temporary `trycloudflare.com` link, for testing without the domain |
| `start-demo.cmd` | One click before a demo: starts everything, makes a phone link, opens the site |

The website window serves the **production build** (`pnpm run serve`) and builds it first if it has
never been built. After changing website code, rebuild it:
```
pnpm --filter @workspace/manila-zoo run build
```

> **Don't run the dev server on port 4173.** If `pnpm dev` takes port 4173 first, the startup script
> waits behind it and the public site is served unbundled. Every page then needs hundreds of separate
> downloads through the tunnel, so it loads very slowly. For development, use another port.

### Development

```
pnpm run dev:ai      # AI service on :8000
pnpm run dev         # API + website dev server together (set PORT to something other than 4173)
```

### Other commands

| Command | Purpose |
|---|---|
| `pnpm run typecheck` | Typecheck every package |
| `pnpm run build` | Typecheck and build everything |
| `pnpm --filter @workspace/api-spec run codegen` | Regenerate API hooks and Zod schemas from the OpenAPI spec |
| `pnpm run train:ai` | Retrain the ZooBot intent model (`ai-training/train.py`) |
| `pnpm test:chatbot` | ZooBot regression tests against the running system (add `-- --report` to write `chatbot-test-report.md`) |

### ZooBot tests

Run `pnpm test:chatbot` after any change to the chatbot (`artifacts/api-server/src/routes/chat.ts`) or a
retrained model, with the AI service, API and database running. It sends about 130 test questions
(prompt injection, off-topic, safety, emergencies, animal questions, Filipino and typos, conversations)
plus every emergency sentence in the training data, and fails if any answer changes for the worse.
The cases live in `scripts/src/chatbot-test-cases.ts`; add one whenever a chatbot bug is found or fixed.
Cases marked `known` are open issues: they're reported but don't fail the run.

---

## Project layout

```
artifacts/
  manila-zoo/          React + Vite website (src/pages/visitor, src/pages/admin)
  api-server/          Express API (src/routes, src/lib, src/middleware)
lib/
  db/                  Drizzle schema (src/schema) and database connection
  api-spec/            OpenAPI spec, the source of truth for the API contract
  api-zod/             Generated Zod schemas
  api-client-react/    Generated React Query hooks
ai-training/           ZooBot intent model: training, evaluation, FastAPI service
deploy/                Hosting, backups, Docker and startup scripts
project-notes/         Change logs, thesis notes, evaluation survey
scripts/               One-off maintenance scripts
```

---

## Features

**Visitors:** animal profiles with photos, taxonomy and conservation status · 2D map and 3D view with
GPS location and walking directions · QR scanning at exhibits (phone camera or in-app scanner) ·
games, points and rewards · ZooBot chat in English and Filipino · events, announcements and FAQ ·
favorites · visitor registration through the entrance QR code.

**Admins:** dashboard and visitor analytics · animal, map, event and announcement management · QR code
generation and printable posters · ZooBot training data · user and admin account management ·
system settings · audit log · encrypted backups.

---

## QR codes

- Exhibit codes look like `MNL-ZOO-XXXXXXXX` and hold a full link, `<public address>/q/<code>`, so any
  phone camera opens the site directly.
- The entrance code opens `/r`, which leads to the visitor registration form.
- The public address is set in **Admin → QR Code Access** (currently
  `https://manilazoonavigationsystem.com`). If it changes, the printed signs have to be reprinted.

---

## More documentation

- `deploy/HOSTING.md`: putting the system online (tunnel or a cloud server with Docker)
- `deploy/BACKUP.md`: backups and restoring
- `project-notes/`: change logs and system enhancement notes
- `ai-training/model_comparison.md`, `ai-training/statistical_analysis.md`: ZooBot model results

## Notes for developers

- Drizzle returns camelCase fields; middleware in the API converts every response to snake_case to
  match the generated frontend hooks.
- Run `pnpm run typecheck:libs` after changing the schema, before checking the app packages.
- Row Level Security is on for every table. The website reads data only through the API, which
  connects as the table owner.
