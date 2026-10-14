/* Huru GYM Pro: entitlement, Stripe checkout and portal, the Stripe webhook, admin grants, and
 * the gate the AI Coach consults before it spends anything.
 *
 * A factory over server.js's helpers, the same shape as coach/routes.js, so server.js gains one
 * spread line and nothing else here touches upstream code. With HURU_BILLING unset every user
 * counts as Pro and the Coach behaves exactly as upstream ships it.
 *
 * Env: HURU_BILLING=1, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_MONTHLY,
 *      STRIPE_PRICE_YEARLY, HURU_TRIAL_DAYS (first subscription only, default 0),
 *      HURU_CONSENT_VERSION (the Privacy Policy / Terms version accounts must accept),
 *      HURU_PRIVACY_URL, HURU_TERMS_URL (shown beside the consent checkboxes).
 *
 * Also here: the consent record (health data + terms), self-service account deletion, and the
 * e-mailed password-reset code (mail.js; SMTP_USER, SMTP_PASS, MAIL_FROM).
 * Stripe webhook endpoint: <ORIGIN>/api/huru/stripe/webhook, events checkout.session.completed
 * and customer.subscription.created / .updated / .deleted.
 */
import * as store from './billing-store.js';
import * as consent from './consent-store.js';
import * as emails from './email-store.js';
import { stripeRequest, verifySignature, StripeError } from './stripe.js';
import { verifyPassword, passwordLength, MAX_LENGTH, makeResetCode, hashResetCode, normalizeEmail } from '../password.js';
import { mailConfig, sendMail } from './mail.js';

const on = v => /^(1|true|yes|on)$/i.test(v || '');
const MAX_WEBHOOK_BODY = 1 << 20;

export const PRO_REQUIRED = 'the AI Coach is part of Huru GYM Pro';

/** Billing settings, read from the environment once per call so tests can vary them. */
export function billingConfig(env = process.env) {
  return {
    enabled: on(env.HURU_BILLING),
    key: env.STRIPE_SECRET_KEY || '',
    webhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
    prices: { monthly: env.STRIPE_PRICE_MONTHLY || '', yearly: env.STRIPE_PRICE_YEARLY || '' },
    trialDays: Math.max(0, Math.min(30, parseInt(env.HURU_TRIAL_DAYS || '0', 10) || 0))
  };
}

// Bump when the Privacy Policy or Terms change in a way people must agree to again.
export const CONSENT_VERSION = '2026-10-12';

export function consentConfig(env = process.env) {
  return {
    version: env.HURU_CONSENT_VERSION || CONSENT_VERSION,
    privacyUrl: /^https:\/\//.test(env.HURU_PRIVACY_URL || '') ? env.HURU_PRIVACY_URL : null,
    termsUrl: /^https:\/\//.test(env.HURU_TERMS_URL || '') ? env.HURU_TERMS_URL : null
  };
}

// Password guesses against the deletion route: 5 per account per 15 minutes, in memory.
const DELETE_TRIES = 5, DELETE_WINDOW_MS = 15 * 60000;

// Forgotten-password e-mails: a code lives an hour (upstream's admin code lives a day, but it is
// handed over in person); per hour, 5 requests per network address and 3 per e-mail address,
// so the form cannot be used to flood someone's inbox.
export const FORGOT_TTL_MS = 3600000;
const FORGOT_WINDOW_MS = 3600000, FORGOT_PER_ADDR = 5, FORGOT_PER_EMAIL = 3;

/** The reset-code e-mail. Plain text: it carries a code, not a link, so nothing in it can be
 *  rewritten into a phishing link and the code works in the app and the web alike. */
/** The code that confirms a sign-in e-mail. */
export function verifyEmail({ name, code, site }) {
  return {
    subject: 'Confirm your Huru GYM e-mail',
    text: [
      `Hi ${name},`,
      '',
      'Enter this code in Huru GYM to confirm this is your e-mail address:',
      '',
      `    ${code}`,
      '',
      'It works for the next 30 minutes. Once confirmed, this is where we send a code if you',
      'ever forget your password.',
      '',
      'If you did not ask for this, ignore this e-mail.',
      '',
      '-- ',
      'Huru GYM by AdxFuel LLC, 30 N Gould St Ste R, Sheridan, WY 82801, US',
      site
    ].join('\n')
  };
}

export function resetEmail({ name, code, site }) {
  return {
    subject: 'Your Huru GYM reset code',
    text: [
      `Hi ${name},`,
      '',
      'Someone asked to reset the password of your Huru GYM profile. Your one-time code is:',
      '',
      `    ${code}`,
      '',
      'It works once, for the next 60 minutes. In the app, open "Sign in with password", tap',
      '"Have a reset code?" and enter this e-mail address, the code and a new password.',
      '',
      'If you did not ask for this, ignore this e-mail. Your password has not changed.',
      '',
      '-- ',
      'Huru GYM by AdxFuel LLC, 30 N Gould St Ste R, Sheridan, WY 82801, US',
      site
    ].join('\n')
  };
}

/** The Stripe subscription object, reduced to what the entitlement needs. Newer API versions
 *  moved current_period_end onto the subscription items; both places are read. */
export function subscriptionPatch(sub, deleted = false) {
  const item = sub.items?.data?.[0];
  return {
    status: deleted ? 'canceled' : sub.status,
    periodEnd: sub.current_period_end ?? item?.current_period_end ?? null,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    interval: item?.price?.recurring?.interval || null,
    stripeSubscriptionId: sub.id,
    stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
    ...(sub.trial_start || sub.status === 'trialing' ? { trialUsed: true } : {})
  };
}

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', d => {
      size += d.length;
      if (size > MAX_WEBHOOK_BODY) { reject(Object.assign(new Error('body too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(d);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function huruRoutes({ json, readBody, readSession, requireAdmin, isAdmin, findUser, origin, audit, countAdmins, purgeUser, clearCoach,
  findByEmail, saveDb, limitAddress = () => 'unknown', mailer = sendMail, env = process.env, fetchImpl }) {
  const deleteTries = new Map();   // uid -> { n, since }
  const forgotTries = new Map();   // 'a:<address>' | 'e:<email>' -> { n, since }
  // Counts one request against `key`; the seconds left in its window when it is over `max`.
  const overLimit = (key, max, now) => {
    if (forgotTries.size > 10000) for (const [k, v] of forgotTries) if (now - v.since >= FORGOT_WINDOW_MS) forgotTries.delete(k);
    const cur = forgotTries.get(key);
    const t = cur && now - cur.since < FORGOT_WINDOW_MS ? cur : { n: 0, since: now };
    if (t.n >= max) return Math.ceil((t.since + FORGOT_WINDOW_MS - now) / 1000);
    forgotTries.set(key, { n: t.n + 1, since: t.since });
    return 0;
  };
  const base = String(origin || '').replace(/\/+$/, '');
  const stripe = (method, path, params) => stripeRequest(method, path, params, { key: billingConfig(env).key, fetchImpl });

  const proFor = user => {
    const cfg = billingConfig(env);
    return !cfg.enabled || isAdmin(user) || store.isPro(user.id);
  };

  /** Applies a Stripe subscription to whoever owns it. Events can arrive out of order, so one
   *  older than the last applied for this user is ignored. */
  const applySubscription = (sub, eventCreated, deleted) => {
    const uid = sub.metadata?.uid || store.uidForCustomer(typeof sub.customer === 'string' ? sub.customer : sub.customer?.id);
    if (!uid || !findUser(uid)) return null;
    const cur = store.get(uid);
    if (cur?.lastEventAt && eventCreated && eventCreated < cur.lastEventAt) return cur;
    // A deleted event for a subscription the user has since replaced must not cancel the new one.
    if (deleted && cur?.stripeSubscriptionId && cur.stripeSubscriptionId !== sub.id) return cur;
    return store.update(uid, { ...subscriptionPatch(sub, deleted), lastEventAt: eventCreated || cur?.lastEventAt || null });
  };

  const routes = {
    // What the app needs to draw the Pro screen and gate the Coach.
    'GET /api/huru/me': async (req, res) => {
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'not signed in' });
      const cfg = billingConfig(env);
      const e = store.get(user.id) || {};
      json(res, 200, {
        billing: cfg.enabled,
        pro: proFor(user),
        source: isAdmin(user) ? 'admin' : (e.grantUntil && e.grantUntil > Date.now() ? 'grant' : (e.status ? 'stripe' : null)),
        status: e.status || null,
        interval: e.interval || null,
        periodEnd: e.periodEnd || null,
        cancelAtPeriodEnd: !!e.cancelAtPeriodEnd,
        grantUntil: e.grantUntil || null,
        canManage: !!e.stripeCustomerId,
        trialDays: e.trialUsed ? 0 : cfg.trialDays,
        plans: { monthly: !!cfg.prices.monthly, yearly: !!cfg.prices.yearly },
        checkout: cfg.enabled && !!cfg.key,
        consent: { ...consentConfig(env), accepted: consent.accepted(user.id, consentConfig(env).version) },
        hasPassword: !!user.pw?.h,
        email: { address: user.email || null, verified: emails.isVerified(user.id, user.email) }
      });
    },

    'POST /api/huru/checkout': async (req, res) => {
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'not signed in' });
      const cfg = billingConfig(env);
      if (!cfg.enabled || !cfg.key) return json(res, 503, { error: 'billing is not set up yet', code: 'off' });
      const body = await readBody(req);
      const plan = body.plan === 'yearly' ? 'yearly' : 'monthly';
      const price = cfg.prices[plan];
      if (!price) return json(res, 400, { error: `no ${plan} plan is configured`, code: 'plan' });
      const e = store.get(user.id) || {};
      if (e.stripeSubscriptionId && store.isPro(user.id)) return json(res, 409, { error: 'you already have Pro, manage it from Settings', code: 'subscribed' });
      try {
        const session = await stripe('POST', '/checkout/sessions', {
          mode: 'subscription',
          line_items: [{ price, quantity: 1 }],
          client_reference_id: user.id,
          ...(e.stripeCustomerId ? { customer: e.stripeCustomerId } : (user.email ? { customer_email: user.email } : {})),
          subscription_data: {
            metadata: { uid: user.id },
            ...(cfg.trialDays && !e.trialUsed ? { trial_period_days: cfg.trialDays } : {})
          },
          metadata: { uid: user.id },
          allow_promotion_codes: 'true',
          success_url: `${base}/#/pro?checkout=success`,
          cancel_url: `${base}/#/pro?checkout=cancel`
        });
        audit?.(req, 'huru.checkout', { user, plan });
        json(res, 200, { url: session.url });
      } catch (err) {
        if (!(err instanceof StripeError)) throw err;
        console.error('huru checkout:', err.message);
        json(res, 502, { error: 'the payment page could not be opened, try again in a moment', code: 'stripe' });
      }
    },

    'POST /api/huru/portal': async (req, res) => {
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'not signed in' });
      const e = store.get(user.id);
      if (!e?.stripeCustomerId) return json(res, 404, { error: 'no subscription to manage', code: 'none' });
      try {
        const session = await stripe('POST', '/billing_portal/sessions', { customer: e.stripeCustomerId, return_url: `${base}/#/pro` });
        json(res, 200, { url: session.url });
      } catch (err) {
        if (!(err instanceof StripeError)) throw err;
        console.error('huru portal:', err.message);
        json(res, 502, { error: 'the billing page could not be opened, try again in a moment', code: 'stripe' });
      }
    },

    // Called by Stripe, not the app: no session, authenticated by the signature instead.
    'POST /api/huru/stripe/webhook': async (req, res) => {
      const cfg = billingConfig(env);
      let raw;
      try { raw = await readRaw(req); } catch (e) { return json(res, e.status || 400, { error: e.message }); }
      if (!verifySignature(raw, req.headers['stripe-signature'], cfg.webhookSecret)) {
        return json(res, 400, { error: 'bad signature' });
      }
      let event;
      try { event = JSON.parse(raw.toString('utf8')); } catch { return json(res, 400, { error: 'bad payload' }); }
      const obj = event.data?.object || {};
      try {
        switch (event.type) {
          case 'checkout.session.completed': {
            const uid = obj.client_reference_id || obj.metadata?.uid;
            if (obj.mode === 'subscription' && uid && findUser(uid)) {
              store.update(uid, { stripeCustomerId: obj.customer, stripeSubscriptionId: obj.subscription, trialUsed: true });
              // The subscription events normally follow; reading it now makes Pro appear the
              // moment the user lands back in the app instead of whenever they arrive.
              if (obj.subscription && cfg.key) {
                const sub = await stripe('GET', `/subscriptions/${encodeURIComponent(obj.subscription)}`);
                applySubscription({ ...sub, metadata: { uid, ...(sub.metadata || {}) } }, event.created, false);
              }
            }
            break;
          }
          case 'customer.subscription.created':
          case 'customer.subscription.updated':
          case 'customer.subscription.deleted':
            applySubscription(obj, event.created, event.type.endsWith('.deleted'));
            break;
          default:
            break;  // Acknowledged so Stripe stops retrying; nothing else changes entitlement.
        }
      } catch (err) {
        if (!(err instanceof StripeError)) throw err;
        // A 500 makes Stripe retry later, which is what a transient API failure needs.
        console.error('huru webhook', event.type, err.message);
        return json(res, 500, { error: 'retry later' });
      }
      json(res, 200, { received: true });
    },

    // The consent screen: explicit agreement to processing health and fitness data (GDPR
    // Article 9) and to the Terms, for the version currently published.
    'POST /api/huru/consent': async (req, res) => {
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'not signed in' });
      const body = await readBody(req);
      const { version } = consentConfig(env);
      if (body.health !== true || body.terms !== true) return json(res, 400, { error: 'both agreements are needed', code: 'consent' });
      if (body.version !== version) return json(res, 409, { error: 'the policy changed, reload and read it again', code: 'version' });
      const rec = consent.record(user.id, version);
      audit?.(req, 'huru.consent', { user, msg: version });
      json(res, 200, { accepted: true, version: rec.version });
    },

    // Self-service account deletion: everything the account holds, on this server and at Stripe.
    // Asks for the profile name typed out and, when the account has one, its password.
    'POST /api/huru/account/delete': async (req, res) => {
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'not signed in' });
      const body = await readBody(req);
      if (String(body.confirmName || '').trim() !== user.name) return json(res, 400, { error: 'type your profile name exactly to confirm', code: 'confirm' });

      const now = Date.now();
      const t = deleteTries.get(user.id);
      const tries = t && now - t.since < DELETE_WINDOW_MS ? t : { n: 0, since: now };
      if (tries.n >= DELETE_TRIES) return json(res, 429, { error: 'too many attempts, try again in 15 minutes', code: 'throttled' });
      if (user.pw?.h) {
        const pw = String(body.password || '');
        if (!pw) return json(res, 400, { error: 'enter your password to confirm', code: 'password-required' });
        const ok = passwordLength(pw) <= MAX_LENGTH && await verifyPassword(pw, user.pw.h);
        if (!ok) {
          deleteTries.set(user.id, { n: tries.n + 1, since: tries.since });
          return json(res, 403, { error: 'that password is not right', code: 'password' });
        }
      }
      if (isAdmin(user) && countAdmins() <= 1) return json(res, 409, { error: 'make someone else an admin before deleting the last admin account', code: 'last-admin' });

      // Stop charging first: if Stripe cannot be reached, nothing is deleted and the user retries.
      const e = store.get(user.id);
      if (e?.stripeSubscriptionId && e.status && e.status !== 'canceled' && billingConfig(env).key) {
        try {
          await stripe('DELETE', `/subscriptions/${encodeURIComponent(e.stripeSubscriptionId)}`);
        } catch (err) {
          if (!(err instanceof StripeError)) throw err;
          if (err.status !== 404) {
            console.error('huru delete: stripe cancel failed:', err.message);
            return json(res, 502, { error: 'your subscription could not be cancelled, nothing was deleted, try again in a moment', code: 'stripe' });
          }
        }
      }
      try { clearCoach?.(user.id); } catch (err) { console.error('huru delete: coach data', err.message); }
      store.remove(user.id);
      consent.remove(user.id);
      emails.remove(user.id);
      deleteTries.delete(user.id);
      purgeUser(user);
      // Logged with the name: the id means nothing once the account is gone.
      audit?.(req, 'huru.account.delete', { user, msg: user.name });
      json(res, 200, { ok: true });
    },

    // Forgot password: e-mails a one-time code to the profile with that sign-in e-mail, which the
    // user redeems at upstream's POST /api/login/password-reset. No session, so the answer is the
    // same whether or not the address belongs to anyone, and the mail goes out after it. The old
    // password keeps working until a new one is set: asking for a code locks nobody out.
    'POST /api/huru/password/forgot': async (req, res) => {
      const mail = mailConfig(env);
      if (!mail.enabled) return json(res, 503, { error: 'e-mail is not set up on this server', code: 'mail-off' });
      const body = await readBody(req);
      const email = normalizeEmail(typeof body.email === 'string' ? body.email.slice(0, 300) : '');
      if (!email) return json(res, 400, { error: 'that is not an e-mail address', code: 'email-invalid' });
      const now = Date.now();
      const wait = overLimit('a:' + limitAddress(req), FORGOT_PER_ADDR, now) || overLimit('e:' + email, FORGOT_PER_EMAIL, now);
      if (wait) return json(res, 429, { error: 'too many attempts, try again later', code: 'locked', retryAfter: wait }, { 'Retry-After': String(wait) });
      const user = findByEmail(email);
      json(res, 200, { ok: true });
      // Only to an address the account has confirmed: a typo must not send a stranger the code.
      if (!user || user.disabled || !emails.isVerified(user.id, email)) return;
      const code = makeResetCode();
      user.pwReset = { h: hashResetCode(code), exp: now + FORGOT_TTL_MS, by: 'email' };
      saveDb();
      audit?.(req, 'huru.password.forgot', { user });
      const host = (() => { try { return new URL(base).hostname; } catch { return 'localhost'; } })();
      mailer(mail, { to: email, ...resetEmail({ name: user.name, code, site: base }) }, { helo: host })
        .catch(err => console.error('huru mail: reset code not sent:', err.message));
    },

    // Confirm the signed-in account's sign-in e-mail: a 6-digit code to that address, typed back.
    'POST /api/huru/email/send-code': async (req, res) => {
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'not signed in' });
      if (!user.email) return json(res, 400, { error: 'add a sign-in e-mail first', code: 'no-email' });
      const mail = mailConfig(env);
      if (!mail.enabled) return json(res, 503, { error: 'e-mail is not set up on this server', code: 'mail-off' });
      if (emails.isVerified(user.id, user.email)) return json(res, 200, { ok: true, verified: true });
      const wait = overLimit('v:' + user.id, FORGOT_PER_EMAIL, Date.now());
      if (wait) return json(res, 429, { error: 'too many attempts, try again later', code: 'locked', retryAfter: wait }, { 'Retry-After': String(wait) });
      const code = emails.newCode(user.id, user.email);
      const host = (() => { try { return new URL(base).hostname; } catch { return 'localhost'; } })();
      try {
        await mailer(mail, { to: user.email, ...verifyEmail({ name: user.name, code, site: base }) }, { helo: host });
      } catch (err) {
        console.error('huru mail: confirmation code not sent:', err.message);
        return json(res, 502, { error: 'the e-mail could not be sent, try again in a moment', code: 'mail-failed' });
      }
      json(res, 200, { ok: true, verified: false });
    },
    'POST /api/huru/email/verify': async (req, res) => {
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'not signed in' });
      const body = await readBody(req);
      const code = String(body.code || '').replace(/\D/g, '').slice(0, 6);
      if (!user.email) return json(res, 400, { error: 'add a sign-in e-mail first', code: 'no-email' });
      const r = emails.check(user.id, user.email, code);
      if (r === 'ok') {
        audit?.(req, 'huru.email.verified', { user });
        return json(res, 200, { verified: true });
      }
      const why = {
        none: 'ask for a new code first', expired: 'that code has expired, ask for a new one',
        locked: 'too many wrong codes, ask for a new one', wrong: 'that code is not right'
      }[r];
      json(res, 400, { error: why, code: 'code-' + r });
    },

    // Comps for beta testers and friends: Pro for N days without a subscription. days 0 revokes.
    'POST /api/huru/admin/grant': async (req, res) => {
      const admin = requireAdmin(req, res); if (!admin) return;
      const body = await readBody(req);
      const target = findUser(String(body.uid || ''));
      if (!target) return json(res, 404, { error: 'no such user' });
      const days = Math.max(0, Math.min(3650, Number(body.days) || 0));
      const grantUntil = days ? Date.now() + days * 86400e3 : null;
      store.update(target.id, { grantUntil });
      audit?.(req, 'huru.grant', { user: admin, target: target.id, days });
      json(res, 200, { uid: target.id, grantUntil });
    },

    // One profile's Pro, for the admin's user sheet: what they have and why, and any free Pro.
    'GET /api/huru/admin/pro': async (req, res) => {
      if (!requireAdmin(req, res)) return;
      const uid = new URL(req.url, 'http://x').searchParams.get('uid') || '';
      const target = findUser(uid);
      if (!target) return json(res, 404, { error: 'no such user' });
      const e = store.get(uid) || {};
      const now = Date.now();
      json(res, 200, {
        uid, billing: billingConfig(env).enabled, admin: isAdmin(target), pro: proFor(target),
        status: e.status || null, interval: e.interval || null, periodEnd: e.periodEnd || null,
        cancelAtPeriodEnd: !!e.cancelAtPeriodEnd, grantUntil: e.grantUntil && e.grantUntil > now ? e.grantUntil : null
      });
    },

    'GET /api/huru/admin/billing': async (req, res) => {
      if (!requireAdmin(req, res)) return;
      const rows = Object.entries(store.all()).map(([uid, e]) => ({
        uid, name: findUser(uid)?.name || null, pro: store.isPro(uid), status: e.status || null,
        interval: e.interval || null, periodEnd: e.periodEnd || null, grantUntil: e.grantUntil || null
      }));
      json(res, 200, { billing: billingConfig(env).enabled, rows });
    }
  };

  /** For coach/jobs.js setEnqueueGate: null lets the job through, an object refuses it. */
  const coachGate = uid => {
    const user = findUser(uid);
    if (!user || proFor(user)) return null;
    return { code: 'pro', message: PRO_REQUIRED };
  };

  return { routes, coachGate, proFor };
}
