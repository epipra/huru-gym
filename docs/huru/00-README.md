# Huru GYM - Production Development Docs
A privacy-first workout and body-weight tracker for web, iOS and Android, built by evolving the open-source openGym codebase into a hosted, synced, store-ready product under the Huru GYM brand.

## Documents
1. `01-PRD.md` - what and why
2. `02-TRD.md` - tech stack and architecture
3. `03-APP-FLOW.md` - screens and navigation
4. `04-UIUX-DESIGN-BRIEF.md` - design system
5. `05-BACKEND-SCHEMA.md` - data model
6. `06-IMPLEMENTATION-PLAN.md` - full-team reference plan, superseded by 10
7. `07-FORK-AND-COMPLIANCE.md` - license, rebrand and store checklist (read first)
8. `08-AUDIT-AND-INPUTS.md` - audit of these docs against the real upstream code
9. `09-OUTREACH-DRAFTS.md` - emails to Gym visual and the upstream author (private, not in the repo: `D:\DevOps\Huru GYM\docs\09-OUTREACH-DRAFTS.md`)
10. `10-DECISIONS-AND-SOLO-PLAN.md` - **binding decisions and the solo, revenue-first plan; overrides 00-07 where they conflict**
11. `11-CODE-AUDIT.md` - code audit of openGym v1.4.0 (what Huru builds on)
12. `12-PLAY-CONSOLE.md` - Google Play Console answers, data safety and store listing
13. `CHANGES.md` - every change Huru makes to upstream files

Current status, findings and the task tracker live in the "Huru GYM - Status & Audit Report" doc; deployment steps in `deploy/RUNBOOK.md`; every change to upstream in `docs/huru/CHANGES.md`.

## Assumptions
- Base is github.com/DuarteSantos8/openGym **v1.4.1** (`464355e`, merged 2026-10-12; forked at v1.4.0 `b1cff63`), tracked as `upstream`; our repo is github.com/epipra/huru-gym. (alexpcosta/opengym is 1,673 commits behind and is not used.)
- Hosted product with free core and a paid Pro tier (AI Coach and extras).
- Publisher: AdxFuel LLC, 30 N Gould St Ste R, Sheridan, WY 82801, US. Beta domain gym.adxfuel.com; production hurugym.com later. Trademark still to be checked.
- Exercise media must be licensed or replaced before launch.
- Stack (beta): upstream as-is - React + Vite, Capacitor, Node.js API with JSON storage, Docker Compose, AI Coach on the OpenAI API (upstream HTTPS adapter, key in Admin -> Coach) - plus Huru modules for brand, Pro billing (Stripe), consent and account deletion. Runs on the owner's PC behind Cloudflare Tunnel until a VPS is rented before paid launch. Fastify/Postgres/AWS from 02 are the scale-up target (see 10).

## Blockers to clear before public launch
1. Commercial license or replacement for the exercise GIFs and images.
2. Counsel confirmation of the AGPL app-store permission for a derivative.
3. Privacy Policy and Terms: published and linked in the app (gym.adxfuel.com/legal/); still needs lawyer review and accepted DPAs with the processors.
4. Trademark and domain check for "Huru GYM".
5. Hosting moved off the owner's PC to a VPS before Stripe live mode (encrypted daily backups to Cloudflare R2 are done; only the VPS remains).

## How to use with an AI coding tool
Paste this when starting a session in the `huru-gym` repo:

"Read docs/huru/10-DECISIONS-AND-SOLO-PLAN.md first, then 11-CODE-AUDIT.md and deploy/RUNBOOK.md. Huru GYM tracks upstream openGym (remote `upstream`): keep edits to upstream files tiny and put Huru code in new files (`api/huru/`, `frontend/src/lib/brand.js`, `frontend/src/lib/huru-pro.js`, `frontend/src/components/Huru*.jsx`, `deploy/`). Never edit locale packs or `opengym-*` internal identifiers, never ship the Gym visual media, never remove upstream notices. Add every change to docs/huru/CHANGES.md. Linux CI is the reference; some upstream tests fail only on Windows."

## Build order
Phases from 10: A fork and beta (done, except the VPS) -> B Pro on the web (done in Stripe test mode; live switch pending) -> C Android app (AAB 1.4.1-huru.4 built; internal test upload next) -> D production on hurugym.com with iOS. Merge each upstream release as it ships.
