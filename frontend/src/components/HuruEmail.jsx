// Huru GYM: confirm the sign-in e-mail (Settings → Account). A forgotten-password code is only
// ever mailed to a confirmed address (api/huru/routes.js), so a typo in the address cannot send
// someone else the way into this profile. Upstream's row above this one sets the address; this
// one proves it with a 6-digit code mailed to it.
import { useEffect, useRef, useState } from 'react'
import { t } from '../lib/i18n.js'
import { loadPro, sendEmailCode, verifyEmailCode } from '../lib/huru-pro.js'
import { useUI } from '../store/useUI.js'
import { usePro } from './HuruPro.jsx'
import { Row, Button } from './ui.jsx'
import { passwordError } from './PasswordAuth.jsx'

const errStyle = { color: 'var(--red)', marginTop: 10 }
const codeStyle = { letterSpacing: '.3em', fontWeight: 600, textAlign: 'center', fontSize: '1.2rem' }

export function emailError(e) {
  switch (e?.data?.code) {
    case 'mail-off': return t('This server cannot send e-mail yet.')
    case 'mail-failed': return t('The e-mail could not be sent. Try again in a moment.')
    case 'no-email': return t('Add a sign-in e-mail first.')
    case 'code-wrong': return t('That code is not right.')
    case 'code-expired': return t('That code has expired. Send a new one.')
    case 'code-locked': return t('Too many wrong codes. Send a new one.')
    case 'code-none': return t('Send a code first.')
  }
  return passwordError(e)
}

export function ConfirmEmailSheet({ address, close }) {
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const ref = useRef(null)
  useEffect(() => { if (sent) setTimeout(() => ref.current?.focus(), 150) }, [sent])
  const send = async () => {
    if (busy) return
    setBusy(true); setErr(null)
    try {
      const r = await sendEmailCode()
      if (r?.verified) { await loadPro({ force: true }); close(); useUI.getState().toast(t('E-mail confirmed')); return }
      setSent(true)
    } catch (e) { setErr(emailError(e)) }
    finally { setBusy(false) }
  }
  const confirm = async ev => {
    ev.preventDefault()
    if (busy) return
    const clean = code.replace(/\D/g, '')
    if (clean.length !== 6) { setErr(t('Enter the 6-digit code.')); return }
    setBusy(true); setErr(null)
    try {
      await verifyEmailCode(clean)
      await loadPro({ force: true })
      close()
      useUI.getState().toast(t('E-mail confirmed'))
    } catch (e) { setErr(emailError(e)) }
    finally { setBusy(false) }
  }
  return <>
    <h3>{t('Confirm your e-mail')}</h3>
    <div className="muted small" style={{ marginBottom: 14, overflowWrap: 'anywhere' }}>
      {sent ? t('We sent a 6-digit code to {0}. It works for 30 minutes. Check your spam folder too.', address)
        : t('We send a 6-digit code to {0}. Once confirmed, a forgotten password can be reset by e-mail.', address)}
    </div>
    {sent ? <form onSubmit={confirm} noValidate>
      <input ref={ref} className="input" name="email-code" autoComplete="one-time-code" inputMode="numeric" placeholder="000000" maxLength={7}
        value={code} onChange={e => setCode(e.target.value)} style={codeStyle} />
      {err && <div className="small" role="alert" style={errStyle}>{err}</div>}
      <div style={{ height: 12 }} />
      <Button type="submit" variant="primary" disabled={busy}>{t('Confirm')}</Button>
      <div style={{ height: 8 }} />
      <Button type="button" variant="ghost" className="dim" disabled={busy} onClick={send}>{t('Send a new code')}</Button>
    </form> : <>
      {err && <div className="small" role="alert" style={errStyle}>{err}</div>}
      <Button variant="primary" disabled={busy} onClick={send}>{busy ? t('Sending…') : t('Send code')}</Button>
    </>}
  </>
}

/** Settings → Account: shown while the profile has a sign-in e-mail. */
export function EmailConfirmRow() {
  const { me } = usePro()
  // The address can change in upstream's row on this same page, so ask again on every visit.
  useEffect(() => { loadPro({ force: true }) }, [])
  const e = me?.email
  if (!e?.address) return null
  if (e.verified) return <Row icon="checkCircle" iconTint="var(--green)" title={t('E-mail confirmed')} subtitle={e.address} accessory="none" />
  return <Row icon="envelope" iconTint="var(--orange)" title={t('Confirm your e-mail')}
    subtitle={t('Needed to reset a forgotten password by e-mail')} accessory="chevron"
    onClick={() => useUI.getState().openSheet(close => <ConfirmEmailSheet address={e.address} close={close} />)} />
}
