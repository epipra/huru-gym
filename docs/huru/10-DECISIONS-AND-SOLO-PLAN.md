# Decisions & Solo Revenue Plan - Huru GYM
> 2026-10-10 | Supersedes conflicting parts of 00-07 (team size, base repo, hosting, timeline). Owner: AdxFuel LLC. Builder: one person + AI coding tools.

## 1. Decisions
| ID | Decision | Reason | Revisit when |
|----|----------|--------|--------------|
| D0 | Owner: **AdxFuel LLC**, 30 N Gould St Ste R, Sheridan, WY 82801, US. GitHub: **epipra/huru-gym** (public, AGPL) | Given by owner | - |
| D1 | **Track upstream** instead of a hard fork. Our `main` = upstream release + Huru commits; merge each upstream release tag. Huru-only code lives in new files (`api/huru/`, `frontend/src/huru/`, `deploy/`), brand via config, not by editing hundreds of files | Upstream ships every 1-2 weeks and already plans DB storage, OIDC, iOS, Health. A solo builder cannot out-build it | Upstream stalls, or licensing/strategy changes |
| D2 | Base: **DuarteSantos8/openGym v1.4.0** (`b1cff63`, 2026-10-09). Not alexpcosta/opengym | That fork is 1,673 commits behind | - |
| D3 | **No Gym visual media in Huru deployments** until we hold our own license. Text instructions + muscle map only. Quote request sent in week 1 (see 09) | Upstream NOTICE forbids third-party reuse; legal risk outweighs UX loss for beta | License signed -> enable media |
| D4 | **Beta hosting: one VPS + Docker Compose + Caddy (auto TLS)**, nightly encrypted backups to object storage. Est. USD 6-15/month. AWS/ECS/RDS (TRD) deferred | Revenue-focused; upstream already ships docker-compose | ~1,000 weekly actives or paid launch on stores |
| D5 | Storage: keep upstream JSON-per-profile storage for beta; adopt upstream's database storage when it lands. Postgres schema in 05 becomes the target, not week-1 work | Avoids diverging from upstream on the core data path | Upstream DB release, or scale limits |
| D6 | Domains: beta **gym.epipra.com** (app + API same origin). Passkey `RP_ID=gym.epipra.com`. Production later on hurugym.com; every domain is an env var | Owner choice; same origin avoids CORS/cookie issues | Production launch |
| D7 | Moving to hurugym.com later: needs a small patch (several allowed `ORIGIN`s + `/.well-known/webauthn` Related Origin Requests on gym.epipra.com) so beta passkeys keep working; `PASSWORD_LOGIN=1` in beta as fallback; 301-redirect old host. **Cheaper alternative: register hurugym.com now (~USD 11/yr) and launch beta there** | Passkeys are bound to the RP ID (audit 11, risk 2) | Production cut-over |
| D8 | Revenue order: **web first (Stripe, no store fee) -> Android (Play Billing via RevenueCat) -> iOS** | Web subscriptions keep ~97% of revenue; Android costs USD 25 once; iOS USD 99/yr | Android conversion data |
| D9 | AI Coach (Pro) on the **Anthropic Messages API** using upstream's existing `anthropic` adapter (instance mode, our API key) - no new adapter needed; default model Claude Haiku 5.5 for reviews/revisions, Claude Sonnet 5.5 for full plan design; per-user monthly quota | Main paid differentiator; CLI sign-ins are not allowed for multi-user paid service | Cost per Pro user > 30% of price |
| D10 | Pricing (initial, adjustable): **Pro USD 5.99/month or 39.99/year, 7-day trial**; free core forever, no ads | Market band of Hevy/Strong Pro; low enough for impulse buy | After 100 paying users |
| D12 | Beta access: `INVITE_ONLY=1`, `PASSWORD_LOGIN=1`, `ALLOW_GUEST=0`, owner as admin via `ADMIN_UIDS`. E-mail (verification + recovery via a transactional provider) added in Phase B before open sign-up | Upstream has no e-mail at all | Open sign-up |
| D11 | Analytics: none in beta beyond server counts; Sentry free tier for errors (PII scrubbed). PostHog later, opt-in | Cost + privacy promise | Paid launch |

## 2. Solo plan (replaces 06 timeline)
| Phase | Weeks | Scope | Revenue gate |
|-------|-------|-------|--------------|
| A Fork & beta | 1-2 | Fork to epipra/huru-gym, code audit, brand layer (name, icons, colors, app ids, RP name), media off, NOTICE/CHANGELOG, VPS + Caddy + backups, deploy gym.epipra.com, invite-only signups | Beta live with 10-20 real lifters |
| B Pro on web | 3-5 | Coach on Claude API (existing adapter) + Pro gating + quotas, e-mail recovery, Stripe Checkout + Customer Portal + webhooks, entitlements, paywall, Privacy Policy, Terms, account deletion page | First paying user |
| C Android | 6-8 | Rebranded Capacitor Android app synced to gym.epipra.com, Play Billing via RevenueCat, Play listing + data safety form, closed test (Play requires 12 testers / 14 days for new personal accounts; org account avoids this) | Play approval |
| D Production | 9-12 | hurugym.com cut-over, marketing site (Astro on Cloudflare Pages, free), iOS app, media (if licensed) | MRR covers infra + Apple fee |
| Later | - | Postgres/managed DB, AWS, admin extensions, Health sync on iOS, imports beyond upstream | Scale |

## 3. Monthly cost at beta (estimate)
VPS USD 5-10 · object-storage backups < USD 1 · domain (epipra.com already owned) USD 0 · Sentry free · Stripe 2.9% + 30c per charge only when paid · Claude API pay-per-use, capped by quota. Total fixed ~USD 6-15/month.

## 4. Owner actions (only what Claude cannot do)
1. `gh auth login` on this PC (one-time, browser) so the repo can be created under epipra.
2. Buy a VPS (recommended: Hetzner Cloud CPX21 or CX32, Ubuntu 24.04, region near users) and add the SSH public key Claude provides; share the IP.
3. Add DNS records for gym.epipra.com at the epipra.com DNS host (values provided at deploy time).
4. Send the two emails in `09-OUTREACH-DRAFTS.md`.
5. Phase B: Stripe account for AdxFuel LLC, Anthropic API key (put into the server's `.env`, never in chat).
6. Phase C: Google Play developer account as an organization (needs D-U-N-S number for AdxFuel LLC - request it now, it is free and takes up to ~30 days).
