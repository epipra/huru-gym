# Code Audit - openGym v1.4.0 (`b1cff63`) for Huru GYM
> 2026-10-10 | Read-only audit. Paths are relative to the repo root. This is the week-1 deliverable that 06 and 07 ask for.
> **Snapshot of upstream v1.4.0.** Added by Huru since: Stripe billing and the Pro gate (`api/huru/`), the no-media build flag (`VITE_EXERCISE_MEDIA=0`), the consent screen and account deletion. Still missing: e-mail, crash reporting.

## 1. What is there
| Area | Facts |
|------|-------|
| Frontend | React 19, Vite 8, Zustand 5, react-router 7, plain JS/JSX (no TypeScript). 22 views (`frontend/src/views/`), one store `src/store/useStore.js` (1,983 lines, persisted as `gym_state_v1`), 134 pure modules in `src/lib/`, most modals in `src/sheets.jsx` (3,411 lines). 19 UI languages; English strings are the i18n keys. |
| API | `api/server.js` (2,709 lines) on plain `node:http` with a flat `routes` table. 3 dependencies (`@simplewebauthn/server`, `undici`, `web-push`); Claude Agent SDK is optional. |
| Storage | `DATA_DIR/db.json` (users, credentials, push, invites) is rewritten on each save; one `state-<uid>.json` per user. Atomic writes via `durable.js`. |
| Sync | `GET /api/data` returns `{state, rev}`; `PUT /api/data` with `baseRev`; 409 plus a client merge (`lib/sync-merge.js`). The active workout stays on the device. |
| Auth | Passkeys (`RP_ID`/`ORIGIN`/`RP_NAME` env), optional password login (`PASSWORD_LOGIN`, scrypt), HMAC session cookie `__Host-gymsid`, phone pairing codes, `INVITE_ONLY`, `ALLOW_GUEST`, admins via `ADMIN_UIDS`/`FIRST_USER_ADMIN`. **No e-mail of any kind** (no verification, no recovery mail), no OIDC. |
| AI Coach | `api/coach/`: adapter interface `check()`/`invoke()`. Providers are Claude Agent SDK (CLI), Codex CLI, and a **plain Anthropic Messages API adapter** (`api/coach/core/adapters/anthropic.js`, default image, default model `claude-opus-5`). Consent is enforced server-side, the user accepts changes one by one, a snapshot allows revert, and quotas are `caps.perProfileDaily` (10) and `instanceDaily`. Kill switch `COACH_DISABLED`. |
| Media | Gym visual stills/clips in `catalogue/media/` (219 MB), baked into the web image, staged into mobile builds. The UI falls back to a dumbbell tile when files are missing (`Media.jsx:29-45`). |
| Telemetry / billing | Optional Umami at build time only. **No billing, no crash reporting.** |
| Tests / CI | 472 test files (frontend vitest 398, api node:test 71, mcp 3). GitHub workflow `test.yml` covers tests, build, locale checks, docker smoke. |
| Infra | docker-compose (api + web), helm/kubernetes with `replicas: 1`, ghcr image publishing, GitLab mirror. |

## 2. Brand footprint
There is no central app-name setting; `RP_NAME` is the only switch. About 6,400 matching lines, of which ~4,300 are `"textSource": "opengym"` in catalogue data (leave these alone).

- **Change (user-visible):** `index.html`, `public/manifest.json`, `public/sw.js` notification title, icons, `capacitor.config.json`, Android `applicationId`/`strings.xml`/launcher icons, iOS bundle id/`Info.plist`/AppIcon, view texts (Login, MobileOnboarding, Home, Settings, Plan, Passkeys, ServerSync, sheets), `lib/plan-share.js` footer, `fit-export.js`, `update.js` (checks upstream GitLab releases: repoint or disable), push message titles, coach prompt intro.
- **Approach:** do not edit 17 locale packs. Swap the brand at runtime in `t()` (`lib/i18n-core.js:78-88`) using a build-time `__APP_NAME__`; generate `index.html`/manifest values at build time.
- **Never change (would break data or devices):** service-worker cache names `opengym-*`, IndexedDB `opengym-media`, Capacitor file names `opengym-*.json`, share/backup formats `opengym_plan` / `opengym-backup.json`, Health Connect record ids `opengym-w-`/`opengym-bw-`, crypto labels `opengym-coach-v1` / `opengym-link:` / `opengym-reset:`, catalogue `textSource`, MCP env names. These are invisible to users.

## 3. Risks for a hosted service
1. **Single process, single writer.** In-memory challenges, rate limits, rest timers and the coach queue; `db.json` is rewritten synchronously on logins and pulls. Fine for beta on one VPS; it will not scale horizontally. Plan a storage adapter at around 1k active users, or adopt upstream's database release.
2. **Passkeys bound to `RP_ID`.** Moving from gym.epipra.com to hurugym.com later needs multi-origin support (WebAuthn Related Origin Requests + allowing several `ORIGIN`s in the CSRF check and verifier) or users re-register. Mitigation: enable `PASSWORD_LOGIN` in beta as a fallback.
3. **No e-mail recovery.** Lost passkey means an admin-issued reset code. Acceptable for an invite-only beta; a Phase B item before open sign-up.
4. **Admins can read all user data; nothing is encrypted at rest** (`SECURITY.md`). Disclose this in the Privacy Policy; use full-disk encryption on the VPS and encrypted backups.
5. **AGPL source link** in Settings must point to github.com/epipra/huru-gym.

## 4. Keep / refactor / replace
| Module | Verdict |
|--------|---------|
| Frontend views, store, lib, sync-merge | Keep untouched |
| Branding | Small brand module + `t()` hook + build-time name; leave locales |
| API routes, auth, passkeys, password, device-link | Keep; add a `huru` route module spread into `routes` (same pattern as coach) |
| JSON storage | Keep for beta; storage adapter later |
| Coach | Keep; use existing `anthropic` adapter in instance mode; gate Pro in `jobs.enqueue` + `/api/config`; set Haiku/Sonnet models and caps |
| Exercise media | Not shipped (`web/Dockerfile.huru`); add a no-media build flag to stop 404 requests |
| `update.js`, demo, Umami | Configure/disable |
| `website/`, docs, helm/k8s, ghcr publish, GitLab mirror | Replace with Huru equivalents or disable in our repo |
| Android/iOS shells | New ids (`com.adxfuel.hurugym`) and icons; keep internal file names |
| `mcp/` | Leave in repo, not deployed |
| E-mail, billing (Stripe), crash reporting | Add new |
