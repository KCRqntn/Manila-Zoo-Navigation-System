# Putting the Manila Zoo system online (HTTPS)

Phones only share GPS with `https://` pages, so the location features need the site online with HTTPS.
There are two ways. Start with **A** for testing; use **B** when the system should stay up without your laptop.

---

## A. Quick tunnel from this laptop (free, ~5 minutes)

Your laptop keeps running everything; Cloudflare gives it a temporary `https://` link.

1. Install Cloudflare's tunnel tool once (in a terminal):
   ```
   winget install --id Cloudflare.cloudflared
   ```
   Close and reopen the terminal afterwards.
2. Double-click **`start-zoo.cmd`** and wait about a minute for the three windows to start.
3. Double-click **`start-tunnel.cmd`**. After a few seconds it prints a link like
   `https://quiet-river-1234.trycloudflare.com`.
4. Open that link on any phone (mobile data or Wi-Fi). Allow location when asked.

Good to know:
- **Anyone with the link can open the site.** Admin pages still need your Supabase admin login.
- The link changes every time you run `start-tunnel.cmd`, and stops when you close its window or the laptop sleeps.
- Keep the laptop plugged in with sleep turned off while testing at the zoo.

---

## B. Always-on hosting on one small server (~₱350–700/month)

Everything (website + HTTPS, API, AI model) runs in Docker on one cloud server.

### What you need
- A cloud server (VPS) with **at least 2 GB of memory** (the AI model needs ~1.5 GB) running Ubuntu 24.04.
  Examples: Hetzner CX22 (~€4/month), DigitalOcean 2 GB droplet (~$12/month), Vultr 2 GB.
- Your project's Supabase values (the same ones in the laptop's `.env`).
- Optional: a domain name. Without one, the free `sslip.io` address below still gets real HTTPS.

### Steps
1. **Create the server** and note its public IP address, e.g. `203.0.113.5`.
2. **Install Docker** on it (SSH in, then):
   ```
   curl -fsSL https://get.docker.com | sh
   ```
3. **Copy the project to the server.** Either push it to a *private* GitHub repository and `git clone` it,
   or copy the folder with `scp`/WinSCP. `.gitignore` keeps `.env` out of git; never upload `.env`.
   The AI model (`ai-training/models`, ~680 MB) must be included: if you use git, add it with Git LFS or copy that folder separately.
4. **Create the settings file** on the server:
   ```
   cp deploy/.env.production.example deploy/.env.production
   nano deploy/.env.production
   ```
   Fill in every line. For `SITE_DOMAIN` use your domain, or the IP with dashes plus `.sslip.io`
   (e.g. `203-0-113-5.sslip.io`).
5. **Start everything** (the first build takes 10–20 minutes):
   ```
   docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production up -d --build
   ```
6. **Open `https://<SITE_DOMAIN>`** on a phone. Caddy gets the HTTPS certificate automatically on first visit
   (ports 80 and 443 must be open in the server's firewall).

### Checking and updating
- See whether everything runs: `docker compose -f deploy/docker-compose.yml ps`
- Read the API's log: `docker compose -f deploy/docker-compose.yml logs api --tail 50`
- After changing the code: copy/pull the new version, then run the command in step 5 again.
- Retrained the AI model? Replace `ai-training/models` on the server and run step 5 again.

### Before relying on it
These files were written for this project but **haven't been test-built yet** (Docker wasn't running on the
development laptop). The first `up --build` is the test: if a step fails, the error appears in the output.

---

## Settings reference

| Setting | Used by | Secret? |
|---|---|---|
| `SITE_DOMAIN` | Caddy (HTTPS address) | No |
| `DATABASE_URL` | API | **Yes** |
| `VITE_SUPABASE_URL` | Website and API | No |
| `VITE_SUPABASE_ANON_KEY` | Website and API | No (meant for browsers) |
| `SUPABASE_SERVICE_ROLE_KEY` | API (accounts, admin checks) | **Yes** |
| `AI_SERVICE_URL` | API; set automatically to the AI container | No |
