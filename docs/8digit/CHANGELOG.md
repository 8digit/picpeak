# 8digit Creative — Fork Changelog

All changes made to our fork of PicPeak (github.com/8digit/picpeak), on top of upstream v2.6.2+.
Newest entries first. See `docs/8digit/handoffs/` for detailed session narratives.

---

## 2026-04-26 — Pivoted Guest Feedback CSV Export

### Features
- **Feedback CSV export now pivoted (one row per photo per guest)**
  - Previously: one row per feedback action (a photo with like + rating + comment appeared 3 times)
  - Now: one row per `(filename, guest_identifier)` pair with columns `filename`, `guest_name`, `guest_email`, `is_favorited`, `is_liked`, `star_rating`, `comment`
  - Hidden/moderated feedback excluded from export
  - Booleans render as `yes`/`no` instead of `true`/`false`/`''`

### Files Changed
- MOD: `backend/src/services/feedbackService.js` (exportEventFeedback — pivoted query + JS map)
- MOD: `backend/src/routes/adminFeedback.js` (convertToCSV — boolean and null handling)

---

## 2026-04-15 — Gallery Download Fix & Admin Remember Me

### Bug Fixes
- **Gallery "Download All" stalls on iOS Safari** (`0de319e`, `a52b49a`)
  - Root cause 1: `downloadAllPhotos` used `axios.get({ responseType: 'blob' })` which buffered the entire ZIP (1GB+) in the JS heap — exceeded Safari iOS per-tab memory cap (~300-500MB), tab silently stalled
  - Root cause 2: After switching to native `<a download>`, the click was inside a react-query `useMutation` wrapper — the microtask boundary broke Safari's trusted user gesture chain, silently blocking the download
  - Fix: Native `<a download>` click runs synchronously inside `handleDownloadAll` (no async boundary). JWT passed via `?token=` query param since native anchor clicks can't set Authorization headers. Backend `getGalleryTokenFromRequest` now accepts query param fallback.

- **Admin "Remember Me" causes login loop** (`d062865`)
  - Root cause: checkbox had local state but was never sent to backend; cookie always expired at 24h; stale sessionStorage made frontend think it was still authenticated → infinite form/loading loop
  - Fix: wired end-to-end — frontend sends `rememberMe` flag, backend issues 30-day JWT + matching 30-day cookie maxAge when checked, falls back to 24h otherwise

### Files Changed
- MOD: `frontend/src/components/gallery/GalleryView.tsx` (inline download anchor, removed mutation wrapper)
- MOD: `frontend/src/services/gallery.service.ts` (native download for downloadAllPhotos + downloadSelectedPhotos)
- MOD: `backend/src/utils/tokenUtils.js` (query param fallback in getGalleryTokenFromRequest, REMEMBER_ME_MAX_AGE_MS, setAdminAuthCookie rememberMe param)
- MOD: `backend/src/routes/auth.js` (accept rememberMe, 30d JWT/cookie)
- MOD: `frontend/src/services/auth.service.ts` (pass rememberMe in adminLogin)
- MOD: `frontend/src/pages/admin/AdminLoginPage.tsx` (wire rememberMe checkbox)

---

## 2026-03-27 — Editable Client Email & Draft Preview

### Features
- **Editable client email after event creation** (`15fe047`)
  - Added `customer_email` field to the event edit form (was only settable at creation time)
  - Allows creating events without client email, then adding it before publishing

- **Admin draft gallery preview** (`15fe047`)
  - New "Preview Gallery" button (yellow, with eye icon) on draft events
  - Generates a short-lived JWT preview token (1 hour) via `GET /admin/events/:id/preview-token`
  - Gallery middleware, resolve, info, and verify-token endpoints all respect `?preview=<token>` param
  - Admin can see exactly how the gallery will look before publishing — clients cannot

### Files Changed
- MOD: `backend/src/middleware/gallery.js` (isAdminPreview helper, draft bypass in all 3 query points)
- MOD: `backend/src/routes/adminEvents.js` (preview-token endpoint)
- MOD: `backend/src/routes/gallery.js` (preview support in resolve, verify-token, info)
- MOD: `backend/src/services/shareLinkService.js` (includeDrafts option in resolveShareIdentifier)
- MOD: `frontend/src/pages/admin/EventDetailsPage.tsx` (customer_email in edit form, Preview Gallery button)
- MOD: `frontend/src/services/events.service.ts` (getPreviewToken method)
- MOD: `frontend/src/services/gallery.service.ts` (pass preview param to all gallery API calls)

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
