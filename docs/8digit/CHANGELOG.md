# 8digit Creative — Fork Changelog

All changes made to our fork of PicPeak (github.com/8digit/picpeak), on top of upstream v2.6.2+.
Newest entries first. See `docs/8digit/handoffs/` for detailed session narratives.

---

## 2026-04-27 — Draft Preview Black Images

### Bug Fixes
- **Admin draft gallery preview showed black image boxes (commit e1c8a35)**
  - Root cause: `AuthenticatedImage` fetched photo bytes using `Authorization: Bearer <gallery_token>` but never appended `?preview=JWT` to the image URL. The backend `verifyGalleryAccess` middleware calls `isAdminPreview(req)` which reads `req.query.preview` — without the param, it returned false, so `is_draft: false` was included in the WHERE clause, making every photo/thumbnail/hero image return 404. Gallery metadata (photo count, categories) loaded fine because `gallery.service.ts` uses Axios with `getPreviewParam()` which does forward the preview token — only `AuthenticatedImage` was missing it.
  - Fix: In `AuthenticatedImage.fetchWithAuth`, read `?preview=` from `window.location.search` (same source as `getPreviewParam()` in `gallery.service.ts`) and append it to the fetch URL. Non-preview gallery pages have no preview param in the URL, so live galleries are unaffected.

### Files Changed
- MOD: `frontend/src/components/common/AuthenticatedImage.tsx` (forward ?preview= param in fetchWithAuth)

---

## 2026-04-27 — Theme Customization Broken in All Layouts

### Bug Fixes
- **Gallery Story and Gallery Premium layouts ignored all ThemeContext colors/fonts (commit 7bdab1c)**
  - Root cause: Both CSS files had hardcoded color schemes (Story: `#0d0d0d`/`#c9a961` dark cinematic; Premium: `#ffffff`/`#18181b` light). Neither referenced ThemeContext CSS variables (`--color-background`, `--color-text`, `--color-primary`).
  - Fix (Story): `--story-background`, `--story-foreground`, `--story-primary`, `--story-primary-foreground` now use `var(--color-background, ...)` etc. as their values. All 4 Playfair Display occurrences use `var(--heading-font-family, 'Playfair Display')`. Base `font-family` uses `var(--font-family, 'Inter')`.
  - Fix (Premium): Introduced `--premium-bg`, `--premium-fg`, `--premium-accent` CSS variables bridging ThemeContext vars. Root element, nav category active states, download button, and checkbox use these variables. Hero title and nav title use `var(--heading-font-family, 'Playfair Display')`.
- **heroLogoVisible not respected in Story/Premium nav (commit 7bdab1c)**
  - Root cause: Both full-page layouts showed the event logo in their nav bars regardless of the `heroLogoVisible` event setting.
  - Fix: Nav logo in both layouts now gated on `heroLogoVisible && eventLogo`.
- **Theme customization wiped on every keypress in CreateEventPage (commit 7bdab1c)**
  - Root cause: `availableEventTypes` was computed inline on every render (not memoized). Since it's a dependency of the event-type `useEffect`, that effect fired on every render — overwriting `theme_preset` and `theme_config` back to the event-type default. This made every color picker drag, input change, or any state update destroy the user's theme selections instantly.
  - Fix: `availableEventTypes` wrapped in `useMemo([eventTypes])`. Effect now only fires when the user actually changes the event type or when the API data first loads.

### Files Changed
- MOD: `frontend/src/components/gallery/layouts/GalleryStoryLayout.css` (CSS variable bridging to ThemeContext, font vars)
- MOD: `frontend/src/components/gallery/layouts/GalleryStoryLayout.tsx` (heroLogoVisible prop + nav logo gate)
- MOD: `frontend/src/components/gallery/layouts/GalleryPremiumLayout.css` (--premium-* CSS variables, font vars)
- MOD: `frontend/src/components/gallery/layouts/GalleryPremiumLayout.tsx` (heroLogoVisible prop + nav logo gate)
- MOD: `frontend/src/pages/admin/CreateEventPage.tsx` (useMemo for availableEventTypes)

---

## 2026-04-26 (night) — Feedback Silent Failures + Full Branding Fix

### Bug Fixes
- **Guest likes/ratings not registering — 3 compounding bugs fixed (commit c80e638)**
  - `GET /:slug/feedback-settings` in `backend/src/routes/gallery.js` was missing `require_name_email` in its response. This route is registered before the one in `galleryFeedback.js` (server.js line 488 vs 489), so it takes precedence. Missing field → identity modal never shown → API rejected submissions with 400.
  - Name validation regex in `feedbackValidation.js` was ASCII-only (`[a-zA-Z0-9...]`). Changed to Unicode-aware (`[\p{L}\p{N}...]` with `/u` flag). Accented names (José, María, etc.) were being silently rejected.
  - All catch blocks in `GalleryPremiumLayout` and `GalleryStoryLayout` used `console.warn` — errors were invisible to users. Replaced with `toast.error(err?.response?.data?.error || t('gallery.feedback.submitError'))`.
- **PicPeak logo hardcoded as fallback in 5 locations — all removed (commit d425175)**
  - `GalleryPage.tsx` password login screen: removed PicPeak `<img>` fallback; shows company name text instead when no logo configured.
  - `HeroHeader.tsx` (top/center/bottom positions): all three logo `<div>` blocks now gated on `!!eventLogo`. When no custom logo, nothing renders.
  - `GalleryLayout.tsx` header: `<img>` now only renders when `brandingSettings?.logo_url` is set.
  - `GalleryLayout.tsx` hero section: same — no logo_url → no `<img>`. Also fixed `|| 'PicPeak'` fallback text.

### Files Changed
- MOD: `backend/src/routes/gallery.js` (added require_name_email to feedback-settings response)
- MOD: `backend/src/utils/feedbackValidation.js` (Unicode-aware name regex)
- MOD: `frontend/src/components/gallery/layouts/GalleryPremiumLayout.tsx` (toast.error in catch blocks)
- MOD: `frontend/src/components/gallery/layouts/GalleryStoryLayout.tsx` (toast.error in catch blocks)
- MOD: `frontend/src/pages/GalleryPage.tsx` (remove PicPeak fallback on password screen)
- MOD: `frontend/src/components/gallery/HeroHeader.tsx` (remove PicPeak fallback, gate on !!eventLogo)
- MOD: `frontend/src/components/gallery/GalleryLayout.tsx` (remove PicPeak fallback in header + hero)

---

## 2026-04-26 (evening) — Gallery Branding in Premium & Story Layouts

### Bug Fixes
- **Custom logo not shown in Premium/Story gallery nav bars**
  - Root cause: `GalleryPremiumLayout` and `GalleryStoryLayout` did not destructure `eventLogo` from `BaseGalleryLayoutProps`. The prop was being passed through `layoutProps` in `PhotoGridWithLayouts` but silently dropped.
  - Fix: Both layouts now destructure `eventLogo`. When set, nav renders `<img>` instead of text initials. Logo uses `filter: brightness(0) invert(1)` for visibility on dark nav backgrounds.
- **Premium layout footer always showed "Powered by PicPeak"**
  - Fix: Footer respects `hide_powered_by` branding setting. Copyright line uses `company_name` when configured.
- **`hidePoweredBy` and `companyName` not reachable by full-page layouts**
  - Fix: Added both props to `BaseGalleryLayoutProps`, `PhotoGridWithLayouts`, and both branches of `GalleryView` (full-page and regular).

### Files Changed
- MOD: `frontend/src/components/gallery/layouts/BaseGalleryLayout.tsx` (added hidePoweredBy, companyName)
- MOD: `frontend/src/components/gallery/PhotoGridWithLayouts.tsx` (accept + pass new props in layoutProps)
- MOD: `frontend/src/components/gallery/GalleryView.tsx` (pass hidePoweredBy + companyName in both render paths)
- MOD: `frontend/src/components/gallery/layouts/GalleryPremiumLayout.tsx` (use eventLogo in nav, hidePoweredBy + companyName in footer)
- MOD: `frontend/src/components/gallery/layouts/GalleryPremiumLayout.css` (.gallery-premium-nav-logo-img)
- MOD: `frontend/src/components/gallery/layouts/GalleryStoryLayout.tsx` (use eventLogo in nav)
- MOD: `frontend/src/components/gallery/layouts/GalleryStoryLayout.css` (.story-nav-logo-img)

---

## 2026-04-26 — In-App Confirmation Dialogs

### Bug Fixes
- **`window.confirm()` silently suppressed by browsers, breaking critical buttons**
  - Root cause: 17 admin actions (Publish, Delete Event, Delete Photo, Archive, etc.) used native `window.confirm()`. Browsers can permanently silence the dialog if a user ever clicks "Prevent this page from creating additional dialogs" — clicking the button then does nothing visibly.
  - Fix: new `ConfirmDialogProvider` + `useConfirm()` hook in `components/common/ConfirmDialog.tsx`. Promise-based API: `if (await confirm({...})) { ... }`. Mounted at `App.tsx`. All 17 native confirms across 11 files migrated.
  - Bonus: dialogs now respect dark mode, support i18n, support Esc/Enter, and have a visual `danger`/`warning`/`primary` variant for destructive actions.

### Files Changed
- NEW: `frontend/src/components/common/ConfirmDialog.tsx`
- MOD: `frontend/src/components/common/index.ts` (exports)
- MOD: `frontend/src/App.tsx` (mount provider)
- MOD: 11 admin files migrated to `useConfirm()`: `EventDetailsPage.tsx` (×3), `EventsListPage.tsx`, `ArchivesPage.tsx` (×2), `EventFeedbackPage.tsx`, `CMSPage.tsx`, `AdminPhotoGrid.tsx` (×2), `AdminPhotoViewer.tsx` (×2), `FeedbackModerationPanel.tsx`, `CssTemplateEditor.tsx`, `CategoryManager.tsx`, `EventCategoryManager.tsx`, `WordFilterManager.tsx`

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
