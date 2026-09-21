'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { proposalSubject, proposalText, proposalHtml, sendResend } = require('./commercial-email.js');

const ROOT = __dirname;
const originalCreateServer = http.createServer;

function dataPaths() {
  const configured = String(process.env.DATA_DIR || '').trim();
  const dataDir = configured ? path.resolve(configured) : ROOT;
  return { dataFile: path.join(dataDir, 'data.json'), backupsDir: path.join(dataDir, 'backups') };
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

function senderConfig() {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  const email = String(process.env.COMMERCIAL_FROM_EMAIL || '').trim();
  const name = String(process.env.COMMERCIAL_FROM_NAME || 'ARCADI GESTIO RESTAURANT').trim();
  const replyTo = String(process.env.COMMERCIAL_REPLY_TO || '').trim();
  return {
    configured: Boolean(apiKey && email),
    apiKey,
    email,
    from: email.includes('<') ? email : `${name} <${email}>`,
    replyTo
  };
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
    const error = new Error('L’enviament directe encara no està configurat. Cal RESEND_API_KEY i COMMERCIAL_FROM_EMAIL al servidor.');
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

async function handleCommercialRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/commercial-email-status' && req.method === 'GET') {
    if (!requireAdmin(req, res)) return true;
    const config = senderConfig();
    send(res, 200, { configured: config.configured, provider: 'resend', from: config.configured ? config.email : '' });
    return true;
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

module.exports = { ...exported, handleCommercialRequest, senderConfig, proposalCompany, sendProposal };
