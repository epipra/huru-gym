// Huru GYM Pro: the upgrade / manage screen (/pro), its row in Settings, and the gate in front of
// the Coach. All three render nothing special on a server without Huru billing (lib/huru-pro.js).
import { useEffect, useState, useSyncExternalStore } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { t } from '../lib/i18n.js'
import { MOBILE } from '../lib/mobile.js'
import { APP_NAME } from '../lib/brand.js'
import { getProState, subscribePro, loadPro, needsPro, proStatusLine, startCheckout, openBillingPortal, PRICE_LABELS } from '../lib/huru-pro.js'
import { useUI } from '../store/useUI.js'
import { useStore } from '../store/useStore.js'
import Icon from './Icon.jsx'
import { Section, Row, Button } from './ui.jsx'

const PRO_NAME = () => `${APP_NAME} Pro`

export function usePro() {
  const s = useSyncExternalStore(subscribePro, getProState)
  const uid = useStore(st => st.user?.id || null)
  const fresh = s.loaded && s.uid === uid
  useEffect(() => { if (!fresh) loadPro({ force: true, uid }) }, [fresh, uid])
  return fresh ? s : { ...s, loaded: false, me: null }
}

const FEATURES = [
  ['sparkles', 'AI Coach that builds your plan from your goals and equipment'],
  ['chartLine', 'Weekly reviews that adjust weights, sets and exercises, one change at a time'],
  ['undo', 'Every Coach change explained and reversible'],
  ['heart', 'Supports an ad-free app that keeps your data yours']
]

/** Settings row: plan at a glance, opens /pro. Hidden where there is no billing. */
export function ProRow() {
  const nav = useNavigate()
  const { me } = usePro()
  if (!me?.billing) return null
  return <Section>
    <Row icon="crown" iconTint="var(--orange)" title={PRO_NAME()} subtitle={proStatusLine(me)}
      accessory="chevron" onClick={() => nav('/pro')} />
  </Section>
}

/** In front of the Coach screens: the upgrade screen for a free profile, the Coach otherwise. */
export function ProGate({ children }) {
  const { loaded, me } = usePro()
  if (!loaded) return null
  return needsPro(me) ? <ProScreen gated /> : children
}

export function ProScreen({ gated = false }) {
  const nav = useNavigate()
  const loc = useLocation()
  const toast = useUI(s => s.toast)
  const { me, loaded } = usePro()
  const [busy, setBusy] = useState(null)
  const [plan, setPlan] = useState('yearly')
  const back = new URLSearchParams(loc.search).get('checkout')

  // Back from Stripe: the webhook may land a moment after the redirect, so ask again briefly.
  useEffect(() => {
    if (back !== 'success') return
    let n = 0
    const tick = () => loadPro({ force: true, uid: getProState().uid }).then(s => { if (!s.me?.pro && ++n < 6) timer = setTimeout(tick, 2000) })
    let timer = setTimeout(tick, 0)
    return () => clearTimeout(timer)
  }, [back])

  const run = (what, fn) => async () => {
    setBusy(what)
    try { await fn() } catch (e) { toast(e?.message || t('Something went wrong, try again.')); setBusy(null) }
  }

  const header = <div className="hdr">
    {!gated && <button className="iconbtn" onClick={() => nav('/settings')} aria-label={t('Settings')}><Icon name="chevronLeft" /></button>}
    <div style={{ flex: 1, marginLeft: gated ? 0 : 10 }}><h1>{PRO_NAME()}</h1>
      <div className="sub">{gated ? t('The AI Coach is part of Pro') : proStatusLine(me) || t('Your plan')}</div></div>
  </div>

  if (!loaded) return <div className="narrow">{header}</div>

  const features = <Section title={t('What you get')}>
    {FEATURES.map(([icon, text]) => <Row key={text} icon={icon} iconTint="var(--green)" title={t(text)} />)}
  </Section>

  if (me?.pro) {
    return <div className="narrow">
      {header}
      {back === 'success' && <div className="card"><b>{t('Welcome to Pro!')}</b> {t('The Coach is ready when you are.')}</div>}
      <Section footer={me.canManage ? t('Change plan, update your card or cancel. Cancelling keeps Pro until the end of the period you paid for.') : null}>
        <Row icon="crown" iconTint="var(--orange)" title={t('Your plan')} subtitle={proStatusLine(me)} />
        {me.canManage && !MOBILE && <Row icon="gear" title={t('Manage subscription')} accessory="chevron"
          onClick={run('portal', () => openBillingPortal())} />}
        <Row icon="sparkles" iconTint="var(--indigo)" title={t('Open the Coach')} accessory="chevron" onClick={() => nav('/coach')} />
      </Section>
      {features}
    </div>
  }

  const trial = me?.trialDays ? t('{0} days free, then', me.trialDays) + ' ' : ''
  return <div className="narrow">
    {header}
    {back === 'success' && <div className="card">{t('Payment received. Activating Pro…')}</div>}
    {back === 'cancel' && <div className="card">{t('Checkout was cancelled. Nothing was charged.')}</div>}
    {features}
    {MOBILE ? (
      <Section footer={t('Upgrade from the web app while signed in to this profile; Pro then appears here too.')}>
        <Row icon="globe" title={t('Upgrade on the web')} />
      </Section>
    ) : !me?.checkout ? (
      <Section footer={t('Payments are not switched on yet. Ask the person who runs this server.')}>
        <Row icon="info" title={t('Pro is coming soon')} />
      </Section>
    ) : <>
      <Section title={t('Choose your plan')}>
        {me.plans?.yearly && <Row icon={plan === 'yearly' ? 'checkCircle' : 'dot'} iconTint="var(--green)"
          title={t('Yearly') + ' · ' + PRICE_LABELS.yearly} subtitle={t('Best value, about 45% less than monthly')} onClick={() => setPlan('yearly')} />}
        {me.plans?.monthly && <Row icon={plan === 'monthly' ? 'checkCircle' : 'dot'} iconTint="var(--green)"
          title={t('Monthly') + ' · ' + PRICE_LABELS.monthly} subtitle={t('Cancel any time')} onClick={() => setPlan('monthly')} />}
      </Section>
      <div style={{ padding: '0 16px' }}>
        <Button variant="primary" disabled={!!busy}
          onClick={run('checkout', () => startCheckout(me.plans?.[plan] ? plan : (me.plans?.yearly ? 'yearly' : 'monthly')))}>
          {busy === 'checkout' ? t('Opening secure checkout…') : (me.trialDays ? t('Start free trial') : t('Upgrade to Pro'))}
        </Button>
        <p className="small dim" style={{ textAlign: 'center' }}>
          {trial}{plan === 'yearly' ? PRICE_LABELS.yearly + ' ' + t('per year') : PRICE_LABELS.monthly + ' ' + t('per month')}.{' '}
          {t('Secure payment by Stripe. Cancel any time in Settings.')}
        </p>
      </div>
    </>}
  </div>
}
