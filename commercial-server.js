'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { proposalSubject, proposalText, proposalHtml } = require('./commercial-email.js');
const gmail = require('./gmail-oauth.js');

const ROOT = __dirname;
const originalCreateServer = http.createServer;
const sending = new Set();

function dataPaths() {
  const configured = String(process.env.DATA_DIR || '').trim();
  const dataDir = configured ? path.resolve(configured) : ROOT;
  return { dataDir, dataFile: path.join(dataDir, 'data.json'), backupsDir: path.join(dataDir, 'backups') };
}
function securityHeaders(res) { res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('X-Frame-Options','SAMEORIGIN'); res.setHeader('Referrer-Policy','same-origin'); }
function send(res,status,body){ securityHeaders(res); res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(body)); }
function readJsonBody(req,limit=64*1024){ return new Promise((resolve,reject)=>{ let body=''; req.on('data',c=>{body+=c;if(Buffer.byteLength(body)>limit){const e=new Error('Petició massa gran');e.statusCode=413;reject(e);req.destroy();}}); req.on('end',()=>{if(!body.trim())return resolve({});try{resolve(JSON.parse(body));}catch{const e=new Error('JSON no vàlid');e.statusCode=400;reject(e);}}); req.on('error',reject); }); }

function userId() { return process.env.ARCADI_DESKTOP === '1' ? 'desktop-direction' : String(process.env.ADMIN_USER); }
function resolveScope(data, input = {}) {
  const companyId = String(input.companyId || 'company_casa_mestres');
  const centreId = String(input.centreId || (companyId === 'company_casa_mestres' ? 'restaurant_casa_mestres' : ''));
  if (!(data.organizations || []).some(x => x.id === companyId)) throw Object.assign(new Error('Empresa no trobada.'), {statusCode:404});
  if (centreId && !(data.restaurants || []).some(x => x.id === centreId && x.organizationId === companyId && x.kind !== 'GROUP')) throw Object.assign(new Error('Centre no trobat dins d’aquesta empresa.'), {statusCode:404});
  return { userId: userId(), companyId, centreId };
}
function sameOrigin(req) {
  if (String(req.headers['sec-fetch-site'] || '') === 'cross-site') return false;
  if (!req.headers.origin) return true;
  const expected = gmail.googleConfig()?.origin || String(process.env.APP_BASE_URL || '').replace(/\/$/, '');
  return Boolean(expected) && req.headers.origin === expected;
}
function proposalCompany(data, proposal) {
  const org = (data.organizations || []).find(x => x.id === proposal.companyId);
  const centre = (data.restaurants || []).find(x => x.id === proposal.centreId);
  return { name: centre?.name || org?.name || data.company?.name || 'ARCADI GESTIO RESTAURANT',
    phone: centre?.phone || data.company?.phone || '', email: centre?.email || data.company?.email || '' };
}
async function sendProposal(data, proposal) {
  if (!['VALIDADA', 'ENVIADA'].includes(String(proposal.status || ''))) throw Object.assign(new Error('Direcció ha de validar la proposta abans de poder-la enviar.'), {statusCode:409});
  if (!gmail.validEmail(String(proposal.clientEmail || '').trim())) throw Object.assign(new Error('La proposta no té un email de client vàlid.'), {statusCode:400});
  const scope = resolveScope(data, proposal);
  if (!gmail.status(scope).configured) throw Object.assign(new Error('Prem “Connectar Gmail” abans d’enviar la proposta.'), {statusCode:409});
  const company = proposalCompany(data, proposal);
  return gmail.sendMail(scope, { to: proposal.clientEmail.trim(), subject: proposalSubject(proposal, company.name),
    html: proposalHtml(proposal, company), text: proposalText(proposal, company) });
}
function redirectBack(res, result) {
  res.setHeader('Set-Cookie', `${gmail.COOKIE}=; ${gmail.cookieOptions()}; Max-Age=0`);
  securityHeaders(res);
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.writeHead(303, {Location: '/?gmail=' + result + '#arcadi-groups', 'Cache-Control':'no-store'});
  res.end();
}
async function handleCommercialRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const sendMatch = url.pathname.match(/^\/api\/commercial-proposals\/([^/]+)\/send$/);
  if (!url.pathname.startsWith('/api/gmail/') && !url.pathname.startsWith('/api/commercial-email-') && !sendMatch) return false;
  if (!exported.requireAdmin(req, res)) return true;
  try {
    if (req.method === 'POST' && (!sameOrigin(req) || !String(req.headers['content-type'] || '').startsWith('application/json'))) {
      send(res, 403, {error:'Petició no autoritzada.'}); return true;
    }
    if (url.pathname === gmail.CALLBACK && req.method === 'GET') {
      try { await gmail.callback(req, url, userId()); redirectBack(res, 'connected'); }
      catch { redirectBack(res, 'failed'); }
      return true;
    }
    if (['/api/commercial-email-status', '/api/commercial-email-config'].includes(url.pathname) && req.method === 'GET') {
      const scope = resolveScope(exported.readData(), Object.fromEntries(url.searchParams));
      send(res, 200, gmail.status(scope)); return true;
    }
    if (url.pathname === '/api/gmail/connect' && req.method === 'POST') {
      const scope = resolveScope(exported.readData(), await readJsonBody(req));
      if (gmail.status(scope).configured) send(res, 200, {connected:true});
      else send(res, 200, gmail.start(scope, res));
      return true;
    }
    if (url.pathname === '/api/gmail/disconnect' && req.method === 'POST') {
      const scope = resolveScope(exported.readData(), await readJsonBody(req));
      gmail.saveConnection(scope, null);
      send(res, 200, {ok:true}); return true;
    }
    if (!sendMatch || req.method !== 'POST') {
      send(res, 410, {error:'Aquesta configuració ja no s’utilitza. Prem “Connectar Gmail”.'}); return true;
    }
    const proposalId = decodeURIComponent(sendMatch[1]);
    if (sending.has(proposalId)) { send(res, 409, {error:'Aquesta proposta ja s’està enviant.'}); return true; }
    sending.add(proposalId);
    try {
      const data = exported.readData();
      const proposal = (data.commercialProposals || []).find(x => x.id === proposalId);
      if (!proposal) { send(res, 404, {error:'Proposta comercial no trobada.'}); return true; }
      const snapshot = JSON.stringify(proposal);
      const result = await sendProposal(data, proposal);
      const now = new Date().toISOString();
      const record = {at:now, to:proposal.clientEmail, from:result.from, provider:'gmail', providerId:result.id, userId:userId(), companyId:proposal.companyId || 'company_casa_mestres', centreId:resolveScope(data, proposal).centreId};
      // Use the shared write queue and fresh data after Google responds.
      await exported.mutateData(latest => {
        const current = (latest.commercialProposals || []).find(x => x.id === proposalId);
        if (current) {
          const unchanged = JSON.stringify(current) === snapshot;
          current.sendHistory = Array.isArray(current.sendHistory) ? current.sendHistory : [];
          current.sendHistory.push(record);
          if (unchanged) { current.status='ENVIADA'; current.sentAt=now; current.sentTo=proposal.clientEmail; current.updatedAt=now; }
        }
        latest.commercialSendHistory = Array.isArray(latest.commercialSendHistory) ? latest.commercialSendHistory : [];
        latest.commercialSendHistory.push({...record, proposalId});
      });
      send(res, 200, {ok:true, proposalId, providerId:result.id, message:`Proposta ${proposal.code || ''} enviada a ${proposal.clientEmail}.`});
      return true;
    } finally { sending.delete(proposalId); }
  } catch (error) {
    send(res, error.statusCode || 500, {error:error.statusCode ? error.message : 'No s’ha pogut completar l’operació. Comprova l’historial i la carpeta Enviats abans de repetir-la.'}); return true;
  }
}

http.createServer=function patchedCreateServer(listener){return originalCreateServer.call(http,(req,res)=>{Promise.resolve(handleCommercialRequest(req,res)).then(handled=>{if(!handled)listener(req,res);}).catch(()=>send(res,500,{error:'No s’ha pogut completar l’operació.'}));});};
let exported; try{exported=require('./server.js');}finally{http.createServer=originalCreateServer;}
const legacyFile = path.join(dataPaths().dataDir, 'commercial-email.json');
if (fs.existsSync(legacyFile)) fs.unlinkSync(legacyFile);
module.exports={...exported,handleCommercialRequest,resolveScope,proposalCompany,sendProposal};
