# Fork, Rebrand & Compliance Checklist - Huru GYM
> Companion to the six documents. Based on the repo README and NOTICE (not a full code audit). This is a practical checklist, not legal advice: have counsel confirm the points marked "counsel".

## 1. Lineage and license
- Chain: **DuarteSantos8/openGym** v1.4.1 (forked at v1.4.0, v1.4.1 merged 2026-10-12; upstream, copyright 2026 Duarte Santos, AGPL-3.0, now includes the AI Coach) -> **epipra/huru-gym** (AdxFuel LLC). alexpcosta/opengym is not used.
- Rebranding and commercial use are allowed under AGPL-3.0, but the result must stay AGPL: you cannot close the source of the app or the server.
- Confirm the LICENSE file in the fork you import (the README states AGPL-3.0) and whether the AI Coach additions carry the same license.

## 2. AGPL obligations (keep, do, publish)
| Obligation | What to do |
|------------|-----------|
| Keep notices | Keep upstream copyright lines, LICENSE and NOTICE; add your own copyright for your changes |
| Mark changes | Keep git history; add a CHANGELOG entry that this is a modified version named Huru GYM. Done: `docs/huru/CHANGES.md` |
| Offer source to network users | Settings > About links to the public repo and the tag matching the running version (FR-16) |
| Publish the deployed code | Production runs only tagged releases of the public repo; secrets stay in environment config, never in the repo |
| Same license for derivatives | New server and client code is AGPL; third-party libraries must be compatible |
| Dependencies | Run a license scan in CI; keep MIT notices for MuscleMap-derived body diagram and other packages |

## 3. App store distribution (counsel)
- Upstream NOTICE grants an additional permission allowing distribution through app stores whose terms conflict with AGPL, provided the AGPL source stays available. Keep that text, keep the source link in the app, and get written confirmation from the upstream author that it extends to Huru GYM (counsel).
- The README says the upstream project deliberately avoids store listings; Huru GYM will publish to both. Do not state or imply that upstream endorses the apps.

## 4. Exercise media and data
- Exercise text follows upstream `NOTICE.md`: only the 1,324 catalogue entries marked `"textSource": "exercisedb"` keep names, muscles and instructions from ExerciseDB v1 (AscendAPI), received through hasaneyldrm/exercises-dataset under MIT. Everything else in the catalogue (newer exercises, every description, the muscle-map corrections and all translations) was written for openGym and is covered by openGym's AGPL.
- **Images and GIFs are copyright Gym visual** and are redistributed upstream with permission at low resolution; reuse is governed by Gym visual's terms and you must obtain your own license. This is the biggest launch blocker: license it, or replace with original or properly licensed media.
- Keep the attribution string required by the dataset until you have replaced the media.
- The body-diagram paths derive from MuscleMap (MIT): keep its notice.

## 5. Remove or replace
| Item | Action |
|------|--------|
| Bundled Claude Code CLI and Codex CLI in the API image | Remove from production; run the AI Coach through upstream's HTTPS adapter with our own commercial API key (OpenAI, set in Admin -> Coach; the non-root api refuses the CLI runtimes anyway); subscription-based CLI sign-ins are for self-hosters and are not appropriate for a multi-user paid service (check provider terms) |
| `openGym` name, logo, banner, demo and download domains | Replace with Huru GYM brand assets and domains |
| Docker image names, package names, PWA manifest, Capacitor app id | Rename (bundle id: `com.adxfuel.hurugym`). Done on Android; iOS pending |
| Passkey `RP_ID` and `RP_NAME` | Set to your domain and Huru GYM; existing passkeys will not carry over |
| Telemetry stance in README ("no telemetry") | No crash reporting or analytics in beta. Update copy only when crash reporting (Sentry) or opt-in analytics are added; no ads or data sales |
| JSON file storage | Keep for beta (D1, D5 in 10); PostgreSQL and the migration script are the later target |

## 6. Reuse map
| Area | Decision |
|------|----------|
| React UI, router, Zustand stores, i18n (19 languages), icons, themes | Keep; migrate to TypeScript gradually; restyle to Huru GYM brand |
| `frontend/src/lib/` (progression, 1RM, import parsers, tests) | Keep; move to `packages/core` as shared pure functions |
| PWA service worker and offline behavior | Keep; harden and align with the new sync protocol |
| Capacitor Android (standalone, no sync) | Extend to synced mode; add iOS project |
| Node API with JSON files | Keep the upstream API and JSON storage for beta (D1, D5 in 10); Fastify + Postgres later |
| Admin dashboard | Port to the new API with audit logging |
| AI Coach | Keep upstream's Coach (consent, approval, revert); OpenAI API key set in Admin -> Coach |
| Docs and self-host guide | Rewrite for Huru GYM; keep a community self-host path |

## 7. Legal and policy documents to prepare
Privacy Policy (health-related data, AI processing, retention), Terms of Service, subscription terms, cookie and analytics notice, data processing agreements with AWS, Sentry, PostHog, RevenueCat, Stripe and the AI provider, store privacy labels and data safety forms, an account deletion page for Google Play, and an AGPL source notice.

Status 2026-10-14: Privacy Policy, Terms and the account deletion page are live at gym.adxfuel.com/legal/ (consent version 2026-10-12). Beta processors are OpenAI, Google Workspace, Cloudflare and Stripe; their DPAs are not yet accepted, and the lawyer review is not done.

## 8. Naming and trademark
Search trademark databases and domains for "Huru GYM" before design work is final; check app store name availability, social handles, and conflicts with other "Huru" products. Register the mark if clear.

## 9. First-week checklist
1. Create the GitHub repo from the fork with history preserved; enable branch protection and Dependabot.
2. Add NOTICE lines for your changes; do not delete upstream notices.
3. Open Apple Developer, Google Play, AWS, Stripe and RevenueCat accounts under the publisher entity. Google Play (AdxFuel LLC) and Stripe exist; Apple and RevenueCat later.
4. Email Gym visual about commercial licensing; email upstream author about the app-store permission.
5. Run license and dependency scans; list findings in the audit report.
6. Pick and reserve the domain and handles. Beta runs on gym.adxfuel.com; hurugym.com is planned, not registered (last checked 2026-10-10).
