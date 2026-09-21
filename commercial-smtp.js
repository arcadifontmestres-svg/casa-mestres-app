'use strict';

const tls = require('tls');
const crypto = require('crypto');

function normalizeGoogleAppPassword(value) {
  return String(value || '').replace(/\s+/g, '').trim();
}

function b64(value) { return Buffer.from(String(value), 'utf8').toString('base64'); }
function encodeHeader(value) { return `=?UTF-8?B?${b64(value)}?=`; }
function normalizeBody(value) { return String(value || '').replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..'); }

function createMessage({ user, fromName, to, replyTo, subject, html, text }) {
  const boundary = `arcadi_${crypto.randomBytes(12).toString('hex')}`;
  const id = `<${Date.now()}.${crypto.randomBytes(8).toString('hex')}@arcadi.local>`;
  const lines = [
    `From: ${encodeHeader(fromName || 'ARCADI GESTIO RESTAURANT')} <${user}>`,
    `To: <${to}>`,
    `Subject: ${encodeHeader(subject || 'Proposta comercial')}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${id}`,
    'MIME-Version: 1.0',
    ...(replyTo ? [`Reply-To: <${replyTo}>`] : []),
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(text || ''),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(html || ''),
    `--${boundary}--`,
    ''
  ];
  return { id, raw: normalizeBody(lines.join('\r\n')) };
}

function smtpError(stage, response) {
  const err = new Error(`Gmail SMTP ha rebutjat ${stage}: ${String(response || '').trim()}`);
  err.code = 'SMTP_ERROR';
  return err;
}

async function sendGmail({ user, appPassword, fromName, to, replyTo, subject, html, text }) {
  user = String(user || '').trim();
  appPassword = normalizeGoogleAppPassword(appPassword);
  if (!user || !appPassword) throw new Error('Falten l’email de Gmail o la contrasenya d’aplicació.');
  if (!/^\S+@\S+\.\S+$/.test(user) || !/^\S+@\S+\.\S+$/.test(String(to || ''))) throw new Error('Email no vàlid.');

  const message = createMessage({ user, fromName, to, replyTo, subject, html, text });

  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: 'smtp.gmail.com', port: 465, servername: 'smtp.gmail.com', rejectUnauthorized: true });
    let buffer = '';
    let closed = false;

    const finish = (error, value) => {
      if (closed) return;
      closed = true;
      try { socket.end(); } catch {}
      error ? reject(error) : resolve(value);
    };

    socket.setTimeout(20000, () => finish(new Error('Temps d’espera esgotat connectant amb Gmail.')));
    socket.on('error', error => finish(error));
    socket.on('data', chunk => { buffer += chunk.toString('utf8'); });

    const readResponse = (timeout = 15000) => new Promise((res, rej) => {
      const started = Date.now();
      const poll = () => {
        const lines = buffer.split(/\r?\n/).filter(Boolean);
        for (let i = 0; i < lines.length; i += 1) {
          const match = lines[i].match(/^(\d{3})([ -])(.*)$/);
          if (!match) continue;
          const code = Number(match[1]);
          if (match[2] === ' ') {
            const response = lines.slice(0, i + 1).join('\n');
            buffer = lines.slice(i + 1).join('\r\n') + (lines.length > i + 1 ? '\r\n' : '');
            return res({ code, response });
          }
        }
        if (Date.now() - started > timeout) return rej(new Error('Resposta SMTP no rebuda a temps.'));
        setTimeout(poll, 20);
      };
      poll();
    });

    const command = async (line, expected) => {
      socket.write(`${line}\r\n`);
      const result = await readResponse();
      if (!expected.includes(result.code)) throw smtpError(line.split(' ')[0], result.response);
      return result;
    };

    socket.once('secureConnect', async () => {
      try {
        let response = await readResponse();
        if (response.code !== 220) throw smtpError('connexió', response.response);
        await command('EHLO arcadi-gestio.local', [250]);
        await command('AUTH LOGIN', [334]);
        await command(b64(user), [334]);
        await command(b64(appPassword), [235]);
        await command(`MAIL FROM:<${user}>`, [250]);
        await command(`RCPT TO:<${to}>`, [250, 251]);
        await command('DATA', [354]);
        socket.write(`${message.raw}\r\n.\r\n`);
        response = await readResponse();
        if (response.code !== 250) throw smtpError('DATA', response.response);
        try { await command('QUIT', [221]); } catch {}
        finish(null, { id: message.id, accepted: [to] });
      } catch (error) { finish(error); }
    });
  });
}

module.exports = { normalizeGoogleAppPassword, createMessage, sendGmail };
