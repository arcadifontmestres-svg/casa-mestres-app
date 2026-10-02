'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const ROOT = __dirname;
const DATA_DIR = path.resolve(String(process.env.DATA_DIR || ROOT));
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const CENTRES_DIR = path.join(DATA_DIR, 'centres');
const COMPANY_ID = 'company_grup_trafec';
const originalCreateServer = http.createServer;
const CENTRE_COLLECTIONS = [
  'suppliers','products','bases','dishes','saleItems','documents','employees','shiftTemplates','schedules','punches','reservations',
  'maintenanceRecords','communications','crmContacts','marketingCampaigns','groupEvents','experiences','loyaltyAccounts','purchaseOrders',
  'goodsReceipts','traceabilityRecords','productionRecords','productForecasts','financialEntries','permissions','permissionAudit'
];

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

function safeJson(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
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

function rootData() {
  return safeJson(DATA_FILE, {});
}

function resolveSarriera(data) {
  const restaurants = Array.isArray(data.restaurants) ? data.restaurants : [];
  const exact = restaurants.find(item => item && item.kind !== 'GROUP' && item.organizationId === COMPANY_ID && /SARRIERA/i.test(String(item.name || '')));
  if (exact) return exact;
  const byName = restaurants.find(item => item && item.kind !== 'GROUP' && /SARRIERA/i.test(String(item.name || '')));
  if (byName) return byName;
  return null;
}

function companyRecord(data) {
  return (data.organizations || []).find(item => item.id === COMPANY_ID) || { id: COMPANY_ID, name: 'Grup Tràfec' };
}

function centreLocal(centreId) {
  if (!centreId) return { collections: {}, controlNormatiu: { records: {} } };
  return safeJson(path.join(CENTRES_DIR, `${centreId}.json`), { collections: {}, controlNormatiu: { records: {} } });
}

function recordCompanyId(item) {
  return item?.companyId || 'company_casa_mestres';
}

function mergedCentreState() {
  const root = rootData();
  const centre = resolveSarriera(root);
  if (!centre) throw Object.assign(new Error('No s’ha trobat Sarriera 1930 dins Grup Tràfec.'), { statusCode: 503 });
  const local = centreLocal(centre.id);
  const state = { ...root };
  for (const key of CENTRE_COLLECTIONS) {
    const companyRecords = (root[key] || []).filter(item =>
      recordCompanyId(item) === COMPANY_ID && (item.scope === 'COMPANY' || item.scope === 'CORPORATE')
    );
    state[key] = [...companyRecords, ...(local.collections?.[key] || [])];
  }
  state.controlNormatiu = {
    ...(root.controlNormatiu || {}),
    records: local.controlNormatiu?.records || {}
  };
  return { root, local, state, centre, context: { companyId: COMPANY_ID, centreId: centre.id } };
}

function belongsCompany(item) {
  return recordCompanyId(item) === COMPANY_ID;
}

function belongsCentre(item, centreId) {
  if (!belongsCompany(item)) return false;
  if (item?.centreId === centreId) return true;
  if (Array.isArray(item?.centreIds) && item.centreIds.includes(centreId)) return true;
  return false;
}

function masterVisible(item, centreId) {
  if (!belongsCompany(item)) return false;
  if (!item?.centreId) return true;
  if (item.scope === 'COMPANY' || item.scope === 'CORPORATE') return true;
  return belongsCentre(item, centreId);
}

function enabledModules(data, centre) {
  const configured = centre?.satelliteModules && typeof centre.satelliteModules === 'object' ? centre.satelliteModules : {};
  return {
    agenda: configured.agenda !== false,
    reserves: configured.reserves !== false,
    kitchen: configured.kitchen !== false,
    appcc: configured.appcc !== false
  };
}

function devices(data) {
  return Array.isArray(data.satelliteDevices) ? data.satelliteDevices : [];
}

function authorized(req, data, centreId) {
  const token = String(req.headers['x-arcadi-satellite-token'] || '');
  if (!token) return false;
  const tokenHash = hash(token);
  return devices(data).some(device =>
    device.active !== false && device.companyId === COMPANY_ID && device.centreId === centreId && safeEqual(device.tokenHash, tokenHash)
  );
}

function publicEmployee(item) {
  return { id:item.id, code:item.code || '', name:item.name || '', level:item.level || '', role:item.role || item.roleBase || '', active:item.active !== false };
}
function publicProduct(item) {
  return { id:item.id, code:item.code || '', name:item.name || '', family:item.family || '', unit:item.unit || 'unitat', active:item.active !== false };
}
function publicRecipe(item, type) {
  return {
    id:item.id, type, code:item.code || '', name:item.name || '', cat:item.cat || item.type || '', station:item.station || '',
    servings:item.servings || null, yield:item.yield ?? null, yieldUnit:item.yieldUnit || '', ingredients:Array.isArray(item.ingredients)?item.ingredients:[],
    baseUses:Array.isArray(item.baseUses)?item.baseUses:[], process:item.process || '', plating:item.plating || '', allergens:item.allergens || ''
  };
}
function publicReservation(item) {
  return { id:item.id, date:item.date || '', time:item.time || '', name:item.name || '', phone:item.phone || '', pax:Number(item.pax)||0, status:item.status || '', notes:item.notes || '', menuTitle:item.menuTitle || '' };
}
function publicTask(item) {
  return { id:item.id, kind:item.agendaKind || item.kind || 'TASCA', date:item.agendaDate || item.date || '', time:item.agendaTime || item.time || '', responsible:item.recipient || item.responsible || '', subject:item.subject || '', detail:item.message || item.detail || '', status:item.status || 'Pendent' };
}
function controlRows(state, centreId) {
  const out=[];
  for (const [type,list] of Object.entries(state.controlNormatiu?.records || {})) {
    for (const item of Array.isArray(list)?list:[]) {
      if (item?.companyId && !belongsCentre(item, centreId)) continue;
      out.push({ id:item.id, date:item.date || item.createdAt?.slice(0,10) || '', type, responsible:item.responsible || item.employeeName || '', result:item.result || item.status || '', notes:item.notes || item.observations || '' });
    }
  }
  return out;
}

function bootstrap(snapshot = mergedCentreState()) {
  const { root, state, centre } = snapshot;
  const company = companyRecord(root);
  const centreId = centre.id;
  return {
    schema:'GRUP_TRAFEC_CENTRE_V1',
    centre:{ id:centreId, name:centre.name || 'Sarriera 1930', group:company.name || 'Grup Tràfec', status:centre.status || 'Actiu' },
    enabledModules:enabledModules(root, centre),
    employees:(state.employees || []).filter(item => belongsCentre(item, centreId)).filter(item => item.active !== false).map(publicEmployee),
    products:(state.products || []).filter(item => masterVisible(item, centreId)).filter(item => item.active !== false).map(publicProduct),
    recipes:[
      ...(state.dishes || []).filter(item => masterVisible(item, centreId)).map(item => publicRecipe(item,'Plat')),
      ...(state.bases || []).filter(item => masterVisible(item, centreId)).map(item => publicRecipe(item,'Base'))
    ],
    reservations:(state.reservations || []).filter(item => belongsCentre(item, centreId)).map(publicReservation),
    tasks:(state.communications || []).filter(item => belongsCentre(item, centreId)).filter(item => item.agendaKind || item.kind).map(publicTask),
    appcc:controlRows(state, centreId)
  };
}

function activationCodeValid(input) {
  const configured = String(process.env.SARRIERA_SATELLITE_ACTIVATION_CODE || '');
  return configured && safeEqual(configured, String(input || '').trim());
}

function core() {
  return require('./server.js');
}

async function handleCentreSatellite(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/satellite/sarriera')) return false;

  try {
    const initial = mergedCentreState();
    const centreId = initial.centre.id;

    if (url.pathname === '/api/satellite/sarriera/activate' && req.method === 'POST') {
      const input = await readBody(req, 32 * 1024);
      if (!activationCodeValid(input.activationCode)) {
        json(res, 403, { error:'Codi de vinculació no vàlid.' });
        return true;
      }
      const token = crypto.randomBytes(32).toString('base64url');
      await core().mutateData(data => {
        data.satelliteDevices = Array.isArray(data.satelliteDevices) ? data.satelliteDevices : [];
        data.satelliteDevices.push({ id:uid('satdev'), companyId:COMPANY_ID, centreId, label:String(input.label || 'Sarriera · dispositiu centre').slice(0,120), tokenHash:hash(token), active:true, createdAt:new Date().toISOString() });
      });
      json(res, 200, { ok:true, token, centre:bootstrap(initial).centre, enabledModules:enabledModules(initial.root, initial.centre) });
      return true;
    }

    if (!authorized(req, rootData(), centreId)) {
      json(res, 401, { error:'Dispositiu de centre no validat.' });
      return true;
    }

    if (url.pathname === '/api/satellite/sarriera/bootstrap' && req.method === 'GET') {
      json(res, 200, bootstrap());
      return true;
    }

    const context = { companyId:COMPANY_ID, centreId };

    if (url.pathname === '/api/satellite/sarriera/task' && req.method === 'POST') {
      const input = await readBody(req);
      let created;
      await core().mutateData(data => {
        data.communications = Array.isArray(data.communications) ? data.communications : [];
        created = { id:uid('comm'), companyId:COMPANY_ID, centreId, scope:'CENTRE', agendaKind:String(input.kind || 'TASCA').slice(0,20), agendaDate:String(input.date || '').slice(0,10), agendaTime:String(input.time || '').slice(0,5), recipient:String(input.responsible || '').slice(0,160), subject:String(input.subject || '').slice(0,300), message:String(input.detail || '').slice(0,3000), channel:'Intern', status:'Pendent', source:'CENTRE_SATELLITE', createdAt:new Date().toISOString() };
        if (!created.subject) throw Object.assign(new Error('Falta assumpte.'), { statusCode:400 });
        data.communications.push(created);
      }, context);
      json(res, 200, { ok:true, task:publicTask(created) });
      return true;
    }

    if (url.pathname === '/api/satellite/sarriera/task/close' && req.method === 'POST') {
      const input = await readBody(req, 32 * 1024);
      let found=false;
      await core().mutateData(data => {
        const item=(data.communications || []).find(x => x.id === input.id && belongsCentre(x, centreId));
        if (!item) throw Object.assign(new Error('Tasca no trobada.'), { statusCode:404 });
        item.status='Arxivat'; item.updatedAt=new Date().toISOString(); found=true;
      }, context);
      json(res, 200, { ok:found });
      return true;
    }

    if (url.pathname === '/api/satellite/sarriera/reservation' && req.method === 'POST') {
      const input = await readBody(req);
      let created;
      await core().mutateData(data => {
        data.reservations = Array.isArray(data.reservations) ? data.reservations : [];
        created = { id:uid('res'), companyId:COMPANY_ID, centreId, scope:'CENTRE', date:String(input.date || '').slice(0,10), time:String(input.time || '').slice(0,5), name:String(input.name || '').slice(0,200), phone:String(input.phone || '').slice(0,80), pax:Math.max(1,Number(input.pax)||1), status:String(input.status || 'Confirmada').slice(0,80), notes:String(input.notes || '').slice(0,2000), source:'CENTRE_SATELLITE', createdAt:new Date().toISOString() };
        if (!created.date || !created.time || !created.name) throw Object.assign(new Error('Falten data, hora o nom.'), { statusCode:400 });
        data.reservations.push(created);
      }, context);
      json(res, 200, { ok:true, reservation:publicReservation(created) });
      return true;
    }

    if (url.pathname === '/api/satellite/sarriera/recipe' && req.method === 'POST') {
      const input = await readBody(req, 2 * 1024 * 1024);
      const isBase=String(input.type || '').toLowerCase()==='base';
      const collection=isBase?'bases':'dishes';
      let created;
      await core().mutateData(data => {
        data[collection]=Array.isArray(data[collection])?data[collection]:[];
        created={ id:uid(isBase?'base':'dish'), companyId:COMPANY_ID, centreId:'', scope:'COMPANY', sourceCentreId:centreId, code:String(input.code || '').slice(0,40), name:String(input.name || '').slice(0,200), station:String(input.station || '').slice(0,120), process:String(input.process || '').slice(0,6000), ingredients:Array.isArray(input.ingredients)?input.ingredients.slice(0,120).map(x=>({ productId:String(x.productId || '').slice(0,160), name:String(x.name || '').slice(0,200), qty:Math.max(0,Number(x.qty)||0), unit:String(x.unit || 'unitat').slice(0,40), asNeeded:Boolean(x.asNeeded) })):[], baseUses:Array.isArray(input.baseUses)?input.baseUses.slice(0,60):[], createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() };
        if (isBase) { created.type=String(input.category || '').slice(0,120); created.yield=input.yield===''||input.yield==null?null:Math.max(0,Number(input.yield)||0); created.yieldUnit=String(input.yieldUnit || 'unitat').slice(0,40); }
        else { created.cat=String(input.category || '').slice(0,120); created.servings=Math.max(1,Number(input.servings)||1); created.allergens=String(input.allergens || '').slice(0,600); created.plating=String(input.plating || '').slice(0,3000); }
        if (!created.name) throw Object.assign(new Error('Falta el nom de la recepta.'), { statusCode:400 });
        for (const line of created.ingredients) if (line.productId && !(data.products || []).some(p => p.id === line.productId && masterVisible(p, centreId))) throw Object.assign(new Error('La recepta conté un producte no autoritzat per aquest centre.'), { statusCode:400 });
        data[collection].push(created);
      }, context);
      json(res, 200, { ok:true, recipe:publicRecipe(created,isBase?'Base':'Plat') });
      return true;
    }

    if (url.pathname === '/api/satellite/sarriera/appcc' && req.method === 'POST') {
      const input = await readBody(req);
      let created;
      await core().mutateData(data => {
        data.controlNormatiu = data.controlNormatiu && typeof data.controlNormatiu === 'object' ? data.controlNormatiu : { empresa:{}, records:{} };
        data.controlNormatiu.records = data.controlNormatiu.records && typeof data.controlNormatiu.records === 'object' ? data.controlNormatiu.records : {};
        const key=String(input.type || 'incidencia').trim().toLowerCase().replace(/[^a-z0-9à-ÿ]+/gi,'_').slice(0,80) || 'incidencia';
        data.controlNormatiu.records[key]=Array.isArray(data.controlNormatiu.records[key])?data.controlNormatiu.records[key]:[];
        created={ id:uid('appcc'), companyId:COMPANY_ID, centreId, scope:'CENTRE', date:String(input.date || '').slice(0,10), responsible:String(input.responsible || '').slice(0,160), result:String(input.result || 'Pendent').slice(0,80), notes:String(input.notes || '').slice(0,2000), source:'CENTRE_SATELLITE', createdAt:new Date().toISOString() };
        data.controlNormatiu.records[key].push(created);
      }, context);
      json(res, 200, { ok:true, record:created });
      return true;
    }

    json(res, 405, { error:'Operació no autoritzada per al satèl·lit.' });
    return true;
  } catch (error) {
    json(res, error.statusCode || 500, { error:error.statusCode ? error.message : 'Error del servei satèl·lit.' });
    return true;
  }
}

http.createServer = function patchedCreateServer(listener) {
  return originalCreateServer.call(http, (req,res) => {
    Promise.resolve(handleCentreSatellite(req,res))
      .then(handled => { if (!handled) listener(req,res); })
      .catch(() => json(res,500,{ error:'Error del servei satèl·lit.' }));
  });
};

module.exports = { handleCentreSatellite, resolveSarriera, mergedCentreState };
