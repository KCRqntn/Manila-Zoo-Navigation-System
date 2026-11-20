# System enhancements: admin datasets, security, backups (October 21, 2026)

What was added to the Manila Zoo Navigation and Information System. The stack is unchanged: React + TypeScript, Express API, Supabase Postgres, and the fine-tuned BERT chatbot.

## 1. Features

| Area | What exists now | Where |
|---|---|---|
| **Dataset Management** | Zoo Updates, Ticket Prices, Announcements and Events managed through one engine: create, edit, publish, unpublish, archive, cancel (events), delete (blocked while published), search, status filter, pagination, CSV export, and CSV import (validated as one transaction, errors reported by line). Records store who created and updated them, and when. | Admin → Datasets section |
| **Ticket prices** | Verification source and date per price; only verified prices can be published. The website and chatbot show only published, verified prices in effect today; with none, they say prices need verification. Change history table. Seeded only from the official rates the team supplied (Sept 14, 2023 rates, verified 2026-10-19). | Admin → Ticket Prices; Visit page; AI Guide |
| **Announcements** | Type, priority (low to urgent), publish time, expiry; urgent ones show as a banner on the home page; expired ones are hidden at once and archived after a configurable number of days. | Admin → Announcements; Home |
| **Events** | Status (draft, published, cancelled, archived), scheduled publication, map place; cancelled events are labelled; events appear in the place's details on the map and link to directions. | Admin → Events; Events page; Map |
| **QR Code Access** | Configurable public website address (https only; localhost and private addresses refused), QR preview, PNG download, printable bilingual poster. | Admin → QR Code Access |
| **Splash and welcome window** | Splash screen, then a small window (once per visit, home page only): Open the website / Website QR code / Administrator login. Can be switched off in System Settings. The QR code never grants admin access. | Website |
| **Visitor submissions** | Contact and group-visit inquiry form (Help → Contact) with validation, duplicate and spam protection; admin list with filters, pagination, details, status and notes, CSV export (phone numbers only on request). Account registrations listed from Supabase Auth. Opening a record and exporting are audited. | Help page; Admin → Form Submissions |
| **3D map management** | Existing MapLibre 3D map and Leaflet 2D map kept. Added: view-angle buttons (tilted, top-down, low angle, reset), published or hidden places (staff preview hidden ones), label visibility, a photo per place, position validation (must be inside the zoo), saved map versions (manual, automatic hourly before edits, and before restores) with a safe restore. | Admin → 3D Map Management; Map |
| **Backup and Recovery** | Encrypted full and differential backups of the database and uploaded photos; loading screen, password re-entry, then the operation menu; real progress; integrity checks; restore with safety backup and in-transaction verification. Details in `deploy/BACKUP.md`. | Admin → Backup & Recovery |
| **Audit logs** | Server-side, append-only (database triggers block UPDATE, DELETE and TRUNCATE), hash-chained (tampering detectable with "Check integrity"). Records logins (success and failure, through the API), logouts, dataset, map, QR, settings, user and role changes, submission access, backups and restores, plus every change made through the existing admin routes. Secrets are removed before storing. Filter, paginate and export. | Admin → Audit Logs |
| **Roles** | admin, editor and viewer, enforced on the server for every request (see the table on the Users & Roles page). The last active admin can't be removed or demoted. | Admin → Users & Roles |
| **System Settings** | Public site address, welcome window on or off, announcement archiving delay. | Admin → System Settings |
| **Dashboard** | Active announcements, upcoming events, published updates, verified and unverified prices, map locations, submissions, successful and failed backups, failed actions. | Admin → Dashboard |

## 2. Security fixes found during the work

1. **Row Level Security was off on all 21 tables.** With the public Supabase key that ships in the website, anyone could read every visitor's chat history and game progress, or change animals, events and the map, through Supabase's REST API. RLS is now on for every table with no public policies. The API is unaffected because it connects as the table owner. Verified: the public key reads nothing and can't insert.
2. **An 8-hour shift** would have hit event and announcement times entered through the new forms, because the older `timestamp` columns drop time zones. Fixed: date-times are sent with the Manila offset, and the API process runs in Asia/Manila time.
3. **The user role field accepted any text.** Roles are now limited to visitor, viewer, editor and admin.

## 3. Database migrations

Applied automatically at API startup by `artifacts/api-server/src/lib/migrations.ts`. Each runs once in a transaction and is recorded in `schema_migrations`. Nothing existing was dropped.

- `2026-10-21-01-security-audit-datasets`:
  - turns on RLS for all tables;
  - creates `audit_logs` (append-only trigger), `zoo_updates`, `ticket_prices`, `ticket_price_history`, `map_versions`, `system_settings`, `form_submissions` and `backups`;
  - adds status, priority and scheduling columns to `announcements` and `events`;
  - adds `show_label` and `image_url` to `map_pins`;
  - adds constraints: non-negative prices, valid date ranges, unique records, valid email.
- `2026-10-21-02-audit-no-truncate`: blocks TRUNCATE on `audit_logs`.

## 4. Files

**API, new:**
- `lib/` (all under `src/`): `migrations.ts`, `audit.ts`, `datasets.ts`, `csv.ts`, `settings.ts`, `backup.ts`, `seedTicketPrices.ts`
- `middleware/access.ts`
- `routes/`: `auth.ts`, `datasets.ts`, `settings.ts`, `submissions.ts`, `auditLogs.ts`, `backup.ts`
- `tests/acceptance.ts`

**API, changed:**
- `index.ts` (Manila time, migrations, interrupted-backup check)
- `routes/index.ts`
- `middleware/requireAdmin.ts` (permissions and automatic auditing)
- `routes/`: `users.ts`, `map.ts`, `announcements.ts`, `events.ts`, `chat.ts` (prices from the database, event status, published places only)
- `lib/db/src/index.ts` (DATE columns as text)
- schema: `announcements`, `events`, `mapPins`

**Website, new:**
- `lib/adminApi.ts`
- `components/`: `EntryWindow.tsx`, `InquiryForm.tsx`, `admin/ConfirmDialog.tsx`, `admin/DatasetManager.tsx`
- `pages/admin/`: `DatasetPages.tsx`, `QrAccess.tsx`, `Submissions.tsx`, `Backup.tsx`, `AuditLogs.tsx`, `SystemSettings.tsx`

**Website, changed:**
- `App.tsx`
- layout and auth: `AdminLayout` (grouped, permission-filtered, phone menu), `ProtectedRoute`, `AuthContext`, `AppNavbar`
- pages: `Login`, admin `Users` and `Dashboard`, `MapEditor`, visitor `Map`, `Home`, `Visit`, `Events`, `Help`
- components: `PinEditDialog`, `Zoo3DView`

**Removed:** `pages/admin/Announcements.tsx` and `pages/admin/Events.tsx`, replaced by the dataset pages.

**Deploy:** `deploy/docker-compose.yml` (TZ, private backup volume), `deploy/BACKUP.md`, `.gitignore` (excludes `*.mzb`).

## 5. Configuration

- **No new secrets.** The existing `.env` values are used.
- **Optional `BACKUP_DIR`:** the folder for encrypted backups. It defaults to `backups/encrypted/` in the project folder, and to `/backups` with Docker.
- **Roles:** change them in Admin → Users & Roles, or with `pnpm --filter @workspace/api-server create-admin <email> <password>` for a first administrator.

## 6. Testing (October 21, 2026)

- **Typecheck:** API and website pass with no errors. The production website build succeeds.
- **Backend acceptance test** (`tests/acceptance.ts`, against the running API): **75 of 75 checks passed**. It covers:
  - roles and permissions for admin, editor, viewer, visitor and no login;
  - RLS against the public key;
  - every dataset rule (drafts, publishing, duplicates, invalid dates and prices, unverified prices, scheduling and expiry, cancelled events with map places);
  - CSV import (atomic) and export;
  - settings validation;
  - the inquiry form (validation, duplicates, staff access);
  - map validation, hidden places and version restore;
  - audit logging (logins, changes, no secrets stored, records can't be changed or truncated, hash chain intact);
  - a full backup, a differential backup (file not readable, integrity check passes), and a restore (wrong passphrase refused, safety backup made, data exactly restored, audit log kept).
- **Browser test** (headless Chrome, phone and desktop sizes):
  - every new admin page loads;
  - creating a record through the form works;
  - the editor's menu hides admin-only sections, and the server refuses them;
  - the welcome window appears once per visit;
  - live prices with their source show on the Visit page;
  - the contact form submits, and staff see the message;
  - the map shows the view-angle buttons;
  - no JavaScript errors anywhere.

  Three checks needed test-script fixes, not code fixes: the Events page opens on its Games tab, the headless browser didn't pick the dropdown value, and the expected error text was wrong.
- **Chatbot regression:** 76 of 76 questions answered correctly.
- **Cleanup:** all test accounts, records and test backups were removed. Audit entries from the tests remain, by design.

## 7. Limitations and dependencies

- **Not in backups:** Supabase Auth accounts, the source code and the AI model files (see `deploy/BACKUP.md`).
- **Backups live on the same computer.** Copy them elsewhere regularly. A backup passphrase that's lost can't be recovered.
- **Logins through the website are audited.** Signing in directly against Supabase's own API, outside this website, isn't recorded.
- **The audit hash chain detects tampering; it doesn't prevent it.** Someone with full database-owner rights could still drop the triggers.
- **Backup sessions and job progress are kept in server memory.** A server restart ends them, and an interrupted backup is marked failed.
- **3D map:** the existing MapLibre map was kept (zoom, pan, rotate, tilt, view presets, 2D fallback) instead of rewriting it in React Three Fiber.
  - Buildings are edited as outlines with heights and colours.
  - There's no arbitrary 3D model editing.
  - "Preview before publishing" works by keeping places hidden until published, while staff see them.
- **Visitor positions** come from GPS, a spot picked on the map, or location QR codes; there's no indoor positioning.
- **The visitor QR code needs a permanent public address.** A trycloudflare link changes every time the tunnel restarts.
- **No official data was invented:**
  - There are no zoo updates yet, and no upcoming events (the 4 existing events are past).
  - Only the official 2023 rates are seeded as verified prices.
  - The group-visit form is an inquiry, not a reservation.
