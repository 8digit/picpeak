# PicPeak — 8digit Creative Handoff Document

> If you're an AI assistant starting a new conversation on this project, read this first.
> Last updated: 2026-03-27

---

## What Is This Project?

PicPeak is an open-source photo gallery platform for photographers to deliver photos to clients. Franco Aparicio (8digit Creative, Puerto Rico) forked it to run as his own white-label gallery service.

- **Upstream:** github.com/the-luap/picpeak (by the-luap)
- **Our fork:** github.com/8digit/picpeak
- **Production:** https://gallery.8digitcreative.com
- **Server:** DigitalOcean droplet at 45.55.56.61

## Architecture

```
Client Browser
    ↓ HTTPS (:443)
Host Nginx (Let's Encrypt SSL)
    ├── /api/* → Docker backend (port 3001 → container 3000)
    └── /*     → Docker frontend (port 3000 → container 80)
                    Backend → PostgreSQL + Redis (both in Docker)
```

All services run via `docker-compose.production.yml` on the droplet at `/opt/picpeak`.

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Express.js 4.18, Node.js |
| Database | PostgreSQL (via Knex.js) |
| Cache | Redis |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| State | React Query (@tanstack/react-query) |
| Images | Sharp for processing |
| Email | Nodemailer + Handlebars templates |
| Auth | JWT (jsonwebtoken + bcrypt) |
| i18n | i18next (en, de, ru) |
| Infra | Docker Compose, Nginx, GitHub Actions |

## CI/CD Pipeline

```
Push to main
    ↓
docker-build.yml → builds images → pushes to ghcr.io/8digit/picpeak/...:main
    ↓ (workflow_run, only if build succeeds)
deploy.yml → SSH to droplet → git pull → docker compose pull → up -d
    ↓
Migrations run automatically on backend startup
```

**Important:** The deploy workflow triggers on `workflow_run` completion, NOT on `push`. This prevents the race condition where deploy pulls stale images before the build finishes.

**Docker images:** `ghcr.io/8digit/picpeak/backend:main` and `ghcr.io/8digit/picpeak/frontend:main`

## Git Setup

```
origin    → github.com/8digit/picpeak (our fork — push here)
upstream  → github.com/the-luap/picpeak (original — pull updates)
```

**Rule:** Never modify upstream doc files (CHANGELOG.md, CODE_OF_CONDUCT.md, CONTRIBUTING.md, DEPLOYMENT_GUIDE.md, SECURITY.md, SIMPLE_SETUP.md, README.md). Our docs go in `docs/8digit/`.

## What We Changed (vs Upstream v2.6.2)

### 1. Draft Mode for Events
- **Why:** Franco needs to set up a gallery (upload photos, configure settings) before the client sees it or gets an email.
- **How:** `is_draft` column on events table. Events created as drafts. Publish endpoint sends email. Public access blocked for drafts.
- **Key files:** `074_add_is_draft_column.js`, `adminEvents.js` (publish endpoint), `shareLinkService.js`, `gallery.js` middleware, `EventDetailsPage.tsx`, `EventsListPage.tsx`

### 2. Share Link Domain Resolution
- **Why:** Share links were generating relative paths like `/gallery/abc123` without the domain, making them useless in emails and copy-paste.
- **How:** `getFrontendBaseUrl()` in `backend/src/utils/frontendUrl.js` checks `FRONTEND_URL` env var, falls back to `general_site_url` DB setting. Frontend uses `window.location.origin`.
- **Key files:** `frontendUrl.js`, `shareLinkService.js`, `emailProcessor.js`, `EventDetailsPage.tsx`, `EventsListPage.tsx`

### 3. Branding & White-Label
- **Why:** The app had PicPeak branding hardcoded. Franco needs 8digit Creative branding.
- **How:**
  - Admin header reads company_name, logo, display_mode from branding API settings
  - Event creation inherits branding defaults (logo visibility, size, position) from app_settings
  - Email templates use theme primaryColor instead of hardcoded PicPeak green
  - Logo URLs built with public frontend URL, not internal API URL
- **Key files:** `AdminHeader.tsx`, `adminEvents.js` (getBrandingDefaults), `emailProcessor.js`

### 4. Docker Registry Fix
- **Why:** `docker-compose.production.yml` pointed to upstream's GHCR registry (`ghcr.io/the-luap/picpeak`). Our CI built images to our registry (`ghcr.io/8digit/picpeak`). Production never got our code.
- **How:** Changed image refs and tag from `:stable` to `:main`.
- **Key file:** `docker-compose.production.yml`

### 5. Deploy Race Condition Fix
- **Why:** Both `docker-build.yml` and `deploy.yml` triggered on push. Deploy would run `docker compose pull` before the build finished, pulling old images.
- **How:** Changed deploy trigger to `workflow_run` (waits for build) with success condition.
- **Key file:** `.github/workflows/deploy.yml`

### 6. Webhook Email Transport for n8n
- **Why:** Franco uses n8n for automations. Webhook transport allows n8n to handle email delivery.
- **Key file:** Email transport configuration

## Known Issues

| Issue | Status | Notes |
|-------|--------|-------|
| Admin password resets on container restart | Open | Franco has had to reset multiple times. Root cause not yet investigated. |
| `general_site_url` must be configured manually | Setup step | Settings > General — needed for share links and email links |
| Branding must be configured manually | Setup step | Branding page — logo, company name, colors |

## Database

- PostgreSQL running in Docker
- Migrations in `backend/migrations/core/` (numbered sequentially)
- Latest custom migration: `074_add_is_draft_column.js`
- Migrations run automatically on backend startup via `run-migrations.js`
- Key tables: `events` (has `is_draft`), `app_settings` (branding config), `photos`, `users`

## Environment Variables (Production)

Located at `/opt/picpeak/.env` on the droplet. Key vars:
- `FRONTEND_URL` — should be `https://gallery.8digitcreative.com`
- `JWT_SECRET` — auth tokens
- `SMTP_*` — Gmail/Google Workspace via smtp.gmail.com:587
- `PICPEAK_CHANNEL` — was "stable", but images now tagged as "main" (hardcoded in compose file)

## Server Access

- SSH: `ssh deploy@45.55.56.61` (ED25519 key "picpeak")
- App path: `/opt/picpeak`
- Franco prefers NOT to SSH — use CI/CD pipeline
- GitHub Secrets: `DROPLET_IP`, `DROPLET_USER`, `DROPLET_SSH_KEY`

## Future Plans

- Connect PicPeak API to n8n for auto-creating galleries from Airtable
- n8n instance: n8n.8digitcreative.com
- Airtable base: appZdVzMphPtqXEyN (client management)
- Goal: when a project is marked "ready for delivery" in Airtable → n8n auto-creates gallery

## File Organization

```
/                           ← upstream root (don't modify upstream docs)
├── CLAUDE.md               ← AI assistant instructions (ours)
├── docs/8digit/            ← our documentation
│   ├── HANDOFF.md          ← this file
│   └── CHANGELOG.md        ← fork-specific changes
├── backend/                ← Express.js API
│   ├── migrations/core/    ← DB migrations (074+ are ours)
│   ├── src/routes/         ← API routes
│   ├── src/services/       ← Business logic
│   ├── src/middleware/      ← Express middleware
│   └── src/utils/          ← Utilities (frontendUrl.js is ours)
├── frontend/               ← React app
│   ├── src/pages/admin/    ← Admin dashboard pages
│   ├── src/components/     ← UI components
│   ├── src/services/       ← API client services
│   └── src/i18n/locales/   ← Translation files
├── .github/workflows/      ← CI/CD (deploy.yml and docker-build.yml are ours)
└── docker-compose.production.yml ← Production Docker config (modified)
```
