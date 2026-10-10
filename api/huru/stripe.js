/* Huru GYM: the few Stripe calls billing needs, over plain HTTPS.
 *
 * No Stripe SDK: api/ keeps its dependency count tiny (CONTRIBUTING.md), and three endpoints
 * plus webhook verification do not justify one. Node's global fetch carries the requests.
 */
import crypto from 'node:crypto';

const API = 'https://api.stripe.com/v1';

/** Stripe's form encoding: nested objects and arrays become a[b][0][c]=v. */
export function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export class StripeError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function stripeRequest(method, path, params, { key, fetchImpl = fetch } = {}) {
  if (!key) throw new StripeError('billing is not configured', 503);
  const res = await fetchImpl(API + path, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' || !params ? undefined : form(params).toString()
  });
  const text = await res.text();
  let body = {};
  try { body = JSON.parse(text); } catch { /* not JSON: keep the status */ }
  if (!res.ok) throw new StripeError(body?.error?.message || `Stripe answered ${res.status}`, res.status);
  return body;
}

/* Webhook signature, as Stripe documents it: header `t=<unix>,v1=<hex>[,v1=...]`, where each v1
   is HMAC-SHA256(secret, `${t}.${rawBody}`). The raw bytes matter: re-serialised JSON would not
   match. A timestamp outside the tolerance is refused so a captured event cannot be replayed. */
export function verifySignature(rawBody, header, secret, { toleranceSec = 300, now = Date.now() } = {}) {
  if (!secret || !header) return false;
  let t = null;
  const sigs = [];
  for (const part of String(header).split(',')) {
    const [k, v] = part.split('=', 2);
    if (k === 't') t = Number(v);
    else if (k === 'v1' && v) sigs.push(v);
  }
  if (!Number.isFinite(t) || !sigs.length) return false;
  if (Math.abs(now / 1000 - t) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest();
  return sigs.some(s => {
    const got = Buffer.from(s, 'hex');
    return got.length === expected.length && crypto.timingSafeEqual(got, expected);
  });
}

/** Test helper and documentation in one: the header Stripe would send for this body. */
export function signPayload(rawBody, secret, t = Math.floor(Date.now() / 1000)) {
  const sig = crypto.createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest('hex');
  return `t=${t},v1=${sig}`;
}
