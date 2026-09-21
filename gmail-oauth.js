'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const CALLBACK = '/api/gmail/callback';
const COOKIE = 'arcadi_gmail_oauth';
const pending = new Map();
const refreshes = new Map();
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const dataDir = () => path.resolve(process.env.DATA_DIR || __dirname);

function googleConfig() {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
  let base;
  try { base = new URL(process.env.APP_BASE_URL); } catch { return null; }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if (base.username || base.password || base.search || base.hash || base.pathname !== '/' ||
      (base.protocol !== 'https:' && !(local && base.protocol === 'http:'))) return null;
  return clientId && clientSecret ? { clientId, clientSecret, origin: base.origin, redirectUri: base.origin + CALLBACK } : null;
}

function key() {
  const file = path.join(dataDir(), 'gmail-token.key');
  fs.mkdirSync(dataDir(), { recursive: true });
  if (!fs.existsSync(file)) {
    try { fs.writeFileSync(file, crypto.randomBytes(32), { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  const value = fs.readFileSync(file);
  if (value.length !== 32) throw fail('No es pot obrir la connexió de Gmail.', 503);
  return value;
}

function readStore() {
  const file = path.join(dataDir(), 'gmail-connections.enc');
  if (!fs.existsSync(file)) return {};
  try {
    const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64')), decipher.final()]).toString('utf8'));
  } catch { throw fail('No es pot obrir la connexió de Gmail. Contacta amb l’administrador.', 503); }
}

function writeStore(store) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(store), 'utf8'), cipher.final()]);
  const file = path.join(dataDir(), 'gmail-connections.enc');
  const tmp = `${file}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') }), { mode: 0o600 });
  fs.renameSync(tmp, file);
  fs.chmodSync(file, 0o600);
}

function scopeKey(scope) { return hash(JSON.stringify([scope.userId, scope.companyId, scope.centreId])); }
function connection(scope) { return readStore()[scopeKey(scope)] || null; }
function saveConnection(scope, value) {
  const store = readStore();
  if (value) store[scopeKey(scope)] = value;
  else delete store[scopeKey(scope)];
  writeStore(store);
}

function status(scope) {
  const value = connection(scope);
  const ready = Boolean(googleConfig());
  return { provider: 'gmail', configured: ready && Boolean(value?.refreshToken), ready,
    from: value?.email || '', companyId: scope.companyId, centreId: scope.centreId };
}

function cookieOptions() { return `Path=/api/gmail; HttpOnly; SameSite=Lax${googleConfig()?.origin.startsWith('https:') ? '; Secure' : ''}`; }
function start(scope, res) {
  const config = googleConfig();
  if (!config) throw fail('La connexió amb Google encara no està activada al servidor. Contacta amb l’administrador.', 503);
  for (const [id, item] of pending) if (item.expires <= Date.now()) pending.delete(id);
  if (pending.size >= 1000) throw fail('Torna a provar la connexió d’aquí a uns minuts.', 429);
  const state = crypto.randomBytes(32).toString('base64url');
  const browser = crypto.randomBytes(32).toString('base64url');
  const verifier = crypto.randomBytes(32).toString('base64url');
  pending.set(hash(state), { scope, browser: hash(browser), verifier, expires: Date.now() + 10 * 60 * 1000 });
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri,
    response_type: 'code', scope: `openid email ${SEND_SCOPE}`, access_type: 'offline', prompt: 'consent',
    state, code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
  res.setHeader('Set-Cookie', `${COOKIE}=${browser}; ${cookieOptions()}; Max-Age=600`);
  return { url: url.toString() };
}

async function googleRequest(url, options) {
  let response;
  try { response = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) }); }
  catch { throw fail('No s’ha pogut contactar amb Google. Torna-ho a provar més tard.', 502); }
  let body;
  try { body = await response.json(); } catch { body = {}; }
  if (!response.ok) {
    const error = fail('Google no ha pogut completar l’operació. Torna a connectar Gmail si has retirat el permís.', 502);
    error.invalidGrant = body.error === 'invalid_grant';
    error.unauthorized = response.status === 401;
    throw error;
  }
  return body;
}

async function tokenRequest(params) {
  const config = googleConfig();
  if (!config) throw fail('La connexió amb Google encara no està activada al servidor.', 503);
  return googleRequest('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...params }).toString()
  });
}

async function callback(req, url, userId) {
  const state = url.searchParams.get('state') || '';
  const item = pending.get(hash(state));
  const browser = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) || '';
  if (!item || item.expires <= Date.now() || item.browser !== hash(browser) || item.scope.userId !== userId) {
    throw fail('La connexió ha caducat o no correspon a aquesta sessió. Prem “Connectar Gmail”.');
  }
  pending.delete(hash(state));
  if (url.searchParams.has('error')) throw fail('No s’ha autoritzat Gmail. Pots tornar-ho a provar quan vulguis.');
  const code = url.searchParams.get('code');
  if (!code || code.length > 4096) throw fail('Google no ha retornat una autorització vàlida.');
  const tokens = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: googleConfig().redirectUri, code_verifier: item.verifier });
  if (!String(tokens.scope || '').split(' ').includes(SEND_SCOPE) || !tokens.access_token || !tokens.refresh_token) {
    throw fail('Cal autoritzar l’enviament de correu a Google. Torna a prémer “Connectar Gmail”.');
  }
  const identity = await googleRequest('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  if (!identity.email_verified || !validEmail(identity.email) || !identity.sub) throw fail('Google no ha confirmat l’adreça del compte.');
  saveConnection(item.scope, { email: identity.email, googleId: identity.sub, refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token, expires: Date.now() + Number(tokens.expires_in || 3600) * 1000, connectedAt: new Date().toISOString() });
  return item.scope;
}

async function accessToken(scope) {
  const value = connection(scope);
  if (!value?.refreshToken) throw fail('Prem “Connectar Gmail” abans d’enviar la proposta.', 409);
  if (value.accessToken && value.expires > Date.now() + 60000) return value.accessToken;
  const id = scopeKey(scope);
  if (refreshes.has(id)) return refreshes.get(id);
  const job = (async () => {
    try {
      const tokens = await tokenRequest({ grant_type: 'refresh_token', refresh_token: value.refreshToken });
      if (!tokens.access_token) throw fail('Google no ha renovat la connexió. Torna-ho a provar.', 502);
      // Do not restore a connection disconnected/replaced while Google was responding.
      if (connection(scope)?.refreshToken !== value.refreshToken) throw fail('La connexió de Gmail ha canviat. Torna-ho a provar.', 409);
      saveConnection(scope, { ...value, accessToken: tokens.access_token, refreshToken: tokens.refresh_token || value.refreshToken,
        expires: Date.now() + Number(tokens.expires_in || 3600) * 1000 });
      return tokens.access_token;
    } catch (error) {
      if (error.invalidGrant && connection(scope)?.refreshToken === value.refreshToken) {
        saveConnection(scope, null);
        throw fail('Google ha retirat l’autorització. Prem “Connectar Gmail” per tornar a autoritzar-la.', 409);
      }
      throw error;
    }
  })();
  refreshes.set(id, job);
  try { return await job; } finally { refreshes.delete(id); }
}

function validEmail(value) { return typeof value === 'string' && /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value); }
function createMessage({ from, to, subject, text, html }) {
  if (!validEmail(from) || !validEmail(to)) throw fail('L’adreça de correu no és vàlida.');
  const b64 = value => Buffer.from(String(value || ''), 'utf8').toString('base64');
  const body64 = value => b64(value).match(/.{1,76}/g)?.join('\r\n') || '';
  const boundary = `arcadi_${crypto.randomBytes(12).toString('hex')}`;
  return [`From: <${from}>`, `To: <${to}>`, `Subject: =?UTF-8?B?${b64(subject)}?=`,
    `Date: ${new Date().toUTCString()}`, `Message-ID: <${crypto.randomUUID()}@arcadi.local>`, 'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`, '', `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', body64(text),
    `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', body64(html), `--${boundary}--`, ''].join('\r\n');
}

async function sendMail(scope, payload) {
  const token = await accessToken(scope);
  const from = connection(scope)?.email;
  const raw = Buffer.from(createMessage({ ...payload, from })).toString('base64url');
  try {
    const result = await googleRequest('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw })
    });
    if (!result.id) throw fail('Google no ha confirmat l’enviament. Comprova la carpeta Enviats abans de repetir-lo.', 502);
    return { id: result.id, from };
  } catch (error) {
    if (error.unauthorized) {
      const value = connection(scope);
      if (value?.accessToken === token) saveConnection(scope, { ...value, accessToken: '', expires: 0 });
    }
    // Never retry messages automatically: a network failure may follow successful delivery.
    throw error;
  }
}

module.exports = { SEND_SCOPE, CALLBACK, COOKIE, googleConfig, status, start, callback, accessToken, sendMail,
  connection, saveConnection, scopeKey, validEmail, createMessage, cookieOptions };
