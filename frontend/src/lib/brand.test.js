import { describe, it, expect, vi, afterEach } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

const load = async env => {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
  return import('./brand.js')
}

describe('brand', () => {
  it('is upstream openGym when nothing is set', async () => {
    const b = await load({})
    expect(b.APP_NAME).toBe('openGym')
    expect(b.BRANDED).toBe(false)
    expect(b.EXERCISE_MEDIA).toBe(true)
    expect(b.SOURCE_URL).toBe('https://github.com/DuarteSantos8/openGym')
    expect(b.brand('Made with openGym')).toBe('Made with openGym')
  })

  it('swaps every occurrence of the name in a rebranded build', async () => {
    const b = await load({ VITE_APP_NAME: 'Huru GYM', VITE_SOURCE_URL: 'https://github.com/epipra/huru-gym' })
    expect(b.BRANDED).toBe(true)
    expect(b.brand('openGym on openGym')).toBe('Huru GYM on Huru GYM')
    expect(b.brand('opengym.ch stays')).toBe('opengym.ch stays')
    expect(b.brand(undefined)).toBe(undefined)
    expect(b.SOURCE_URL).toBe('https://github.com/epipra/huru-gym')
  })

  it('turns exercise media off only for VITE_EXERCISE_MEDIA=0', async () => {
    expect((await load({ VITE_EXERCISE_MEDIA: '0' })).EXERCISE_MEDIA).toBe(false)
    vi.unstubAllEnvs(); vi.resetModules()
    expect((await load({ VITE_EXERCISE_MEDIA: '1' })).EXERCISE_MEDIA).toBe(true)
  })
})
