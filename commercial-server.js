'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { proposalSubject, proposalText, proposalHtml, sendResend } = require('./commercial-email.js');

const ROOT = __dirname;
const originalCreateServer = http.createServer;
const MAIL_CONFIG_FILE = 'commercial-email.json';

function dataPaths() {
  const configured = String(process.env.DATA_DIR || '').trim();
  const dataDir = configured ? path.resolve(configured) : ROOT;
  return {
    dataDir,
    dataFile: path.join(dataDir, 'data.json'),
    backupsDir: path.join(dataDir, 'backups'),
    mailConfigFile: path.join(dataDir, MAIL_CONFIG_FILE)
  };
}

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
}

function send(res, status, body) {
  securityHeaders(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isLoopback(req) {
  const address = String(req.socket?.remoteAddress || '');
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
}

function isAdmin(req) {
  if (process.env.ARCADI_DESKTOP === '1') return isLoopback(req);
  if (!process.env.ADMIN_USER || !process.env.ADMIN_PASSWORD) return false;
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Basic ')) return false;
  let decoded = '';
  try { decoded = Buffer.from(header.slice(6), 'base64').toString('utf8'); } catch { return false; }
  const separator = decoded.indexOf(':');
  if (separator < 0) return false;
  return safeEqual(decoded.slice(0, separator), process.env.ADMIN_USER)
    && safeEqual(decoded.slice(separator + 1), process.env.ADMIN_PASSWORD);
}

function requireAdmin(req, res) {
  if (isAdmin(req)) return true;
  res.setHeader('WWW-Authenticate', 'Basic realm="ARCADI Back Office", charset="UTF-8"');
  send(res, 401, { error: 'Accés restringit a Direcció.' });
  return false;
}

function readJsonBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > limit) {
        const error = new Error('Petició massa gran');
        error.statusCode = 413;
        reject(error);
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try { resolve(JSON.parse(body)); }
      catch {
        const error = new Error('JSON no vàlid');
        error.statusCode = 400;
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function readData() {
  const { dataFile } = dataPaths();
  if (!fs.existsSync(dataFile)) throw new Error('No s’ha trobat el fitxer de dades');
  return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
}

function writeData(data, label = 'commercial') {
  const { dataFile, backupsDir } = dataPaths();
  fs.mkdirSync(backupsDir, { recursive: true });
  if (fs.existsSync(dataFile)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(dataFile, path.join(backupsDir, `before_${label}_${stamp}.json`));
  }
  data.updatedAt = new Date().toISOString();
  const temporary = `${dataFile}.commercial.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(temporary, dataFile);
}

function readStoredMailConfig() {
  const { mailConfigFile } = dataPaths();
  try {
    if (!fs.existsSync(mailConfigFile)) return {};
    const value = JSON.parse(fs.readFileSync(mailConfigFile, 'utf8'));
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function writeStoredMailConfig(config) {
  const { dataDir, mailConfigFile } = dataPaths();
  fs.mkdirSync(dataDir, { recursive: true });
  const temporary = `${mailConfigFile}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(config, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, mailConfigFile);
  try { fs.chmodSync(mailConfigFile, 0o600); } catch {}
}

function senderConfig() {
  const stored = readStoredMailConfig();
  const envApiKey = String(process.env.RESEND_API_KEY || '').trim();
  const envEmail = String(process.env.COMMERCIAL_FROM_EMAIL || '').trim();
  const envName = String(process.env.COMMERCIAL_FROM_NAME || '').trim();
  const envReplyTo = String(process.env.COMMERCIAL_REPLY_TO || '').trim();

  const apiKey = envApiKey || String(stored.apiKey || '').trim();
  const email = envEmail || String(stored.email || '').trim();
  const name = envName || String(stored.name || 'ARCADI GESTIO RESTAURANT').trim();
  const replyTo = envReplyTo || String(stored.replyTo || '').trim();
  const source = envApiKey || envEmail ? 'environment' : (apiKey || email ? 'stored' : 'none');

  return {
    configured: Boolean(apiKey && email),
    apiKey,
    email,
    name,
    from: email ? (email.includes('<') ? email : `${name} <${email}>`) : '',
    replyTo,
    source
  };
}

function publicSenderConfig() {
  const config = senderConfig();
  return {
    configured: config.configured,
    provider: 'resend',
    from: config.email,
    name: config.name,
    replyTo: config.replyTo,
    source: config.source,
    hasApiKey: Boolean(config.apiKey),
    apiKeyMasked: config.apiKey ? `${config.apiKey.slice(0, 5)}••••••${config.apiKey.slice(-4)}` : ''
  };
}

function saveSenderConfig(input = {}) {
  const current = readStoredMailConfig();
  const envLocked = Boolean(String(process.env.RESEND_API_KEY || '').trim() || String(process.env.COMMERCIAL_FROM_EMAIL || '').trim());
  if (envLocked) {
    const error = new Error('La configuració de correu està definida a les variables del servidor i no es pot substituir des de l’app.');
    error.statusCode = 409;
    throw error;
  }

  const next = {
    provider: 'resend',
    apiKey: input.clearApiKey === true ? '' : (String(input.apiKey || '').trim() || String(current.apiKey || '').trim()),
    email: String(input.email ?? current.email ?? '').trim(),
    name: String(input.name ?? current.name ?? 'ARCADI GESTIO RESTAURANT').trim() || 'ARCADI GESTIO RESTAURANT',
    replyTo: String(input.replyTo ?? current.replyTo ?? '').trim(),
    updatedAt: new Date().toISOString()
  };
  if (next.email && !/^\S+@\S+\.\S+$/.test(next.email)) {
    const error = new Error('L’email remitent no és vàlid.');
    error.statusCode = 400;
    throw error;
  }
  if (next.replyTo && !/^\S+@\S+\.\S+$/.test(next.replyTo)) {
    const error = new Error('L’email de resposta no és vàlid.');
    error.statusCode = 400;
    throw error;
  }
  if (next.apiKey && !/^re_[A-Za-z0-9_\-]+$/.test(next.apiKey)) {
    const error = new Error('La clau de Resend no té el format esperat (re_...).');
    error.statusCode = 400;
    throw error;
  }
  writeStoredMailConfig(next);
  return publicSenderConfig();
}

function proposalCompany(data, proposal) {
  const organization = (data.organizations || []).find(item => item.id === proposal.companyId);
  const centre = (data.restaurants || []).find(item => item.id === proposal.centreId);
  return {
    name: centre?.name || organization?.name || data.company?.name || 'ARCADI GESTIO RESTAURANT',
    phone: centre?.phone || data.company?.phone || '',
    email: senderConfig().replyTo || data.company?.email || ''
  };
}

async function sendProposal(data, proposal) {
  const config = senderConfig();
  if (!config.configured) {
    const error = new Error('L’enviament directe no està configurat. Obre “Configurar correu” a Propostes comercials i introdueix la clau de Resend i l’email remitent.');
    error.statusCode = 503;
    throw error;
  }
  if (!['VALIDADA', 'ENVIADA'].includes(String(proposal.status || ''))) {
    const error = new Error('Direcció ha de validar la proposta abans de poder-la enviar.');
    error.statusCode = 409;
    throw error;
  }
  const to = String(proposal.clientEmail || '').trim();
  if (!/^\S+@\S+\.\S+$/.test(to)) {
    const error = new Error('La proposta no té un email de client vàlid.');
    error.statusCode = 400;
    throw error;
  }
  const company = proposalCompany(data, proposal);
  const result = await sendResend({
    apiKey: config.apiKey,
    from: config.from,
    to,
    replyTo: config.replyTo || company.email || '',
    subject: proposalSubject(proposal, company.name),
    html: proposalHtml(proposal, company),
    text: proposalText(proposal, company)
  });
  const now = new Date().toISOString();
  proposal.status = 'ENVIADA';
  proposal.sentAt = now;
  proposal.sentTo = to;
  proposal.updatedAt = now;
  proposal.sendHistory = Array.isArray(proposal.sendHistory) ? proposal.sendHistory : [];
  proposal.sendHistory.push({ at: now, to, provider: 'resend', providerId: result.id || '' });
  return result;
}

async function sendTestEmail(to) {
  const config = senderConfig();
  if (!config.configured) {
    const error = new Error('Configura primer la clau de Resend i l’email remitent.');
    error.statusCode = 503;
    throw error;
  }
  const recipient = String(to || '').trim();
  if (!/^\S+@\S+\.\S+$/.test(recipient)) {
    const error = new Error('Indica un email de prova vàlid.');
    error.statusCode = 400;
    throw error;
  }
  return sendResend({
    apiKey: config.apiKey,
    from: config.from,
    to: recipient,
    replyTo: config.replyTo,
    subject: 'Prova d’enviament · ARCADI GESTIO RESTAURANT',
    html: '<div style="font-family:Arial,sans-serif"><h2>ARCADI GESTIO RESTAURANT</h2><p>L’enviament directe de propostes comercials està configurat correctament.</p></div>',
    text: 'ARCADI GESTIO RESTAURANT\n\nL’enviament directe de propostes comercials està configurat correctament.'
  });
}

async function handleCommercialRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/api/commercial-email-status' && req.method === 'GET') {
    if (!requireAdmin(req, res)) return true;
    send(res, 200, publicSenderConfig());
    return true;
  }

  if (url.pathname === '/api/commercial-email-config' && req.method === 'GET') {
    if (!requireAdmin(req, res)) return true;
    send(res, 200, publicSenderConfig());
    return true;
  }

  if (url.pathname === '/api/commercial-email-config' && req.method === 'POST') {
    if (!requireAdmin(req, res)) return true;
    try {
      const body = await readJsonBody(req);
      const config = saveSenderConfig(body);
      send(res, 200, { ok: true, ...config, message: config.configured ? 'Correu comercial configurat.' : 'Configuració guardada, però encara falten dades.' });
      return true;
    } catch (error) {
      send(res, error.statusCode || 500, { error: error.message || 'No s’ha pogut guardar la configuració.' });
      return true;
    }
  }

  if (url.pathname === '/api/commercial-email-test' && req.method === 'POST') {
    if (!requireAdmin(req, res)) return true;
    try {
      const body = await readJsonBody(req);
      const result = await sendTestEmail(body.to);
      send(res, 200, { ok: true, providerId: result.id || '', message: `Email de prova enviat a ${String(body.to || '').trim()}.` });
      return true;
    } catch (error) {
      send(res, error.statusCode || 500, { error: error.message || 'No s’ha pogut enviar la prova.' });
      return true;
    }
  }

  const match = url.pathname.match(/^\/api\/commercial-proposals\/([^/]+)\/send$/);
  if (!match || req.method !== 'POST') return false;
  if (!requireAdmin(req, res)) return true;
  try {
    const data = readData();
    const proposalId = decodeURIComponent(match[1]);
    const proposal = (data.commercialProposals || []).find(item => item.id === proposalId);
    if (!proposal) return send(res, 404, { error: 'Proposta comercial no trobada' }) || true;
    const result = await sendProposal(data, proposal);
    writeData(data, 'commercial_send');
    send(res, 200, { ok: true, proposalId, providerId: result.id || '', message: `Proposta ${proposal.code || ''} enviada a ${proposal.clientEmail}.` });
    return true;
  } catch (error) {
    send(res, error.statusCode || 500, { error: error.message || 'No s’ha pogut enviar la proposta' });
    return true;
  }
}

http.createServer = function patchedCreateServer(listener) {
  return originalCreateServer.call(http, (req, res) => {
    Promise.resolve(handleCommercialRequest(req, res)).then(handled => {
      if (!handled) listener(req, res);
    }).catch(error => send(res, 500, { error: error.message || 'Error comercial' }));
  });
};

let exported;
try {
  exported = require('./server.js');
} finally {
  http.createServer = originalCreateServer;
}

module.exports = {
  ...exported,
  handleCommercialRequest,
  senderConfig,
  publicSenderConfig,
  saveSenderConfig,
  proposalCompany,
  sendProposal,
  sendTestEmail,
  readStoredMailConfig
};
