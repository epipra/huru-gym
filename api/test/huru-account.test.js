/* Huru GYM: consent record and self-service account deletion, against the real server.js in a
 * child process (same harness as server-admin-delete.test.js). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';
import { hashPassword } from '../password.js';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = crypto.randomBytes(32).toString('hex');
const ORIGIN = 'http://localhost:8080';
const mintSession = uid => {
  const payload = `${uid}:${Date.now() + 86400000}:0`;
  return payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
};
const ADMIN = 'u_adm_1', PW = 'u_pw_1', KEY = 'u_key_1';
const PASSWORD = 'correct horse battery staple';
const as = uid => ({ Cookie: `gymsid=${mintSession(uid)}`, 'Content-Type': 'application/json', Origin: ORIGIN });

async function startServer(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'huru-acct-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  const created = new Date().toISOString();
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({
    users: [
      { id: ADMIN, name: 'Owner', created, admin: true },
      { id: PW, name: 'Lena', created, pw: { h: await hashPassword(PASSWORD), set: created } },
      { id: KEY, name: 'Marco', created }
    ],
    creds: [{ id: 'c-key', userId: KEY, publicKey: 'x' }],
    subs: [{ endpoint: 'https://push/lena', userId: PW }],
    invites: []
  }));
  for (const uid of [PW, KEY]) fs.writeFileSync(path.join(dataDir, `state-${uid}.json`), JSON.stringify({ unit: 'kg', workouts: [], _rev: 1 }));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN, RP_ID: 'localhost', PASSWORD_LOGIN: '1' }
  });
  const h = { log: '', dataDir };
  child.stdout.on('data', d => h.log += d);
  child.stderr.on('data', d => h.log += d);
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  h.api = `http://127.0.0.1:${await boundPort(child, () => h.log)}`;
  h.call = async (method, p, uid, body) => {
    const r = await fetch(h.api + p, { method, headers: as(uid), body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json() };
  };
  h.del = (uid, body) => h.call('POST', '/api/huru/account/delete', uid, body);
  h.db = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8'));
  h.file = f => path.join(dataDir, f);
  return h;
}

test('consent: asked for until both agreements for the current version are recorded', async t => {
  const h = await startServer(t);
  const before = await h.call('GET', '/api/huru/me', PW);
  assert.equal(before.status, 200);
  assert.equal(before.body.consent.accepted, false);
  const version = before.body.consent.version;
  assert.ok(version);

  assert.equal((await h.call('POST', '/api/huru/consent', PW, { health: true, terms: false, version })).status, 400);
  assert.equal((await h.call('POST', '/api/huru/consent', PW, { health: true, terms: true, version: 'old' })).status, 409);
  const ok = await h.call('POST', '/api/huru/consent', PW, { health: true, terms: true, version });
  assert.equal(ok.status, 200);
  assert.equal((await h.call('GET', '/api/huru/me', PW)).body.consent.accepted, true);
  assert.equal((await h.call('GET', '/api/huru/me', KEY)).body.consent.accepted, false, 'per account');
  const stored = JSON.parse(fs.readFileSync(h.file('huru-consent.json'), 'utf8')).users[PW];
  assert.equal(stored.version, version);
  assert.ok(stored.healthAt && stored.termsAt);
});

test('delete with a password: name and password checked, then everything goes', async t => {
  const h = await startServer(t);
  await h.call('POST', '/api/huru/consent', PW, { health: true, terms: true, version: (await h.call('GET', '/api/huru/me', PW)).body.consent.version });

  assert.equal((await h.del(PW, { confirmName: 'lena', password: PASSWORD })).body.code, 'confirm');
  assert.equal((await h.del(PW, { confirmName: 'Lena' })).body.code, 'password-required');
  const wrong = await h.del(PW, { confirmName: 'Lena', password: 'not the password at all' });
  assert.equal(wrong.status, 403);
  assert.ok(h.db().users.some(u => u.id === PW), 'nothing removed on a wrong password');

  const ok = await h.del(PW, { confirmName: 'Lena', password: PASSWORD });
  assert.equal(ok.status, 200);
  const db = h.db();
  assert.equal(db.users.some(u => u.id === PW), false, 'the user is gone');
  assert.equal(db.subs.some(s => s.userId === PW), false, 'their push subscriptions are gone');
  assert.equal(fs.existsSync(h.file(`state-${PW}.json`)), false, 'their history is gone');
  assert.equal(JSON.parse(fs.readFileSync(h.file('huru-consent.json'), 'utf8')).users[PW], undefined, 'their consent record is gone');
  assert.equal((await h.call('GET', '/api/me', PW)).status, 401, 'the session is dead');
  assert.equal(db.users.length, 2, 'nobody else was touched');
});

test('delete without a password (passkey account): the typed name is enough', async t => {
  const h = await startServer(t);
  const ok = await h.del(KEY, { confirmName: 'Marco' });
  assert.equal(ok.status, 200);
  assert.equal(h.db().creds.some(c => c.userId === KEY), false, 'their passkeys are gone');
});

test('the last admin cannot delete themselves', async t => {
  const h = await startServer(t);
  const res = await h.del(ADMIN, { confirmName: 'Owner' });
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'last-admin');
  assert.ok(h.db().users.some(u => u.id === ADMIN));
});

test('password guesses are limited to five per 15 minutes', async t => {
  const h = await startServer(t);
  for (let i = 0; i < 5; i++) assert.equal((await h.del(PW, { confirmName: 'Lena', password: 'guess number ' + i })).status, 403);
  const sixth = await h.del(PW, { confirmName: 'Lena', password: PASSWORD });
  assert.equal(sixth.status, 429, 'even the right password waits once the limit is hit');
});

test('the admin delete still works after the purge was shared', async t => {
  const h = await startServer(t);
  const r = await h.call('POST', '/api/admin/user/delete', ADMIN, { id: KEY });
  assert.equal(r.status, 200);
  assert.equal(fs.existsSync(h.file(`state-${KEY}.json`)), false);
});
