/* Huru GYM Pro: entitlement store, Stripe signature and encoding, the routes driven with fakes,
 * and the Coach enqueue gate through the real jobs.enqueue. No network: Stripe is a fake fetch.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { tempData, writeState, sampleState } from './helpers.mjs';

const DIR = tempData();
const store = await import('../huru/billing-store.js');
const { form, verifySignature, signPayload } = await import('../huru/stripe.js');
const { huruRoutes, subscriptionPatch, billingConfig } = await import('../huru/routes.js');
const cfg = await import('../coach/config.js');
const jobs = await import('../coach/jobs.js');
const { forcePrivilegeVerdict } = await import('../coach/adapters/spawn.js');

const WHSEC = 'whsec_test_secret';
const NOW_S = () => Math.floor(Date.now() / 1000);

/* ------------------------------------------------------------------ fakes */
const users = [
  { id: 'u-free', name: 'Free', email: 'free@example.com' },
  { id: 'u-paid', name: 'Paid', email: 'paid@example.com' },
  { id: 'u-admin', name: 'Owner', admin: true }
];
const findUser = uid => users.find(u => u.id === uid) || null;

function fakeRes() {
  const r = { code: null, body: null };
  return { r, res: r };
}
function json(res, code, obj) { res.code = code; res.body = obj; }
const reqFor = (user, body, headers = {}) => Object.assign(Readable.from(body == null ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]), { user, headers });
const readSession = req => req.user || null;
const readBody = async req => { const c = []; for await (const d of req) c.push(d); return c.length ? JSON.parse(Buffer.concat(c).toString()) : {}; };
const requireAdmin = (req, res) => (req.user?.admin ? req.user : (json(res, 403, { error: 'forbidden' }), null));
const isAdmin = u => !!u?.admin;

function stripeFake(answers = {}) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body ? new URLSearchParams(init.body) : null, auth: init.headers.Authorization });
    const path = new URL(url).pathname.replace('/v1', '');
    const a = answers[path] || answers['*'] || { status: 200, body: {} };
    return { ok: a.status < 300, status: a.status, text: async () => JSON.stringify(a.body) };
  };
  f.calls = calls;
  return f;
}

const ENV = {
  HURU_BILLING: '1', STRIPE_SECRET_KEY: 'sk_test_1', STRIPE_WEBHOOK_SECRET: WHSEC,
  STRIPE_PRICE_MONTHLY: 'price_m', STRIPE_PRICE_YEARLY: 'price_y', HURU_TRIAL_DAYS: '7'
};
const purged = []
const make = (env = ENV, fetchImpl = stripeFake()) =>
  huruRoutes({ json, readBody, readSession, requireAdmin, isAdmin, findUser, origin: 'https://gym.example.com/', env, fetchImpl,
    countAdmins: () => 1, purgeUser: u => purged.push(u.id), clearCoach: () => {} });

async function call(h, key, user, body, headers) {
  const { res } = fakeRes();
  await h.routes[key](reqFor(user, body, headers), res);
  return res;
}
const webhook = (h, event, secret = WHSEC, t = NOW_S()) => {
  const raw = JSON.stringify(event);
  return call(h, 'POST /api/huru/stripe/webhook', null, raw, { 'stripe-signature': signPayload(Buffer.from(raw), secret, t) });
};

/* ------------------------------------------------------------------ stripe.js */
test('form encodes nested objects and arrays the way Stripe reads them', () => {
  const p = form({ mode: 'subscription', line_items: [{ price: 'p', quantity: 1 }], subscription_data: { metadata: { uid: 'u1' } }, skip: null });
  assert.equal(p.get('line_items[0][price]'), 'p');
  assert.equal(p.get('line_items[0][quantity]'), '1');
  assert.equal(p.get('subscription_data[metadata][uid]'), 'u1');
  assert.equal(p.has('skip'), false);
});

test('webhook signatures: valid accepted; tampered, stale, unsigned or wrong secret refused', () => {
  const raw = Buffer.from('{"id":"evt_1"}');
  const header = signPayload(raw, WHSEC);
  assert.equal(verifySignature(raw, header, WHSEC), true);
  assert.equal(verifySignature(Buffer.from('{"id":"evt_2"}'), header, WHSEC), false);
  assert.equal(verifySignature(raw, header, 'whsec_other'), false);
  assert.equal(verifySignature(raw, signPayload(raw, WHSEC, NOW_S() - 3600), WHSEC), false);
  assert.equal(verifySignature(raw, '', WHSEC), false);
  assert.equal(verifySignature(raw, header, ''), false);
  // Stripe sends several v1 values while a secret is being rolled; any one may match.
  const [t, v1] = header.split(',');
  assert.equal(verifySignature(raw, `${t},v1=${'0'.repeat(64)},${v1}`, WHSEC), true);
});

/* ------------------------------------------------------------------ store */
test('isPro: paying statuses, period end with slack, grants, and nothing else', () => {
  const now = Date.now();
  store.update('s-active', { status: 'active', periodEnd: NOW_S() + 86400 });
  store.update('s-pastdue', { status: 'past_due', periodEnd: NOW_S() + 86400 });
  store.update('s-canceled', { status: 'canceled', periodEnd: NOW_S() + 86400 });
  store.update('s-lapsed', { status: 'active', periodEnd: NOW_S() - 10 * 86400 });
  store.update('s-late', { status: 'active', periodEnd: NOW_S() - 86400 });
  store.update('s-grant', { grantUntil: now + 86400e3 });
  store.update('s-oldgrant', { grantUntil: now - 1 });
  assert.equal(store.isPro('s-active'), true);
  assert.equal(store.isPro('s-pastdue'), true);
  assert.equal(store.isPro('s-canceled'), false);
  assert.equal(store.isPro('s-lapsed'), false);
  assert.equal(store.isPro('s-late'), true, 'a renewal webhook a day late does not lock anyone out');
  assert.equal(store.isPro('s-grant'), true);
  assert.equal(store.isPro('s-oldgrant'), false);
  assert.equal(store.isPro('nobody'), false);
});

test('the store survives a restart and keeps the customer index', () => {
  store.update('s-cust', { stripeCustomerId: 'cus_9', status: 'active' });
  store._reset();
  assert.equal(store.uidForCustomer('cus_9'), 's-cust');
  const mode = fs.statSync(path.join(DIR, 'huru-billing.json')).mode & 0o777;
  if (process.platform !== 'win32') assert.equal(mode, 0o600);
});

test('subscriptionPatch reads the period end from either API version', () => {
  assert.equal(subscriptionPatch({ id: 's', status: 'active', current_period_end: 100, customer: 'c' }).periodEnd, 100);
  const newer = { id: 's', status: 'trialing', customer: { id: 'c' }, items: { data: [{ current_period_end: 200, price: { recurring: { interval: 'year' } } }] } };
  const p = subscriptionPatch(newer);
  assert.deepEqual([p.periodEnd, p.interval, p.stripeCustomerId, p.trialUsed], [200, 'year', 'c', true]);
  assert.equal(subscriptionPatch(newer, true).status, 'canceled');
});

/* ------------------------------------------------------------------ routes */
test('billing off: everyone is Pro, checkout refuses, the gate lets jobs through', async () => {
  const h = make({});
  const me = await call(h, 'GET /api/huru/me', users[0]);
  assert.equal(me.code, 200);
  assert.deepEqual([me.body.billing, me.body.pro, me.body.checkout], [false, true, false]);
  assert.equal((await call(h, 'POST /api/huru/checkout', users[0], { plan: 'monthly' })).code, 503);
  assert.equal(h.coachGate('u-free'), null);
  assert.equal(billingConfig({}).enabled, false);
});

test('billing on: free users are gated, admins never are', async () => {
  const h = make();
  assert.deepEqual(h.coachGate('u-free'), { code: 'pro', message: 'the AI Coach is part of Huru GYM Pro' });
  assert.equal(h.coachGate('u-admin'), null);
  const me = await call(h, 'GET /api/huru/me', users[0]);
  assert.deepEqual([me.body.pro, me.body.trialDays, me.body.plans], [false, 7, { monthly: true, yearly: true }]);
  assert.equal((await call(h, 'GET /api/huru/me', null)).code, 401);
});

test('checkout: subscription session with trial, uid and return URLs on the app', async () => {
  const f = stripeFake({ '/checkout/sessions': { status: 200, body: { url: 'https://checkout.stripe.com/c/1' } } });
  const h = make(ENV, f);
  const res = await call(h, 'POST /api/huru/checkout', users[0], { plan: 'yearly' });
  assert.equal(res.code, 200);
  assert.equal(res.body.url, 'https://checkout.stripe.com/c/1');
  const b = f.calls[0].body;
  assert.equal(f.calls[0].auth, 'Bearer sk_test_1');
  assert.equal(b.get('mode'), 'subscription');
  assert.equal(b.get('line_items[0][price]'), 'price_y');
  assert.equal(b.get('client_reference_id'), 'u-free');
  assert.equal(b.get('subscription_data[metadata][uid]'), 'u-free');
  assert.equal(b.get('subscription_data[trial_period_days]'), '7');
  assert.equal(b.get('customer_email'), 'free@example.com');
  assert.equal(b.get('success_url'), 'https://gym.example.com/#/pro?checkout=success');
});

test('checkout: Stripe failing is a 502 for the user, not a crash', async () => {
  const h = make(ENV, stripeFake({ '*': { status: 400, body: { error: { message: 'No such price' } } } }));
  const res = await call(h, 'POST /api/huru/checkout', users[0], { plan: 'monthly' });
  assert.equal(res.code, 502);
  assert.equal(res.body.code, 'stripe');
});

test('webhook: checkout completes, Pro appears; a cancellation takes it away; no second trial', async () => {
  const sub = { id: 'sub_1', customer: 'cus_1', status: 'trialing', trial_start: NOW_S(), current_period_end: NOW_S() + 7 * 86400, items: { data: [{ price: { recurring: { interval: 'month' } } }] }, metadata: { uid: 'u-paid' } };
  const f = stripeFake({ '/subscriptions/sub_1': { status: 200, body: sub } });
  const h = make(ENV, f);

  const done = await webhook(h, { id: 'evt_1', type: 'checkout.session.completed', created: NOW_S(), data: { object: { mode: 'subscription', client_reference_id: 'u-paid', customer: 'cus_1', subscription: 'sub_1' } } });
  assert.equal(done.code, 200);
  assert.equal(store.isPro('u-paid'), true);
  assert.equal(h.coachGate('u-paid'), null);
  assert.equal(store.uidForCustomer('cus_1'), 'u-paid');

  // An older event arriving late changes nothing.
  await webhook(h, { id: 'evt_0', type: 'customer.subscription.updated', created: NOW_S() - 600, data: { object: { ...sub, status: 'canceled' } } });
  assert.equal(store.isPro('u-paid'), true);

  // Customer-only event (no metadata) still finds the user through the customer index.
  const { metadata, ...bare } = sub;
  await webhook(h, { id: 'evt_2', type: 'customer.subscription.deleted', created: NOW_S() + 1, data: { object: bare } });
  assert.equal(store.isPro('u-paid'), false);
  assert.deepEqual(h.coachGate('u-paid')?.code, 'pro');

  const me = await call(h, 'GET /api/huru/me', users[1]);
  assert.equal(me.body.trialDays, 0, 'the trial is offered once');
  assert.equal(me.body.canManage, true);
});

test('webhook: bad signatures are refused and change nothing', async () => {
  const h = make();
  const evt = { id: 'evt_x', type: 'customer.subscription.updated', created: NOW_S(), data: { object: { id: 'sub_x', customer: 'cus_x', status: 'active', metadata: { uid: 'u-free' } } } };
  assert.equal((await webhook(h, evt, 'whsec_wrong')).code, 400);
  assert.equal((await call(h, 'POST /api/huru/stripe/webhook', null, JSON.stringify(evt), {})).code, 400);
  assert.equal(store.isPro('u-free'), false);
  // Events for unknown users or types are acknowledged, so Stripe stops retrying them.
  assert.equal((await webhook(h, { ...evt, data: { object: { ...evt.data.object, metadata: { uid: 'ghost' } } } })).code, 200);
  assert.equal((await webhook(h, { id: 'e', type: 'invoice.paid', created: NOW_S(), data: { object: {} } })).code, 200);
});

test('admin grants Pro for a number of days, and only an admin can', async () => {
  const h = make();
  assert.equal((await call(h, 'POST /api/huru/admin/grant', users[0], { uid: 'u-free', days: 30 })).code, 403);
  const ok = await call(h, 'POST /api/huru/admin/grant', users[2], { uid: 'u-free', days: 30 });
  assert.equal(ok.code, 200);
  assert.equal(store.isPro('u-free'), true);
  const list = await call(h, 'GET /api/huru/admin/billing', users[2]);
  assert.ok(list.body.rows.some(r => r.uid === 'u-free' && r.pro));
  await call(h, 'POST /api/huru/admin/grant', users[2], { uid: 'u-free', days: 0 });
  assert.equal(store.isPro('u-free'), false);
  assert.equal((await call(h, 'POST /api/huru/admin/grant', users[2], { uid: 'ghost', days: 3 })).code, 404);
});

test('admin reads one profile’s Pro: free Pro shows until when, and only an admin can ask', async () => {
  const h = make();
  const pro = async (asUser, uid) => {
    const { res } = fakeRes();
    await h.routes['GET /api/huru/admin/pro'](Object.assign(reqFor(asUser), { url: '/api/huru/admin/pro?uid=' + uid }), res);
    return res;
  };
  assert.equal((await pro(users[0], 'u-free')).code, 403);
  assert.equal((await pro(users[2], 'ghost')).code, 404);
  await call(h, 'POST /api/huru/admin/grant', users[2], { uid: 'u-free', days: 30 });
  const r = await pro(users[2], 'u-free');
  assert.equal(r.code, 200);
  assert.equal(r.body.billing, true);
  assert.equal(r.body.pro, true);
  assert.ok(r.body.grantUntil > Date.now() + 29 * 86400e3 && r.body.grantUntil <= Date.now() + 30 * 86400e3);
  await call(h, 'POST /api/huru/admin/grant', users[2], { uid: 'u-free', days: 0 });
  const after = await pro(users[2], 'u-free');
  assert.deepEqual([after.body.pro, after.body.grantUntil], [false, null]);
  assert.deepEqual([(await pro(users[2], 'u-admin')).body.admin, (await pro(users[2], 'u-admin')).body.pro], [true, true]);
});

test('deleting an account cancels its Stripe subscription first, and keeps everything if that fails', async () => {
  store.update('u-free', { stripeSubscriptionId: 'sub_del', stripeCustomerId: 'cus_del', status: 'active', periodEnd: NOW_S() + 86400 });
  const down = stripeFake({ '*': { status: 500, body: { error: { message: 'down' } } } });
  const failed = await call(make(ENV, down), 'POST /api/huru/account/delete', users[0], { confirmName: 'Free' });
  assert.equal(failed.code, 502);
  assert.equal(purged.includes('u-free'), false, 'nothing deleted while the subscription still charges');
  assert.equal(store.isPro('u-free'), true);

  const up = stripeFake({ '/subscriptions/sub_del': { status: 200, body: { id: 'sub_del', status: 'canceled' } } });
  const ok = await call(make(ENV, up), 'POST /api/huru/account/delete', users[0], { confirmName: 'Free' });
  assert.equal(ok.code, 200);
  assert.equal(up.calls[0].method, 'DELETE');
  assert.ok(purged.includes('u-free'));
  assert.equal(store.get('u-free'), null, 'the billing record is gone');
  assert.equal(store.uidForCustomer('cus_del'), null);
});

/* ------------------------------------------------------------------ the real enqueue */
test('jobs.enqueue refuses a gated profile with code pro, before consent or caps', () => {
  cfg.save({ enabled: true, provider: 'fixture' });
  forcePrivilegeVerdict({ ok: true, dropped: false, why: 'pinned by the test suite' });
  writeState(DIR, 'u-free', sampleState({ coach: { consent: { agreedAt: Date.now() } } }));
  jobs.setEnqueueGate(make().coachGate);
  try {
    assert.throws(() => jobs.enqueue('u-free', { kind: 'review' }), e => e instanceof jobs.CoachError && e.code === 'pro');
  } finally {
    jobs.setEnqueueGate(null);
  }
});

test('the api image carries huru/', () => {
  const dockerfile = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'Dockerfile'), 'utf8');
  assert.match(dockerfile, /^COPY huru \.\/huru$/m);
});
