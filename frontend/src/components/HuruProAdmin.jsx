// Huru GYM: Pro for one profile, in the admin's user sheet (views/Admin.jsx, UserDetail). Says
// what Pro they have and why, and gives or ends free Pro (POST /api/huru/admin/grant), e.g. for
// beta testers. English-only like the rest of the admin dashboard. Renders nothing on a server
// without the Huru routes.
import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { useUI } from '../store/useUI.js'
import { confirmSheet } from '../sheets.jsx'

export const GRANT_DAYS = [30, 90, 365]
const day = ms => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const daysLabel = d => d === 365 ? '1 year' : d + ' days'

/** One sentence on what Pro this profile has, from GET /api/huru/admin/pro. */
export function proLine(p, now = Date.now()) {
  if (!p.billing) return 'Billing is off on this server, so everyone has Pro.'
  if (p.admin) return 'Admins always have Pro.'
  const parts = []
  if ((p.status === 'active' || p.status === 'trialing') && p.periodEnd) {
    const what = p.status === 'trialing' ? 'Free trial' : 'Paid subscription'
    const plan = p.interval ? ` (${p.interval}ly)` : ''
    parts.push(`${what}${plan}, ${p.cancelAtPeriodEnd ? 'ends' : 'renews'} ${day(p.periodEnd * 1000)}.`)
  } else if (p.status === 'past_due') parts.push('Subscription payment failed; Stripe is retrying.')
  if (p.grantUntil && p.grantUntil > now) parts.push(`Free Pro until ${day(p.grantUntil)}.`)
  return parts.length ? parts.join(' ') : 'No Pro. Free Pro lets them try the AI Coach without a card.'
}

export default function HuruProAdmin({ uid, name }) {
  const [p, setP] = useState(null)
  const [busy, setBusy] = useState(false)
  const toast = useUI(s => s.toast)
  const load = () => api('/api/huru/admin/pro?uid=' + encodeURIComponent(uid))
    .then(setP)
    .catch(e => setP(e?.status === 404 ? { missing: true } : { error: e?.message || 'could not load' }))
  useEffect(() => { load() }, [uid])
  if (!p || p.missing) return null

  const grant = days => {
    if (busy) return
    setBusy(true)
    api('/api/huru/admin/grant', { method: 'POST', body: JSON.stringify({ uid, days }) })
      .then(r => { toast(days ? `${name} has free Pro until ${day(r.grantUntil)}` : `Free Pro ended for ${name}`); return load() })
      .catch(e => toast(e.message))
      .finally(() => setBusy(false))
  }
  const freeUntil = p.grantUntil && p.grantUntil > Date.now() ? p.grantUntil : null

  return <>
    <h4 className="sec">Huru GYM Pro</h4>
    {p.error ? <div className="adm-hint">{p.error}</div> : <>
      <div className="adm-hint" style={{ marginBottom: 10 }}>{proLine(p)}</div>
      {p.billing && !p.admin && <>
        <div className="row" style={{ gap: 8 }}>
          {GRANT_DAYS.map(d => <button key={d} type="button" className="btn" style={{ flex: 1 }} disabled={busy}
            onClick={() => grant(d)}>{freeUntil ? 'Set' : 'Give'} {daysLabel(d)}</button>)}
        </div>
        <div className="adm-hint">Free Pro needs no card and ends on its own; counted from today. It does not touch a paid subscription.</div>
        {freeUntil && <button type="button" className="btn danger" style={{ margin: '10px 0 4px' }} disabled={busy}
          onClick={() => confirmSheet({
            title: 'End ' + name + '’s free Pro?',
            message: 'Pro features stop now unless they also pay for a subscription. Their data stays.',
            confirmText: 'End free Pro',
            danger: true,
            onConfirm: () => grant(0),
          })}>End free Pro</button>}
      </>}
    </>}
  </>
}
