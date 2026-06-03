# 2026-06-03 — Archive Restore Fails (>2 GiB) + Backend Healthcheck

## Trigger
Franco tried to **Restore** the "ZUHEILY BUSINESS TEAM" archived gallery (2.44 GB) from Admin → Archives and got a generic **"Something went wrong"** toast. He asked to investigate a suspected `read-only` problem.

## TL;DR
- The `read-only` hypothesis was **wrong**. Disk had 25 GB free, no read-only mounts.
- Real cause: `adm-zip` loads the **entire ZIP into a Node Buffer**, and the 2.44 GB archive exceeded Node's hard **2 GiB Buffer/file limit** → `RangeError [ERR_FS_FILE_TOO_LARGE]`.
- Separately discovered the backend container was `unhealthy` for 6+ days because the healthcheck used `curl`, which isn't installed in the Alpine image (purely cosmetic — app was fine).
- Fixed both.

## Investigation (what was actually checked)

### 1. The "Something went wrong" toast is generic
`frontend/src/pages/admin/ArchivesPage.tsx:87-88` — the restore mutation's `onError` always shows `t('errors.somethingWentWrong')`, discarding the backend's real error message. So the UI never reveals the cause. (Left as an open follow-up.)

### 2. No `read-only` concept in code
Grepped `read-only|readonly|read_only|EROFS|RDONLY` across `backend/` — only match is the "viewer" role description. No `:ro` volume in `docker-compose.production.yml` (`${APP_STORAGE}:/app/storage` is writable).

### 3. Live server (SSH, read-only commands via `~/.ssh/picpeak-deploy`)
- `df -h`: `/dev/vda1 49G, 24G used, 25G free (49%)` — disk fine.
- `mount | grep ro`: only snap squashfs + systemd creds (normal). No app filesystem read-only.
- **Backend log** revealed the real error:
  ```
  Archive extraction error: RangeError [ERR_FS_FILE_TOO_LARGE]:
  File size (2621888490) is greater than 2 GiB
      at tryCreateBuffer (node:fs:410:13)
      at Object.readFileSync (node:fs:463:14)
      at new module.exports (/app/node_modules/adm-zip/adm-zip.js:60:37)
      at /app/src/routes/adminArchives.js:168:19
    code: 'ERR_FS_FILE_TOO_LARGE'
  ```
- 2,621,888,490 bytes = 2.442 GiB; Node limit = 2,147,483,647. Over by 0.44 GiB.

### 4. Backend `unhealthy` diagnosis
`docker inspect picpeak-backend --format '{{json .State.Health}}'` →
```
OCI runtime exec failed: exec: "curl": executable file not found in $PATH
FailingStreak: 17897
```
`curl` is not in the image (Dockerfile installs only `dumb-init` + `postgresql-client`). `/health` itself returns 200 `{status:ok}` (tested with both node and wget inside the container). So `unhealthy` was a false alarm.

## Validation before changing anything (Franco asked for 100% accuracy + side-effect check)
- `adm-zip` / `AdmZip` used in **exactly one place**: `adminArchives.js` (require + line 168). Nothing else imports it.
- `restoreService.js` (system backup restore) uses **tar.gz + S3**, not adm-zip — untouched by this change.
- `secureImageService.js:296` `.extract()` is **Sharp** image cropping, not zip.
- `/health` (`server.js:465`) does `db.raw('SELECT 1')` → 200 ok / 503 on DB failure.
- Base `docker-compose.yml:51` **already** uses the correct `wget --quiet --tries=1 --spider`; only production compose had regressed to `curl`.
- `deploy.yml:39` gates on its own **host-level** `curl -sf http://localhost:3001/health`, so the broken container healthcheck never blocked deploys. Nothing uses `depends_on: condition: service_healthy` against the backend.
- Verified in the live container: `wget --quiet --tries=1 --spider http://127.0.0.1:3000/health` → `exit=0` (BusyBox v1.37.0 supports `--spider`).

## Changes
- `backend/src/routes/adminArchives.js`: replaced `adm-zip` with `node-stream-zip` streaming extraction.
  - `new StreamZip.async({ file })` → `await zip.entries()` → `await zip.extract(null, eventDir)` → `await zip.close()`.
  - Re-import logic (photos, categories, sizes) unchanged; only `entry.entryName` → `entry.name`.
  - `node-stream-zip` streams each entry to disk — no full-file Buffer, no 2 GiB limit.
- `backend/package.json` / `package-lock.json`: − `adm-zip`, + `node-stream-zip ^1.15.0`.
- `docker-compose.production.yml`: backend healthcheck `curl -f` → `wget --quiet --tries=1 --spider http://127.0.0.1:3000/health`. Frontend/postgres/redis healthchecks untouched.

## Local verification
- `node --check src/routes/adminArchives.js` → OK.
- `node-stream-zip` async API confirmed (`entries`, `extract`, `close` all functions).
- `require('adm-zip')` → `MODULE_NOT_FOUND` (cleanly removed).

## Deploy
Committed to `main` (commit `d91e99d`) → `docker-build.yml` rebuilds backend image → `deploy.yml` pulls + `up -d`.

## Post-deploy verification (fill in)
- [ ] `docker inspect picpeak-backend` shows `healthy`.
- [ ] Restore "ZUHEILY BUSINESS TEAM" from admin → succeeds, no `ERR_FS_FILE_TOO_LARGE` in logs, photos re-imported.

## Follow-ups / known-open
- Frontend restore `onError` swallows the backend error message (`ArchivesPage.tsx:87`) — surface the real error for future debuggability.
- Admin password reset-on-restart issue still open (unrelated).
