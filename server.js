const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const SEED_DATA = path.join(ROOT, 'data.json');
const CATALOG_DATA = path.join(ROOT, 'seed', 'catalog.json');

function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const text = line.trim();
    if (!text || text.startsWith('#')) continue;
    const separator = text.indexOf('=');
    if (separator < 1) continue;
    const key = text.slice(0, separator).trim();
    const value = text.slice(separator + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

const configuredDataDir = String(process.env.DATA_DIR || '').trim();
const DATA_DIR = configuredDataDir ? path.resolve(configuredDataDir) : ROOT;
const DATA = path.join(DATA_DIR, 'data.json');
const BACKUPS = path.join(DATA_DIR, 'backups');
const PORT = Number(process.env.PORT || 3210);
const HOST = process.env.HOST || '0.0.0.0';
const stripeTestSessions = new Map();

function ensureStorage() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(BACKUPS, { recursive: true });
  if (!fs.existsSync(DATA)) {
    if (!fs.existsSync(SEED_DATA)) throw new Error('Falta el fitxer inicial data.json');
    fs.copyFileSync(SEED_DATA, DATA);
    if (fs.existsSync(CATALOG_DATA)) {
      const initial = JSON.parse(fs.readFileSync(DATA, 'utf8'));
      const catalog = JSON.parse(fs.readFileSync(CATALOG_DATA, 'utf8'));
      Object.assign(initial, catalog);
      fs.writeFileSync(DATA, JSON.stringify(initial, null, 2), 'utf8');
    }
  }
}

ensureStorage();

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  securityHeaders(res);
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function adminConfigured() {
  return process.env.ARCADI_DESKTOP === '1' || Boolean(process.env.ADMIN_USER && process.env.ADMIN_PASSWORD);
}

function isAdmin(req) {
  if (process.env.ARCADI_DESKTOP === '1') {
    const address = String(req.socket?.remoteAddress || '');
    return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
  }
  if (!adminConfigured()) return false;
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Basic ')) return false;
  let decoded = '';
  try {
    decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  } catch {
    return false;
  }
  const separator = decoded.indexOf(':');
  if (separator < 0) return false;
  return safeEqual(decoded.slice(0, separator), process.env.ADMIN_USER)
    && safeEqual(decoded.slice(separator + 1), process.env.ADMIN_PASSWORD);
}

function requireAdmin(req, res) {
  if (!adminConfigured()) {
    send(res, 503, { error: 'Configura ADMIN_USER i ADMIN_PASSWORD abans d’obrir el Back Office.' });
    return false;
  }
  if (!isAdmin(req)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Casa Mestres Back Office", charset="UTF-8"');
    send(res, 401, { error: 'Accés restringit al Back Office.' });
    return false;
  }
  return true;
}

function normalizeArcadiData(data) {
  data.arcadiSchema = data.arcadiSchema || 'ARCADI_GESTIO_RESTAURANT_V1';
  const collections = [
    'maintenanceRecords', 'communications', 'crmContacts', 'marketingCampaigns',
    'groupEvents', 'experiences', 'loyaltyAccounts', 'purchaseOrders',
    'goodsReceipts', 'traceabilityRecords', 'productionRecords', 'restaurants',
    'platformProfiles', 'miniApps'
  ];
  for (const key of collections) if (!Array.isArray(data[key])) data[key] = [];
  if (!data.restaurants.some(item => item.id === 'restaurant_casa_mestres')) {
    data.restaurants.unshift({
      id: 'restaurant_casa_mestres',
      name: data.company?.name || 'Casa Mestres',
      address: data.company?.address || '',
      phone: data.company?.phone || '',
      status: 'Actiu',
      notes: 'Centre principal'
    });
  }
  const defaultMiniApps = [
    { id: 'miniapp_reserves', name: 'Reserves', type: 'Reserves', path: '/reserves.html', status: 'Activa', notes: 'Mini app pública existent' },
    { id: 'miniapp_fitxatges', name: 'Fitxatges', type: 'RRHH', path: '/fitxatges.html', status: 'Activa', notes: 'Mini app de personal existent' }
  ];
  for (const item of defaultMiniApps) if (!data.miniApps.some(current => current.id === item.id)) data.miniApps.push(item);
  return data;
}

function readData() {
  try {
    return normalizeArcadiData(JSON.parse(fs.readFileSync(DATA, 'utf8')));
  } catch (error) {
    throw new Error(`No es pot llegir data.json: ${error.message}`);
  }
}

function backupCurrent() {
  if (!fs.existsSync(DATA)) return;
  fs.mkdirSync(BACKUPS, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(DATA, path.join(BACKUPS, `data_${stamp}.json`));
  const files = fs.readdirSync(BACKUPS).filter(name => name.endsWith('.json')).sort().reverse();
  for (const file of files.slice(30)) fs.unlinkSync(path.join(BACKUPS, file));
}

function writeData(data) {
  data.updatedAt = new Date().toISOString();
  backupCurrent();
  const temporary = `${DATA}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(temporary, DATA);
  return data;
}

let mutationQueue = Promise.resolve();
function mutateData(change) {
  const job = mutationQueue.then(async () => {
    const data = readData();
    const result = await change(data);
    writeData(data);
    return result;
  });
  mutationQueue = job.catch(() => {});
  return job;
}

function readRaw(req, limit = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('Fitxer massa gran'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function bodyJson(req, limit) {
  const raw = await readRaw(req, limit);
  try {
    return JSON.parse(raw.toString('utf8') || '{}');
  } catch {
    throw new Error('JSON no vàlid');
  }
}

function safeStatic(urlPath) {
  let pathname = decodeURIComponent(urlPath.split('?')[0]);
  if (pathname === '/' || pathname === '') pathname = '/index.html';
  const full = path.resolve(PUBLIC, `.${pathname}`);
  if (full !== PUBLIC && !full.startsWith(`${PUBLIC}${path.sep}`)) return null;
  return full;
}

function mime(file) {
  const extension = path.extname(file).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.wasm': 'application/wasm',
    '.gz': 'application/gzip',
    '.txt': 'text/plain; charset=utf-8'
  })[extension] || 'application/octet-stream';
}

function norm(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function menuPrice(menu) {
  if (Number.isFinite(Number(menu.reservationPrice))) return Number(menu.reservationPrice);
  if (Number.isFinite(Number(menu.priceNumeric))) return Number(menu.priceNumeric);
  const match = String(menu.price || '').replace(',', '.').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function nextProductCode(data, family, reserved = []) {
  const definition = (data.config?.families || []).find(item => item.name === family) || { prefix: 'ALT' };
  let maximum = 0;
  for (const product of [...(data.products || []), ...reserved]) {
    const match = String(product.code || '').match(new RegExp(`^${definition.prefix}-(\\d+)$`, 'i'));
    if (match) maximum = Math.max(maximum, Number(match[1]));
  }
  return `${definition.prefix}-${String(maximum + 1).padStart(3, '0')}`;
}

function haversine(lat1, lon1, lat2, lon2) {
  const radius = 6371000;
  const radians = value => value * Math.PI / 180;
  const deltaLat = radians(lat2 - lat1);
  const deltaLon = radians(lon2 - lon1);
  const value = Math.sin(deltaLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(deltaLon / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function publicBaseUrl(req) {
  const configured = String(process.env.APP_BASE_URL || '').trim().replace(/\/$/, '');
  if (configured) return configured;
  const forwarded = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwarded || (req.socket.encrypted ? 'https' : 'http');
  return `${protocol}://${req.headers.host}`;
}

function stripeRequest(method, endpoint, parameters = {}) {
  if (process.env.NODE_ENV === 'test' && process.env.STRIPE_TEST_MODE === 'mock') {
    if (method === 'POST' && endpoint === '/checkout/sessions') {
      const id = `cs_test_mock_${crypto.randomBytes(8).toString('hex')}`;
      const session = {
        id,
        url: `https://checkout.stripe.test/pay/${id}`,
        payment_status: 'unpaid',
        metadata: { reservation_id: parameters['metadata[reservation_id]'] || '' },
        payment_intent: `pi_test_${crypto.randomBytes(6).toString('hex')}`
      };
      stripeTestSessions.set(id, session);
      return Promise.resolve(session);
    }
    if (method === 'GET' && endpoint.startsWith('/checkout/sessions/')) {
      const id = decodeURIComponent(endpoint.split('/').pop());
      const session = stripeTestSessions.get(id);
      if (!session) return Promise.reject(new Error('Sessió Stripe de prova no trobada'));
      return Promise.resolve({ ...session, payment_status: 'paid' });
    }
  }

  return new Promise((resolve, reject) => {
    const clean = Object.fromEntries(Object.entries(parameters).filter(([, value]) => value !== undefined && value !== null && value !== ''));
    const body = new URLSearchParams(clean).toString();
    const isGet = method === 'GET';
    const requestPath = `/v1${endpoint}${isGet && body ? `?${body}` : ''}`;
    const headers = { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY || ''}` };
    if (!isGet) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    const request = https.request({ hostname: 'api.stripe.com', path: requestPath, method, headers }, response => {
      let chunks = '';
      response.on('data', chunk => { chunks += chunk; });
      response.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(chunks);
        } catch {
          parsed = { error: { message: chunks || 'Resposta Stripe no vàlida' } };
        }
        if (response.statusCode >= 200 && response.statusCode < 300) resolve(parsed);
        else reject(new Error(parsed?.error?.message || 'Error Stripe'));
      });
    });
    request.on('error', reject);
    if (!isGet && body) request.write(body);
    request.end();
  });
}

function calculateDeposit(menu, pax) {
  const price = menuPrice(menu);
  const depositType = menu.depositType || 'fixed';
  const depositValue = Number(menu.depositValue || 0);
  const amount = depositType === 'percent' ? price * pax * depositValue / 100 : pax * depositValue;
  return {
    price,
    depositType,
    depositValue,
    depositAmount: Math.round(amount * 100) / 100
  };
}

async function createCheckoutSession(req, reservation, currency = 'EUR') {
  const base = publicBaseUrl(req);
  const parameters = {
    mode: 'payment',
    success_url: `${base}/reserves.html?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/reserves.html?stripe=cancel&reservation_id=${encodeURIComponent(reservation.id)}&token=${encodeURIComponent(reservation.manageToken)}`,
    client_reference_id: reservation.id,
    customer_email: reservation.email,
    locale: 'auto',
    'metadata[reservation_id]': reservation.id,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': String(currency || 'EUR').toLowerCase(),
    'line_items[0][price_data][unit_amount]': String(Math.round(reservation.depositAmount * 100)),
    'line_items[0][price_data][product_data][name]': `Fiança reserva · ${reservation.menuTitle}`.slice(0, 127),
    'line_items[0][price_data][product_data][description]': `${reservation.date} ${reservation.time} · ${reservation.pax} pax`.slice(0, 127)
  };
  return stripeRequest('POST', '/checkout/sessions', parameters);
}

function verifyStripeSignature(rawBody, signatureHeader, secret) {
  const pieces = String(signatureHeader || '').split(',').map(piece => piece.trim().split('='));
  const timestamp = pieces.find(([key]) => key === 't')?.[1];
  const signatures = pieces.filter(([key]) => key === 'v1').map(([, value]) => value);
  if (!timestamp || !signatures.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody.toString('utf8')}`).digest('hex');
  return signatures.some(signature => safeEqual(signature, expected));
}

function markSessionPaid(data, session) {
  const reservationId = session.metadata?.reservation_id;
  const reservation = (data.reservations || []).find(item => item.id === reservationId || item.stripeSessionId === session.id);
  if (!reservation) return null;
  if (session.payment_status === 'paid') {
    reservation.paymentStatus = 'pagat';
    reservation.status = 'Confirmada';
    reservation.paidAt = reservation.paidAt || new Date().toISOString();
    reservation.stripeSessionId = session.id;
    reservation.stripePaymentIntent = session.payment_intent || '';
    delete reservation.manageToken;
  }
  return reservation;
}

const ADMIN_STATIC = new Set(['/', '/index.html', '/app.js', '/ocr.html', '/control_normatiu.html']);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || HOST}`);
    const pathname = url.pathname;

    if (pathname === '/api/health' && req.method === 'GET') {
      return send(res, 200, {
        ok: true,
      app: 'ARCADI GESTIO RESTAURANT',
        stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
        adminConfigured: adminConfigured(),
        persistence: configuredDataDir ? 'directori extern configurat' : 'fitxer local'
      });
    }

    if (pathname === '/api/stripe/webhook' && req.method === 'POST') {
      if (!process.env.STRIPE_WEBHOOK_SECRET) return send(res, 503, { error: 'Webhook Stripe no configurat' });
      const raw = await readRaw(req, 2 * 1024 * 1024);
      if (!verifyStripeSignature(raw, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET)) {
        return send(res, 400, { error: 'Signatura Stripe no vàlida' });
      }
      const event = JSON.parse(raw.toString('utf8'));
      if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
        await mutateData(data => markSessionPaid(data, event.data.object));
      }
      return send(res, 200, { received: true });
    }

    if (pathname === '/api/state' && req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return send(res, 200, readData());
    }

    if (pathname === '/api/state' && ['POST', 'PUT'].includes(req.method)) {
      if (!requireAdmin(req, res)) return;
      const incoming = await bodyJson(req);
      if (!incoming || typeof incoming !== 'object') return send(res, 400, { error: 'Dades no vàlides' });
      const state = await mutateData(current => {
        const reservations = current.reservations || [];
        const punches = current.punches || [];
        for (const key of Object.keys(current)) delete current[key];
        Object.assign(current, incoming, { reservations, punches });
        return current;
      });
      return send(res, 200, { ok: true, state });
    }

    if (pathname === '/api/control-state' && req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return send(res, 200, readData().controlNormatiu || { empresa: {}, records: {} });
    }

    if (pathname === '/api/control-state' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const control = await bodyJson(req);
      await mutateData(data => { data.controlNormatiu = control; });
      return send(res, 200, { ok: true });
    }

    if (pathname === '/api/products-bulk' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const payload = await bodyJson(req);
      const rows = Array.isArray(payload.rows) ? payload.rows : [];
      const result = await mutateData(data => {
        data.products = data.products || [];
        let created = 0;
        let updated = 0;
        let skipped = 0;
        const reserved = [];
        for (const row of rows) {
          const name = String(row.name || '').trim();
          if (!name) {
            skipped += 1;
            continue;
          }
          const found = data.products.find(product => norm(product.name) === norm(name));
          if (found) {
            found.price = Number(row.price || 0);
            found.family = row.family || found.family || 'Altres';
            found.unit = row.unit || found.unit || 'unitat';
            found.subfamily = row.subfamily || found.subfamily || '';
            found.active = true;
            updated += 1;
            continue;
          }
          const family = row.family || 'Altres';
          const code = row.code || nextProductCode(data, family, reserved);
          const product = {
            id: `prod_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
            code,
            supplierCode: row.supplierCode || '',
            name,
            family,
            subfamily: row.subfamily || '',
            unit: row.unit || 'unitat',
            price: Number(row.price || 0),
            stock: 0,
            min: 0,
            supplierId: row.supplierId || '',
            location: '',
            notes: 'Creat des de l’OCR',
            active: true
          };
          data.products.push(product);
          reserved.push(product);
          created += 1;
        }
        return { created, updated, skipped };
      });
      return send(res, 200, { ok: true, ...result });
    }

    if (pathname === '/api/punch' && req.method === 'POST') {
      const input = await bodyJson(req);
      const result = await mutateData(data => {
        data.punches = data.punches || [];
        const employee = (data.employees || []).find(item => String(item.code) === String(input.code));
        if (!employee) return { error: 'Codi d’empleat no trobat', status: 404 };
        const gps = data.company?.gps || {};
        let distance = null;
        let status = 'GPS NO DISPONIBLE';
        if ([input.lat, input.lng, gps.lat, gps.lng].every(value => Number.isFinite(Number(value)))) {
          distance = haversine(Number(input.lat), Number(input.lng), Number(gps.lat), Number(gps.lng));
          status = distance <= Number(gps.radius || 60) ? 'DINS DE ZONA' : 'FORA DE ZONA';
        }
        const punch = {
          id: `punch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          employeeId: employee.id,
          employeeCode: employee.code,
          employeeName: employee.name,
          type: input.type,
          dateTime: new Date().toISOString(),
          lat: input.lat ?? null,
          lng: input.lng ?? null,
          accuracy: input.accuracy ?? null,
          distance: distance === null ? null : Math.round(distance),
          status
        };
        data.punches.push(punch);
        return { punch };
      });
      if (result.error) return send(res, result.status, { error: result.error });
      return send(res, 200, { ok: true, punch: result.punch });
    }

    if (pathname === '/api/reservation-config' && req.method === 'GET') {
      const data = readData();
      const config = data.reservationConfig || {};
      const menus = (data.documents || [])
        .filter(item => item.type === 'Menú' && item.publishReservations === true)
        .map(item => ({
          id: item.id,
          title: item.title,
          subtitle: item.subtitle || '',
          price: menuPrice(item),
          depositType: item.depositType || 'fixed',
          depositValue: Number(item.depositValue || 0),
          notes: item.publicReservationNotes || item.notes || '',
          attachment: item.reservationAttachment || ''
        }));
      return send(res, 200, {
        company: {
          name: data.company?.name || 'Casa Mestres',
          phone: data.company?.phone || '',
          email: data.company?.email || '',
          logo: data.company?.logo || ''
        },
        config: {
          maxPax: Number(config.maxPax || 10),
          groupPhone: config.groupPhone || data.company?.phone || '',
          cancellationPolicy: config.cancellationPolicy || '',
          stripeEnabled: Boolean(process.env.STRIPE_SECRET_KEY),
          currency: config.currency || 'EUR'
        },
        menus
      });
    }

    if (pathname === '/api/reservation-config' && req.method === 'PUT') {
      if (!requireAdmin(req, res)) return;
      const input = await bodyJson(req);
      const config = await mutateData(data => {
        const current = data.reservationConfig || {};
        data.reservationConfig = {
          ...current,
          maxPax: Math.max(1, Number(input.maxPax || 10)),
          groupPhone: String(input.groupPhone || '').trim(),
          cancellationPolicy: String(input.cancellationPolicy || '').trim(),
          currency: String(input.currency || 'EUR').toUpperCase()
        };
        return data.reservationConfig;
      });
      return send(res, 200, { ok: true, config });
    }

    if (pathname === '/api/reservations' && req.method === 'POST') {
      const input = await bodyJson(req);
      const result = await mutateData(async data => {
        data.reservations = data.reservations || [];
        const config = data.reservationConfig || {};
        const maxPax = Number(config.maxPax || 10);
        const pax = Number(input.pax || 0);
        const name = String(input.name || '').trim();
        const phone = String(input.phone || '').trim();
        const email = String(input.email || '').trim();
        if (!input.date || !input.time || !name || !phone || !email) throw Object.assign(new Error('Falten dades obligatòries'), { statusCode: 400 });
        if (!/^\S+@\S+\.\S+$/.test(email)) throw Object.assign(new Error('L’email no és vàlid'), { statusCode: 400 });
        if (!input.termsAccepted) throw Object.assign(new Error('Cal acceptar les condicions de reserva i cancel·lació'), { statusCode: 400 });
        if (!Number.isInteger(pax) || pax < 1 || pax > maxPax) {
          throw Object.assign(new Error(`Per a més de ${maxPax} persones cal fer reserva de grup i contactar amb el restaurant.`), { statusCode: 400 });
        }
        const menu = (data.documents || []).find(item => item.id === input.menuId && item.type === 'Menú' && item.publishReservations === true);
        if (!menu) throw Object.assign(new Error('Menú no disponible'), { statusCode: 400 });
        const duplicate = data.reservations.find(item => item.date === input.date
          && norm(item.name) === norm(name)
          && !['cancel·lada', 'cancelled'].includes(norm(item.status)));
        if (duplicate) {
          throw Object.assign(new Error('Ja existeix una reserva amb aquest nom per aquest dia. Contacta amb el restaurant si necessites modificar-la.'), { statusCode: 409 });
        }
        const deposit = calculateDeposit(menu, pax);
        const reservation = {
          id: `res_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
          manageToken: crypto.randomBytes(18).toString('hex'),
          createdAt: new Date().toISOString(),
          date: input.date,
          time: input.time,
          pax,
          zone: input.zone || 'Sala principal',
          name,
          phone,
          email,
          menuId: menu.id,
          menuTitle: menu.title,
          menuPrice: deposit.price,
          depositType: deposit.depositType,
          depositValue: deposit.depositValue,
          depositAmount: deposit.depositAmount,
          status: deposit.depositAmount > 0 ? 'Pendent pagament' : 'Confirmada',
          paymentStatus: deposit.depositAmount > 0 ? 'pendent' : 'no requerit',
          marketing: Boolean(input.marketing),
          notes: String(input.notes || '').trim(),
          termsAcceptedAt: new Date().toISOString(),
          cancellationPolicy: String(config.cancellationPolicy || '')
        };
        let checkoutUrl = '';
        if (reservation.depositAmount > 0) {
          if (!process.env.STRIPE_SECRET_KEY) {
            throw Object.assign(new Error('El pagament online encara no està disponible. Contacta amb el restaurant.'), { statusCode: 503 });
          }
          const session = await createCheckoutSession(req, reservation, config.currency || 'EUR');
          reservation.stripeSessionId = session.id;
          checkoutUrl = session.url;
        }
        data.reservations.push(reservation);
        return { reservation, checkoutUrl };
      });
      return send(res, 200, {
        ok: true,
        reservation: result.reservation,
        checkoutUrl: result.checkoutUrl,
        stripeEnabled: Boolean(process.env.STRIPE_SECRET_KEY),
        message: result.checkoutUrl ? 'Reserva creada. Continua amb el pagament.' : 'Reserva confirmada sense fiança.'
      });
    }

    if (pathname === '/api/reservations/resume' && req.method === 'POST') {
      const input = await bodyJson(req);
      const result = await mutateData(async data => {
        const reservation = (data.reservations || []).find(item => item.id === input.reservationId && safeEqual(item.manageToken || '', input.token || ''));
        if (!reservation) throw Object.assign(new Error('No s’ha trobat la reserva pendent'), { statusCode: 404 });
        if (reservation.paymentStatus === 'pagat') throw Object.assign(new Error('Aquesta reserva ja està pagada'), { statusCode: 409 });
        if (!process.env.STRIPE_SECRET_KEY) throw Object.assign(new Error('Stripe no està configurat'), { statusCode: 503 });
        const config = data.reservationConfig || {};
        const session = await createCheckoutSession(req, reservation, config.currency || 'EUR');
        reservation.stripeSessionId = session.id;
        reservation.status = 'Pendent pagament';
        return { checkoutUrl: session.url };
      });
      return send(res, 200, { ok: true, checkoutUrl: result.checkoutUrl });
    }

    const statusMatch = pathname.match(/^\/api\/reservations\/([^/]+)\/status$/);
    if (statusMatch && req.method === 'PUT') {
      if (!requireAdmin(req, res)) return;
      const input = await bodyJson(req);
      const allowed = ['Pendent Stripe', 'Pendent pagament', 'Confirmada', 'Cancel·lada'];
      if (!allowed.includes(input.status)) return send(res, 400, { error: 'Estat no vàlid' });
      const reservation = await mutateData(data => {
        const found = (data.reservations || []).find(item => item.id === decodeURIComponent(statusMatch[1]));
        if (!found) throw Object.assign(new Error('Reserva no trobada'), { statusCode: 404 });
        found.status = input.status;
        if (input.status === 'Confirmada') found.paymentStatus = 'pagat';
        if (input.status === 'Cancel·lada' && found.paymentStatus !== 'pagat') found.paymentStatus = 'cancel·lat';
        return found;
      });
      return send(res, 200, { ok: true, reservation });
    }

    if (pathname === '/api/stripe/confirm' && req.method === 'GET') {
      if (!process.env.STRIPE_SECRET_KEY) return send(res, 400, { error: 'Stripe no està configurat' });
      const sessionId = url.searchParams.get('session_id');
      if (!sessionId) return send(res, 400, { error: 'Falta session_id' });
      const session = await stripeRequest('GET', `/checkout/sessions/${encodeURIComponent(sessionId)}`);
      const reservation = await mutateData(data => {
        const found = markSessionPaid(data, session);
        if (!found) throw Object.assign(new Error('Reserva no trobada'), { statusCode: 404 });
        return found;
      });
      return send(res, 200, { ok: true, paid: session.payment_status === 'paid', reservation });
    }

    if (pathname === '/api/restore' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const incoming = await bodyJson(req);
      if (!incoming.schema || !incoming.company) return send(res, 400, { error: 'La còpia no correspon a l’app consolidada' });
      writeData(incoming);
      return send(res, 200, { ok: true });
    }

    if (pathname === '/api/backup' && req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      const content = fs.readFileSync(DATA);
      securityHeaders(res);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="CASA_MESTRES_BACKUP_${new Date().toISOString().slice(0, 10)}.json"`,
        'Cache-Control': 'no-store'
      });
      return res.end(content);
    }

    if (ADMIN_STATIC.has(pathname) && !requireAdmin(req, res)) return;
    const file = safeStatic(pathname);
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'No trobat', 'text/plain; charset=utf-8');
    securityHeaders(res);
    res.writeHead(200, { 'Content-Type': mime(file), 'Cache-Control': 'no-cache' });
    return fs.createReadStream(file).pipe(res);
  } catch (error) {
    return send(res, error.statusCode || 500, { error: error.message });
  }
});

server.listen(PORT, HOST, () => {
  const localHost = HOST === '0.0.0.0' ? '127.0.0.1' : HOST;
  const url = `http://${localHost}:${PORT}`;
  console.log(`ARCADI GESTIO RESTAURANT: ${url}`);
  if (process.platform === 'win32' && !process.env.NO_OPEN) {
    setTimeout(() => exec(`start "" "${url}"`), 600);
  }
});

module.exports = { server };
