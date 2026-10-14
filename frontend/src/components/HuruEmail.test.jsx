// @vitest-environment happy-dom
// Huru GYM: confirming the sign-in e-mail, against a mocked server.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'

const server = vi.hoisted(() => ({ email: null, calls: [], code: '123456', sendFail: null }))
vi.mock('../lib/api.js', () => ({
  api: vi.fn(async (path, init) => {
    server.calls.push({ path, body: init?.body ? JSON.parse(init.body) : null })
    if (path === '/api/huru/me') return { billing: true, pro: false, consent: { accepted: true }, email: { ...server.email } }
    if (path === '/api/huru/email/send-code') {
      if (server.sendFail) throw Object.assign(new Error('x'), { status: 503, data: { code: server.sendFail } })
      return { ok: true, verified: server.email.verified }
    }
    if (path === '/api/huru/email/verify') {
      const { code } = JSON.parse(init.body)
      if (code !== server.code) throw Object.assign(new Error('x'), { status: 400, data: { code: 'code-wrong' } })
      server.email.verified = true
      return { verified: true }
    }
    throw new Error('unexpected ' + path)
  }),
  passwordResetRedeem: vi.fn(), webauthnOK: () => false, passkeyAssertion: vi.fn(), passwordLogin: vi.fn(), passwordRegister: vi.fn()
}))

const { useStore } = await import('../store/useStore.js')
const { useUI } = await import('../store/useUI.js')
const { EmailConfirmRow, ConfirmEmailSheet } = await import('./HuruEmail.jsx')

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
function type(el, value) {
  Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent.includes(text))
const click = async el => { await act(async () => { el.click() }); await settle() }

let n = 0
beforeEach(() => {
  server.calls = []; server.sendFail = null
  server.email = { address: 'lena@example.com', verified: false }
  useUI.setState({ sheets: [], toastMsg: '' })
  useStore.setState({ user: { id: 'u' + (++n), name: 'Lena' } })
  document.body.innerHTML = ''
})
afterEach(() => { act(() => { roots.splice(0).forEach(r => r.unmount()) }) })

describe('confirm e-mail row', () => {
  it('asks to confirm an unconfirmed address, says so once confirmed, and hides without one', async () => {
    let host = await mount(<EmailConfirmRow />)
    expect(host.textContent).toContain('Confirm your e-mail')
    expect(host.textContent).toContain('Needed to reset a forgotten password by e-mail')

    server.email = { address: 'lena@example.com', verified: true }
    useStore.setState({ user: { id: 'u' + (++n), name: 'Lena' } })
    host = await mount(<EmailConfirmRow />)
    expect(host.textContent).toContain('E-mail confirmed')
    expect(host.textContent).toContain('lena@example.com')

    server.email = { address: null, verified: false }
    useStore.setState({ user: { id: 'u' + (++n), name: 'Marco' } })
    host = await mount(<EmailConfirmRow />)
    expect(host.textContent).toBe('')
  })
})

describe('confirm e-mail sheet', () => {
  it('sends a code, refuses a wrong one, and confirms with the right one', async () => {
    const close = vi.fn()
    const host = await mount(<ConfirmEmailSheet address="lena@example.com" close={close} />)
    expect(host.textContent).toContain('We send a 6-digit code to lena@example.com')
    await click(button(host, 'Send code'))
    expect(server.calls.some(c => c.path === '/api/huru/email/send-code')).toBe(true)
    expect(host.textContent).toContain('We sent a 6-digit code')

    const input = host.querySelector('input[name="email-code"]')
    type(input, '12')
    await act(async () => { host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(host.querySelector('[role=alert]').textContent).toContain('6-digit code')

    type(input, '999 999')
    await act(async () => { host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) }); await settle()
    expect(host.querySelector('[role=alert]').textContent).toContain('not right')

    type(input, '123 456')
    await act(async () => { host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) }); await settle()
    expect(server.calls.filter(c => c.path === '/api/huru/email/verify').at(-1).body).toEqual({ code: '123456' })
    expect(close).toHaveBeenCalled()
    expect(useUI.getState().toastMsg).toBe('E-mail confirmed')
  })

  it('says when the server cannot send e-mail', async () => {
    server.sendFail = 'mail-off'
    const host = await mount(<ConfirmEmailSheet address="lena@example.com" close={() => {}} />)
    await click(button(host, 'Send code'))
    expect(host.querySelector('[role=alert]').textContent).toContain('cannot send e-mail')
  })
})
