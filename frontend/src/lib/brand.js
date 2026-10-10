// Brand layer for builds of this codebase that ship under another name (Huru GYM).
//
// Everything is read from build-time env, so a build with none of these set is exactly
// upstream openGym: same name, same links, media on. That keeps upstream's tests and its own
// builds unchanged and keeps merges from upstream small. `import.meta.env` is undefined in plain
// Node; the guard keeps this module loadable without Vite (same as lib/exercises.js).
const ENV = import.meta.env || {}

const UPSTREAM_NAME = 'openGym'

// Shown wherever the product names itself: headers, About, share cards, notifications.
export const APP_NAME = ENV.VITE_APP_NAME || UPSTREAM_NAME
// Host printed on shared plans ("Made with ... · host").
export const SITE_HOST = ENV.VITE_SITE_HOST || 'opengym.ch'
// True for a rebranded build. Hides upstream-only rows (its APK download, its update checker).
export const BRANDED = APP_NAME !== UPSTREAM_NAME
// AGPL section 13: the source of the version users are running. A fork must point at its own repo.
export const SOURCE_URL = ENV.VITE_SOURCE_URL || 'https://github.com/DuarteSantos8/openGym'
// The Gym visual exercise stills and animations are licensed to openGym only. A build without its
// own licence sets VITE_EXERCISE_MEDIA=0: no media is requested, rendered or prefetched.
export const EXERCISE_MEDIA = ENV.VITE_EXERCISE_MEDIA !== '0'

// Swap the product name inside translated UI text. The English source strings are the i18n
// keys, so the 19 locale packs are left as they are and the name is replaced on the way out.
export function brand(s) {
  return BRANDED && typeof s === 'string' && s.includes(UPSTREAM_NAME) ? s.replaceAll(UPSTREAM_NAME, APP_NAME) : s
}
