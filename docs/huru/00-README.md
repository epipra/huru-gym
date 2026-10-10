# Huru GYM - Production Development Docs
A privacy-first workout and body-weight tracker for web, iOS and Android, built by evolving the open-source openGym codebase into a hosted, synced, store-ready product under the Huru GYM brand.

## Documents
1. `01-PRD.md` - what and why
2. `02-TRD.md` - tech stack and architecture
3. `03-APP-FLOW.md` - screens and navigation
4. `04-UIUX-DESIGN-BRIEF.md` - design system
5. `05-BACKEND-SCHEMA.md` - data model
6. `06-IMPLEMENTATION-PLAN.md` - phases and timeline (23 weeks)
7. `07-FORK-AND-COMPLIANCE.md` - license, rebrand and store checklist (read first)
8. `08-AUDIT-AND-INPUTS.md` - audit of these docs against the real upstream code
9. `09-OUTREACH-DRAFTS.md` - emails to Gym visual and the upstream author
10. `10-DECISIONS-AND-SOLO-PLAN.md` - **binding decisions and the solo, revenue-first plan; overrides 00-07 where they conflict**

## Assumptions
- Base is github.com/DuarteSantos8/openGym **v1.4.0** (`b1cff63`), tracked as `upstream`; our repo is github.com/epipra/huru-gym. (alexpcosta/opengym is 1,673 commits behind and is not used.)
- Hosted product with free core and a paid Pro tier (AI Coach and extras).
- Publisher: AdxFuel LLC, 30 N Gould St Ste R, Sheridan, WY 82801, US. Beta domain gym.epipra.com; production hurugym.com later. Trademark still to be checked.
- Exercise media must be licensed or replaced before launch.
- Stack (beta): upstream as-is - React + Vite, Capacitor, Node.js API with JSON storage, Docker Compose on one VPS, Claude API. Fastify/Postgres/AWS from 02 are the scale-up target (see 10).

## Blockers to clear before public launch
1. Commercial license or replacement for the exercise GIFs and images.
2. Counsel confirmation of the AGPL app-store permission for a derivative.
3. Add a Claude Messages API adapter for the hosted Coach (upstream CLI adapters stay for self-hosters).
4. Trademark and domain check for "Huru GYM".

## How to use with an AI coding tool
Place all files in `/docs` of the `huru-gym` repo, then paste:

"Read every file in /docs before writing code. They are the source of truth: the PRD defines features (FR- IDs), the TRD fixes the stack and monorepo layout, the App Flow defines screens, the Design Brief defines the design system, the Schema defines the database, and 07 lists license and rebrand rules. Start with week 1 of the Implementation Plan: audit the existing code against the reuse map in document 07 and report before changing anything. Then build milestone M1. Never remove upstream copyright or license notices. Do not add features, screens, tables or libraries that are not in the documents; if something is missing or conflicting, ask me first. After each milestone, list which FR- IDs are complete."

## Suggested build order
Audit and fork -> rebrand and notices -> monorepo, Postgres and auth (M1) -> core training loop and sync (M2) -> insights, notifications, onboarding (M3) -> native apps, Health, billing (M4) -> Coach, admin, marketing, hardening (M5) -> beta -> launch.
