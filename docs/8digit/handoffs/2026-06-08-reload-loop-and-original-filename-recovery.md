# 2026-06-08 — Restored-Gallery Reload Loop + original_filename Recovery

Continuation of the 2026-06-03 ZUHEILY archive restore work. Same gallery (event 6,
slug `other-zuheily-business-team-c430be`). Two separate problems surfaced, both caused
by the restore being lossy.

## Problem 1 — Client's gallery stuck in a reload loop (mobile)

### Symptom
The client opened the gallery on her iPhone; it loaded, but the moment she scrolled it
auto-reloaded, in a loop. Franco had seen similar behavior at login on other occasions.

### Investigation (read-only)
- The app's own `window.location.reload()` calls (`GalleryView.tsx:684,862`) are only in the
  photo-upload `onUploadComplete` handlers — not scroll-triggered.
- `config/api.ts` 401 interceptor explicitly does NOT redirect/reload on `/gallery/` pages
  (guards against redirect loops). `ErrorBoundary` reloads are button-click only.
- So the reload is the **browser** reloading, not the app → iOS Safari memory-pressure tab reload.

### Root cause
The restore set `thumbnail_path = NULL` for all 1341 photos (event 6 was the only event with
0 thumbnails — every other event had 100%). The gallery list endpoint gates `thumbnail_url` on
`thumbnail_path` (`gallery.js:417`), so it returned null, and the grid fell back to
`photo.url` = full-res (`PhotoGrid.tsx:266`). The `/photo/:id` route sends the original file
unresized. The originals are **2561×3840 (~9.8 MP) → ~38 MB decoded RAM each**. On an iPhone,
scrolling decoded enough full-res images to blow Safari's per-tab memory ceiling → WebKit
reloaded the tab → loop.

### Fix (operational, no deploy)
Regenerated thumbnails for event 6 via `ensureThumbnail()` (which uses the smart
`resolvePhotoFilePath` resolver — the built-in `/regenerate` endpoint and
`scripts/regenerate-thumbnails.js` would NOT work for event 6, see Problem-2 path note).
Ran a detached batch in the backend container over all 1341 photos:
`docker exec -d picpeak-backend node -e '...ensureThumbnail per photo...' > /app/logs/thumb-regen-6.log`
Result: 1341/1341 generated (21 KB each), 0 errors, `thumbnail_path` persisted. Loop gone.

## Problem 2 — original_filename lost on restore

### Symptom
Feedback CSV export for event 6 showed `original_filename` = gallery filename
(`ZUHEILY_..._NNNN.jpg`) instead of the true camera name (`_5CI....jpg`). Worked correctly on
non-restored galleries (e.g. event 9 → `_5CI5766.jpg`).

### Root cause
- Restore hardcoded `original_filename: filename` (`adminArchives.js`, pre-existing).
- The archive ZIP never stored a photos manifest (only images + feedback files). The feedback
  CSV in the ZIP was from 2026-05-22; the `original_filename` feedback-export feature shipped
  2026-05-28 (commit `430885c`) — so even that had no original_filename column.
- No DB backups ever ran (`backup_runs` empty; nothing on disk; S3 not configured).
- JPEG XMP/EXIF/IPTC did not contain the original raw filename.
- → The true names were not recoverable from any server-side artifact. Only Franco's local
  originals folder had them.

### Path-format note (second latent restore bug)
Restore stores `path = events/active/<slug>/<file>` (relative to storage root), while normal
uploads store `path = <slug>/<file>` (relative to events/active). So the built-in thumbnail
regenerators that do `path.join(storage, 'events/active', photo.path)` double the prefix and
fail for restored events. `ensureThumbnail`/the `/photo` route use `resolvePhotoFilePath`,
which handles both — that's why thumbnail regen via ensureThumbnail worked. (Not fixed this
session; worth normalizing in a future pass.)

### Recovery (operational) — SHA-256 content matching
Upload does not re-encode the full image (`photoProcessor.js:204` just moves the file), so the
gallery file is byte-identical to what Franco uploaded. Approach (no folder upload needed):
1. Franco ran `shasum -a 256` over his originals folder → `hash, _5CI….jpg` (1179 files).
2. Computed SHA-256 of all event-6 gallery files on the server (1341).
3. Joined on hash → exact gallery↔original mapping.
Result: **1179/1179 of his originals matched** (162 gallery files unmatched = retouched
`edited-and-retouched` + 1 `pre-edit-preview`, not in his folder). Patched
`photos.original_filename` for the 1179 in the DB (transactional; before=0 changed, after=1179).
Backup of prior values: `zuheily-event6-original_filename-BACKUP.csv`.

Client selection (303 likes): **297 recovered**, 6 unmapped (retouched/preview versions);
deliverable `zuheily-seleccion-con-nombre-original.csv` written for Franco's tagging workflow.

### Code fix (commit `eb018aa`) — prevent recurrence
- `archiveService.archiveEvent`: write `photos_manifest.json` (filename, original_filename,
  type, uploaded_at, category) into the archive ZIP. Non-fatal on error.
- `adminArchives` restore: read the manifest when present and use the real original_filename;
  fall back to gallery filename for older archives without a manifest (backward compatible).
Makes archive→restore lossless for original_filename going forward. The old ZUHEILY ZIP has no
manifest, so its recovery had to be done manually by hash (above).

## Open / follow-ups
- The 6 selected retouched/preview photos still have gallery-name original_filename (Franco
  chose to leave them; recoverable later via a retouched-folder hash pass or perceptual match).
- Restore's `path` format differs from uploads (doubled `events/active/` prefix) — normalize
  in a future pass so the built-in thumbnail regenerators work on restored events too.
- Frontend restore `onError` still swallows the backend error (generic toast) — earlier note.
