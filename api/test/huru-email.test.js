/* Huru GYM: confirming a sign-in e-mail with a 6-digit code (api/huru/email-store.js and the
 * /api/huru/email routes), against the real server.js in a child process and a fake SMTP relay. */
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
const SECRET = crypto.randomBytes(32).toString('hex');
const ORIGIN = 'http://localhost:8080';
const LENA = 'u_pw_1', NOMAIL = 'u_pw_2', PW = 'correct horse battery staple';
const mintSession = uid => {
  const payload = `${uid}:${Date.now() + 86400000}:0`;
  return payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
};

async function startServer(t, smtpPort) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'huru-email-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  const created = new Date().toISOString();
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({
    users: [
      { id: 'u_adm_1', name: 'Owner', created, admin: true },
      { id: LENA, name: 'Lena', created, email: 'lena@example.com', pw: { h: await hashPassword(PW), set: created } },
      { id: NOMAIL, name: 'Marco', created, pw: { h: await hashPassword(PW), set: created } }
    ],
    creds: [], subs: [], invites: []
  }));
  const env = { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN, RP_ID: 'localhost', PASSWORD_LOGIN: '1',
    SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtpPort), SMTP_SECURE: '0', SMTP_USER: 'support@example.com', SMTP_PASS: 'pw',
    MAIL_FROM: 'Huru GYM <support@example.com>' };
  const child = spawn(process.execPath, ['server.js'], { cwd: API, stdio: ['ignore', 'pipe', 'pipe'], env });
  const h = { log: '' };
  child.stdout.on('data', d => h.log += d);
  child.stderr.on('data', d => h.log += d);
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  h.api = `http://127.0.0.1:${await boundPort(child, () => h.log)}`;
  h.call = async (method, p, uid, body) => {
    const headers = { 'Content-Type': 'application/json', Origin: ORIGIN };
    if (uid) headers.Cookie = `gymsid=${mintSession(uid)}`;
    const r = await fetch(h.api + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  h.me = async uid => (await h.call('GET', '/api/huru/me', uid)).body.email;
  return h;
}
const codeIn = msg => /\b(\d{6})\b/.exec(bodyOf(msg))?.[1];

test('email: a mailed 6-digit code confirms the sign-in e-mail, and only then do reset codes go to it', async t => {
  const smtp = await fakeSmtp(t);
  const h = await startServer(t, smtp.port);
  assert.deepEqual(await h.me(LENA), { address: 'lena@example.com', verified: false });

  // Not confirmed yet: a forgotten-password request sends nothing.
  assert.equal((await h.call('POST', '/api/huru/password/forgot', null, { email: 'lena@example.com' })).status, 200);
  await new Promise(r => setTimeout(r, 300));
  assert.equal(smtp.messages.length, 0);

  assert.equal((await h.call('POST', '/api/huru/email/send-code', null)).status, 401);
  const sent = await h.call('POST', '/api/huru/email/send-code', LENA);
  assert.deepEqual([sent.status, sent.body], [200, { ok: true, verified: false }]);
  const msg = await smtp.waitFor(1);
  assert.match(msg, /\r\nSubject: Confirm your Huru GYM e-mail\r\n/);
  const code = codeIn(msg);
  assert.ok(code, 'a 6-digit code in the mail');

  const wrong = await h.call('POST', '/api/huru/email/verify', LENA, { code: code === '000000' ? '111111' : '000000' });
  assert.deepEqual([wrong.status, wrong.body.code], [400, 'code-wrong']);
  const ok = await h.call('POST', '/api/huru/email/verify', LENA, { code: code.slice(0, 3) + ' ' + code.slice(3) });
  assert.deepEqual([ok.status, ok.body], [200, { verified: true }]);
  assert.deepEqual(await h.me(LENA), { address: 'lena@example.com', verified: true });
  // Used once: the same code again finds nothing pending.
  assert.equal((await h.call('POST', '/api/huru/email/verify', LENA, { code })).body.code, 'code-none');
  // Already confirmed: no second mail.
  assert.deepEqual((await h.call('POST', '/api/huru/email/send-code', LENA)).body, { ok: true, verified: true });

  assert.equal((await h.call('POST', '/api/huru/password/forgot', null, { email: 'lena@example.com' })).status, 200);
  const reset = await smtp.waitFor(2);
  assert.match(reset, /\r\nSubject: Your Huru GYM reset code\r\n/);
});

test('email: no address, too many wrong codes, and the hourly limit', async t => {
  const smtp = await fakeSmtp(t);
  const h = await startServer(t, smtp.port);
  assert.deepEqual(await h.me(NOMAIL), { address: null, verified: false });
  assert.equal((await h.call('POST', '/api/huru/email/send-code', NOMAIL)).body.code, 'no-email');
  assert.equal((await h.call('POST', '/api/huru/email/verify', LENA, { code: '123456' })).body.code, 'code-none');

  assert.equal((await h.call('POST', '/api/huru/email/send-code', LENA)).status, 200);
  const code = codeIn(await smtp.waitFor(1));
  const bad = code === '000000' ? '111111' : '000000';
  const answers = [];
  for (let i = 0; i < 5; i++) answers.push((await h.call('POST', '/api/huru/email/verify', LENA, { code: bad })).body.code);
  assert.deepEqual(answers, ['code-wrong', 'code-wrong', 'code-wrong', 'code-wrong', 'code-locked']);
  // Locked: even the right code is refused until a new one is sent.
  assert.equal((await h.call('POST', '/api/huru/email/verify', LENA, { code })).body.code, 'code-locked');

  assert.equal((await h.call('POST', '/api/huru/email/send-code', LENA)).status, 200);
  assert.equal((await h.call('POST', '/api/huru/email/send-code', LENA)).status, 200);
  const limited = await h.call('POST', '/api/huru/email/send-code', LENA);
  assert.deepEqual([limited.status, limited.body.code], [429, 'locked']);
});
