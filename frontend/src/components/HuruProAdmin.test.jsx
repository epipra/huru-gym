// @vitest-environment happy-dom
// Huru GYM admin Pro panel: what it says, and giving and ending free Pro, against a mocked server.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'

const server = vi.hoisted(() => ({ pro: null, calls: [], missing: false }))
vi.mock('../lib/api.js', () => ({
  api: vi.fn(async (path, init) => {
    server.calls.push({ path, body: init?.body ? JSON.parse(init.body) : null })
    if (path.startsWith('/api/huru/admin/pro')) {
      if (server.missing) throw Object.assign(new Error('not found'), { status: 404 })
      return { ...server.pro }
    }
    if (path === '/api/huru/admin/grant') {
      const { days } = JSON.parse(init.body)
      server.pro.grantUntil = days ? Date.now() + days * 86400e3 : null
      server.pro.pro = !!days
      return { uid: 'u1', grantUntil: server.pro.grantUntil }
    }
    throw new Error('unexpected ' + path)
  })
}))
const confirm = vi.hoisted(() => ({ last: null }))
vi.mock('../sheets.jsx', () => ({ confirmSheet: opts => { confirm.last = opts } }))

const { useUI } = await import('../store/useUI.js')
const { default: HuruProAdmin, proLine } = await import('./HuruProAdmin.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const roots = []
async function mount(node) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  await act(async () => root.render(node))
  await settle()
  return host
}
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)) })
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent.includes(text))
const click = async el => { await act(async () => { el.click() }); await settle() }

beforeEach(() => {
  server.calls = []; server.missing = false; confirm.last = null
  server.pro = { uid: 'u1', billing: true, admin: false, pro: false, status: null, interval: null, periodEnd: null, cancelAtPeriodEnd: false, grantUntil: null }
  useUI.setState({ sheets: [], toastMsg: '' })
  document.body.innerHTML = ''
})
afterEach(() => { act(() => { roots.splice(0).forEach(r => r.unmount()) }) })

describe('proLine', () => {
  const base = { billing: true, admin: false, status: null, periodEnd: null, grantUntil: null }
  it('names the reason a profile has Pro, or that it has none', () => {
    expect(proLine({ ...base, billing: false })).toMatch(/Billing is off/)
    expect(proLine({ ...base, admin: true })).toBe('Admins always have Pro.')
    expect(proLine(base)).toMatch(/^No Pro\./)
    expect(proLine({ ...base, status: 'trialing', interval: 'year', periodEnd: Date.UTC(2026, 9, 19) / 1000 })).toBe('Free trial (yearly), renews 19 Oct 2026.')
    expect(proLine({ ...base, status: 'active', interval: 'month', periodEnd: Date.UTC(2026, 10, 1) / 1000, cancelAtPeriodEnd: true })).toBe('Paid subscription (monthly), ends 1 Nov 2026.')
    expect(proLine({ ...base, grantUntil: Date.UTC(2026, 10, 11) }, Date.UTC(2026, 9, 12))).toBe('Free Pro until 11 Nov 2026.')
  })
})

describe('admin Pro panel', () => {
  it('gives 30 days of free Pro, then offers to end it', async () => {
    const host = await mount(<HuruProAdmin uid="u1" name="Lena" />)
    expect(host.textContent).toContain('No Pro.')
    await click(button(host, 'Give 30 days'))
    expect(server.calls.find(c => c.path === '/api/huru/admin/grant').body).toEqual({ uid: 'u1', days: 30 })
    expect(host.textContent).toContain('Free Pro until')
    expect(useUI.getState().toastMsg).toMatch(/^Lena has free Pro until /)

    await click(button(host, 'End free Pro'))
    expect(confirm.last.confirmText).toBe('End free Pro')
    await act(async () => { confirm.last.onConfirm() })
    await settle()
    expect(server.calls.filter(c => c.path === '/api/huru/admin/grant').at(-1).body).toEqual({ uid: 'u1', days: 0 })
    expect(host.textContent).toContain('No Pro.')
    expect(button(host, 'End free Pro')).toBeUndefined()
  })

  it('shows no buttons for an admin or when billing is off, and nothing on a non-Huru server', async () => {
    server.pro = { ...server.pro, admin: true, pro: true }
    let host = await mount(<HuruProAdmin uid="u1" name="Owner" />)
    expect(host.textContent).toContain('Admins always have Pro.')
    expect(button(host, 'Give')).toBeUndefined()

    server.missing = true
    host = await mount(<HuruProAdmin uid="u2" name="Marco" />)
    expect(host.textContent).toBe('')
  })
})
