/* Huru GYM Pro: entitlement, Stripe checkout and portal, the Stripe webhook, admin grants, and
 * the gate the AI Coach consults before it spends anything.
 *
 * A factory over server.js's helpers, the same shape as coach/routes.js, so server.js gains one
 * spread line and nothing else here touches upstream code. With HURU_BILLING unset every user
 * counts as Pro and the Coach behaves exactly as upstream ships it.
 *
 * Env: HURU_BILLING=1, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_MONTHLY,
 *      STRIPE_PRICE_YEARLY, HURU_TRIAL_DAYS (first subscription only, default 0).
 * Stripe webhook endpoint: <ORIGIN>/api/huru/stripe/webhook, events checkout.session.completed
 * and customer.subscription.created / .updated / .deleted.
 */
import * as store from './billing-store.js';
import { stripeRequest, verifySignature, StripeError } from './stripe.js';

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

export function huruRoutes({ json, readBody, readSession, requireAdmin, isAdmin, findUser, origin, audit, env = process.env, fetchImpl }) {
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
        checkout: cfg.enabled && !!cfg.key
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
