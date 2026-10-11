// @vitest-environment happy-dom
// Huru GYM consent gate and account deletion, rendered against a mocked server.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const server = vi.hoisted(() => ({ me: null, calls: [], fail: null }))
vi.mock('../lib/api.js', () => ({
  api: vi.fn(async (path, init) => {
    server.calls.push({ path, body: init?.body ? JSON.parse(init.body) : null })
    if (path === '/api/huru/me') {
      if (server.me === 404) throw Object.assign(new Error('not found'), { status: 404 })
      return structuredClone(server.me)
    }
    if (path === '/api/huru/consent') { server.me.consent.accepted = true; return { accepted: true } }
    if (path === '/api/huru/account/delete') {
      if (server.fail) throw Object.assign(new Error(server.fail), { status: 403 })
      return { ok: true }
    }
    throw new Error('unexpected ' + path)
  })
}))

const { useStore } = await import('../store/useStore.js')
const { useUI } = await import('../store/useUI.js')
const { ConsentGate, DeleteAccountScreen } = await import('./HuruAccount.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const roots = []
async function mount(node, path = '/home') {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  await act(async () => root.render(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>))
  await act(async () => { await new Promise(r => setTimeout(r, 0)) })
  return host
}
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)) })
function type(el, value) {
  Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent.includes(text))
const meWith = (accepted, extra = {}) => ({ billing: true, pro: false, consent: { version: 'v1', accepted, privacyUrl: null, termsUrl: null }, hasPassword: false, ...extra })

let n = 0
beforeEach(() => {
  server.calls = []; server.fail = null
  useUI.setState({ sheets: [], toastMsg: '' })
  // A fresh profile per test, so the Pro/consent answer is fetched again for it.
  useStore.setState({ user: { id: 'u' + (++n), name: 'Lena' } })
  document.body.innerHTML = ''
})
afterEach(() => { act(() => { roots.splice(0).forEach(r => r.unmount()) }) })

describe('consent gate', () => {
  it('holds the app back until both boxes are ticked and the server has the agreement', async () => {
    server.me = meWith(false)
    const host = await mount(<ConsentGate><div id="app-inside">app</div></ConsentGate>)
    expect(host.querySelector('#app-inside')).toBeNull()
    const go = button(host, 'Agree and continue')
    const [health, terms] = host.querySelectorAll('input[type=checkbox]')
    expect(health.checked).toBe(false)
    expect(go.disabled).toBe(true)
    await act(async () => health.click())
    expect(go.disabled).toBe(true)
    await act(async () => terms.click())
    expect(go.disabled).toBe(false)
    await act(async () => go.click())
    await settle()
    expect(server.calls.find(c => c.path === '/api/huru/consent').body).toEqual({ health: true, terms: true, version: 'v1' })
    expect(host.querySelector('#app-inside')).not.toBeNull()
  })

  it('lets an account that already agreed straight through', async () => {
    server.me = meWith(true)
    const host = await mount(<ConsentGate><div id="app-inside">app</div></ConsentGate>)
    expect(host.querySelector('#app-inside')).not.toBeNull()
  })

  it('stays out of the way on a server without Huru (404)', async () => {
    server.me = 404
    const host = await mount(<ConsentGate><div id="app-inside">app</div></ConsentGate>)
    expect(host.querySelector('#app-inside')).not.toBeNull()
  })

  it('still lets someone reach account deletion instead of agreeing', async () => {
    server.me = meWith(false)
    const host = await mount(<ConsentGate><Routes><Route path="/account/delete" element={<div id="delete-page" />} /></Routes></ConsentGate>, '/account/delete')
    expect(host.querySelector('#delete-page')).not.toBeNull()
  })
})

describe('delete account', () => {
  it('needs the exact profile name and the password, then wipes the device', async () => {
    server.me = meWith(true, { hasPassword: true })
    const accountDeleted = vi.fn(async () => {})
    useStore.setState({ accountDeleted })
    const host = await mount(<DeleteAccountScreen />, '/account/delete')
    const del = button(host, 'Delete my account')
    const nameField = host.querySelector('#del-name')
    const pwField = host.querySelector('#del-pw')
    expect(pwField).not.toBeNull()
    await act(async () => type(nameField, 'lena'))
    await act(async () => type(pwField, 'secret password'))
    expect(del.disabled).toBe(true)
    await act(async () => type(nameField, 'Lena'))
    expect(del.disabled).toBe(false)
    await act(async () => del.click())
    await settle()
    expect(server.calls.find(c => c.path === '/api/huru/account/delete').body).toEqual({ confirmName: 'Lena', password: 'secret password' })
    expect(accountDeleted).toHaveBeenCalledOnce()
  })

  it('shows the refusal and keeps everything when the server says no', async () => {
    server.me = meWith(true)
    server.fail = 'that password is not right'
    const accountDeleted = vi.fn(async () => {})
    useStore.setState({ accountDeleted })
    const host = await mount(<DeleteAccountScreen />, '/account/delete')
    expect(host.querySelector('#del-pw')).toBeNull()
    await act(async () => type(host.querySelector('#del-name'), 'Lena'))
    await act(async () => button(host, 'Delete my account').click())
    await settle()
    expect(host.querySelector('[role=alert]').textContent).toBe('that password is not right')
    expect(accountDeleted).not.toHaveBeenCalled()
  })
})
