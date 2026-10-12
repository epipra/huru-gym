// @vitest-environment happy-dom
// Huru GYM "Forgot your password?": asks for a code by e-mail, then redeems it at upstream's
// reset route and signs in. Rendered against a mocked server.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'

const server = vi.hoisted(() => ({ calls: [], fail: null, redeemFail: null }))
vi.mock('../lib/api.js', () => ({
  api: vi.fn(async (path, init) => {
    server.calls.push({ path, body: init?.body ? JSON.parse(init.body) : null })
    if (path === '/api/huru/password/forgot') {
      if (server.fail) throw Object.assign(new Error('refused'), { status: server.fail.status, data: { code: server.fail.code } })
      return { ok: true }
    }
    throw new Error('unexpected ' + path)
  }),
  passwordResetRedeem: vi.fn(async (name, code, next) => {
    server.calls.push({ path: 'redeem', body: { name, code, next } })
    if (server.redeemFail) throw Object.assign(new Error('bad'), { status: 400, data: { code: server.redeemFail } })
    return { id: 'u_lena', name: 'Lena' }
  }),
  webauthnOK: () => false, passkeyAssertion: vi.fn(), passwordLogin: vi.fn(), passwordRegister: vi.fn()
}))

const { useStore } = await import('../store/useStore.js')
const { useUI } = await import('../store/useUI.js')
const { ForgotPasswordSheet } = await import('./HuruForgot.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const roots = []
async function mount(node) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  roots.push(root)
  await act(async () => root.render(node))
  return host
}
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)) })
function type(el, value) {
  Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}
const submit = async host => { await act(async () => { host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) }); await settle() }
const input = (host, name) => host.querySelector(`input[name="${name}"]`)

let setUser, adoptProfile, close
beforeEach(() => {
  server.calls = []; server.fail = null; server.redeemFail = null
  setUser = vi.fn(); adoptProfile = vi.fn(async () => {}); close = vi.fn()
  useStore.setState({ user: null, setUser, adoptProfile })
  useUI.setState({ sheets: [], toastMsg: '' })
  document.body.innerHTML = ''
})
afterEach(() => { act(() => { roots.splice(0).forEach(r => r.unmount()) }) })

describe('forgot password', () => {
  it('mails a code for the e-mail, then sets the new password with it and signs in', async () => {
    const host = await mount(<ForgotPasswordSheet close={close} />)
    type(input(host, 'email'), '  lena@example.com ')
    await submit(host)
    expect(server.calls[0]).toEqual({ path: '/api/huru/password/forgot', body: { email: 'lena@example.com' } })
    expect(host.textContent).toContain('a code is on its way')

    type(input(host, 'reset-code'), 'abcd-efgh-jklm')
    type(input(host, 'new-password'), 'a brand new staple')
    type(input(host, 'new-password-again'), 'a brand new staple')
    await submit(host)
    expect(server.calls[1]).toEqual({ path: 'redeem', body: { name: 'lena@example.com', code: 'ABCD-EFGH-JKLM', next: 'a brand new staple' } })
    expect(setUser).toHaveBeenCalledWith({ id: 'u_lena', name: 'Lena' }, { adopt: true })
    expect(close).toHaveBeenCalled()
  })

  it('checks the address and the passwords before asking the server', async () => {
    const host = await mount(<ForgotPasswordSheet close={close} />)
    type(input(host, 'email'), 'not an address')
    await submit(host)
    expect(server.calls).toEqual([])
    expect(host.querySelector('[role=alert]').textContent).toContain('not an e-mail address')

    type(input(host, 'email'), 'lena@example.com')
    await submit(host)
    type(input(host, 'reset-code'), 'ABCD-EFGH-JKLM')
    type(input(host, 'new-password'), 'a brand new staple')
    type(input(host, 'new-password-again'), 'a different staple')
    await submit(host)
    expect(server.calls.map(c => c.path)).toEqual(['/api/huru/password/forgot'])
    expect(host.querySelector('[role=alert]').textContent).toContain('not the same')
  })

  it('says so when the server cannot send mail, or the code is wrong', async () => {
    server.fail = { status: 503, code: 'mail-off' }
    const host = await mount(<ForgotPasswordSheet close={close} />)
    type(input(host, 'email'), 'lena@example.com')
    await submit(host)
    expect(host.querySelector('[role=alert]').textContent).toContain('cannot send e-mail')

    server.fail = null
    await submit(host)
    server.redeemFail = 'reset-invalid'
    type(input(host, 'reset-code'), 'AAAA-BBBB-CCCC')
    type(input(host, 'new-password'), 'a brand new staple')
    type(input(host, 'new-password-again'), 'a brand new staple')
    await submit(host)
    expect(host.querySelector('[role=alert]').textContent).toContain('wrong or has expired')
    expect(setUser).not.toHaveBeenCalled()
  })
})
