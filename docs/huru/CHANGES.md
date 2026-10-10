# Huru GYM - modifications to openGym

Huru GYM is a modified version of [openGym](https://github.com/DuarteSantos8/openGym) by Duarte Santos,
licensed under the GNU AGPL v3.0 or later. This file is the notice required by AGPL section 5(a).

Modified by AdxFuel LLC (30 N Gould St Ste R, Sheridan, WY 82801, US). Source: https://github.com/epipra/huru-gym

| Date | Base | Change |
|------|------|--------|
| 2026-10-10 | openGym v1.4.0 (`b1cff63`) | Fork created. Brand layer (`frontend/src/lib/brand.js`, `brand/huru/`) that renames the product at build time without touching locale packs; option to build without the Gym visual exercise media (`VITE_EXERCISE_MEDIA=0`); media-free web image (`web/Dockerfile.huru`); single-server deployment with Caddy (`deploy/`); planning documents (`docs/huru/`). |
