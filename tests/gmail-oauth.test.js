'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const gmail = require('../gmail-oauth');

test('Gmail tokens: encryption, isolation, refresh, revocation and tampering', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gmail-unit-'));
  const previous = {...process.env};
  const originalFetch = global.fetch;
  Object.assign(process.env, {DATA_DIR:dir, GOOGLE_CLIENT_ID:'client', GOOGLE_CLIENT_SECRET:'secret', APP_BASE_URL:'https://erp.example'});
  const scope={userId:'director',companyId:'company',centreId:'centre'};
  try {
    gmail.saveConnection(scope,{email:'test@gmail.com',refreshToken:'private-refresh',accessToken:'expired',expires:0});
    assert.equal(gmail.status({...scope,userId:'someone-else'}).configured,false);
    assert.equal(gmail.status({...scope,centreId:'other'}).configured,false);
    assert.equal(gmail.status({...scope,companyId:'other'}).configured,false);
    const file=path.join(dir,'gmail-connections.enc');
    assert.doesNotMatch(fs.readFileSync(file,'utf8'),/private-refresh|test@gmail/);
    if(process.platform!=='win32') assert.equal(fs.statSync(file).mode & 0o777,0o600);
    let requests=0;
    global.fetch=async(url,opts)=>{
      requests++;
      assert.equal(url,'https://oauth2.googleapis.com/token');
      const form=new URLSearchParams(opts.body);
      assert.equal(form.get('grant_type'),'refresh_token');
      assert.equal(form.get('refresh_token'),'private-refresh');
      return Response.json({access_token:'new-access',expires_in:3600});
    };
    assert.deepEqual(await Promise.all([gmail.accessToken(scope),gmail.accessToken(scope)]),['new-access','new-access']);
    assert.equal(requests,1);
    assert.equal(await gmail.accessToken(scope),'new-access');
    assert.equal(requests,1);
    assert.equal(gmail.connection(scope).refreshToken,'private-refresh');
    delete require.cache[require.resolve('../gmail-oauth')];
    assert.equal(require('../gmail-oauth').status(scope).configured,true,'Connection survives process/module restart');
    gmail.saveConnection(scope,{...gmail.connection(scope),expires:0});
    global.fetch=async()=>Response.json({error:'invalid_grant',error_description:'secret-provider-details'}, {status:400});
    await assert.rejects(gmail.accessToken(scope),/Connectar Gmail/);
    assert.equal(gmail.status(scope).configured,false);
    gmail.saveConnection(scope,{email:'test@gmail.com',refreshToken:'retained',expires:0});
    global.fetch=async()=>{throw new Error('network secret');};
    await assert.rejects(gmail.accessToken(scope),/contactar amb Google/);
    assert.equal(gmail.connection(scope).refreshToken,'retained','Transient errors keep authorization');
    const encrypted=JSON.parse(fs.readFileSync(file,'utf8'));
    encrypted.tag=Buffer.alloc(16).toString('base64');
    fs.writeFileSync(file,JSON.stringify(encrypted));
    assert.throws(()=>gmail.status(scope),/No es pot obrir/);
  } finally {global.fetch=originalFetch;process.env=previous;fs.rmSync(dir,{recursive:true,force:true});}
});

test('OAuth callback rejects missing browser binding, wrong user, expiry, cancellation and insufficient scope', async () => {
  const previous={...process.env};
  const originalFetch=global.fetch, originalNow=Date.now;
  Object.assign(process.env,{GOOGLE_CLIENT_ID:'client',GOOGLE_CLIENT_SECRET:'secret',APP_BASE_URL:'https://erp.example'});
  const scope={userId:'director',companyId:'company',centreId:'centre'};
  let cookie='';
  const begin=()=>{
    const value=gmail.start(scope,{setHeader:(name,value)=>{cookie=value.split(';')[0];assert.match(value,/HttpOnly; SameSite=Lax; Secure/);}});
    const url=new URL(value.url);
    return new URL('https://erp.example/api/gmail/callback?code=abc&state='+url.searchParams.get('state'));
  };
  try {
    let url=begin();
    await assert.rejects(gmail.callback({headers:{}},url,'director'),/sessió/);
    await assert.rejects(gmail.callback({headers:{cookie}},url,'another'),/sessió/);
    Date.now=()=>originalNow()+11*60*1000;
    await assert.rejects(gmail.callback({headers:{cookie}},url,'director'),/caducat/);
    Date.now=originalNow;
    url=begin();url.searchParams.set('error','access_denied');
    await assert.rejects(gmail.callback({headers:{cookie}},url,'director'),/No s’ha autoritzat/);
    url=begin();
    global.fetch=async()=>Response.json({scope:'openid email',access_token:'a',refresh_token:'r'});
    await assert.rejects(gmail.callback({headers:{cookie}},url,'director'),/Cal autoritzar/);
    await assert.rejects(gmail.callback({headers:{cookie}},url,'director'),/sessió/);
  } finally {Date.now=originalNow;global.fetch=originalFetch;process.env=previous;}
});

test('MIME rejects header injection and preserves Catalan content', () => {
  assert.throws(()=>gmail.createMessage({from:'a@gmail.com',to:'a@example.com\r\nBcc: evil@example.com'}),/adreça/);
  const raw=gmail.createMessage({from:'a@gmail.com',to:'b@example.com',subject:'Proposta · Direcció',text:'Menú català',html:'<p>Menú català</p>'});
  assert.match(raw,/multipart\/alternative/);
  assert.match(raw,new RegExp(Buffer.from('Menú català').toString('base64')));
});

test('Direction UI sends validated proposals through connected Gmail and blocks drafts', async () => {
  const vm = require('node:vm');
  const source=fs.readFileSync(path.join(__dirname,'../public/js/commercial-email-settings.js'),'utf8');
  const calls=[];
  const messages=[];
  let loaded=0;
  const proposal={
    id:'p',code:'PROP-2026-0001',status:'VALIDADA',clientName:'Client prova',clientEmail:'client@example.com',
    companyId:'own-company',centreId:'own-centre',eventDate:'2026-10-04',pax:10,menuName:'MENU HIVERN',
    pricePerPerson:55,totalAmount:550,menuSummary:'Primer\nSegon\nPostres'
  };
  const app={
    state:{commercialProposals:[proposal],restaurants:[{id:'own-centre',name:'SARRIERA 1930'}],organizations:[]},
    context:{companyId:'own-company',centreId:'own-centre'},
    api:async(pathname, options={})=>{
      calls.push({pathname,options});
      if(pathname.startsWith('/api/commercial-email-status?')) return {configured:true,ready:true,from:'direccio@sarriera1930.cat'};
      if(pathname==='/api/commercial-proposals/p/send') return {ok:true,message:'Proposta enviada correctament.'};
      throw new Error('Unexpected API '+pathname);
    },
    load:async()=>{loaded++;}, modal:()=>{}, closeModal:()=>{}, esc:value=>String(value || '')
  };
  const context={
    window:{ArcadiERP:app,ArcadiCommercial:{},ArcadiModules:{open:()=>{}}},
    document:{readyState:'loading',addEventListener:()=>{},querySelectorAll:()=>[]},
    location:{hash:'#arcadi-groups',search:'',pathname:'/'},
    history:{replaceState:()=>{}},
    alert:x=>messages.push(x),
    confirm:()=>true,
    URLSearchParams,
    setTimeout
  };
  vm.runInNewContext(source,context);
  const ui=context.window.ArcadiCommercialEmailSettings;

  await ui.sendProposal('p');
  assert.ok(calls.some(call=>call.pathname.startsWith('/api/commercial-email-status?companyId=own-company&centreId=own-centre')));
  assert.ok(calls.some(call=>call.pathname==='/api/commercial-proposals/p/send'));
  assert.equal(loaded,1);
  assert.match(messages.at(-1),/enviada/i);

  proposal.status='ESBORRANY';
  calls.length=0; messages.length=0;
  await ui.sendProposal('p');
  assert.equal(calls.length,0);
  assert.match(messages.at(-1),/validar/);
});