'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcadi-mail-test-'));
Object.assign(process.env, {DATA_DIR:dir, PORT:'0', HOST:'127.0.0.1', NO_OPEN:'1', ARCADI_DESKTOP:'0',
  ADMIN_USER:'direction-test', ADMIN_PASSWORD:'test-password', GOOGLE_CLIENT_ID:'test-client',
  GOOGLE_CLIENT_SECRET:'test-secret', APP_BASE_URL:'http://127.0.0.1'});
fs.writeFileSync(path.join(dir, 'commercial-email.json'), JSON.stringify({appPassword:'obsolete-secret'}));
const gmail = require('../gmail-oauth');
const {server, mutateData} = require('../commercial-server');
const realFetch = global.fetch;
let calls = [], sendHook = null, failSend = false;
global.fetch = async (url, options) => {
  if (!String(url).startsWith('https://')) return realFetch(url, options);
  calls.push({url, options});
  if (url === 'https://oauth2.googleapis.com/token') return Response.json({access_token:'access-secret', refresh_token:'refresh-secret', expires_in:3600, scope:gmail.SEND_SCOPE});
  if (url.includes('/userinfo')) return Response.json({sub:'google-user', email:'direction@gmail.com', email_verified:true});
  if (url.includes('/messages/send')) {
    if (sendHook) await sendHook();
    return failSend ? Response.json({error:'unavailable'}, {status:503}) : Response.json({id:'gmail-message-1'});
  }
  throw new Error('Unexpected network request');
};
let base;
const auth = 'Basic ' + Buffer.from('direction-test:test-password').toString('base64');
async function request(route, {method='GET', body, authenticated=true, ...options} = {}) {
  const response = await realFetch(base + route, {method, redirect:'manual', ...options,
    headers:{...(authenticated ? {Authorization:auth} : {}), ...(method==='POST' ? {'Content-Type':'application/json'} : {}), ...options.headers},
    ...(body === undefined ? {} : {body:JSON.stringify(body)})});
  const text = await response.text();
  let data; try {data=JSON.parse(text);} catch {data=text;}
  return {response, data};
}
async function main() {
  if (!server.listening) await once(server, 'listening');
  base = 'http://127.0.0.1:' + server.address().port;
  process.env.APP_BASE_URL=base;
  assert.equal(fs.existsSync(path.join(dir,'commercial-email.json')), false);
  assert.equal((await request('/api/commercial-email-status', {authenticated:false})).response.status,401);
  assert.equal((await request('/api/gmail/connect', {method:'POST', body:{}, authenticated:false})).response.status,401);
  assert.equal((await request('/api/gmail/connect', {method:'POST', body:{}, headers:{Origin:'https://attacker.example'}})).response.status,403);
  // Normalize the fixture through the same endpoint used by the application.
  const state=(await request('/api/state')).data;
  state.restaurants.push({id:'other-centre', organizationId:'company_casa_mestres', name:'Other'});
  state.commercialProposals=[{id:'p1', status:'ESBORRANY', code:'PROP-TEST', clientEmail:'client@example.com', centreId:'restaurant_casa_mestres', companyId:'company_casa_mestres'}];
  await request('/api/state', {method:'POST',body:state});
  assert.equal((await request('/api/commercial-proposals/p1/send', {method:'POST',body:{}})).response.status,409);
  assert.equal(calls.length,0,'Unvalidated proposals cannot contact Google');
  assert.equal((await request('/api/commercial-email-config', {method:'POST',body:{appPassword:'ignored'}})).response.status,410);
  assert.equal((await request('/api/commercial-email-test', {method:'POST',body:{}})).response.status,410);
  assert.equal((await request('/api/commercial-email-status?centreId=unknown')).response.status,404);
  const started=await request('/api/gmail/connect', {method:'POST',body:{}});
  assert.equal(started.response.status,200);
  const authorization=new URL(started.data.url);
  assert.equal(authorization.origin,'https://accounts.google.com');
  assert.equal(authorization.searchParams.get('access_type'),'offline');
  assert.equal(authorization.searchParams.get('code_challenge_method'),'S256');
  assert.ok(!started.data.url.includes('test-secret'));
  const cookie=started.response.headers.get('set-cookie').split(';')[0];
  const callback='/api/gmail/callback?code=code-test&state='+authorization.searchParams.get('state');
  const bad=await request(callback);
  assert.equal(bad.response.headers.get('location'),'/?gmail=failed#arcadi-groups');
  assert.equal(calls.length,0);
  const connected=await request(callback,{headers:{Cookie:cookie}});
  assert.equal(connected.response.headers.get('location'),'/?gmail=connected#arcadi-groups');
  assert.equal((await request(callback,{headers:{Cookie:cookie}})).response.headers.get('location'),'/?gmail=failed#arcadi-groups');
  const status=await request('/api/commercial-email-status');
  assert.equal(status.data.configured,true);
  assert.equal(status.data.from,'direction@gmail.com');
  assert.doesNotMatch(JSON.stringify(status.data),/access-secret|refresh-secret|test-secret/);
  assert.doesNotMatch(fs.readFileSync(path.join(dir,'gmail-connections.enc'),'utf8'),/access-secret|refresh-secret/);
  assert.equal((await request('/api/commercial-email-status?centreId=other-centre')).data.configured,false);
  assert.deepEqual((await request('/api/gmail/connect',{method:'POST',body:{}})).data,{connected:true});
  await mutateData(data=>{data.commercialProposals[0].status='VALIDADA';});
  let release, entered;
  const enteredPromise=new Promise(resolve=>{entered=resolve;});
  const releasePromise=new Promise(resolve=>{release=resolve;});
  sendHook=async()=>{entered();await releasePromise;};
  const first=request('/api/commercial-proposals/p1/send',{method:'POST',body:{}});
  await enteredPromise;
  assert.equal((await request('/api/commercial-proposals/p1/send',{method:'POST',body:{}})).response.status,409);
  await mutateData(data=>{data.company.phone='concurrent-change';});
  release();
  assert.equal((await first).response.status,200);
  sendHook=null;
  const sent=(await request('/api/state')).data;
  assert.equal(sent.company.phone,'concurrent-change');
  assert.equal(sent.commercialProposals[0].status,'ENVIADA');
  assert.equal(sent.commercialProposals[0].sendHistory[0].providerId,'gmail-message-1');
  assert.equal(sent.commercialSendHistory.length,1);
  const payload=JSON.parse(calls.find(x=>x.url.includes('/messages/send')).options.body);
  assert.match(Buffer.from(payload.raw,'base64url').toString(),/From: <direction@gmail.com>/);
  assert.doesNotMatch(JSON.stringify(sent),/access-secret|refresh-secret/);
  await request('/api/state',{method:'POST',body:sent});
  failSend=true;
  assert.equal((await request('/api/commercial-proposals/p1/send',{method:'POST',body:{}})).response.status,502);
  assert.equal((await request('/api/state')).data.commercialSendHistory.length,1);
  // A stale client cannot erase or invent send history.
  state.commercialProposals[0].sendHistory=[{providerId:'forged'}];
  await request('/api/state',{method:'POST',body:state});
  const preserved=(await request('/api/state')).data;
  assert.equal(preserved.commercialSendHistory.length,1);
  assert.equal(preserved.commercialProposals[0].sendHistory[0].providerId,'gmail-message-1');
  await request('/api/gmail/disconnect',{method:'POST',body:{}});
  assert.equal((await request('/api/commercial-email-status')).data.configured,false);
  console.log('OK commercial-server: OAuth, permissions, CSRF, scope, validation, send, duplicate protection, history and disconnect');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  global.fetch=realFetch;
  await new Promise(resolve=>server.close(resolve));
  fs.rmSync(dir,{recursive:true,force:true});
});
