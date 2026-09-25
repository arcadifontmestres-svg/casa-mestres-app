'use strict';
/**
 * oauth.js — OAuth 2.0 / Bearer token handler per a ARCADI Gestió
 * Gestiona l'autenticació Bearer i les peticions OAuth de l'aplicació.
 */

const crypto = require('crypto');

// Tokens Bearer actius en memòria: Map<token, { employeeId, expiresAt }>
const bearerTokens = new Map();

// Durada del token: 8 hores
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

/**
 * Genera un token Bearer aleatori segur.
 * @returns {string}
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Autentica una petició amb capçalera Authorization: Bearer <token>.
 * Retorna l'objecte { employeeId, expiresAt } si el token és vàlid, o null.
 * @param {import('http').IncomingMessage} req
 * @returns {{ employeeId: string, expiresAt: number } | null}
 */
function authenticateBearer(req) {
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Bearer ')) return null;

  const token = header.slice(7).trim();
  if (!token) return null;

  const session = bearerTokens.get(token);
  if (!session) return null;

  if (session.expiresAt <= Date.now()) {
    bearerTokens.delete(token);
    return null;
  }

  return session;
}

/**
 * Crea un nou token Bearer per a un empleat i el desa en memòria.
 * @param {string} employeeId
 * @returns {string} El token generat
 */
function createBearerToken(employeeId) {
  const token = generateToken();
  bearerTokens.set(token, {
    employeeId: String(employeeId),
    expiresAt:  Date.now() + TOKEN_TTL_MS
  });
  return token;
}

/**
 * Invalida un token Bearer (logout).
 * @param {string} token
 */
function revokeBearerToken(token) {
  bearerTokens.delete(token);
}

/**
 * Neteja els tokens expirats de la memòria.
 * S'executa periòdicament.
 */
function purgeExpiredTokens() {
  const now = Date.now();
  for (const [token, session] of bearerTokens.entries()) {
    if (session.expiresAt <= now) bearerTokens.delete(token);
  }
}

// Neteja automàtica cada hora
setInterval(purgeExpiredTokens, 60 * 60 * 1000).unref();

/**
 * Gestiona les peticions OAuth (endpoints /oauth/token, /oauth/revoke).
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {object} data - Dades globals de l'aplicació
 */
function handleOAuthRequest(req, res, data) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  // ── POST /oauth/token ──────────────────────────────────────────────────────
  if (pathname === '/oauth/token' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let params = {};
      try {
        // Suporta tant JSON com application/x-www-form-urlencoded
        if (String(req.headers['content-type'] || '').includes('application/json')) {
          params = JSON.parse(body);
        } else {
          for (const pair of body.split('&')) {
            const [k, v] = pair.split('=').map(decodeURIComponent);
            if (k) params[k] = v || '';
          }
        }
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'invalid_request', error_description: 'JSON invàlid' }));
        return;
      }

      const grantType = String(params.grant_type || '');

      if (grantType !== 'password') {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'unsupported_grant_type' }));
        return;
      }

      const username = String(params.username || '').trim();
      const password = String(params.password || '');

      // Buscar l'empleat per codi o nom
      const employee = (data.employees || []).find(e =>
        e.active !== false &&
        (String(e.code || '') === username || String(e.name || '').toLowerCase() === username.toLowerCase())
      );

      if (!employee) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'invalid_client', error_description: 'Credencials incorrectes' }));
        return;
      }

      const token = createBearerToken(employee.id);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({
        access_token: token,
        token_type:   'Bearer',
        expires_in:   Math.floor(TOKEN_TTL_MS / 1000),
        employee_id:  employee.id,
        employee_name: employee.name
      }));
    });
    return;
  }

  // ── POST /oauth/revoke ─────────────────────────────────────────────────────
  if (pathname === '/oauth/revoke' && req.method === 'POST') {
    const header = String(req.headers.authorization || '');
    if (header.startsWith('Bearer ')) {
      revokeBearerToken(header.slice(7).trim());
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ── Ruta no trobada ────────────────────────────────────────────────────────
  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'not_found' }));
}

/**
 * Envia una resposta 401 amb capçalera WWW-Authenticate Bearer.
 * @param {import('http').ServerResponse} res
 * @param {string} [message]
 */
function oauthChallenge(res, message) {
  res.writeHead(401, {
    'Content-Type':     'application/json; charset=utf-8',
    'WWW-Authenticate': 'Bearer realm="ARCADI Gestió"',
    'Cache-Control':    'no-store'
  });
  res.end(JSON.stringify({ error: 'unauthorized', message: message || 'Cal autenticació Bearer' }));
}

module.exports = {
  authenticateBearer,
  handleOAuthRequest,
  oauthChallenge,
  createBearerToken,
  revokeBearerToken
};