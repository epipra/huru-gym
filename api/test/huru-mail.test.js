/* Huru GYM: the SMTP client (api/huru/mail.js), against a fake relay. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mailConfig, sendMail, buildMessage, addressOf } from '../huru/mail.js';
import { resetEmail } from '../huru/routes.js';
import { fakeSmtp, bodyOf } from './huru-smtp.mjs';

const cfgFor = (port, extra = {}) => mailConfig({
  SMTP_HOST: '127.0.0.1', SMTP_PORT: String(port), SMTP_SECURE: '0',
  SMTP_USER: 'support@example.com', SMTP_PASS: 'app-password-123', MAIL_FROM: 'Huru GYM <support@example.com>', ...extra
});

test('mailConfig: off without credentials, TLS unless plain is asked for on loopback', () => {
  assert.equal(mailConfig({}).enabled, false);
  assert.equal(mailConfig({ SMTP_USER: 'a@b.c' }).enabled, false);
  const gmail = mailConfig({ SMTP_USER: 'a@b.c', SMTP_PASS: 'x' });
  assert.deepEqual([gmail.enabled, gmail.host, gmail.port, gmail.secure, gmail.from], [true, 'smtp.gmail.com', 465, true, 'a@b.c']);
  // SMTP_SECURE=0 is honoured only for a loopback host: a typo cannot send a password in clear.
  assert.equal(mailConfig({ SMTP_HOST: 'smtp.gmail.com', SMTP_SECURE: '0' }).secure, true);
  assert.equal(mailConfig({ SMTP_HOST: '127.0.0.1', SMTP_SECURE: '0' }).secure, false);
  assert.equal(addressOf('Huru GYM <support@adxfuel.com>'), 'support@adxfuel.com');
  assert.equal(addressOf('support@adxfuel.com'), 'support@adxfuel.com');
});

test('buildMessage: headers, base64 body, no header injection', () => {
  const msg = buildMessage({ from: 'Huru GYM <s@example.com>', to: 'lena@example.com', subject: 'Hi', text: 'line one\n.line two', date: new Date(0), id: 'x' });
  assert.match(msg, /^From: Huru GYM <s@example\.com>\r\nTo: <lena@example\.com>\r\nSubject: Hi\r\n/);
  assert.match(msg, /\r\nMessage-ID: <x@example\.com>\r\n/);
  assert.equal(bodyOf(msg), 'line one\r\n.line two');
  assert.match(buildMessage({ from: 's@example.com', to: 'a@b.c', subject: 'Grüße', text: '' }), /Subject: =\?UTF-8\?B\?/);
  assert.throws(() => buildMessage({ from: 's@example.com', to: 'a@b.c\r\nBcc: x@y.z', subject: 'x', text: '' }), /line break/);
  assert.throws(() => buildMessage({ from: 's@example.com', to: 'a@b.c', subject: 'x\nBcc: x@y.z', text: '' }), /line break/);
});

test('sendMail: authenticates, sends one message, quits', async t => {
  const smtp = await fakeSmtp(t);
  await sendMail(cfgFor(smtp.port), { to: 'lena@example.com', subject: 'Your code', text: 'ABCD' }, { helo: 'gym.example.com' });
  const msg = await smtp.waitFor(1);
  const verbs = smtp.cmds.map(c => c.split(/[ :]/)[0]);
  assert.deepEqual(verbs, ['EHLO', 'AUTH', 'MAIL', 'RCPT', 'DATA', 'QUIT']);
  assert.equal(smtp.cmds[0], 'EHLO gym.example.com');
  assert.equal(Buffer.from(smtp.cmds[1].split(' ')[2], 'base64').toString(), '\0support@example.com\0app-password-123');
  assert.equal(smtp.cmds[2], 'MAIL FROM:<support@example.com>');
  assert.equal(smtp.cmds[3], 'RCPT TO:<lena@example.com>');
  assert.equal(bodyOf(msg), 'ABCD');
});

test('sendMail: a refused login rejects without the password in the error', async t => {
  const smtp = await fakeSmtp(t, { authOk: false });
  await assert.rejects(
    sendMail(cfgFor(smtp.port), { to: 'lena@example.com', subject: 'x', text: 'x' }),
    err => /AUTH refused: 535/.test(err.message) && !err.message.includes('app-password-123')
      && !err.message.includes(Buffer.from('\0support@example.com\0app-password-123').toString('base64'))
  );
  assert.equal(smtp.messages.length, 0);
});

test('sendMail: refuses when not configured or given a bad address', async () => {
  await assert.rejects(sendMail(mailConfig({}), { to: 'a@b.c', subject: 'x', text: 'x' }), /not configured/);
  await assert.rejects(sendMail(cfgFor(1), { to: 'not an address', subject: 'x', text: 'x' }), /bad address/);
});

test('resetEmail: names the code, its lifetime and the site', () => {
  const m = resetEmail({ name: 'Lena', code: 'ABCD-EFGH-JKLM', site: 'https://gym.example.com' });
  assert.equal(m.subject, 'Your Huru GYM reset code');
  assert.match(m.text, /^Hi Lena,/);
  assert.match(m.text, /ABCD-EFGH-JKLM/);
  assert.match(m.text, /60 minutes/);
  assert.match(m.text, /https:\/\/gym\.example\.com$/);
});
