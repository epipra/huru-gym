// Huru GYM Pro on the client: what the server says about this profile's plan, and the two
// exits to Stripe (checkout, billing portal). The server is the gate (api/huru/routes.js and the
// Coach's enqueue gate); this only decides what to show.
//
// A server without the Huru billing routes (upstream openGym, or an older Huru build) answers
// /api/huru/me with 404. That reads as "no billing here": everyone has everything, nothing is
// shown, so this module is inert outside a Huru deployment.
import { api } from './api.js'
import { t } from './i18n-core.js'
import { fmtDate } from './format.js'

const ENV = import.meta.env || {}

// Shown on the Pro screen; must match the prices configured in Stripe. Set at build time.
export const PRICE_LABELS = {
  monthly: ENV.VITE_PRO_PRICE_MONTHLY || '$5.99',
  yearly: ENV.VITE_PRO_PRICE_YEARLY || '$39.99'
}

const NO_BILLING = { billing: false, pro: true }

let state = { loaded: false, me: null, error: null }
let inflight = null
const subs = new Set()

export const getProState = () => state
export function subscribePro(fn) { subs.add(fn); return () => subs.delete(fn) }
function set(next) { state = next; for (const fn of subs) fn() }

// `uid` keys the answer to the signed-in profile: after a switch of account the old answer is
// not shown for the new one (components/HuruPro.jsx usePro compares it).
export function loadPro({ force = false, request = api, uid = state.uid } = {}) {
  if (inflight) return inflight
  if (state.loaded && !force && state.uid === uid) return Promise.resolve(state)
  const same = state.uid === uid
  inflight = request('/api/huru/me')
    .then(me => set({ loaded: true, me, error: null, uid }))
    .catch(e => set({ loaded: true, me: e?.status === 404 ? NO_BILLING : (same ? state.me : null), error: e?.status === 404 ? null : e, uid }))
    .then(() => { inflight = null; return state })
  return inflight
}

/** True when this profile is shown the upgrade screen instead of the Coach. */
export const needsPro = me => !!me && me.billing === true && me.pro === false

/** Unix seconds or ms to the YYYY-MM-DD fmtDate expects, in local time. */
export function isoDay(stamp) {
  if (!stamp) return null
  const d = new Date(stamp < 1e12 ? stamp * 1000 : stamp)
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** One line under "Huru GYM Pro" in Settings and on the Pro screen. */
export function proStatusLine(me, fmt = fmtDate) {
  if (!me || !me.billing) return ''
  if (!me.pro) return me.trialDays ? t('Free plan · {0}-day free trial available', me.trialDays) : t('Free plan')
  if (me.source === 'admin') return t('Included for admins')
  if (me.source === 'grant') return t('Complimentary until {0}', fmt(isoDay(me.grantUntil), true, true))
  const day = me.periodEnd ? fmt(isoDay(me.periodEnd), true, true) : null
  if (me.status === 'trialing') return day ? t('Free trial until {0}', day) : t('Free trial')
  if (me.status === 'past_due') return t('Payment failed, update your card to keep Pro')
  if (me.cancelAtPeriodEnd) return day ? t('Ends on {0}', day) : t('Ends at the end of this period')
  const plan = me.interval === 'year' ? t('Yearly') : t('Monthly')
  return day ? t('{0} · renews on {1}', plan, day) : plan
}

async function go(path, body, request) {
  const { url } = await request(path, { method: 'POST', body: JSON.stringify(body || {}) })
  if (!url || !/^https:\/\//.test(url)) throw new Error(t('The payment page could not be opened.'))
  globalThis.location.assign(url)
}

export const startCheckout = (plan, request = api) => go('/api/huru/checkout', { plan: plan === 'yearly' ? 'yearly' : 'monthly' }, request)
export const openBillingPortal = (request = api) => go('/api/huru/portal', {}, request)

/** Consent screen: health-data processing and the Terms, for the server's current version. */
export async function acceptConsent(version, request = api) {
  await request('/api/huru/consent', { method: 'POST', body: JSON.stringify({ health: true, terms: true, version }) })
  return loadPro({ force: true, request, uid: state.uid })
}

/** Needs the consent screen: a Huru server that says this profile has not agreed yet. */
export const needsConsent = me => !!me?.consent && me.consent.accepted === false

/** Deletes the signed-in account on the server. Throws with the server's words on refusal. */
export async function deleteAccount({ confirmName, password }, request = api) {
  return request('/api/huru/account/delete', { method: 'POST', body: JSON.stringify({ confirmName, password: password || undefined }) })
}

/** Forgot password: the server e-mails a one-time code to the profile with this sign-in e-mail,
 *  redeemed with passwordResetRedeem (lib/api.js). The answer is the same whether or not the
 *  address belongs to anyone. */
export async function requestResetCode(email, request = api) {
  return request('/api/huru/password/forgot', { method: 'POST', body: JSON.stringify({ email }) })
}

/** Mails a 6-digit code to the signed-in profile's sign-in e-mail (api/huru/email-store.js). */
export async function sendEmailCode(request = api) {
  return request('/api/huru/email/send-code', { method: 'POST', body: '{}' })
}

/** Confirms the sign-in e-mail with that code. */
export async function verifyEmailCode(code, request = api) {
  return request('/api/huru/email/verify', { method: 'POST', body: JSON.stringify({ code }) })
}
