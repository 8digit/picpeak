# 2026-04-26 — Guest Feedback Silent Failures + Full Branding Fix

## Problem

Franco reported three user-facing bugs:
1. Likes and star ratings clicked by guests did nothing — no error, no visible feedback
2. Feedback not appearing in the admin Feedback Management panel
3. PicPeak logo appearing instead of custom logo on: (a) password-protected gallery login screen, (b) gallery hero image

## Root Cause Analysis

### Bug 1 & 2: Feedback Silent Failures (3 compounding issues)

**Issue A — Missing `require_name_email` in `gallery.js` feedback-settings route**

`backend/src/routes/gallery.js` has a duplicate of the `GET /:slug/feedback-settings` endpoint that also lives in `galleryFeedback.js`. Because Express processes routes in registration order, and `gallery.js` is registered first in `server.js` (line 488 vs 489), the `gallery.js` version always wins. This version was missing `require_name_email` in its response:

```js
// BEFORE (gallery.js ~line 1108) — missing field
res.json({
  feedback_enabled: settings.feedback_enabled || false,
  allow_ratings: settings.allow_ratings,
  ...
  // require_name_email was absent
});
```

Without `require_name_email`, the frontend never showed the identity modal. If the event had "require name/email" enabled, the backend then rejected the submission with 400 because the fields were missing.

**Issue B — ASCII-only name validation regex**

`feedbackValidation.js` line 161 used `/^[a-zA-Z0-9\s\-'.]+$/` which rejected any accented character (José, María, etc.). Changed to `/^[\p{L}\p{N}\s\-'.]+$/u` (Unicode-aware).

**Issue C — `console.warn` hiding all errors**

All three catch blocks in `GalleryPremiumLayout` and `GalleryStoryLayout` used `console.warn(err)` — invisible to guests. Replaced with `toast.error(err?.response?.data?.error || t('gallery.feedback.submitError'))`.

### Bug 3: PicPeak Logo Appearing Instead of Custom Logo

Five separate hardcoded fallbacks across 3 files:

| File | Location | Fallback |
|------|----------|---------|
| `GalleryPage.tsx` | Password login screen | `<img src="/picpeak-logo-transparent.png">` |
| `HeroHeader.tsx` | Top logo position | `src={eventLogo ? ... : '/picpeak-logo-transparent.png'}` |
| `HeroHeader.tsx` | Center logo position | same pattern |
| `HeroHeader.tsx` | Bottom logo position | same pattern |
| `GalleryLayout.tsx` | Standard gallery header | same pattern |
| `GalleryLayout.tsx` | Standard gallery hero section | same pattern |

Also in the same session (earlier): `GalleryPremiumLayout` and `GalleryStoryLayout` nav bars were showing text initials instead of the custom logo because `eventLogo` was never destructured from props (commit `58ca5a3`).

## Fixes

### Feedback fixes — commit `c80e638`
- Added `require_name_email: settings.require_name_email` to `gallery.js` feedback-settings response
- Changed name regex to `/^[\p{L}\p{N}\s\-'.]+$/u` in `feedbackValidation.js`
- Replaced `console.warn` with `toast.error` in catch blocks of both Premium and Story layouts

### Branding fixes — commits `58ca5a3` + `d425175`
- `GalleryPage.tsx`: removed PicPeak `<img>`; shows company name text when no logo configured
- `HeroHeader.tsx`: all 3 logo `<div>` blocks gated on `!!eventLogo` — no fallback image
- `GalleryLayout.tsx` header: `<img>` only renders when `brandingSettings?.logo_url` is set
- `GalleryLayout.tsx` hero: same; fixed `|| 'PicPeak'` fallback text

## Key Lessons

- **Express route registration order is silent.** Duplicate routes across different router files can shadow each other. The `gallery.js` feedback-settings route was an unmaintained shadow of the real one in `galleryFeedback.js`. Future: consolidate or annotate.
- **`console.warn` in catch blocks is a silent failure pattern.** Optimistic UI + silent error = user sees the action appear to work but the server rejected it. Always use `toast.error` in guest-facing catch blocks.
- **PicPeak should never appear on client-facing surfaces.** Any new component that renders a logo must gate the entire `<img>` element on the custom logo URL being truthy, not use PicPeak as a fallback.

## Commits

| Hash | Description |
|------|-------------|
| `58ca5a3` | fix(branding): show custom logo in Premium & Story layout nav bars |
| `c80e638` | fix(feedback): resolve silent feedback submission failures |
| `d425175` | fix(branding): remove PicPeak logo fallback from all gallery surfaces |
