/* Huru GYM: who has Pro, and why.
 *
 * Kept in its own file beside db.json (DATA_DIR/huru-billing.json) rather than on the user
 * records, so upstream's schema never has to know billing exists and merges from upstream stay
 * clean. Written the same durable way as everything else under DATA_DIR.
 *
 *   users[uid] = { status, periodEnd, cancelAtPeriodEnd, interval, stripeCustomerId,
 *                  stripeSubscriptionId, trialUsed, grantUntil, lastEventAt, updatedAt }
 *   customers[stripeCustomerId] = uid      (reverse index for webhooks that carry no metadata)
 */
import fs from 'node:fs';
import path from 'node:path';
import { atomicWrite } from '../durable.js';

const DATA = process.env.DATA_DIR || '/data';
const FILE = path.join(DATA, 'huru-billing.json');

// Stripe subscription statuses that unlock Pro. past_due keeps access while Stripe retries the
// card (Smart Retries), so one declined renewal does not lock someone out mid-week.
export const PRO_STATUSES = new Set(['active', 'trialing', 'past_due']);
// A renewal webhook can arrive a little after the period it extends has ended.
const PERIOD_SLACK_MS = 3 * 86400e3;

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e) {
    // Missing is a fresh instance. Unreadable is not papered over: starting empty and saving
    // would silently take Pro away from every paying user.
    if (e.code !== 'ENOENT') throw e;
    cache = {};
  }
  cache.users ||= {};
  cache.customers ||= {};
  return cache;
}

function save() {
  atomicWrite(FILE, JSON.stringify(cache), 0o600);
}

export function get(uid) {
  return load().users[uid] || null;
}

export function all() {
  return { ...load().users };
}

export function update(uid, patch, now = Date.now()) {
  const db = load();
  const next = { ...(db.users[uid] || {}), ...patch, updatedAt: now };
  db.users[uid] = next;
  if (next.stripeCustomerId) db.customers[next.stripeCustomerId] = uid;
  save();
  return next;
}

export function remove(uid) {
  const db = load();
  const e = db.users[uid];
  if (!e) return null;
  delete db.users[uid];
  if (e.stripeCustomerId && db.customers[e.stripeCustomerId] === uid) delete db.customers[e.stripeCustomerId];
  save();
  return e;
}

export function uidForCustomer(customerId) {
  return (customerId && load().customers[customerId]) || null;
}

export function isPro(uid, now = Date.now()) {
  const e = get(uid);
  if (!e) return false;
  if (e.grantUntil && e.grantUntil > now) return true;
  if (!PRO_STATUSES.has(e.status)) return false;
  return !e.periodEnd || e.periodEnd * 1000 + PERIOD_SLACK_MS > now;
}

/** Tests only: forget the in-memory copy so the next call reads the file again. */
export function _reset() {
  cache = null;
}
