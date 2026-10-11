/* Huru GYM: what each account agreed to, and when.
 *
 * DATA_DIR/huru-consent.json, beside db.json for the same reason as billing-store.js: upstream's
 * schema stays untouched. One record per account:
 *   users[uid] = { version, healthAt, termsAt }
 * `version` names the Privacy Policy / Terms text that was accepted; a newer version means the
 * app asks again. Timestamps are kept so a withdrawal or a dispute can be answered from the file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { atomicWrite } from '../durable.js';

const DATA = process.env.DATA_DIR || '/data';
const FILE = path.join(DATA, 'huru-consent.json');

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    cache = {};
  }
  cache.users ||= {};
  return cache;
}

const save = () => atomicWrite(FILE, JSON.stringify(cache), 0o600);

export function get(uid) {
  return load().users[uid] || null;
}

export function accepted(uid, version) {
  const c = get(uid);
  return !!(c && c.healthAt && c.termsAt && c.version === version);
}

export function record(uid, version, now = Date.now()) {
  load().users[uid] = { version, healthAt: now, termsAt: now };
  save();
  return cache.users[uid];
}

export function remove(uid) {
  if (!load().users[uid]) return;
  delete cache.users[uid];
  save();
}

/** Tests only. */
export function _reset() {
  cache = null;
}
