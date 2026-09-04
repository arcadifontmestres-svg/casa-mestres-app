'use strict';

const crypto = require('crypto');

const READ_SCOPE = 'arcadi.read';
const WRITE_SCOPE = 'arcadi.write';
const SUPPORTED_SCOPES = [READ_SCOPE, WRITE_SCOPE];
const usedAuthorizationCodes = new Map();
const loginAttempts = new Map();

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function signingKey() {
  const user = String(process.env.ADMIN_USER || '');
  const password = String(process.env.ADMIN_PASSWORD || '');
  if (!user || !password) return null;
  return crypto.createHash('sha256')
    .update(`arcadi-mcp-oauth-v1\0${user}\0${password}`)
    .digest();
}

function signPayload(payload) {
  const key = signingKey();
  if (!key) throw new Error('OAuth no configurat');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', key).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verifyPayload(token, expectedType, issuer) {
  const key = signingKey();
  if (!key || typeof token !== 'string' || token.length > 16000) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const expected = crypto.createHmac('sha256', key).update(parts[0]).digest('base64url');
  if (!safeEqual(parts[1], expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const now = nowSeconds();
    if (payload.typ !== expectedType || payload.iss !== issuer) return null;
    if (!Number.isFinite(payload.iat) || !Number.isFinite(payload.exp)) return null;
    if (payload.iat > now + 60 || payload.exp <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

function resourceFor(baseUrl) {
  return `${baseUrl.replace(/\/$/, '')}/mcp`;
}

function metadataUrlFor(baseUrl) {
  return `${baseUrl.replace(/\/$/, '')}/.well-known/oauth-protected-resource`;
}

function oauthChallenge(baseUrl, scope, error = 'insufficient_scope', description = 'Cal iniciar sessio per continuar') {
  const fields = [
    `resource_metadata="${metadataUrlFor(baseUrl)}"`,
    `scope="${scope}"`,
    `error="${error}"`,
    `error_description="${description.replace(/["\\\r\n]/g, ' ')}"`
  ];
  return `Bearer ${fields.join(', ')}`;
}

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
}

function sendJson(res, status, body) {
  securityHeaders(res);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    Pragma: 'no-cache'
  });
  res.end(JSON.stringify(body));
}

function sendHtml(res, status, html) {
  securityHeaders(res);
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    Pragma: 'no-cache'
  });
  res.end(html);
}

function redirect(res, location) {
  securityHeaders(res);
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store', Pragma: 'no-cache' });
  res.end();
}

function htmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function parseScopes(value, fallback = SUPPORTED_SCOPES) {
  const requested = String(value || '').trim()
    ? [...new Set(String(value).trim().split(/\s+/))]
    : [...fallback];
  if (!requested.length || requested.some(scope => !SUPPORTED_SCOPES.includes(scope))) return null;
  return requested;
}

function isAllowedRedirectUri(value) {
  try {
    const uri = new URL(value);
    if (uri.username || uri.password || uri.hash) return false;
    const host = uri.hostname.toLowerCase();
    if (uri.protocol === 'https:' && (
      host === 'chatgpt.com' || host.endsWith('.chatgpt.com')
      || host === 'openai.com' || host.endsWith('.openai.com')
    )) return true;
    return process.env.NODE_ENV === 'test'
      && uri.protocol === 'http:'
      && ['127.0.0.1', 'localhost', '::1'].includes(host);
  } catch {
    return false;
  }
}

function validateClient(clientId, baseUrl) {
  const client = verifyPayload(clientId, 'client', baseUrl);
  if (!client || !Array.isArray(client.redirectUris) || !client.redirectUris.length) return null;
  if (client.redirectUris.some(uri => !isAllowedRedirectUri(uri))) return null;
  return client;
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('Cos de petició massa gran'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readForm(req) {
  const raw = await readBody(req);
  return new URLSearchParams(raw);
}

function verifyAdminCredentials(username, password) {
  const expectedUser = String(process.env.ADMIN_USER || '');
  const expectedPassword = String(process.env.ADMIN_PASSWORD || '');
  return Boolean(expectedUser && expectedPassword)
    && safeEqual(username, expectedUser)
    && safeEqual(password, expectedPassword);
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.socket?.remoteAddress || 'unknown');
}

function loginBlocked(req) {
  const key = clientIp(req);
  const current = loginAttempts.get(key);
  if (!current) return false;
  if (current.resetAt <= Date.now()) {
    loginAttempts.delete(key);
    return false;
  }
  return current.count >= 8;
}

function recordLoginFailure(req) {
  const key = clientIp(req);
  const current = loginAttempts.get(key);
  if (!current || current.resetAt <= Date.now()) {
    loginAttempts.set(key, { count: 1, resetAt: Date.now() + 15 * 60 * 1000 });
  } else {
    current.count += 1;
  }
}

function clearLoginFailures(req) {
  loginAttempts.delete(clientIp(req));
}

function pruneTransientState() {
  const now = Date.now();
  for (const [key, expiresAt] of usedAuthorizationCodes) if (expiresAt <= now) usedAuthorizationCodes.delete(key);
  for (const [key, value] of loginAttempts) if (value.resetAt <= now) loginAttempts.delete(key);
}

function authorizationPage(requestToken, requestData, errorMessage = '') {
  const permissions = requestData.scope.includes(WRITE_SCOPE)
    ? 'Consultar i guardar controls diaris, incidències i seguiments.'
    : 'Consultar les dades operatives del restaurant.';
  return `<!doctype html>
<html lang="ca"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connectar ARCADI amb ChatGPT</title>
<style>
body{margin:0;background:#f4f1eb;color:#24201b;font:16px system-ui,-apple-system,Segoe UI,sans-serif}main{max-width:430px;margin:7vh auto;padding:30px;background:#fff;border:1px solid #ddd3c5;border-radius:18px;box-shadow:0 12px 35px #0001}h1{font-size:25px;margin:0 0 8px}.brand{color:#a55d19;font-weight:800;letter-spacing:.03em}.muted{color:#665f57;line-height:1.45}.error{background:#fff0ed;color:#8b2618;padding:11px 13px;border-radius:9px;margin:14px 0}label{display:block;font-weight:700;margin:16px 0 6px}input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #bcb4aa;border-radius:9px;font:inherit}.actions{display:flex;gap:10px;margin-top:22px}button{border:0;border-radius:9px;padding:12px 16px;font:700 15px inherit;cursor:pointer}.allow{background:#a55d19;color:#fff;flex:1}.deny{background:#eee8df;color:#352f29}small{display:block;color:#746c64;margin-top:18px;line-height:1.4}
</style></head><body><main>
<div class="brand">ARCADI GESTIO RESTAURANT</div>
<h1>Connectar amb ChatGPT</h1>
<p class="muted">${htmlEscape(permissions)} La contrasenya es valida aquí i no s’envia a ChatGPT.</p>
${errorMessage ? `<div class="error">${htmlEscape(errorMessage)}</div>` : ''}
<form method="post" action="/oauth/authorize" autocomplete="on">
<input type="hidden" name="request" value="${htmlEscape(requestToken)}">
<label for="username">Usuari del Back Office</label>
<input id="username" name="username" autocomplete="username" required autofocus>
<label for="password">Contrasenya</label>
<input id="password" name="password" type="password" autocomplete="current-password" required>
<div class="actions"><button class="deny" type="submit" name="decision" value="deny" formnovalidate>Cancel·lar</button><button class="allow" type="submit" name="decision" value="allow">Connectar</button></div>
</form><small>Accés privat. Pots desconnectar el connector des de la configuració de ChatGPT.</small>
</main></body></html>`;
}

function oauthError(res, status, error, description) {
  sendJson(res, status, { error, error_description: description });
}

function redirectAuthorizationError(res, requestData, baseUrl, error, description) {
  const target = new URL(requestData.redirectUri);
  target.searchParams.set('error', error);
  target.searchParams.set('error_description', description);
  target.searchParams.set('iss', baseUrl);
  if (requestData.state) target.searchParams.set('state', requestData.state);
  redirect(res, target.toString());
}

function issueTokens({ baseUrl, clientId, scope, subject }) {
  const issuedAt = nowSeconds();
  const audience = resourceFor(baseUrl);
  const common = { iss: baseUrl, aud: audience, sub: subject, clientId, scope, iat: issuedAt };
  return {
    access_token: signPayload({ ...common, typ: 'access', exp: issuedAt + 60 * 60, jti: crypto.randomUUID() }),
    token_type: 'Bearer',
    expires_in: 60 * 60,
    refresh_token: signPayload({ ...common, typ: 'refresh', exp: issuedAt + 30 * 24 * 60 * 60, jti: crypto.randomUUID() }),
    scope: scope.join(' ')
  };
}

function authenticateBearer(req, baseUrl) {
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Bearer ')) return { authenticated: false, reason: 'missing_token', scopes: [] };
  const payload = verifyPayload(header.slice(7).trim(), 'access', baseUrl);
  if (!payload || payload.aud !== resourceFor(baseUrl) || !Array.isArray(payload.scope)) {
    return { authenticated: false, reason: 'invalid_token', scopes: [] };
  }
  const scopes = payload.scope.filter(scope => SUPPORTED_SCOPES.includes(scope));
  return { authenticated: true, user: payload.sub, scopes, clientId: payload.clientId };
}

function validateAuthorizationRequest(url, baseUrl) {
  const responseType = url.searchParams.get('response_type');
  const clientId = url.searchParams.get('client_id') || '';
  const redirectUri = url.searchParams.get('redirect_uri') || '';
  const resource = url.searchParams.get('resource') || '';
  const codeChallenge = url.searchParams.get('code_challenge') || '';
  const method = url.searchParams.get('code_challenge_method') || '';
  const scopes = parseScopes(url.searchParams.get('scope'));
  const client = validateClient(clientId, baseUrl);
  if (responseType !== 'code') throw new Error('response_type no admès');
  if (!client) throw new Error('client_id no vàlid');
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) throw new Error('redirect_uri no vàlid');
  if (resource !== resourceFor(baseUrl)) throw new Error('resource no vàlid');
  if (method !== 'S256' || !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)) throw new Error('PKCE S256 obligatori');
  if (!scopes) throw new Error('scope no vàlid');
  return {
    clientId,
    redirectUri,
    resource,
    codeChallenge,
    scope: scopes,
    state: url.searchParams.get('state') || ''
  };
}

async function handleClientRegistration(req, res, baseUrl) {
  let input;
  try {
    input = JSON.parse(await readBody(req) || '{}');
  } catch {
    return oauthError(res, 400, 'invalid_client_metadata', 'JSON no vàlid');
  }
  const redirectUris = [...new Set(Array.isArray(input.redirect_uris) ? input.redirect_uris.map(String) : [])];
  if (!redirectUris.length || redirectUris.length > 8 || redirectUris.some(uri => !isAllowedRedirectUri(uri))) {
    return oauthError(res, 400, 'invalid_redirect_uri', 'redirect_uris no admeses');
  }
  if (input.token_endpoint_auth_method && input.token_endpoint_auth_method !== 'none') {
    return oauthError(res, 400, 'invalid_client_metadata', 'Només s’admet token_endpoint_auth_method=none');
  }
  const scopes = parseScopes(input.scope);
  if (!scopes) return oauthError(res, 400, 'invalid_client_metadata', 'scope no vàlid');
  const issuedAt = nowSeconds();
  const clientId = signPayload({
    typ: 'client',
    iss: baseUrl,
    iat: issuedAt,
    exp: issuedAt + 365 * 24 * 60 * 60,
    redirectUris,
    clientName: String(input.client_name || 'ChatGPT').slice(0, 120),
    scope: scopes
  });
  return sendJson(res, 201, {
    client_id: clientId,
    client_id_issued_at: issuedAt,
    redirect_uris: redirectUris,
    client_name: String(input.client_name || 'ChatGPT').slice(0, 120),
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    scope: scopes.join(' ')
  });
}

async function handleAuthorizationPost(req, res, baseUrl) {
  let form;
  try {
    form = await readForm(req);
  } catch (error) {
    return oauthError(res, error.statusCode || 400, 'invalid_request', error.message);
  }
  const requestToken = form.get('request') || '';
  const requestData = verifyPayload(requestToken, 'authorization_request', baseUrl);
  if (!requestData || !validateClient(requestData.clientId, baseUrl)) {
    return sendHtml(res, 400, '<h1>Petició d’autorització no vàlida o caducada.</h1>');
  }
  if (form.get('decision') === 'deny') {
    return redirectAuthorizationError(res, requestData, baseUrl, 'access_denied', 'L’usuari ha cancel·lat la connexió');
  }
  if (loginBlocked(req)) {
    return sendHtml(res, 429, authorizationPage(requestToken, requestData, 'Massa intents. Torna-ho a provar d’aquí a 15 minuts.'));
  }
  const username = form.get('username') || '';
  const password = form.get('password') || '';
  if (!verifyAdminCredentials(username, password)) {
    recordLoginFailure(req);
    return sendHtml(res, 401, authorizationPage(requestToken, requestData, 'Usuari o contrasenya incorrectes.'));
  }
  clearLoginFailures(req);
  const issuedAt = nowSeconds();
  const codeId = crypto.randomUUID();
  const code = signPayload({
    typ: 'authorization_code',
    iss: baseUrl,
    iat: issuedAt,
    exp: issuedAt + 120,
    jti: codeId,
    aud: requestData.resource,
    clientId: requestData.clientId,
    redirectUri: requestData.redirectUri,
    codeChallenge: requestData.codeChallenge,
    scope: requestData.scope,
    sub: String(process.env.ADMIN_USER)
  });
  const target = new URL(requestData.redirectUri);
  target.searchParams.set('code', code);
  target.searchParams.set('iss', baseUrl);
  if (requestData.state) target.searchParams.set('state', requestData.state);
  return redirect(res, target.toString());
}

async function handleTokenRequest(req, res, baseUrl) {
  let form;
  try {
    form = await readForm(req);
  } catch (error) {
    return oauthError(res, error.statusCode || 400, 'invalid_request', error.message);
  }
  pruneTransientState();
  const grantType = form.get('grant_type') || '';
  const clientId = form.get('client_id') || '';
  const client = validateClient(clientId, baseUrl);
  if (!client) return oauthError(res, 401, 'invalid_client', 'client_id no vàlid');

  if (grantType === 'authorization_code') {
    const code = verifyPayload(form.get('code') || '', 'authorization_code', baseUrl);
    if (!code || code.clientId !== clientId || code.aud !== resourceFor(baseUrl)) {
      return oauthError(res, 400, 'invalid_grant', 'Codi no vàlid o caducat');
    }
    if (usedAuthorizationCodes.has(code.jti)) return oauthError(res, 400, 'invalid_grant', 'El codi ja s’ha utilitzat');
    if (form.get('redirect_uri') !== code.redirectUri) return oauthError(res, 400, 'invalid_grant', 'redirect_uri no coincideix');
    if ((form.get('resource') || '') !== code.aud) return oauthError(res, 400, 'invalid_target', 'resource no coincideix');
    const verifier = form.get('code_verifier') || '';
    if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return oauthError(res, 400, 'invalid_grant', 'code_verifier no vàlid');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    if (!safeEqual(challenge, code.codeChallenge)) return oauthError(res, 400, 'invalid_grant', 'PKCE no vàlid');
    usedAuthorizationCodes.set(code.jti, code.exp * 1000);
    return sendJson(res, 200, issueTokens({ baseUrl, clientId, scope: code.scope, subject: code.sub }));
  }

  if (grantType === 'refresh_token') {
    const refresh = verifyPayload(form.get('refresh_token') || '', 'refresh', baseUrl);
    if (!refresh || refresh.clientId !== clientId || refresh.aud !== resourceFor(baseUrl)) {
      return oauthError(res, 400, 'invalid_grant', 'Refresh token no vàlid o caducat');
    }
    const requestedResource = form.get('resource');
    if (requestedResource && requestedResource !== refresh.aud) return oauthError(res, 400, 'invalid_target', 'resource no coincideix');
    const scopes = form.get('scope') ? parseScopes(form.get('scope'), []) : refresh.scope;
    if (!scopes || scopes.some(scope => !refresh.scope.includes(scope))) return oauthError(res, 400, 'invalid_scope', 'No es pot ampliar el scope');
    return sendJson(res, 200, issueTokens({ baseUrl, clientId, scope: scopes, subject: refresh.sub }));
  }

  return oauthError(res, 400, 'unsupported_grant_type', 'grant_type no admès');
}

async function handleOAuthRequest(req, res, url, baseUrl) {
  const path = url.pathname;
  const base = baseUrl.replace(/\/$/, '');
  const resource = resourceFor(base);

  if ((path === '/.well-known/oauth-protected-resource' || path === '/.well-known/oauth-protected-resource/mcp') && req.method === 'GET') {
    sendJson(res, 200, {
      resource,
      authorization_servers: [base],
      scopes_supported: SUPPORTED_SCOPES,
      bearer_methods_supported: ['header'],
      resource_documentation: `${base}/#arcadi-assistant`
    });
    return true;
  }

  if (path === '/.well-known/oauth-authorization-server' && req.method === 'GET') {
    sendJson(res, 200, {
      issuer: base,
      authorization_response_iss_parameter_supported: true,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      registration_endpoint: `${base}/oauth/register`,
      grant_types_supported: ['authorization_code', 'refresh_token'],
      response_types_supported: ['code'],
      token_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: SUPPORTED_SCOPES,
      service_documentation: `${base}/#arcadi-assistant`
    });
    return true;
  }

  if (path === '/oauth/register' && req.method === 'POST') {
    await handleClientRegistration(req, res, base);
    return true;
  }

  if (path === '/oauth/authorize' && req.method === 'GET') {
    if (!signingKey()) {
      sendHtml(res, 503, '<h1>Connexió privada no configurada.</h1><p>Cal configurar ADMIN_USER i ADMIN_PASSWORD al servidor.</p>');
      return true;
    }
    let requestData;
    try {
      requestData = validateAuthorizationRequest(url, base);
    } catch (error) {
      sendHtml(res, 400, `<h1>Petició d’autorització no vàlida.</h1><p>${htmlEscape(error.message)}</p>`);
      return true;
    }
    const issuedAt = nowSeconds();
    const requestToken = signPayload({ ...requestData, typ: 'authorization_request', iss: base, iat: issuedAt, exp: issuedAt + 5 * 60 });
    sendHtml(res, 200, authorizationPage(requestToken, requestData));
    return true;
  }

  if (path === '/oauth/authorize' && req.method === 'POST') {
    await handleAuthorizationPost(req, res, base);
    return true;
  }

  if (path === '/oauth/token' && req.method === 'POST') {
    await handleTokenRequest(req, res, base);
    return true;
  }

  return false;
}

module.exports = {
  READ_SCOPE,
  WRITE_SCOPE,
  authenticateBearer,
  handleOAuthRequest,
  oauthChallenge,
  resourceFor
};
