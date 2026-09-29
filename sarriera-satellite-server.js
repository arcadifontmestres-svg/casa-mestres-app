'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const ROOT = __dirname;
const DATA_DIR = path.resolve(String(process.env.DATA_DIR || ROOT));
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const COMPANY_ID = 'company_grup_trafec';
const CENTRE_ID = 'restaurant_sarriera';
const originalCreateServer = http.createServer;

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'same-origin'
  });
  res.end(JSON.stringify(body));
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (Buffer.byteLength(raw) > limit) {
        const error = new Error('Petició massa gran');
        error.statusCode = 413;
        reject(error);
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try { resolve(JSON.parse(raw)); }
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
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return {}; }
}

function writeData(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && aa.length > 0 && crypto.timingSafeEqual(aa, bb);
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

function centreRecord(data) {
  return (data.restaurants || []).find(x => x.id === CENTRE_ID) || {
    id: CENTRE_ID,
    organizationId: COMPANY_ID,
    name: 'Sarriera 1930',
    status: 'Actiu'
  };
}

function companyRecord(data) {
  return (data.organizations || []).find(x => x.id === COMPANY_ID) || { id: COMPANY_ID, name: 'Grup Tràfec' };
}

function enabledModules(data) {
  const centre = centreRecord(data);
  const configured = centre.satelliteModules && typeof centre.satelliteModules === 'object' ? centre.satelliteModules : {};
  return {
    agenda: configured.agenda !== false,
    reserves: configured.reserves !== false,
    kitchen: configured.kitchen !== false,
    appcc: configured.appcc !== false
  };
}

function belongsCompany(item) {
  const company = item?.companyId || 'company_casa_mestres';
  return company === COMPANY_ID;
}

function belongsCentre(item) {
  if (!belongsCompany(item)) return false;
  if (item?.centreId === CENTRE_ID) return true;
  if (Array.isArray(item?.centreIds) && item.centreIds.includes(CENTRE_ID)) return true;
  return false;
}

function masterVisible(item) {
  if (!belongsCompany(item)) return false;
  if (!item?.centreId) return true;
  if (item.scope === 'COMPANY' || item.scope === 'CORPORATE') return true;
  return belongsCentre(item);
}

function satelliteDevices(data) {
  data.satelliteDevices = Array.isArray(data.satelliteDevices) ? data.satelliteDevices : [];
  return data.satelliteDevices;
}

function authorized(req, data) {
  const token = String(req.headers['x-arcadi-satellite-token'] || '');
  if (!token) return false;
  const tokenHash = hash(token);
  return satelliteDevices(data).some(device =>
    device.active !== false &&
    device.companyId === COMPANY_ID &&
    device.centreId === CENTRE_ID &&
    safeEqual(device.tokenHash, tokenHash)
  );
}

function publicEmployee(item) {
  return {
    id: item.id,
    code: item.code,
    name: item.name,
    level: item.level || '',
    role: item.role || item.roleBase || '',
    active: item.active !== false
  };
}

function publicProduct(item) {
  return {
    id: item.id,
    code: item.code || '',
    name: item.name || '',
    family: item.family || '',
    unit: item.unit || 'unitat',
    active: item.active !== false
  };
}

function publicRecipe(item, type) {
  return {
    id: item.id,
    type,
    code: item.code || '',
    name: item.name || '',
    cat: item.cat || item.type || '',
    station: item.station || '',
    servings: item.servings || null,
    yield: item.yield ?? null,
    yieldUnit: item.yieldUnit || '',
    ingredients: Array.isArray(item.ingredients) ? item.ingredients : [],
    baseUses: Array.isArray(item.baseUses) ? item.baseUses : [],
    process: item.process || '',
    plating: item.plating || '',
    allergens: item.allergens || ''
  };
}

function publicReservation(item) {
  return {
    id: item.id,
    date: item.date || '',
    time: item.time || '',
    name: item.name || '',
    phone: item.phone || '',
    pax: Number(item.pax) || 0,
    status: item.status || '',
    notes: item.notes || '',
    menuTitle: item.menuTitle || ''
  };
}

function publicTask(item) {
  return {
    id: item.id,
    kind: item.agendaKind || item.kind || 'TASCA',
    date: item.agendaDate || item.date || '',
    time: item.agendaTime || item.time || '',
    responsible: item.recipient || item.responsible || '',
    subject: item.subject || '',
    detail: item.message || item.detail || '',
    status: item.status || 'Pendent'
  };
}

function controlRows(data) {
  const out = [];
  const records = data.controlNormatiu?.records || {};
  for (const [type, list] of Object.entries(records)) {
    for (const item of Array.isArray(list) ? list : []) {
      if (!belongsCentre(item)) continue;
      out.push({
        id: item.id,
        date: item.date || item.createdAt?.slice(0, 10) || '',
        type,
        responsible: item.responsible || item.employeeName || '',
        result: item.result || item.status || '',
        notes: item.notes || item.observations || ''
      });
    }
  }
  return out;
}

function bootstrap(data) {
  const centre = centreRecord(data);
  const company = companyRecord(data);
  return {
    schema: 'SARRIERA_SATELLITE_API_V1',
    centre: { id: centre.id, name: centre.name || 'Sarriera 1930', group: company.name || 'Grup Tràfec', status: centre.status || 'Actiu' },
    enabledModules: enabledModules(data),
    employees: (data.employees || []).filter(belongsCentre).filter(x => x.active !== false).map(publicEmployee),
    products: (data.products || []).filter(masterVisible).filter(x => x.active !== false).map(publicProduct),
    recipes: [
      ...(data.dishes || []).filter(masterVisible).map(x => publicRecipe(x, 'Plat')),
      ...(data.bases || []).filter(masterVisible).map(x => publicRecipe(x, 'Base'))
    ],
    reservations: (data.reservations || []).filter(belongsCentre).map(publicReservation),
    tasks: (data.communications || []).filter(belongsCentre).filter(x => x.agendaKind || x.kind).map(publicTask),
    appcc: controlRows(data)
  };
}

function activationCodeValid(input) {
  const configured = String(process.env.SARRIERA_SATELLITE_ACTIVATION_CODE || '');
  return configured && safeEqual(configured, String(input || '').trim());
}

async function handleSatelliteRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/satellite/sarriera')) return false;

  try {
    if (url.pathname === '/api/satellite/sarriera/activate' && req.method === 'POST') {
      const input = await readBody(req, 32 * 1024);
      if (!activationCodeValid(input.activationCode)) {
        json(res, 403, { error: 'Codi de vinculació no vàlid.' });
        return true;
      }
      const data = readData();
      const token = crypto.randomBytes(32).toString('base64url');
      satelliteDevices(data).push({
        id: uid('satdev'),
        companyId: COMPANY_ID,
        centreId: CENTRE_ID,
        label: String(input.label || 'Dispositiu Sarriera').slice(0, 120),
        tokenHash: hash(token),
        active: true,
        createdAt: new Date().toISOString()
      });
      writeData(data);
      json(res, 200, { ok: true, token, centre: bootstrap(data).centre, enabledModules: enabledModules(data) });
      return true;
    }

    const data = readData();
    if (!authorized(req, data)) {
      json(res, 401, { error: 'Dispositiu de centre no validat.' });
      return true;
    }

    if (url.pathname === '/api/satellite/sarriera/bootstrap' && req.method === 'GET') {
      json(res, 200, bootstrap(data));
      return true;
    }

    if (url.pathname === '/api/satellite/sarriera/task' && req.method === 'POST') {
      const input = await readBody(req);
      data.communications = Array.isArray(data.communications) ? data.communications : [];
      const record = {
        id: uid('comm'),
        companyId: COMPANY_ID,
        centreId: CENTRE_ID,
        scope: 'CENTRE',
        agendaKind: String(input.kind || 'TASCA').slice(0, 20),
        agendaDate: String(input.date || '').slice(0, 10),
        agendaTime: String(input.time || '').slice(0, 5),
        recipient: String(input.responsible || '').slice(0, 160),
        subject: String(input.subject || '').slice(0, 300),
        message: String(input.detail || '').slice(0, 3000),
        channel: 'Intern',
        status: 'Pendent',
        source: 'SARRIERA_SATELLITE',
        createdAt: new Date().toISOString()
      };
      if (!record.subject) throw Object.assign(new Error('Falta assumpte.'), { statusCode: 400 });
      data.communications.push(record);
      writeData(data);
      json(res, 200, { ok: true, task: publicTask(record) });
      return true;
    }

    if (url.pathname === '/api/satellite/sarriera/task/close' && req.method === 'POST') {
      const input = await readBody(req, 32 * 1024);
      const record = (data.communications || []).find(x => x.id === input.id && belongsCentre(x));
      if (!record) throw Object.assign(new Error('Tasca no trobada.'), { statusCode: 404 });
      record.status = 'Arxivat';
      record.updatedAt = new Date().toISOString();
      writeData(data);
      json(res, 200, { ok: true });
      return true;
    }

    if (url.pathname === '/api/satellite/sarriera/reservation' && req.method === 'POST') {
      const input = await readBody(req);
      data.reservations = Array.isArray(data.reservations) ? data.reservations : [];
      const pax = Math.max(1, Number(input.pax) || 1);
      const record = {
        id: uid('res'),
        companyId: COMPANY_ID,
        centreId: CENTRE_ID,
        scope: 'CENTRE',
        date: String(input.date || '').slice(0, 10),
        time: String(input.time || '').slice(0, 5),
        name: String(input.name || '').slice(0, 200),
        phone: String(input.phone || '').slice(0, 80),
        pax,
        status: String(input.status || 'Confirmada').slice(0, 80),
        notes: String(input.notes || '').slice(0, 2000),
        source: 'SARRIERA_SATELLITE',
        createdAt: new Date().toISOString()
      };
      if (!record.date || !record.time || !record.name) throw Object.assign(new Error('Falten data, hora o nom.'), { statusCode: 400 });
      data.reservations.push(record);
      writeData(data);
      json(res, 200, { ok: true, reservation: publicReservation(record) });
      return true;
    }

    if (url.pathname === '/api/satellite/sarriera/recipe' && req.method === 'POST') {
      const input = await readBody(req, 2 * 1024 * 1024);
      const isBase = String(input.type || '').toLowerCase() === 'base';
      const collection = isBase ? 'bases' : 'dishes';
      data[collection] = Array.isArray(data[collection]) ? data[collection] : [];
      const record = {
        id: uid(isBase ? 'base' : 'dish'),
        companyId: COMPANY_ID,
        centreId: '',
        scope: 'COMPANY',
        sourceCentreId: CENTRE_ID,
        code: String(input.code || '').slice(0, 40),
        name: String(input.name || '').slice(0, 200),
        station: String(input.station || '').slice(0, 120),
        process: String(input.process || '').slice(0, 6000),
        ingredients: Array.isArray(input.ingredients) ? input.ingredients.slice(0, 120).map(x => ({
          productId: String(x.productId || '').slice(0, 160),
          name: String(x.name || '').slice(0, 200),
          qty: Math.max(0, Number(x.qty) || 0),
          unit: String(x.unit || 'unitat').slice(0, 40),
          asNeeded: Boolean(x.asNeeded)
        })) : [],
        baseUses: Array.isArray(input.baseUses) ? input.baseUses.slice(0, 60) : [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      if (isBase) {
        record.type = String(input.category || '').slice(0, 120);
        record.yield = input.yield === '' || input.yield == null ? null : Math.max(0, Number(input.yield) || 0);
        record.yieldUnit = String(input.yieldUnit || 'unitat').slice(0, 40);
      } else {
        record.cat = String(input.category || '').slice(0, 120);
        record.servings = Math.max(1, Number(input.servings) || 1);
        record.allergens = String(input.allergens || '').slice(0, 600);
        record.plating = String(input.plating || '').slice(0, 3000);
      }
      if (!record.name) throw Object.assign(new Error('Falta el nom de la recepta.'), { statusCode: 400 });
      for (const line of record.ingredients) {
        if (line.productId && !(data.products || []).some(p => p.id === line.productId && masterVisible(p))) {
          throw Object.assign(new Error('La recepta conté un producte no autoritzat per aquest centre.'), { statusCode: 400 });
        }
      }
      data[collection].push(record);
      writeData(data);
      json(res, 200, { ok: true, recipe: publicRecipe(record, isBase ? 'Base' : 'Plat') });
      return true;
    }

    if (url.pathname === '/api/satellite/sarriera/appcc' && req.method === 'POST') {
      const input = await readBody(req);
      data.controlNormatiu = data.controlNormatiu && typeof data.controlNormatiu === 'object' ? data.controlNormatiu : { empresa: {}, records: {} };
      data.controlNormatiu.records = data.controlNormatiu.records && typeof data.controlNormatiu.records === 'object' ? data.controlNormatiu.records : {};
      const key = String(input.type || 'incidencia').trim().toLowerCase().replace(/[^a-z0-9à-ÿ]+/gi, '_').slice(0, 80) || 'incidencia';
      data.controlNormatiu.records[key] = Array.isArray(data.controlNormatiu.records[key]) ? data.controlNormatiu.records[key] : [];
      const record = {
        id: uid('appcc'),
        companyId: COMPANY_ID,
        centreId: CENTRE_ID,
        scope: 'CENTRE',
        date: String(input.date || '').slice(0, 10),
        responsible: String(input.responsible || '').slice(0, 160),
        result: String(input.result || 'Pendent').slice(0, 80),
        notes: String(input.notes || '').slice(0, 2000),
        source: 'SARRIERA_SATELLITE',
        createdAt: new Date().toISOString()
      };
      data.controlNormatiu.records[key].push(record);
      writeData(data);
      json(res, 200, { ok: true, record: { ...record, type: key } });
      return true;
    }

    json(res, 405, { error: 'Operació no autoritzada per al satèl·lit.' });
    return true;
  } catch (error) {
    json(res, error.statusCode || 500, { error: error.statusCode ? error.message : 'Error del servei satèl·lit.' });
    return true;
  }
}

http.createServer = function patchedCreateServer(listener) {
  return originalCreateServer.call(http, (req, res) => {
    Promise.resolve(handleSatelliteRequest(req, res))
      .then(handled => { if (!handled) listener(req, res); })
      .catch(() => json(res, 500, { error: 'Error del servei satèl·lit.' }));
  });
};

module.exports = { handleSatelliteRequest };
