# PicPeak — 8digit Creative Handoff Document

> If you're an AI assistant starting a new conversation on this project, read this first.
> Last updated: 2026-04-27

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
15. **Guest feedback silent-failure fixes** — Three compounding bugs blocked likes/ratings from registering: (a) `GET /:slug/feedback-settings` in `gallery.js` was missing `require_name_email` in its response, so the identity modal never appeared and the API returned 400; (b) name validation regex was ASCII-only and blocked accented characters; (c) all three `console.warn` calls in catch blocks hid errors from users. All fixed. Also: `toast.error` now shows proper error messages in Premium and Story layouts.
16. **Branding full fix — PicPeak logo removed from all gallery surfaces** — Password-protected gallery login screen, hero header (top/center/bottom logo positions via `HeroHeader.tsx`), standard gallery header, and standard gallery hero (both in `GalleryLayout.tsx`) no longer fall back to `/picpeak-logo-transparent.png`. When no custom logo is configured, nothing renders (or company name text if set). Fully white-labels the client-facing gallery.
17. **Theme customization broken in all layouts (2026-04-27)** — Three bugs fixed: (a) Gallery Story and Gallery Premium CSS had hardcoded color schemes that ignored ThemeContext — both now bridge `--story-background/foreground/primary` and `--premium-bg/fg/accent` to ThemeContext's `--color-background/text/primary` CSS variables, with original cinematic/light fallbacks; headings use `--heading-font-family`; (b) `heroLogoVisible` prop now gates nav logo in both full-page layouts; (c) `availableEventTypes` in `CreateEventPage` was not memoized — on every render a new array reference caused the event-type `useEffect` to fire and overwrite `theme_config`, making any customization in the Create flow disappear immediately. Fixed with `useMemo([eventTypes])`. Commit: `7bdab1c`.
18. **Draft mode preview — photos showing as black boxes (2026-04-27)** — `AuthenticatedImage` fetched photo bytes using `Authorization: Bearer <gallery_token>` but never forwarded `?preview=JWT`. Backend `verifyGalleryAccess` calls `isAdminPreview(req)` which reads `req.query.preview` — without it, `is_draft: false` was included in the WHERE clause, making every image return 404. Fix: read `?preview=` from `window.location.search` in `fetchWithAuth` and append to all image URLs. Non-preview pages have no preview param so live galleries are unaffected. Commit: `e1c8a35`.

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
| Guest feedback (likes/ratings) not registering in some templates | Resolved (2026-04-26) | Fixed: missing `require_name_email` in feedback-settings response + ASCII-only name regex + silent console.warn catch blocks. Commit c80e638. |
| Draft mode preview shows black image boxes | Resolved (2026-04-27) | AuthenticatedImage wasn't forwarding ?preview=JWT to image fetches — verifyGalleryAccess blocked draft events. Fixed in AuthenticatedImage.tsx. Commit e1c8a35. |

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
