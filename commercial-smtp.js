'use strict';

const nodemailer = require('nodemailer');

function normalizeGoogleAppPassword(value) {
  return String(value || '').replace(/\s+/g, '').trim();
}

function gmailTransport(user, appPassword) {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: String(user || '').trim(),
      pass: normalizeGoogleAppPassword(appPassword)
    }
  });
}

async function sendGmail({ user, appPassword, fromName, to, replyTo, subject, html, text }) {
  const transport = gmailTransport(user, appPassword);
  const from = `${String(fromName || 'ARCADI GESTIO RESTAURANT').trim()} <${String(user || '').trim()}>`;
  const info = await transport.sendMail({
    from,
    to,
    replyTo: replyTo || undefined,
    subject,
    html,
    text
  });
  return { id: info.messageId || '', accepted: info.accepted || [] };
}

module.exports = { normalizeGoogleAppPassword, gmailTransport, sendGmail };
