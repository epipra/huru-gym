// Huru GYM: the consent screen every profile passes before using the app, and self-service
// account deletion (Settings → Account → Delete account). Both talk to api/huru/routes.js and
// render nothing special on a server without it (lib/huru-pro.js: a 404 means no Huru server).
import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { t } from '../lib/i18n.js'
import { APP_NAME } from '../lib/brand.js'
import { acceptConsent, needsConsent, deleteAccount } from '../lib/huru-pro.js'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { usePro } from './HuruPro.jsx'
import Icon from './Icon.jsx'
import { Section, Row, Button, TextField } from './ui.jsx'

const DELETE_PATH = '/account/delete'

/** In front of the signed-in app: the consent screen until this profile has agreed. The delete
 *  screen stays reachable from it, for someone who would rather not agree. */
export function ConsentGate({ children }) {
  const loc = useLocation()
  const { loaded, me } = usePro()
  if (!loaded) return null
  if (needsConsent(me) && loc.pathname !== DELETE_PATH) return <ConsentScreen consent={me.consent} />
  return children
}

/** True while the consent screen is showing: the app hides its tab bar, whose Start button
 *  would otherwise open a workout around the gate. */
export function useConsentPending() {
  const loc = useLocation()
  const { loaded, me } = usePro()
  return loaded && needsConsent(me) && loc.pathname !== DELETE_PATH
}

const link = (href, label) => href
  ? <a href={href} target="_blank" rel="noopener">{label}</a>
  : label

function Check({ id, checked, onChange, children }) {
  return <label className="lrow tap" htmlFor={id} style={{ alignItems: 'flex-start', gap: 12 }}>
    <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
      style={{ width: 22, height: 22, marginTop: 2, flex: 'none', accentColor: 'var(--acc)' }} />
    <span className="lrow-m"><span className="lrow-t" style={{ whiteSpace: 'normal' }}>{children}</span></span>
  </label>
}

function ConsentScreen({ consent }) {
  const nav = useNavigate()
  const toast = useUI(s => s.toast)
  const [health, setHealth] = useState(false)
  const [terms, setTerms] = useState(false)
  const [busy, setBusy] = useState(false)
  const privacy = link(consent.privacyUrl, t('Privacy Policy'))

  const agree = async () => {
    setBusy(true)
    try { await acceptConsent(consent.version) } catch (e) { toast(e?.message || t('Something went wrong, try again.')); setBusy(false) }
  }

  return <div className="narrow">
    <div className="hdr"><div><h1>{t('Before you start')}</h1>
      <div className="sub">{t('{0} needs your OK for two things', APP_NAME)}</div></div></div>
    <Section footer={t('Your body weight, measurements and training history can reveal information about your health. We use them only to run the app for you, never for advertising, and never sell them. You can withdraw by deleting your data or your account at any time.')}>
      <Check id="consent-health" checked={health} onChange={setHealth}>
        {t('I agree that {0} stores and processes my fitness and body data, such as workouts, body weight and measurements, to run the app for me.', APP_NAME)}{' '}
        <span className="dim">({privacy})</span>
      </Check>
      <Check id="consent-terms" checked={terms} onChange={setTerms}>
        {t('I am 16 or older and accept the')} {link(consent.termsUrl, t('Terms of Service'))} {t('and the')} {privacy}.
      </Check>
    </Section>
    <div style={{ padding: '0 16px' }}>
      <Button variant="primary" disabled={!health || !terms || busy} onClick={agree}>
        {busy ? t('Saving…') : t('Agree and continue')}
      </Button>
      <p className="small dim" style={{ textAlign: 'center' }}>
        {t('Don’t want to agree?')}{' '}
        <a href={'#' + DELETE_PATH} onClick={e => { e.preventDefault(); nav(DELETE_PATH) }}>{t('Delete your account instead')}</a>
      </p>
    </div>
  </div>
}

/** Settings → Account. Hidden on a server without Huru. */
export function DeleteAccountRow() {
  const nav = useNavigate()
  const { me } = usePro()
  if (!me?.consent) return null
  return <Row icon="trash" iconTint="var(--red)" title={t('Delete account')} subtitle={t('Removes your profile and all its data for good.')}
    danger accessory="chevron" onClick={() => nav(DELETE_PATH)} />
}

export function DeleteAccountScreen() {
  const nav = useNavigate()
  const toast = useUI(s => s.toast)
  const user = useStore(s => s.user)
  const accountDeleted = useStore(s => s.accountDeleted)
  const { me } = usePro()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  if (!user) return null

  const paid = me?.pro && me?.source === 'stripe' && !me?.cancelAtPeriodEnd
  const ready = name.trim() === user.name && (!me?.hasPassword || password.length > 0)

  const submit = async () => {
    setBusy(true); setError(null)
    try {
      await deleteAccount({ confirmName: name.trim(), password: me?.hasPassword ? password : undefined })
      await accountDeleted()
      toast(t('Your account and its data were deleted.'))
      nav('/', { replace: true })
    } catch (e) {
      setError(e?.message || t('Something went wrong, try again.'))
      setBusy(false)
    }
  }

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 10 }}><h1>{t('Delete account')}</h1><div className="sub">{t('This cannot be undone')}</div></div>
    </div>
    <Section title={t('What is deleted')} footer={t('Want a copy first? Settings → Data & backup → Export.')}>
      <Row icon="dumbbell" title={t('Your plans, workouts and records')} />
      <Row icon="scale" title={t('Your body weight, measurements and photos')} />
      <Row icon="sparkles" title={t('Your AI Coach history')} />
      <Row icon="key" title={t('Your sign-in: passkeys, password and paired devices')} />
      {paid && <Row icon="crown" iconTint="var(--orange)" title={t('Your Pro subscription is cancelled now, with no refund for the rest of this period')} />}
    </Section>
    <Section title={t('Confirm')}>
      <div style={{ padding: '8px 16px 12px', display: 'grid', gap: 10 }}>
        <label className="small" htmlFor="del-name">{t('Type your profile name, {0}, to confirm', user.name)}</label>
        <TextField id="del-name" value={name} onChange={e => setName(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} />
        {me?.hasPassword && <>
          <label className="small" htmlFor="del-pw">{t('Your password')}</label>
          <TextField id="del-pw" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
        </>}
        {error && <div className="small" role="alert" style={{ color: 'var(--red)' }}>{error}</div>}
      </div>
    </Section>
    <div style={{ padding: '0 16px' }}>
      <Button variant="danger" disabled={!ready || busy} onClick={submit}>
        {busy ? t('Deleting…') : t('Delete my account')}
      </Button>
    </div>
  </div>
}
