import { describe, it, expect, vi, beforeEach } from 'vitest'

beforeEach(() => { vi.resetModules() })
const load = () => import('./huru-pro.js')
const fmt = iso => iso   // keep dates as YYYY-MM-DD so the lines are easy to read

describe('huru-pro', () => {
  it('a server without Huru billing (404) means everyone has everything', async () => {
    const m = await load()
    const err = Object.assign(new Error('not found'), { status: 404 })
    await m.loadPro({ request: () => Promise.reject(err) })
    expect(m.getProState().me).toEqual({ billing: false, pro: true })
    expect(m.needsPro(m.getProState().me)).toBe(false)
    expect(m.proStatusLine(m.getProState().me)).toBe('')
  })

  it('keeps the last answer when the server is unreachable', async () => {
    const m = await load()
    await m.loadPro({ request: () => Promise.resolve({ billing: true, pro: true }) })
    await m.loadPro({ force: true, request: () => Promise.reject(Object.assign(new Error('offline'), { status: undefined })) })
    expect(m.getProState().me).toEqual({ billing: true, pro: true })
    expect(m.getProState().error).toBeTruthy()
  })

  it('only a billed, non-Pro profile is sent to the upgrade screen', async () => {
    const { needsPro } = await load()
    expect(needsPro({ billing: true, pro: false })).toBe(true)
    expect(needsPro({ billing: true, pro: true })).toBe(false)
    expect(needsPro({ billing: false, pro: false })).toBe(false)
    expect(needsPro(null)).toBe(false)
  })

  it('status lines for every way of having, or not having, Pro', async () => {
    const { proStatusLine } = await load()
    const end = Date.UTC(2026, 10, 9, 12) / 1000
    expect(proStatusLine({ billing: true, pro: false, trialDays: 7 }, fmt)).toBe('Free plan · 7-day free trial available')
    expect(proStatusLine({ billing: true, pro: false, trialDays: 0 }, fmt)).toBe('Free plan')
    expect(proStatusLine({ billing: true, pro: true, source: 'admin' }, fmt)).toBe('Included for admins')
    expect(proStatusLine({ billing: true, pro: true, source: 'stripe', status: 'trialing', periodEnd: end }, fmt)).toBe('Free trial until 2026-11-09')
    expect(proStatusLine({ billing: true, pro: true, source: 'stripe', status: 'active', interval: 'year', periodEnd: end }, fmt)).toBe('Yearly · renews on 2026-11-09')
    expect(proStatusLine({ billing: true, pro: true, source: 'stripe', status: 'active', cancelAtPeriodEnd: true, periodEnd: end }, fmt)).toBe('Ends on 2026-11-09')
    expect(proStatusLine({ billing: true, pro: true, source: 'stripe', status: 'past_due' }, fmt)).toMatch(/Payment failed/)
  })

  it('checkout posts the plan and follows only an https URL', async () => {
    const m = await load()
    const assign = vi.fn()
    vi.stubGlobal('location', { assign })
    const request = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/c/x' })
    await m.startCheckout('yearly', request)
    expect(request).toHaveBeenCalledWith('/api/huru/checkout', { method: 'POST', body: '{"plan":"yearly"}' })
    expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/x')
    await expect(m.openBillingPortal(() => Promise.resolve({ url: 'javascript:alert(1)' }))).rejects.toThrow()
    vi.unstubAllGlobals()
  })
})
