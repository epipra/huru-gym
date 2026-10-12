/* Huru GYM: outgoing e-mail, for password-reset codes.
 *
 * A small SMTP client over node:tls instead of a mail library: the api keeps its two
 * dependencies (CONTRIBUTING.md), and one message at a time to one authenticated relay needs
 * only EHLO, AUTH PLAIN, MAIL, RCPT and DATA. Implicit TLS (port 465) by default, which is what
 * Google Workspace's smtp.gmail.com offers with an app password.
 *
 * Env: SMTP_USER, SMTP_PASS (mail is off unless both are set), SMTP_HOST (default
 *      smtp.gmail.com), SMTP_PORT (default 465), MAIL_FROM (default SMTP_USER; may be
 *      "Name <address>"). SMTP_SECURE=0 sends in plain text, and only to a loopback host: the
 *      tests' fake server.
 */
import tls from 'node:tls';
import net from 'node:net';
import crypto from 'node:crypto';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);

export function mailConfig(env = process.env) {
  const user = env.SMTP_USER || '', pass = env.SMTP_PASS || '';
  const host = env.SMTP_HOST || 'smtp.gmail.com';
  const secure = env.SMTP_SECURE !== '0' || !LOOPBACK.has(host);
  return {
    enabled: !!(user && pass),
    host, secure, user, pass,
    port: parseInt(env.SMTP_PORT || '', 10) || 465,
    from: env.MAIL_FROM || user
  };
}

// The address inside "Name <address>", or the whole value when there are no brackets.
export const addressOf = from => {
  const m = /<([^<>\s]+)>\s*$/.exec(String(from || ''));
  return (m ? m[1] : String(from || '')).trim();
};

const NO_BREAKS = /^[^\r\n]*$/;
// Header text: plain when it is ASCII, RFC 2047 encoded-word otherwise.
const headerText = s => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;

/** The message as sent after DATA. The body is base64, so no line can start with a dot. */
export function buildMessage({ from, to, subject, text, date = new Date(), id = crypto.randomUUID() }) {
  for (const v of [from, to, subject]) if (!NO_BREAKS.test(v)) throw new Error('mail: line break in a header');
  const domain = addressOf(from).split('@')[1] || 'localhost';
  const m = /^(.*?)\s*<([^<>]+)>$/.exec(from);
  const fromHeader = m && m[1] ? `${headerText(m[1].replace(/^"|"$/g, ''))} <${m[2]}>` : from;
  const body = Buffer.from(String(text).replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n');
  return [
    `From: ${fromHeader}`,
    `To: <${to}>`,
    `Subject: ${headerText(subject)}`,
    `Date: ${date.toUTCString()}`,
    `Message-ID: <${id}@${domain}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    'Auto-Submitted: auto-generated',
    '',
    body
  ].join('\r\n');
}

// Replies off the socket, one per call: lines until one without the "250-" continuation dash.
function replies(socket) {
  const ready = [], waiters = [];
  let buf = '', lines = [], failure = null;
  socket.setEncoding('utf8');
  socket.on('data', chunk => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, '');
      buf = buf.slice(i + 1);
      lines.push(line);
      if (/^\d{3}-/.test(line)) continue;
      const reply = { code: parseInt(line.slice(0, 3), 10), text: lines.join(' | ') };
      lines = [];
      if (waiters.length) waiters.shift().resolve(reply); else ready.push(reply);
    }
  });
  const fail = err => {
    failure = failure || err;
    while (waiters.length) waiters.shift().reject(failure);
  };
  socket.on('error', fail);
  socket.on('close', () => fail(new Error('smtp: connection closed')));
  return () => ready.length ? Promise.resolve(ready.shift())
    : failure ? Promise.reject(failure)
    : new Promise((resolve, reject) => waiters.push({ resolve, reject }));
}

/** Send one plain-text message. Resolves when the relay has accepted it; rejects with an error
 *  that names the step and the relay's answer, never the credentials. */
export async function sendMail(cfg, { to, subject, text }, { timeoutMs = 20000, helo = 'localhost' } = {}) {
  if (!cfg.enabled) throw new Error('mail: not configured');
  const sender = addressOf(cfg.from);
  for (const a of [sender, to]) if (!/^[^\s<>@]+@[^\s<>@]+$/.test(a)) throw new Error('mail: bad address');
  const message = buildMessage({ from: cfg.from, to, subject, text });
  const socket = cfg.secure
    ? tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host })
    : net.connect({ host: cfg.host, port: cfg.port });
  socket.setTimeout(timeoutMs, () => socket.destroy(new Error('smtp: timed out')));
  const next = replies(socket);
  const step = async (line, verb, ok) => {
    if (line != null) socket.write(line + '\r\n');
    const r = await next();
    if (!ok.includes(r.code)) throw new Error(`smtp: ${verb} refused: ${r.text.slice(0, 200)}`);
    return r;
  };
  try {
    await step(null, 'greeting', [220]);
    await step(`EHLO ${helo}`, 'EHLO', [250]);
    await step('AUTH PLAIN ' + Buffer.from(`\0${cfg.user}\0${cfg.pass}`, 'utf8').toString('base64'), 'AUTH', [235]);
    await step(`MAIL FROM:<${sender}>`, 'MAIL FROM', [250]);
    await step(`RCPT TO:<${to}>`, 'RCPT TO', [250, 251]);
    await step('DATA', 'DATA', [354]);
    await step(message + '\r\n.', 'message', [250]);
    // The message is accepted at this point; a relay that hangs up without a 221 changes nothing.
    await step('QUIT', 'QUIT', [221]).catch(() => {});
  } finally {
    socket.end();
  }
}
