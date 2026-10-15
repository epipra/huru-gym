/* Huru GYM: the product name in text people get from the server or the Coach. The Coach's
 * instructions name the app ("You are the openGym Coach"), and a model may say that name back
 * to the lifter, so a rebranded build swaps it here. Used by the server (push-messages.js) and,
 * through api/coach/core, by the phone's own Coach (frontend/src/lib/coach-local.js), so the name
 * comes from whichever environment is present: HURU_APP_NAME on the server, VITE_APP_NAME in a
 * Vite build. Neither set, it is upstream's name and nothing changes. */
const NODE_ENV = (typeof process !== 'undefined' && process.env) || {};
const VITE_ENV = (typeof import.meta !== 'undefined' && import.meta.env) || {};
const UPSTREAM = 'openGym';

export const APP_NAME = NODE_ENV.HURU_APP_NAME || VITE_ENV.VITE_APP_NAME || UPSTREAM;
export const brandText = s => (typeof s === 'string' && APP_NAME !== UPSTREAM ? s.replaceAll(UPSTREAM, APP_NAME) : s);
