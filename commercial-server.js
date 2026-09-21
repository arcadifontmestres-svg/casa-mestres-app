'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { proposalSubject, proposalText, proposalHtml, sendResend } = require('./commercial-email.js');
const { normalizeGoogleAppPassword, sendGmail } = require('./commercial-smtp.js');

const ROOT = __dirname;
const originalCreateServer = http.createServer;
const MAIL_CONFIG_FILE = 'commercial-email.json';

function dataPaths() {
  const configured = String(process.env.DATA_DIR || '').trim();
  const dataDir = configured ? path.resolve(configured) : ROOT;
  return { dataDir, dataFile: path.join(dataDir, 'data.json'), backupsDir: path.join(dataDir, 'backups'), mailConfigFile: path.join(dataDir, MAIL_CONFIG_FILE) };
}
function securityHeaders(res) { res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('X-Frame-Options','SAMEORIGIN'); res.setHeader('Referrer-Policy','same-origin'); }
function send(res,status,body){ securityHeaders(res); res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(body)); }
function safeEqual(left,right){ const a=Buffer.from(String(left)), b=Buffer.from(String(right)); return a.length===b.length && crypto.timingSafeEqual(a,b); }
function isLoopback(req){ const a=String(req.socket?.remoteAddress||''); return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(a); }
function isAdmin(req){ if(process.env.ARCADI_DESKTOP==='1') return isLoopback(req); if(!process.env.ADMIN_USER||!process.env.ADMIN_PASSWORD) return false; const h=String(req.headers.authorization||''); if(!h.startsWith('Basic ')) return false; let d=''; try{d=Buffer.from(h.slice(6),'base64').toString('utf8');}catch{return false;} const i=d.indexOf(':'); return i>=0 && safeEqual(d.slice(0,i),process.env.ADMIN_USER) && safeEqual(d.slice(i+1),process.env.ADMIN_PASSWORD); }
function requireAdmin(req,res){ if(isAdmin(req)) return true; res.setHeader('WWW-Authenticate','Basic realm="ARCADI Back Office", charset="UTF-8"'); send(res,401,{error:'Accés restringit a Direcció.'}); return false; }
function readJsonBody(req,limit=64*1024){ return new Promise((resolve,reject)=>{ let body=''; req.on('data',c=>{body+=c;if(Buffer.byteLength(body)>limit){const e=new Error('Petició massa gran');e.statusCode=413;reject(e);req.destroy();}}); req.on('end',()=>{if(!body.trim())return resolve({});try{resolve(JSON.parse(body));}catch{const e=new Error('JSON no vàlid');e.statusCode=400;reject(e);}}); req.on('error',reject); }); }
function readData(){ const {dataFile}=dataPaths(); if(!fs.existsSync(dataFile)) throw new Error('No s’ha trobat el fitxer de dades'); return JSON.parse(fs.readFileSync(dataFile,'utf8')); }
function writeData(data,label='commercial'){ const {dataFile,backupsDir}=dataPaths(); fs.mkdirSync(backupsDir,{recursive:true}); if(fs.existsSync(dataFile)){const stamp=new Date().toISOString().replace(/[:.]/g,'-');fs.copyFileSync(dataFile,path.join(backupsDir,`before_${label}_${stamp}.json`));} data.updatedAt=new Date().toISOString(); const tmp=`${dataFile}.commercial.tmp`; fs.writeFileSync(tmp,JSON.stringify(data,null,2),'utf8'); fs.renameSync(tmp,dataFile); }
function readStoredMailConfig(){ const {mailConfigFile}=dataPaths(); try{ if(!fs.existsSync(mailConfigFile)) return {}; const v=JSON.parse(fs.readFileSync(mailConfigFile,'utf8')); return v&&typeof v==='object'?v:{}; }catch{return{};} }
function writeStoredMailConfig(config){ const {dataDir,mailConfigFile}=dataPaths(); fs.mkdirSync(dataDir,{recursive:true}); const tmp=`${mailConfigFile}.tmp`; fs.writeFileSync(tmp,JSON.stringify(config,null,2),{encoding:'utf8',mode:0o600}); fs.renameSync(tmp,mailConfigFile); try{fs.chmodSync(mailConfigFile,0o600);}catch{} }

function senderConfig(){
  const stored=readStoredMailConfig();
  const envResend=String(process.env.RESEND_API_KEY||'').trim();
  const envFrom=String(process.env.COMMERCIAL_FROM_EMAIL||'').trim();
  const envName=String(process.env.COMMERCIAL_FROM_NAME||'').trim();
  const envReply=String(process.env.COMMERCIAL_REPLY_TO||'').trim();
  const envGmailUser=String(process.env.GMAIL_SMTP_USER||'').trim();
  const envGmailPass=normalizeGoogleAppPassword(process.env.GMAIL_APP_PASSWORD||'');
  const envProvider=String(process.env.COMMERCIAL_EMAIL_PROVIDER||'').trim().toLowerCase();
  const provider=envProvider || (envGmailUser||envGmailPass?'gmail':envResend?'resend':String(stored.provider||'gmail').toLowerCase());
  const name=envName || String(stored.name||'ARCADI GESTIO RESTAURANT').trim();
  const replyTo=envReply || String(stored.replyTo||'').trim();
  const email=provider==='gmail' ? (envGmailUser || String(stored.email||'').trim()) : (envFrom || String(stored.email||'').trim());
  const apiKey=envResend || String(stored.apiKey||'').trim();
  const appPassword=envGmailPass || normalizeGoogleAppPassword(stored.appPassword||'');
  const configured=provider==='gmail' ? Boolean(email&&appPassword) : Boolean(email&&apiKey);
  const source=(envResend||envFrom||envGmailUser||envGmailPass||envProvider)?'environment':((apiKey||appPassword||email)?'stored':'none');
  return { provider, configured, apiKey, appPassword, email, name, replyTo, from:email?`${name} <${email}>`:'', source };
}
function maskSecret(value){ const v=String(value||''); if(!v) return ''; if(v.length<=8) return '••••••••'; return `${v.slice(0,4)}••••••${v.slice(-4)}`; }
function publicSenderConfig(){ const c=senderConfig(); return { configured:c.configured, provider:c.provider, from:c.email, name:c.name, replyTo:c.replyTo, source:c.source, hasApiKey:Boolean(c.apiKey), apiKeyMasked:maskSecret(c.apiKey), hasAppPassword:Boolean(c.appPassword), appPasswordMasked:c.appPassword?'•••• •••• •••• ••••':'' }; }
function saveSenderConfig(input={}){
  const current=readStoredMailConfig();
  const envLocked=Boolean(String(process.env.RESEND_API_KEY||'').trim()||String(process.env.COMMERCIAL_FROM_EMAIL||'').trim()||String(process.env.GMAIL_SMTP_USER||'').trim()||String(process.env.GMAIL_APP_PASSWORD||'').trim()||String(process.env.COMMERCIAL_EMAIL_PROVIDER||'').trim());
  if(envLocked){const e=new Error('La configuració de correu està definida a les variables del servidor i no es pot substituir des de l’app.');e.statusCode=409;throw e;}
  const provider=String(input.provider||current.provider||'gmail').trim().toLowerCase();
  if(!['gmail','resend'].includes(provider)){const e=new Error('Proveïdor de correu no vàlid.');e.statusCode=400;throw e;}
  const next={ provider, email:String(input.email??current.email??'').trim(), name:String(input.name??current.name??'ARCADI GESTIO RESTAURANT').trim()||'ARCADI GESTIO RESTAURANT', replyTo:String(input.replyTo??current.replyTo??'').trim(), apiKey:input.clearApiKey===true?'':(String(input.apiKey||'').trim()||String(current.apiKey||'').trim()), appPassword:input.clearAppPassword===true?'':(normalizeGoogleAppPassword(input.appPassword||'')||normalizeGoogleAppPassword(current.appPassword||'')), updatedAt:new Date().toISOString() };
  if(next.email&&!/^\S+@\S+\.\S+$/.test(next.email)){const e=new Error('L’email remitent no és vàlid.');e.statusCode=400;throw e;}
  if(next.replyTo&&!/^\S+@\S+\.\S+$/.test(next.replyTo)){const e=new Error('L’email de resposta no és vàlid.');e.statusCode=400;throw e;}
  if(provider==='resend'&&next.apiKey&&!/^re_[A-Za-z0-9_\-]+$/.test(next.apiKey)){const e=new Error('Enganxa la clau API real completa de Resend; “re_...” només és un exemple.');e.statusCode=400;throw e;}
  if(provider==='resend'&&/@gmail\.com$/i.test(next.email)){const e=new Error('Resend no pot enviar com @gmail.com. Tria Gmail com a proveïdor o usa un domini verificat a Resend.');e.statusCode=400;throw e;}
  if(provider==='gmail'&&next.appPassword&&next.appPassword.length!==16){const e=new Error('La contrasenya d’aplicació de Google ha de tenir 16 caràcters (els espais es poden enganxar o no).');e.statusCode=400;throw e;}
  writeStoredMailConfig(next); return publicSenderConfig();
}
function proposalCompany(data,proposal){ const org=(data.organizations||[]).find(i=>i.id===proposal.companyId), centre=(data.restaurants||[]).find(i=>i.id===proposal.centreId), config=senderConfig(); return {name:centre?.name||org?.name||data.company?.name||'ARCADI GESTIO RESTAURANT',phone:centre?.phone||data.company?.phone||'',email:config.replyTo||data.company?.email||''}; }
async function sendByProvider(config,payload){ if(config.provider==='gmail') return sendGmail({user:config.email,appPassword:config.appPassword,fromName:config.name,...payload}); return sendResend({apiKey:config.apiKey,from:config.from,...payload}); }
async function sendProposal(data,proposal){ const c=senderConfig(); if(!c.configured){const e=new Error('L’enviament directe no està configurat. Obre “Configurar correu”.');e.statusCode=503;throw e;} if(!['VALIDADA','ENVIADA'].includes(String(proposal.status||''))){const e=new Error('Direcció ha de validar la proposta abans de poder-la enviar.');e.statusCode=409;throw e;} const to=String(proposal.clientEmail||'').trim(); if(!/^\S+@\S+\.\S+$/.test(to)){const e=new Error('La proposta no té un email de client vàlid.');e.statusCode=400;throw e;} const company=proposalCompany(data,proposal); const result=await sendByProvider(c,{to,replyTo:c.replyTo||company.email||'',subject:proposalSubject(proposal,company.name),html:proposalHtml(proposal,company),text:proposalText(proposal,company)}); const now=new Date().toISOString(); proposal.status='ENVIADA'; proposal.sentAt=now; proposal.sentTo=to; proposal.updatedAt=now; proposal.sendHistory=Array.isArray(proposal.sendHistory)?proposal.sendHistory:[]; proposal.sendHistory.push({at:now,to,provider:c.provider,providerId:result.id||''}); return result; }
async function sendTestEmail(to){ const c=senderConfig(); if(!c.configured){const e=new Error(c.provider==='gmail'?'Configura l’email de Gmail i la contrasenya d’aplicació de Google.':'Configura la clau de Resend i un remitent de domini verificat.');e.statusCode=503;throw e;} const recipient=String(to||'').trim(); if(!/^\S+@\S+\.\S+$/.test(recipient)){const e=new Error('Indica un email de prova vàlid.');e.statusCode=400;throw e;} return sendByProvider(c,{to:recipient,replyTo:c.replyTo,subject:'Prova d’enviament · ARCADI GESTIO RESTAURANT',html:'<div style="font-family:Arial,sans-serif"><h2>ARCADI GESTIO RESTAURANT</h2><p>L’enviament directe de propostes comercials està configurat correctament.</p></div>',text:'ARCADI GESTIO RESTAURANT\n\nL’enviament directe de propostes comercials està configurat correctament.'}); }

async function handleCommercialRequest(req,res){
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  if(url.pathname==='/api/commercial-email-status'&&req.method==='GET'){if(!requireAdmin(req,res))return true;send(res,200,publicSenderConfig());return true;}
  if(url.pathname==='/api/commercial-email-config'&&req.method==='GET'){if(!requireAdmin(req,res))return true;send(res,200,publicSenderConfig());return true;}
  if(url.pathname==='/api/commercial-email-config'&&req.method==='POST'){if(!requireAdmin(req,res))return true;try{const body=await readJsonBody(req),config=saveSenderConfig(body);send(res,200,{ok:true,...config,message:config.configured?'Correu comercial configurat.':'Configuració guardada, però encara falten dades.'});return true;}catch(error){send(res,error.statusCode||500,{error:error.message||'No s’ha pogut guardar la configuració.'});return true;}}
  if(url.pathname==='/api/commercial-email-test'&&req.method==='POST'){if(!requireAdmin(req,res))return true;try{const body=await readJsonBody(req),result=await sendTestEmail(body.to);send(res,200,{ok:true,providerId:result.id||'',message:`Email de prova enviat a ${String(body.to||'').trim()}.`});return true;}catch(error){send(res,error.statusCode||500,{error:error.message||'No s’ha pogut enviar la prova.'});return true;}}
  const match=url.pathname.match(/^\/api\/commercial-proposals\/([^/]+)\/send$/); if(!match||req.method!=='POST') return false; if(!requireAdmin(req,res))return true; try{const data=readData(),proposalId=decodeURIComponent(match[1]),proposal=(data.commercialProposals||[]).find(i=>i.id===proposalId); if(!proposal)return send(res,404,{error:'Proposta comercial no trobada'})||true; const result=await sendProposal(data,proposal); writeData(data,'commercial_send'); send(res,200,{ok:true,proposalId,providerId:result.id||'',message:`Proposta ${proposal.code||''} enviada a ${proposal.clientEmail}.`});return true;}catch(error){send(res,error.statusCode||500,{error:error.message||'No s’ha pogut enviar la proposta'});return true;}
}

http.createServer=function patchedCreateServer(listener){return originalCreateServer.call(http,(req,res)=>{Promise.resolve(handleCommercialRequest(req,res)).then(handled=>{if(!handled)listener(req,res);}).catch(error=>send(res,500,{error:error.message||'Error comercial'}));});};
let exported; try{exported=require('./server.js');}finally{http.createServer=originalCreateServer;}
module.exports={...exported,handleCommercialRequest,senderConfig,publicSenderConfig,saveSenderConfig,proposalCompany,sendProposal,sendTestEmail,readStoredMailConfig};
