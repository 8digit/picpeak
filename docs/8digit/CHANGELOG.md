# 8digit Creative — Fork Changelog

All changes made to our fork of PicPeak (github.com/8digit/picpeak), on top of upstream v2.6.2.

---

## 2026-03-26 — Initial Customization & Infrastructure

### Features
- **Draft mode for events** (`1357f6e`)
  - New migration `074_add_is_draft_column.js` — adds `is_draft` boolean to events table
  - Events are created as drafts by default; client email is NOT sent until publish
  - New endpoint `POST /admin/events/:id/publish` — sets is_draft=false and queues email
  - Draft galleries blocked from public access (shareLinkService, gallery middleware, gallery routes)
  - Frontend: yellow "Draft" badge, draft banner, "Publish & Notify Client" button, "Drafts" filter tab
  - i18n keys added for en, de, ru

- **Share link domain resolution** (`1357f6e`)
  - New util `backend/src/utils/frontendUrl.js` with `getFrontendBaseUrl()`
  - Checks `FRONTEND_URL` env var, falls back to `general_site_url` DB setting
  - Used in shareLinkService and emailProcessor

- **Branding inheritance on event creation** (`1357f6e`)
  - `getBrandingDefaults()` helper fetches logo settings from app_settings
  - Event creation uses branding defaults as fallbacks for hero logo config

- **Admin header customization** (`1357f6e`, `43ae305`)
  - AdminHeader reads company_name, logo_url, logo_display_mode from branding API
  - Uses `formatBrandingSettings()` to strip `branding_` prefix from API keys
  - Falls back to PicPeak defaults when no custom branding configured

- **Webhook email transport for n8n** (`a1ef485`)
  - Added before the main customization session

### Bug Fixes
- **Docker registry mismatch** (`9add85a`)
  - Changed `docker-compose.production.yml` image refs from `ghcr.io/the-luap/picpeak/...:stable` to `ghcr.io/8digit/picpeak/...:main`
  - Root cause: code changes never reached production because images were pulled from upstream registry

- **Deploy race condition** (`43ae305`)
  - Changed `deploy.yml` trigger from `push` to `workflow_run` so deploy waits for Docker build
  - Added condition: only deploy if build succeeded

- **Share links missing full domain** (`abc02d1`)
  - Used `window.location.origin` to prepend domain in EventDetailsPage and EventsListPage

- **Email template branding** (`127cc76`)
  - Use theme primaryColor instead of hardcoded PicPeak green (#5C8762)
  - Build logo URL with frontendUrl (public) instead of apiUrl (localhost)
  - Prepend frontendUrl to gallery_link so email links include full domain

### Infrastructure
- **CI/CD pipeline** (`44db20a`)
  - GitHub Actions: `docker-build.yml` (build + push to GHCR) and `deploy.yml` (SSH deploy)
  - Bootstrap script: `scripts/bootstrap-droplet.sh`

### Files Changed (from upstream base)
- NEW: `backend/migrations/core/074_add_is_draft_column.js`
- NEW: `backend/src/utils/frontendUrl.js`
- NEW: `.github/workflows/deploy.yml`
- NEW: `.github/workflows/docker-build.yml`
- NEW: `scripts/bootstrap-droplet.sh`
- MOD: `backend/src/routes/adminEvents.js`
- MOD: `backend/src/services/shareLinkService.js`
- MOD: `backend/src/middleware/gallery.js`
- MOD: `backend/src/routes/gallery.js`
- MOD: `backend/src/services/emailProcessor.js`
- MOD: `frontend/src/types/index.ts`
- MOD: `frontend/src/services/events.service.ts`
- MOD: `frontend/src/pages/admin/EventDetailsPage.tsx`
- MOD: `frontend/src/pages/admin/EventsListPage.tsx`
- MOD: `frontend/src/components/admin/AdminHeader.tsx`
- MOD: `frontend/src/i18n/locales/en.json`
- MOD: `frontend/src/i18n/locales/de.json`
- MOD: `frontend/src/i18n/locales/ru.json`
- MOD: `docker-compose.production.yml`
