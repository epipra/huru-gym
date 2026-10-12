/* Huru GYM: forgotten password by e-mail, against the real server.js in a child process and a
 * fake SMTP relay. The code it mails is redeemed at upstream's POST /api/login/password-reset. */
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
import { fakeSmtp, bodyOf } from './huru-smtp.mjs';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'http://localhost:8080';
const LENA = 'u_pw_1', OLD = 'correct horse battery staple', NEW = 'a brand new staple of horses';
const HEADERS = { 'Content-Type': 'application/json', Origin: ORIGIN };

async function startServer(t, smtpPort) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'huru-forgot-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  const created = new Date().toISOString();
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({
    users: [
      { id: 'u_adm_1', name: 'Owner', created, admin: true },
      { id: LENA, name: 'Lena', created, email: 'lena@example.com', pw: { h: await hashPassword(OLD), set: created } },
      { id: 'u_off_1', name: 'Gone', created, email: 'gone@example.com', disabled: true, pw: { h: await hashPassword(OLD), set: created } }
    ],
    creds: [], subs: [], invites: []
  }));
  const smtp = smtpPort ? { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtpPort), SMTP_SECURE: '0', SMTP_USER: 'support@example.com', SMTP_PASS: 'pw', MAIL_FROM: 'Huru GYM <support@example.com>' } : {};
  const env = { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN, RP_ID: 'localhost', PASSWORD_LOGIN: '1', ...smtp };
  if (!smtpPort) for (const k of ['SMTP_USER', 'SMTP_PASS']) delete env[k];
  const child = spawn(process.execPath, ['server.js'], { cwd: API, stdio: ['ignore', 'pipe', 'pipe'], env });
  const h = { log: '' };
  child.stdout.on('data', d => h.log += d);
  child.stderr.on('data', d => h.log += d);
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  h.api = `http://127.0.0.1:${await boundPort(child, () => h.log)}`;
  h.post = async (p, body) => {
    const r = await fetch(h.api + p, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  h.forgot = email => h.post('/api/huru/password/forgot', { email });
  h.db = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8'));
  return h;
}
const codeIn = msg => /([A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4})/.exec(bodyOf(msg))?.[1];

test('forgot: off (503) when the server has no mail settings', async t => {
  const h = await startServer(t, null);
  const r = await h.forgot('lena@example.com');
  assert.equal(r.status, 503);
  assert.equal(r.body.code, 'mail-off');
});

test('forgot: mails a code that sets a new password; the old one works until then', async t => {
  const smtp = await fakeSmtp(t);
  const h = await startServer(t, smtp.port);
  assert.equal((await h.forgot('not-an-address')).status, 400);

  const r = await h.forgot('  Lena@Example.com ');
  assert.deepEqual([r.status, r.body], [200, { ok: true }]);
  const msg = await smtp.waitFor(1);
  assert.match(msg, /\r\nTo: <lena@example\.com>\r\n/);
  assert.match(msg, /\r\nSubject: Your Huru GYM reset code\r\n/);
  const code = codeIn(msg);
  assert.ok(code, 'a reset code in the mail');
  const pending = h.db().users.find(u => u.id === LENA);
  assert.equal(pending.pwReset.by, 'email');
  assert.ok(pending.pwReset.exp <= Date.now() + 3600000 && pending.pwReset.exp > Date.now() + 3500000);
  assert.ok(pending.pw?.h, 'asking for a code leaves the password in place');
  assert.ok(!JSON.stringify(h.db()).includes(code), 'only the hash is stored');

  assert.equal((await h.post('/api/login/password', { identifier: 'lena@example.com', password: OLD })).status, 200);

  assert.equal((await h.post('/api/login/password-reset', { identifier: 'lena@example.com', code: 'AAAA-BBBB-CCCC', next: NEW })).status, 400);
  const ok = await h.post('/api/login/password-reset', { identifier: 'lena@example.com', code, next: NEW });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.name, 'Lena');
  assert.equal(h.db().users.find(u => u.id === LENA).pwReset, undefined);
  assert.equal((await h.post('/api/login/password', { identifier: 'Lena', password: NEW })).status, 200);
  assert.equal((await h.post('/api/login/password', { identifier: 'Lena', password: OLD })).status, 401);
  // Single use.
  assert.equal((await h.post('/api/login/password-reset', { identifier: 'lena@example.com', code, next: OLD })).status, 400);
});

test('forgot: the same answer for an unknown or disabled address, and nothing is sent', async t => {
  const smtp = await fakeSmtp(t);
  const h = await startServer(t, smtp.port);
  for (const email of ['nobody@example.com', 'gone@example.com']) {
    const r = await h.forgot(email);
    assert.deepEqual([r.status, r.body], [200, { ok: true }]);
  }
  await new Promise(r => setTimeout(r, 300));
  assert.equal(smtp.messages.length, 0);
  assert.equal(h.db().users.find(u => u.id === 'u_off_1').pwReset, undefined);
});

test('forgot: 3 mails per address an hour, then 429 with Retry-After', async t => {
  const smtp = await fakeSmtp(t);
  const h = await startServer(t, smtp.port);
  for (let i = 0; i < 3; i++) assert.equal((await h.forgot('lena@example.com')).status, 200);
  const r = await fetch(h.api + '/api/huru/password/forgot', { method: 'POST', headers: HEADERS, body: JSON.stringify({ email: 'lena@example.com' }) });
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get('retry-after')) > 0);
  assert.equal((await r.json()).code, 'locked');
  await smtp.waitFor(3);
});
