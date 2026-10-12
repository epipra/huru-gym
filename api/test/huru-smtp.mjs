/* A fake SMTP relay for the Huru mail tests: plain TCP on loopback, answers the commands
 * api/huru/mail.js sends, and keeps what it was told. */
import net from 'node:net';

export async function fakeSmtp(t, { authOk = true } = {}) {
  const got = { cmds: [], messages: [] };
  const server = net.createServer(sock => {
    sock.setEncoding('utf8');
    let buf = '', inData = false, data = '';
    sock.write('220 fake ESMTP\r\n');
    sock.on('data', chunk => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (inData) {
          if (line === '.') { inData = false; got.messages.push(data); data = ''; sock.write('250 2.0.0 queued\r\n'); }
          else data += line + '\r\n';
          continue;
        }
        got.cmds.push(line);
        const verb = line.split(' ')[0].toUpperCase();
        if (verb === 'EHLO') sock.write('250-fake greets you\r\n250 AUTH PLAIN LOGIN\r\n');
        else if (verb === 'AUTH') sock.write(authOk ? '235 2.7.0 accepted\r\n' : '535 5.7.8 username and password not accepted\r\n');
        else if (verb === 'MAIL' || verb === 'RCPT') sock.write('250 ok\r\n');
        else if (verb === 'DATA') { inData = true; sock.write('354 go ahead\r\n'); }
        else if (verb === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
        else sock.write('500 unknown\r\n');
      }
    });
    sock.on('error', () => {});
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  got.port = server.address().port;
  // Resolves with the n-th message once it has arrived.
  got.waitFor = async (n = 1, ms = 5000) => {
    const until = Date.now() + ms;
    while (got.messages.length < n) {
      if (Date.now() > until) throw new Error(`no mail after ${ms} ms`);
      await new Promise(r => setTimeout(r, 25));
    }
    return got.messages[n - 1];
  };
  return got;
}

/** The decoded text body of a message buildMessage() made. */
export const bodyOf = msg => Buffer.from(msg.split('\r\n\r\n').slice(1).join('').replace(/\s+/g, ''), 'base64').toString('utf8');
