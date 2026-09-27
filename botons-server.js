'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const ROOT = __dirname;
const originalCreateServer = http.createServer;
const DATA_DIR = path.resolve(String(process.env.DATA_DIR || ROOT));
const BOTONS_FILE = path.join(DATA_DIR, 'botons.json');
const STORIES_DIR = path.join(DATA_DIR, 'stories');
const SEED_FILE = path.join(ROOT, 'public', 'botons.json');
const MAX_STORY_BYTES = 8 * 1024 * 1024;

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

function loadSeed() {
  try {
    return JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function ensureData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(STORIES_DIR, { recursive: true });
  if (!fs.existsSync(BOTONS_FILE)) {
    fs.writeFileSync(BOTONS_FILE, JSON.stringify(loadSeed(), null, 2));
  }
}

function readButtons() {
  ensureData();
  try {
    const data = JSON.parse(fs.readFileSync(BOTONS_FILE, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeButtons(buttons) {
  ensureData();
  const tmp = `${BOTONS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(buttons, null, 2));
  fs.renameSync(tmp, BOTONS_FILE);
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && aa.length > 0 && crypto.timingSafeEqual(aa, bb);
}

function pepAuthorized(req) {
  return safeEqual(req.headers['x-pep-secret'], process.env.PEP_SECRET);
}

function requirePep(req, res) {
  if (!process.env.PEP_SECRET || !pepAuthorized(req)) {
    send(res, 401, { error: 'No autoritzat' });
    return false;
  }
  return true;
}

function validButton(input) {
  const id = String(input?.id || '').trim();
  const label = String(input?.label || '').trim();
  const imatge = String(input?.imatge || '').trim();
  const espai = String(input?.espai || '').trim();
  if (!id || !label || !imatge || !espai) {
    throw Object.assign(new Error('Cal indicar id, label, imatge i espai.'), { statusCode: 400 });
  }
  let parsed;
  try { parsed = new URL(imatge); }
  catch { throw Object.assign(new Error('imatge no és una URL vàlida.'), { statusCode: 400 }); }
  if (parsed.protocol !== 'https:') {
    throw Object.assign(new Error('imatge ha de ser una URL HTTPS pública.'), { statusCode: 400 });
  }
  return { id, label, imatge: parsed.toString(), espai };
}

function storyFilename(value) {
  const name = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,80}\.jpg$/.test(name)) {
    throw Object.assign(new Error('filename ha de ser un nom segur acabat en .jpg.'), { statusCode: 400 });
  }
  return name;
}

function publicStoryUrl(req, filename) {
  const configured = String(process.env.APP_BASE_URL || '').replace(/\/$/, '');
  const base = configured || `https://${String(req.headers.host || 'casa-mestres-restaurant-app.onrender.com')}`;
  return `${base}/public/stories/${encodeURIComponent(filename)}`;
}

function saveStory(input, req) {
  ensureData();
  const filename = storyFilename(input?.filename);
  const raw = String(input?.dataBase64 || '').replace(/^data:image\/jpeg;base64,/i, '').trim();
  if (!raw) throw Object.assign(new Error('Falta dataBase64.'), { statusCode: 400 });
  let bytes;
  try { bytes = Buffer.from(raw, 'base64'); }
  catch { throw Object.assign(new Error('dataBase64 no és vàlid.'), { statusCode: 400 }); }
  if (!bytes.length || bytes.length > MAX_STORY_BYTES) {
    throw Object.assign(new Error('El JPEG ha de pesar menys de 8 MB.'), { statusCode: 413 });
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
    throw Object.assign(new Error('El fitxer ha de ser JPEG.'), { statusCode: 415 });
  }
  const target = path.join(STORIES_DIR, filename);
  fs.writeFileSync(target, bytes);
  return { filename, bytes: bytes.length, url: publicStoryUrl(req, filename) };
}

function serveStory(req, res, pathname) {
  const match = pathname.match(/^\/public\/stories\/([a-z0-9][a-z0-9_-]{0,80}\.jpg)$/i);
  if (!match || req.method !== 'GET') return false;
  ensureData();
  const filename = storyFilename(match[1]);
  const target = path.join(STORIES_DIR, filename);
  if (!fs.existsSync(target)) {
    send(res, 404, { error: 'Story no trobada.' });
    return true;
  }
  securityHeaders(res);
  const stat = fs.statSync(target);
  res.writeHead(200, {
    'Content-Type': 'image/jpeg',
    'Content-Length': stat.size,
    'Cache-Control': 'public, max-age=3600'
  });
  fs.createReadStream(target).pipe(res);
  return true;
}

async function handleBotonsRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');

  if (serveStory(req, res, url.pathname)) return true;

  try {
    if (url.pathname === '/api/stories' && req.method === 'POST') {
      if (!requirePep(req, res)) return true;
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
        send(res, 415, { error: 'Content-Type ha de ser application/json.' });
        return true;
      }
      const input = await readJsonBody(req, 12 * 1024 * 1024);
      send(res, 200, { ok: true, story: saveStory(input, req) });
      return true;
    }

    if (url.pathname !== '/api/botons') return false;

    if (req.method === 'GET') {
      send(res, 200, readButtons());
      return true;
    }

    if (req.method === 'POST') {
      if (!requirePep(req, res)) return true;
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
        send(res, 415, { error: 'Content-Type ha de ser application/json.' });
        return true;
      }
      const button = validButton(await readJsonBody(req));
      const buttons = readButtons();
      const index = buttons.findIndex(item => String(item.id) === button.id);
      if (index >= 0) buttons[index] = button;
      else buttons.push(button);
      writeButtons(buttons);
      send(res, 200, { ok: true, botons: buttons });
      return true;
    }

    send(res, 405, { error: 'Mètode no permès.' });
    return true;
  } catch (error) {
    send(res, error.statusCode || 500, { error: error.statusCode ? error.message : 'No s’ha pogut actualitzar els botons.' });
    return true;
  }
}

http.createServer = function patchedCreateServer(listener) {
  return originalCreateServer.call(http, (req, res) => {
    Promise.resolve(handleBotonsRequest(req, res))
      .then(handled => { if (!handled) listener(req, res); })
      .catch(() => send(res, 500, { error: 'No s’ha pogut completar l’operació de botons.' }));
  });
};

let exported;
try {
  exported = require('./instagram-server.js');
} finally {
  http.createServer = originalCreateServer;
}

module.exports = { ...exported, handleBotonsRequest, readButtons };
