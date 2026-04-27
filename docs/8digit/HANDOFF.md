# PicPeak — 8digit Creative Handoff Document

> If you're an AI assistant starting a new conversation on this project, read this first.
> Last updated: 2026-04-26 (evening)

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
| Images | Sharp for processing, archiver for ZIP |
| Email | Nodemailer + Handlebars templates |
| Auth | JWT (jsonwebtoken + bcrypt), httpOnly cookies (SameSite=Lax) |
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

**Rule:** Never modify upstream doc files (CHANGELOG.md, CODE_OF_CONDUCT.md, etc.). Our docs go in `docs/8digit/`.

## What We Changed (vs Upstream)

Forked from upstream v2.6.2. Full details in `docs/8digit/CHANGELOG.md`.

### Core Customizations
1. **Draft mode for events** — `is_draft` column, publish endpoint, public access blocked for drafts
2. **Share link domain resolution** — `getFrontendBaseUrl()` in `frontendUrl.js`
3. **Branding & white-label** — admin header, event creation, email templates use DB branding
4. **Docker registry fix** — compose pointed to our GHCR, not upstream's
5. **Deploy race condition fix** — `workflow_run` trigger instead of `push`
6. **Webhook email transport** — n8n integration
7. **Draft gallery preview** — admin preview token for seeing gallery before publish
8. **Editable client email** — can add/edit customer_email after event creation

### Recent Changes (2026-04-26)
12. **Pivoted guest feedback CSV export** — export now outputs one row per (photo, guest) instead of one row per action. Columns: `filename`, `guest_name`, `guest_email`, `is_favorited`, `is_liked`, `star_rating`, `comment`. Hidden feedback excluded. Booleans as `yes`/`no`.
13. **In-app `ConfirmDialog`** — replaced 17 `window.confirm()` calls with a promise-based `useConfirm()` hook to fix browser-silenced dialogs (Publish & Notify Client, Delete Event, Delete Photo, Archive, etc.). New file: `frontend/src/components/common/ConfirmDialog.tsx`. Mount: `App.tsx`. Going forward: never use `window.confirm()` — use `useConfirm()`.
14. **Gallery branding in Premium & Story layouts** — `GalleryPremiumLayout` and `GalleryStoryLayout` were ignoring `eventLogo` prop entirely (not destructured). Both now show the custom logo in the nav bar (white-filtered for dark nav backgrounds). Premium footer now respects `hide_powered_by` setting and shows `company_name` instead of "All rights reserved". Props `hidePoweredBy`/`companyName` threaded through `BaseGalleryLayoutProps` → `PhotoGridWithLayouts` → `GalleryView`.

### Previous Changes (2026-04-15)
9. **Gallery ZIP download fix** — replaced blob buffering with native browser downloads; fixed iOS Safari memory stall on large galleries (1GB+). Auth via `?token=` query param fallback.
10. **Download user-gesture fix** — moved anchor click out of react-query mutation into synchronous handler to preserve Safari's trusted gesture chain.
11. **Admin Remember Me** — checkbox now wired end-to-end; 30-day JWT + cookie when checked, 24h default otherwise.

## Known Issues

| Issue | Status | Notes |
|-------|--------|-------|
| Admin password resets on container restart | Open | Franco has had to reset multiple times. Root cause not yet investigated. |
| `general_site_url` must be configured manually | Setup step | Settings > General — needed for share links and email links |
| Branding must be configured manually | Setup step | Branding page — logo, company name, colors |
| Download All — pending real-device test | Pending | Fix deployed 2026-04-15. Needs iPhone test by Franco. |
| Dead code: `useDownloadAllPhotos` hook | Cleanup | No longer used by GalleryView after user-gesture fix. Can remove later. |
| Guest feedback (likes/ratings) not registering in some templates | Under investigation | Reported by users. Could be feedback not enabled in admin settings for the event. Check Admin → Event → Feedback Settings before further debugging. |

## Auth Architecture

### Admin Auth
- Login: `POST /auth/admin/login` → JWT (24h or 30d with Remember Me) → httpOnly cookie `admin_token`
- Cookie: `setAdminAuthCookie(res, token, { rememberMe })` in `tokenUtils.js`
- Frontend: `AdminAuthContext` checks `/auth/session` on mount, stores user in sessionStorage

### Gallery Auth
- Password verify: `POST /auth/gallery/verify` → JWT (24h) → httpOnly cookies `gallery_token` + `gallery_token_{slug}`
- Share link: `POST /auth/gallery/share-login` → same JWT flow
- Token resolution order: Authorization header → `?token=` query param → cookies
- Frontend stores JWT in sessionStorage via `galleryAuthStorage.ts` (slug-keyed)
- Download endpoints use `?token=` query param because native `<a download>` clicks cannot set headers

### Critical Lesson
**Never put programmatic `<a>` clicks inside async boundaries** (react-query mutations, promises, setTimeout). Safari silently blocks them if the click isn't in the same synchronous tick as the user gesture.

## Database

- PostgreSQL running in Docker
- Migrations in `backend/migrations/core/` (numbered sequentially)
- Latest custom migration: `074_add_is_draft_column.js`
- Migrations run automatically on backend startup via `run-migrations.js`
- Key tables: `events` (has `is_draft`), `app_settings` (branding config), `photos`, `admin_users`, `access_logs`

## Environment Variables (Production)

Located at `/opt/picpeak/.env` on the droplet. Key vars:
- `FRONTEND_URL` — `https://gallery.8digitcreative.com`
- `JWT_SECRET` — auth tokens
- `SMTP_*` — Gmail/Google Workspace via smtp.gmail.com:587
- `COOKIE_SECURE` — set to `true` for HTTPS (optional, defaults false)
- `COOKIE_SAMESITE` — defaults to `Lax`
- `COOKIE_DOMAIN` — optional, for cross-subdomain cookies

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

## Documentation Structure

```
docs/8digit/
├── HANDOFF.md              ← This file (living project state — read first)
├── CHANGELOG.md            ← Cumulative fork changelog
└── handoffs/               ← Per-session detailed archives
    ├── 2026-04-15-download-fix-and-remember-me.md
    └── ...
```

See `CLAUDE.md` → "Documentation System" for the full session lifecycle protocol.
