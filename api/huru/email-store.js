/* Huru GYM: which sign-in e-mail each account has confirmed, and the code it is confirming with.
 *
 * DATA_DIR/huru-email.json, beside db.json like consent-store.js, so upstream's user records stay
 * untouched. One record per account:
 *   users[uid] = { email, verifiedAt, pending: { email, h, exp, tries } }
 * A confirmation belongs to an address: when the account's sign-in e-mail changes (upstream's
 * Settings row), it no longer matches `email` and counts as unconfirmed until confirmed again.
 * Codes are 6 digits, kept only as a hash salted with the account id.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { atomicWrite } from '../durable.js';

const DATA = process.env.DATA_DIR || '/data';
const FILE = path.join(DATA, 'huru-email.json');
export const CODE_TTL_MS = 30 * 60000;
export const MAX_TRIES = 5;

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    cache = {};
  }
  cache.users ||= {};
  return cache;
}

const save = () => atomicWrite(FILE, JSON.stringify(cache), 0o600);
const hash = (uid, code) => crypto.createHash('sha256').update(`huru-email:${uid}:${String(code).trim()}`).digest('hex');

/** True when `email` is the address this account confirmed. */
export function isVerified(uid, email) {
  const r = load().users[uid];
  return !!(email && r && r.verifiedAt && r.email === email);
}

/** A new 6-digit code for `email`; replaces any code still pending. */
export function newCode(uid, email, now = Date.now()) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const r = load().users[uid] || {};
  r.pending = { email, h: hash(uid, code), exp: now + CODE_TTL_MS, tries: 0 };
  cache.users[uid] = r;
  save();
  return code;
}

/** 'ok' | 'none' (no code for this address) | 'expired' | 'locked' | 'wrong'. */
export function check(uid, email, code, now = Date.now()) {
  const r = load().users[uid];
  const p = r?.pending;
  if (!p || p.email !== email) return 'none';
  if (!(p.exp > now)) return 'expired';
  if (p.tries >= MAX_TRIES) return 'locked';
  const a = Buffer.from(hash(uid, code), 'hex'), b = Buffer.from(p.h, 'hex');
  if (!(a.length === b.length && crypto.timingSafeEqual(a, b))) {
    p.tries += 1;
    save();
    return p.tries >= MAX_TRIES ? 'locked' : 'wrong';
  }
  cache.users[uid] = { email, verifiedAt: now };
  save();
  return 'ok';
}

export function remove(uid) {
  if (!load().users[uid]) return;
  delete cache.users[uid];
  save();
}

/** Tests only. */
export function _reset() {
  cache = null;
}
