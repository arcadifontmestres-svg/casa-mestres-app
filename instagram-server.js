'use strict';

const http = require('http');
const instagram = require('./instagram-graph.js');

const originalCreateServer = http.createServer;

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
}

function send(res, status, body) {
  securityHeaders(res);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(body));
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

function sameOrigin(req) {
  if (String(req.headers['sec-fetch-site'] || '') === 'cross-site') return false;
  if (!req.headers.origin) return true;
  const expected = String(process.env.APP_BASE_URL || '').replace(/\/$/, '');
  return Boolean(expected) && req.headers.origin === expected;
}

async function handleInstagramRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/instagram/')) return false;
  if (!exported.requireAdmin(req, res)) return true;

  try {
    if (url.pathname === '/api/instagram/status' && req.method === 'GET') {
      send(res, 200, instagram.status());
      return true;
    }

    if (url.pathname !== '/api/instagram/publish' || req.method !== 'POST') {
      send(res, 404, { error: 'Acció d’Instagram no trobada.' });
      return true;
    }

    if (!sameOrigin(req) || !String(req.headers['content-type'] || '').startsWith('application/json')) {
      send(res, 403, { error: 'Petició no autoritzada.' });
      return true;
    }

    const input = await readJsonBody(req);
    const result = await instagram.publishImage({
      imageUrl: input.imageUrl,
      caption: input.caption,
      mediaType: input.mediaType
    });

    send(res, 200, result);
    return true;
  } catch (error) {
    send(res, error.statusCode || 500, {
      error: error.statusCode ? error.message : 'No s’ha pogut publicar a Instagram.'
    });
    return true;
  }
}

http.createServer = function patchedCreateServer(listener) {
  return originalCreateServer.call(http, (req, res) => {
    Promise.resolve(handleInstagramRequest(req, res))
      .then(handled => { if (!handled) listener(req, res); })
      .catch(() => send(res, 500, { error: 'No s’ha pogut completar l’operació d’Instagram.' }));
  });
};

let exported;
try {
  exported = require('./commercial-server.js');
} finally {
  http.createServer = originalCreateServer;
}

module.exports = { ...exported, handleInstagramRequest };
