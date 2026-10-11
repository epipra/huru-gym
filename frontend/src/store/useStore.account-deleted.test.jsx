// @vitest-environment happy-dom
// Huru GYM: after the server deleted the account, nothing of it stays on this device — not its
// copy, not a stash of owed changes — while another account's stash on the same device is kept.
import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api.js', async importOriginal => ({ ...(await importOriginal()), api: vi.fn(async () => ({})) }))

const { useStore } = await import('./useStore.js')

describe('accountDeleted', () => {
  it('signs out, wipes the copy and drops only this account\'s stash', async () => {
    localStorage.setItem('gym_stash', JSON.stringify({ '|u-gone': { S: { workouts: [1] } }, '|u-other': { S: { workouts: [2] } } }))
    useStore.getState().setUser({ id: 'u-gone', name: 'Gone' })
    useStore.getState().update(s => { s.bodyweight = [{ date: '2026-10-10', kg: 80 }] })
    expect(JSON.stringify(useStore.getState().S)).toContain('"kg":80')
    await useStore.getState().accountDeleted()
    expect(useStore.getState().user).toBeNull()
    expect(Object.keys(JSON.parse(localStorage.getItem('gym_stash')))).toEqual(['|u-other'])
    expect(JSON.stringify(useStore.getState().S)).not.toContain('"kg":80')
  })
})
