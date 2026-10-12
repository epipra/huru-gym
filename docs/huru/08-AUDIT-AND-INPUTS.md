# Audit & Inputs Needed - Huru GYM
> 2026-10-10 | Audit of docs 00-07 plus a read-only look at the live upstream code. Read before week 1 starts.
> **Historical.** The decisions (D1-D4) and inputs 3, 4, 5 and 6 were answered on 2026-10-10 - see 10. Section 1's host map is for the production domain; the beta runs on gym.epipra.com.

## 1. Domain: hurugym.com
**Status: not registered** (Verisign RDAP returns 404, DNS returns NXDOMAIN as of 2026-10-10). Register it now, before anything public mentions the name.

Proposed host map (docs only define the first two; the rest are gaps):

| Host | Purpose | Notes |
|------|---------|-------|
| `hurugym.com` (+ `www` redirect) | Astro marketing site, pricing, legal pages, demo link | Must also serve `/.well-known/apple-app-site-association`, `/.well-known/assetlinks.json` and `/.well-known/webauthn` because it is the passkey `RP_ID` |
| `app.hurugym.com` | Web app (PWA) | Passkeys work here because the RP ID is the parent domain |
| `api.hurugym.com` | Fastify API | Not named in docs; cookie domain and CORS depend on it |
| `media.hurugym.com` | CloudFront exercise media | Not named in docs |
| `demo.hurugym.com` or `app.hurugym.com/demo` | FR-19 demo on sample data | Location not decided in docs |
| `status.hurugym.com` | Uptime/status page | Optional, useful for store reviewers and support |
| Mail: `noreply@`, `support@`, `privacy@`, `legal@` | SES sending + inbound support | Needs SPF, DKIM, DMARC records; store listings require a support email and URL |

Also: docs put Cloudflare (DNS/WAF) in front of CloudFront. Pick one proxy layer per host (Cloudflare DNS-only for CloudFront hosts, or Cloudflare proxy for everything) to avoid double-CDN cache and TLS issues.

## 2. Base repo: docs are out of date
| Docs assume | Reality (checked 2026-10-10) | Impact |
|-------------|------------------------------|--------|
| Base on `alexpcosta/opengym` (fork with AI Coach) | That fork is **10 commits ahead, 1,673 behind** upstream; last push 2026-08-07 | Fork from **`DuarteSantos8/openGym` v1.4.0** (commit `b1cff63`) instead; upstream now has its own Coach (`api/coach/`) |
| 1,300+ exercises | **5,632 exercises** with new licensed Gym visual animations (v1.4.0, 2026-10-09) | Media license scope is 4x larger; FR-04 numbers change |
| 12 UI languages | **19** (English + 18 locale files incl. Bengali, Hindi, Arabic, Thai, Korean) | FR-17, NFR-10, i18n QA cost; Arabic needs RTL |
| Capacitor Android only | **iOS project already exists** (`frontend/ios`, Swift plugins); Health Connect already shipped | Less mobile work than planned |
| Body measurements "out of scope" | Already shipped upstream (v1.4.0) | Decide: keep (free) or strip |
| Frontend small enough to move to TypeScript | ~**151k lines** JS/JSX, 0 TS; API ~21.7k lines, `server.js` 2,709 lines; JSON-file storage confirmed | Full TS migration is months; do it only for new/shared code |
| Upstream is static | Releases every 1-2 weeks; roadmap to April 2027 includes **database storage (Postgres/SQLite), OIDC, iOS app, Health** | See decision D1 |
| App id | `ch.duartesantos.opengym`, `RP_NAME=openGym` | Rename (07 already covers this) |

Upstream extras not in docs: MCP server (`mcp/`), Helm chart, Kubernetes manifests, gym check-in QR codes, Garmin .fit export, Cloudflare Access support. Each needs a keep/drop call.

Media notice in upstream `NOTICE.md` explicitly says third parties "have no rights to reuse" the animations and must license directly from gymvisual.com. Blocker confirmed, unchanged.

## 3. Inconsistencies and gaps inside docs 00-07
1. **Schema:** `users(email)` listed as plain unique but email is nullable; use a partial unique index on `lower(email)` where not null.
2. **Schema:** `workout_sets` and `routine_exercises` have no `user_id`, but RLS (section 5) and `sync_changes` are keyed on user. Add a denormalized `user_id` or RLS needs joins on every query.
3. **App Flow:** deep link "reset/recovery links to SCR-04", but recovery is code-based (no links). Remove or define a magic link.
4. **TRD:** RP ID on the apex means the marketing site hosting must serve the `.well-known` files (section 1). Not in any milestone.
5. **TRD/Plan:** Multi-AZ RDS + ECS from day 1 costs roughly USD 300-600/month before revenue; TRD itself allows a VPS for closed beta. Pick one for beta.
6. **Plan:** 23 weeks assumes 3 engineers + designer + QA. If the real team is smaller, the timeline roughly doubles.
7. **PRD:** no legal-entity country. It drives GDPR role, VAT/sales tax on web subscriptions (Stripe Tax), store payouts and the privacy-policy jurisdiction.
8. **PRD:** no support email/URL, no pricing range, no Pro trial length; all three are required for store submission.
9. **07:** Apple requires "Sign in with Apple" when Google sign-in exists - docs already include both, good. Google Play requires a web account-deletion URL - put it on `hurugym.com/delete-account`.

## 4. Decisions needed (blocking)
- **D1 Fork strategy.** (a) *Hard fork* as docs say: replace backend with Fastify + Postgres now; stop receiving upstream fixes. (b) *Track upstream*: rebrand + hosted layer on top of v1.4.x, merge upstream releases, adopt their database-storage work when it lands. Recommendation: (b) for beta, re-decide at M2 - upstream is shipping fast and the sync contract already exists.
- **D2 Base commit:** upstream `DuarteSantos8/openGym` v1.4.0, not `alexpcosta/opengym`.
- **D3 Media:** license Gym visual (ask for a quote covering 5,632 animations, commercial SaaS + apps) or launch text-only and replace later.
- **D4 Beta hosting:** AWS as specced, or one VPS + managed Postgres for beta.

## 5. Inputs needed from the owner
| # | Item | Why |
|---|------|-----|
| 1 | Register `hurugym.com` (and ideally `hurugym.app`), at a registrar you control; tell me the registrar | Domain is free today |
| 2 | Cloudflare account (or confirm another DNS host) and add the domain | DNS, WAF, email records |
| 3 | Legal entity name, country, address | Store accounts, privacy policy, Stripe, trademark |
| 4 | GitHub org/account for the public `huru-gym` repo | AGPL source must be public |
| 5 | Answers to D1-D4 | Architecture and week-1 scope |
| 6 | Real team size and budget range (monthly infra, one-off for media license and pen test) | Timeline and hosting |
| 7 | Accounts in the entity's name: Apple Developer (USD 99/yr, D-U-N-S needed for orgs), Google Play (USD 25), AWS, Stripe, RevenueCat, Anthropic API, Sentry, PostHog EU | Long approval lead times, Apple org enrollment can take weeks |
| 8 | Emails sent: Gym visual (licence quote), Duarte Santos (app-store permission covers a derivative + name "Huru GYM" OK) | Two launch blockers |
| 9 | Trademark search result for "Huru GYM" (classes 9, 41, 42) | Avoid rebrand after launch |
| 10 | Brand assets or designer: logo, colors confirm (Primary `#15803D`), app icon | Design phase |
| 11 | Pricing intent (monthly/yearly, trial days) and support email | Paywall + store listings |

Never send me passwords or API keys in chat; put them in the hosting provider's secret store or a local `.env` that is git-ignored.

## 6. What can start now without inputs
- Code audit report (keep/refactor/replace per module) against the reuse map in 07, on upstream v1.4.0.
- Update docs 00-07 to match section 2 (base repo, exercise count, languages, iOS, schema fixes).
- Marketing-site skeleton (Astro) with legal-page placeholders and the `.well-known` routes.
