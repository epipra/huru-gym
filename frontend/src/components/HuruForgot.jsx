// Huru GYM: "Forgot your password?" on the password sign-in sheet. Two steps on one sheet: the
// sign-in e-mail, which the server answers by mailing a one-time code (api/huru/routes.js), then
// that code and a new password, redeemed at upstream's reset route exactly like an admin's code.
import { useEffect, useRef, useState } from 'react'
import { t } from '../lib/i18n.js'
import { passwordResetRedeem } from '../lib/api.js'
import { requestResetCode } from '../lib/huru-pro.js'
import { useUI } from '../store/useUI.js'
import { Button } from './ui.jsx'
import { MIN_PASSWORD, looksLikeEmail, passwordError, signedIn } from './PasswordAuth.jsx'

const errStyle = { color: 'var(--red)', marginTop: 10 }
const field = { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false }
const codeStyle = { letterSpacing: '.14em', fontWeight: 600, textAlign: 'center' }
const length = s => [...String(s || '')].length

// The server's refusals in the UI language; the password ones are upstream's.
export function forgotError(e) {
  if (e?.data?.code === 'mail-off') return t('This server cannot send e-mail. Ask your admin for a reset code.')
  return passwordError(e)
}

export function ForgotPasswordSheet({ close }) {
  const [step, setStep] = useState('email')   // 'email' | 'code'
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const emailRef = useRef(null)
  useEffect(() => { setTimeout(() => emailRef.current?.focus(), 250) }, [])
  const clean = email.trim()

  const send = async ev => {
    ev.preventDefault()
    if (busy) return
    if (!looksLikeEmail(clean)) { setErr(t('That is not an e-mail address.')); return }
    setBusy(true); setErr(null)
    try { await requestResetCode(clean); setStep('code') }
    catch (e) { setErr(forgotError(e)) }
    finally { setBusy(false) }
  }
  const redeem = async ev => {
    ev.preventDefault()
    if (busy) return
    const bad = !code.trim() ? t('Enter the reset code.')
      : length(next) < MIN_PASSWORD ? t('Use at least {0} characters.', MIN_PASSWORD)
      : next !== again ? t('The two passwords are not the same.')
      : null
    if (bad) { setErr(bad); return }
    setBusy(true); setErr(null)
    try { await signedIn(await passwordResetRedeem(clean, code.trim(), next), close) }
    catch (e) { setErr(forgotError(e)) }
    finally { setBusy(false) }
  }

  return <>
    <h3>{t('Forgot your password?')}</h3>
    {step === 'email' ? <>
      <div className="muted small" style={{ marginBottom: 14 }}>{t('Enter the confirmed sign-in e-mail of your profile. We e-mail you a code to set a new password.')}</div>
      <form onSubmit={send} noValidate>
        <input ref={emailRef} className="input" type="email" name="email" autoComplete="email" inputMode="email" placeholder={t('E-mail address')} maxLength={254}
          value={email} onChange={e => setEmail(e.target.value)} {...field} />
        {err && <div className="small" role="alert" style={errStyle}>{err}</div>}
        <div style={{ height: 12 }} />
        <Button type="submit" variant="primary" disabled={busy}>{t('E-mail me a code')}</Button>
      </form>
      <div className="dim small" style={{ marginTop: 10 }}>{t('No confirmed sign-in e-mail on your profile? Ask your admin for a reset code.')}</div>
    </> : <>
      <div className="muted small" style={{ marginBottom: 14, overflowWrap: 'anywhere' }}>
        {t('If {0} is the confirmed sign-in e-mail of a profile, a code is on its way. It works once, for 60 minutes. Check your spam folder too.', clean)}
      </div>
      <form onSubmit={redeem} noValidate>
        <input type="text" name="username" autoComplete="username" value={clean} readOnly hidden />
        <input className="input" name="reset-code" autoComplete="one-time-code" placeholder={t('Reset code')} maxLength={20}
          value={code} onChange={e => setCode(e.target.value.toUpperCase())} {...field} style={codeStyle} />
        <div style={{ height: 10 }} />
        <input className="input" type="password" name="new-password" autoComplete="new-password" placeholder={t('New password')}
          value={next} onChange={e => setNext(e.target.value)} />
        <div style={{ height: 10 }} />
        <input className="input" type="password" name="new-password-again" autoComplete="new-password" placeholder={t('Repeat the password')}
          value={again} onChange={e => setAgain(e.target.value)} />
        <div className="dim small" style={{ marginTop: 6 }}>{t('At least {0} characters. A few unrelated words make a good one.', MIN_PASSWORD)}</div>
        {err && <div className="small" role="alert" style={errStyle}>{err}</div>}
        <div style={{ height: 12 }} />
        <Button type="submit" variant="primary" disabled={busy}>{t('Set password & sign in')}</Button>
      </form>
      <div style={{ height: 8 }} />
      <Button type="button" variant="ghost" className="dim" disabled={busy} onClick={() => { setErr(null); setCode(''); setStep('email') }}>{t('Send another code')}</Button>
    </>}
  </>
}

export const openForgotPassword = () => useUI.getState().openSheet(close => <ForgotPasswordSheet close={close} />)
