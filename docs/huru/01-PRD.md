# PRD - Huru GYM
> Version 1.0 | 2026-10-10 | Status: Draft for review | Platforms: Web (PWA), iOS, Android
> Base: production fork of openGym (AGPL-3.0). See `07-FORK-AND-COMPLIANCE.md` before any public release.

## Assumptions
Inputs were "take the openGym repo to production as Huru GYM on web, iOS and Android". These assumptions were made after reading the repo README and NOTICE (not the source code). Correct any that are wrong.
- **Base repo:** github.com/DuarteSantos8/openGym v1.4.0 (upstream now includes the AI Coach). Tracked, not hard-forked (see `10-DECISIONS-AND-SOLO-PLAN.md`).
- **Hosted product:** Huru GYM becomes a hosted service with accounts and sync. Self-hosting stays possible but is community-supported.
- **Business model:** free core training and tracking; paid "Huru GYM Pro" adds the AI Coach and advanced extras. Prices decided at launch.
- **Publisher:** one legal entity (to be confirmed) owns store accounts, privacy policy and terms.
- **Team:** one person (owner) using AI coding tools. Publisher: AdxFuel LLC (Wyoming, US).
- **Markets:** global, English first; the 19 existing UI languages are kept (Arabic needs RTL QA). EU privacy rules (GDPR) are applied everywhere.
- **Domain:** beta at gym.adxfuel.com (app + API, same origin); production hurugym.com (unregistered as of 2026-10-10) later.
- **Exercise media:** the animations belong to Gym visual; Huru deployments ship without them until our own license is signed.

## 1. Overview
**Problem.** Lifters want a fast, private workout log that plans progression for them. Most apps lock data behind accounts, paywall the basics, or show ads and sell data. openGym solves the trust problem but is built for self-hosters, not for everyone.

**Vision.** Huru GYM: the workout tracker that knows what to lift today, works without signal, and keeps your data yours.

**Target users**
- *Self-directed lifters (22-45):* follow a program, want pre-filled weights, rest timers, PR tracking and clean charts.
- *Beginners:* want a plan chosen for them and clear guidance; the starter plans and AI Coach serve them.
- *Privacy-minded switchers:* leaving ad-funded or subscription-locked trackers; want export, no ads, passkey login.

**Platforms.** Web app (installable PWA), native iOS app, native Android app, all sharing one codebase and one account.

**Scope - in (v1):** passkey and social sign-in with recovery, onboarding, exercise library with licensed media, weekly plan and routine builder, guided workout, progression engine, body-weight tracking, stats and muscle map, offline-first sync, notifications, import/export, AI Coach (Pro), subscriptions, Apple Health / Health Connect weight sync, privacy tools, admin console, marketing site.

**Scope - out (later):** social feed or friends, nutrition tracking, Apple Watch / Wear OS apps, home-screen widgets, coach marketplace, tablet layouts, percentage-based programs (5/3/1), body measurements beyond weight.

**Alternatives.** Strong, Hevy, Fitbod, JEFIT, FitNotes. Differentiators: open source (AGPL), free core with no ads, passkey login, explained progression rules, AI Coach that proposes changes you accept one by one and can revert.

## 2. Goals & Objectives
| Goal | Objective (SMART) |
|------|-------------------|
| G1 Make logging a set effortless | Median time to log a set under 5 seconds in the first 3 months after launch |
| G2 Build a lasting habit | 30% of activated users still logging workouts on day 30, within 6 months of launch |
| G3 Be trustworthy | Crash-free sessions 99.7% or higher and sync success 99.9% or higher in the first 3 months |
| G4 Sustainable revenue | 3% of active users on Huru GYM Pro within 6 months of launch |
| G5 Pass the stores cleanly | Both store listings approved within 2 submission cycles each |

## 3. Requirements
### Functional requirements
| ID | Requirement | Priority | Acceptance criteria |
|----|-------------|----------|---------------------|
| FR-01 | User can create an account and sign in with a passkey (Face ID, Touch ID, fingerprint) on web and native apps | Must | Passkey registers and signs in on iOS, Android and desktop browsers; multiple passkeys per account; no password stored |
| FR-02 | User can also sign in with Apple, Google, or an email one-time code, and recover access if a passkey is lost | Must | Each method works; email code expires in 10 min and is single-use; recovery restores access without data loss; new device sign-in lists active sessions |
| FR-03 | New user completes a short onboarding (goal, days per week, equipment, experience, units) and starts from a starter plan or the AI Coach | Must | Onboarding under 2 minutes; at least 4 starter plans (upper/lower, full body, 5x5, push/pull/legs); user can skip and build manually |
| FR-04 | User can browse and search a 5,600+ exercise library, filter by equipment, view licensed demo media and instructions, and create custom exercises | Must | Search returns results as the user types; equipment filters never show empty combinations; custom exercise needs only name and body part; media is licensed or original |
| FR-05 | User can build a weekly plan with a routine per weekday, supersets, timed exercises and cardio, and reschedule a day without changing the plan | Must | Routine editor supports reorder, superset pairing, rep/time targets; moving a workout to another day leaves the weekly plan unchanged |
| FR-06 | User can run a guided workout: today's session opens automatically, weights pre-filled from last time, rest timer, PR detection, optional effort (RIR or RPE) per set, screen stays awake | Must | Session starts in 1 tap from Home; each set loggable in 2 taps when values are unchanged; timed sets show a work timer; screen-awake releases on finish; PR celebration shown once per PR |
| FR-07 | Progression engine sets next weights by rule (linear, Greyskull LP, double progression, add time), explains each target and handles stalls and deloads | Must | Rule selectable per routine with per-exercise override; every target shows a one-line reason; missed reps never advance load; stall triggers deload |
| FR-08 | User can log body weight and see a chart with a goal line, colored by movement toward or away from the goal | Must | Entry in under 10 s; chart shows week/month/year; goal editable |
| FR-09 | User sees stats: activity heatmap, per-exercise charts, personal records, estimated 1RM and a muscle map | Must | Heatmap covers 12 months; e1RM names the set used and is hidden above 12 reps; muscle map lists untrained muscles for the chosen period |
| FR-10 | App works fully offline and syncs across devices | Must | Complete workout offline and see it on a second device within 30 s of reconnecting; no duplicate or lost sets; conflicts resolved per documented rules |
| FR-11 | User receives rest-timer alerts with the app closed and optional workout-day reminders, on web and native | Must | Rest alert fires on time (within 2 s) on iOS, Android and web push; lock-screen rest timer on native; reminder skipped if workout already logged |
| FR-12 | User can import history (FitNotes, Strong, Hevy, Apple Health weight), export all data as JSON, and share a plan as a file or PDF | Should | Imports map or create exercises, drop nothing, and are idempotent; export restores into a fresh account; shared plan merges instead of overwriting |
| FR-13 | Pro user can use the AI Coach: intake produces a weekly plan, plain-language revisions, periodic review proposes explained changes accepted one by one, every change-set revertible | Should | Needs separate explicit consent; nothing changes without approval; change-sets snapshotted and revertible; usage quota enforced; user can disable and delete coach data |
| FR-14 | User can subscribe to Huru GYM Pro with store billing on iOS/Android and web checkout, restore purchases, and manage or cancel | Must | Entitlement active within 60 s of purchase on every device; restore works; downgrade keeps all data readable and editable except Pro-only features |
| FR-15 | User can sync body weight with Apple Health and Health Connect | Should | Read and write weight with explicit permission; no duplicates; disabling stops sync |
| FR-16 | User can export all data, delete their account, manage consents and analytics opt-in, and find the open-source code link | Must | Deletion completes within 30 days with confirmation; analytics off until opted in; Settings shows source-code link and license notice (AGPL) |
| FR-17 | User can personalize the app: language (19), units, light/dark theme, 8 accent colors, effort scale, keep-screen-awake | Must | Settings saved to the account and applied on all devices instantly |
| FR-18 | Admin can find users, disable accounts, manage invites and feature flags, and read in-app feedback | Should | Admin actions are audit-logged; admin requires passkey with re-authentication; flags apply within 60 s |
| FR-19 | Visitors can learn about the product, see pricing and the privacy policy, try a demo, and open the web app or store links | Must | Marketing site scores 90+ on Lighthouse performance and SEO; demo runs on sample data with no sign-up |

### Non-functional requirements
| ID | Requirement |
|----|-------------|
| NFR-01 | Cold start to interactive Home under 2.5 s on a mid-range phone (4G); any tap in the workout screen responds under 100 ms |
| NFR-02 | All logging features work offline; sync is resumable and idempotent |
| NFR-03 | Security meets OWASP ASVS Level 2; passkeys, rotating sessions, rate limiting, encryption in transit and at rest |
| NFR-04 | Privacy: GDPR-ready; body-weight and training data treated as health data (explicit consent, minimal collection, no ads, no data sales, no third-party ad SDKs) |
| NFR-05 | Accessibility: WCAG 2.2 AA, 48 px touch targets during workouts, dynamic type, screen-reader labels |
| NFR-06 | Availability 99.9% for API; recovery point 15 minutes, recovery time 4 hours |
| NFR-07 | Scales to 50,000 monthly active users at launch and to 500,000 without redesign |
| NFR-08 | Store compliance: Apple and Google policies for subscriptions, account deletion, health data, privacy labels |
| NFR-09 | Open-source compliance: AGPL notices, source availability for the deployed version, third-party notices kept |
| NFR-10 | Localization: all 19 languages complete for UI; instructions localized where licensed data allows |

## 4. User Experience
**Personas**
- *Lena, 32, intermediate lifter:* trains 4 days; wants weights ready and no typing mid-set; frustrated by apps that lose data without signal.
- *Marco, 24, beginner:* does not know what to do; wants a plan and simple form guidance; frustrated by overwhelming menus.
- *Sofia, 38, privacy-minded:* left a subscription tracker; wants passkeys, export and no ads.

**Key journeys**
1. First-time: landing -> sign up with passkey -> onboarding -> starter plan or Coach -> Home -> first workout.
2. Daily workout: Home -> Start -> log sets (rest timer) -> finish -> summary with PRs and muscle map.
3. Weekly review: Stats -> Coach review -> accept or skip each proposed change -> updated plan.
4. New phone: sign in with passkey or email code -> history appears -> continue offline in the gym.

**UX principles (gym context):** one-handed use; big glanceable numbers; zero typing when values are unchanged; never interrupt a set; the app never forgets your place; celebrate PRs but never shame misses.

**Accessibility:** color never the only signal (effort, PR and goal direction also use icons and text); screen-reader labels on all set rows; reduce-motion respected.

Screens: `03-APP-FLOW.md`. Visual system: `04-UIUX-DESIGN-BRIEF.md`.

## 5. Success Metrics
| Metric | Definition | Baseline | Target | Timeframe | How measured |
|--------|------------|----------|--------|-----------|--------------|
| Installs and sign-ups | Store installs plus web sign-ups | 0 | 20,000 | 6 months | Store consoles, API |
| Activation | Users who finish a first workout within 48 h of sign-up | TBD at launch | 55% | 3 months | Opt-in analytics, server workout counts |
| Time to log a set | Median seconds from set start to saved | TBD at launch | under 5 s | 3 months | Opt-in analytics timing |
| Retention D7 / D30 | Users with a workout on day 7 / day 30 | TBD at launch | 40% / 30% | 6 months | Server cohorts |
| Weekly active lifters | Users with 2+ workouts per week | 0 | 6,000 | 6 months | Server counts |
| Pro conversion | Active users on Pro | 0 | 3% | 6 months | Entitlements table |
| Coach adoption | Pro users with at least one accepted change-set | TBD at launch | 50% | 6 months | Coach tables |
| Crash-free sessions (guardrail) | Sessions without a crash | TBD at launch | 99.7% | Ongoing | Crash reporting |
| Sync success (guardrail) | Sync runs finishing without error | TBD at launch | 99.9% | Ongoing | API metrics |
| Store rating (guardrail) | Average rating | n/a | 4.6 or higher | 6 months | Store consoles |
