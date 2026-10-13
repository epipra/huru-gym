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
// The server a branded mobile app pairs with, filled in on "Connect to my server". Empty upstream:
// a self-hoster's app has no default server.
export const DEFAULT_SERVER = BRANDED ? 'https://' + SITE_HOST : ''
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

// Upstream sentences that are not true of a Huru GYM server, by their English source text. Huru
// GYM e-mails reset codes (api/huru/mail.js), so "nothing is ever sent" and "only your admin can
// reset it" would mislead. Used in place of the locale packs' translations (i18n-core.js t()),
// so these few read in English in every language rather than say something wrong.
export const TEXT = BRANDED ? {
  'Lets you sign in with it instead of your name. Nothing is ever sent to it.':
    'Lets you sign in with it instead of your name, and get a reset code by e-mail if you forget your password.',
  'Type it at “Sign in with password” instead of your profile name. We never send anything to it; a forgotten password is still reset by your admin.':
    'Type it at “Sign in with password” instead of your profile name. If you forget your password, we e-mail a reset code to it, and nothing else.',
  'Enter the code your admin gave you and choose a new password. It signs you out everywhere else.':
    'Enter the reset code you were sent and choose a new password. It signs you out everywhere else.',
  'Have a reset code from your admin?': 'Have a reset code?',
  'That reset code is wrong or has expired. Ask your admin for a new one.': 'That reset code is wrong or has expired. Ask for a new one.'
} : {}
