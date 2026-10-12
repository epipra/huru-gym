# Huru GYM - modifications to openGym

Huru GYM is a modified version of [openGym](https://github.com/DuarteSantos8/openGym) by Duarte Santos,
licensed under the GNU AGPL v3.0 or later. This file is the notice required by AGPL section 5(a).

Modified by AdxFuel LLC (30 N Gould St Ste R, Sheridan, WY 82801, US). Source: https://github.com/epipra/huru-gym

| Date | Base | Change |
|------|------|--------|
| 2026-10-10 | openGym v1.4.0 (`b1cff63`) | Fork created. Brand layer (`frontend/src/lib/brand.js`, `brand/huru/`) that renames the product at build time without touching locale packs; option to build without the Gym visual exercise media (`VITE_EXERCISE_MEDIA=0`); media-free web image (`web/Dockerfile.huru`); single-server deployment with Caddy (`deploy/`); planning documents (`docs/huru/`). |
| 2026-10-10 | openGym v1.4.0 | Cloudflare Tunnel deployment mode. Huru GYM Pro: entitlement store and Stripe checkout, billing portal and webhook (`api/huru/`), a gate on Coach jobs (`setEnqueueGate` in `api/coach/jobs.js`, error code `pro` in `api/coach/routes.js`), Pro screen, Settings row and Coach gate in the app (`frontend/src/components/HuruPro.jsx`). |
| 2026-10-11 | openGym v1.4.0 | Consent screen: explicit, versioned agreement to health-data processing and the Terms before the app can be used (`frontend/src/components/HuruAccount.jsx`, `api/huru/consent-store.js`). Self-service account deletion with re-authentication, Stripe cancellation and a full device wipe (`POST /api/huru/account/delete`, `accountDeleted` in `frontend/src/store/useStore.js`); the admin delete's steps moved into a shared `purgeUser()` in `api/server.js`. |
| 2026-10-12 | openGym v1.4.1 (`464355e`) | Merged upstream v1.4.1 (13 bug-fix commits). One conflict, in `frontend/src/components/Media.jsx`: kept upstream's in-memory clip loading and gated it on `EXERCISE_MEDIA`, so a no-media build loads nothing. |
