'use strict';

const express = require('express');
const crypto = require('crypto');
const https = require('https');

const SEND_SCOPE='https://www.googleapis.com/auth/gmail.send';

function postForm(hostname,path,form){
  return new Promise((resolve,reject)=>{
    const body=new URLSearchParams(form).toString();
    const req=https.request({
      hostname,path,method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(body)}
    },res=>{
      let data='';
      res.on('data',chunk=>{data+=chunk});
      res.on('end',()=>{
        let parsed={};
        try{parsed=JSON.parse(data)}catch{}
        if(res.statusCode>=200&&res.statusCode<300)resolve(parsed);
        else reject(new Error(parsed.error_description||parsed.error||'Google OAuth error'));
      });
    });
    req.on('error',reject);
    req.write(body);req.end();
  });
}

async function googleJson(url,headers={}){
  const response=await fetch(url,{headers,signal:AbortSignal.timeout(20000)});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(body.error?.message||body.error||'Google API error');
  return body;
}

function config(){
  const clientId=String(process.env.GOOGLE_CLIENT_ID||'').trim();
  const clientSecret=String(process.env.GOOGLE_CLIENT_SECRET||'').trim();
  const base=String(process.env.APP_BASE_URL||'').trim().replace(/\/$/,'');
  if(!clientId||!clientSecret||!/^https:\/\//.test(base))return null;
  return {clientId,clientSecret,base,redirectUri:base+'/api/reserves-gmail/callback'};
}

function signingSecret(){
  return String(process.env.CENTER_TOKEN_SECRET||process.env.GOOGLE_CLIENT_SECRET||'').trim();
}

function sign(payload){
  const body=Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig=crypto.createHmac('sha256',signingSecret()).update(body).digest('base64url');
  return body+'.'+sig;
}

function verify(token){
  const [body,sig]=String(token||'').split('.');
  if(!body||!sig)return null;
  const expected=crypto.createHmac('sha256',signingSecret()).update(body).digest('base64url');
  const a=Buffer.from(sig),b=Buffer.from(expected);
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;
  try{
    const payload=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));
    if(Date.now()-Number(payload.ts||0)>10*60*1000)return null;
    return payload;
  }catch{return null}
}

function createReservesGmailRouter(govern,miniappState){
  const router=express.Router();

  router.get('/status/:centerId',async(req,res,next)=>{
    try{
      const center=govern.getCenter(req.params.centerId);
      if(!center)return res.status(404).json({error:'Centre no trobat.'});
      const state=await miniappState.read('reserves-mail',center.id,()=>({gmail:null}));
      const ready=Boolean(config());
      res.json({
        ready,
        connected:Boolean(state.gmail?.refreshToken),
        email:state.gmail?.email||'',
        provider:'gmail'
      });
    }catch(error){next(error)}
  });

  router.post('/start/:centerId',async(req,res,next)=>{
    try{
      const center=govern.getCenter(req.params.centerId);
      if(!center)return res.status(404).json({error:'Centre no trobat.'});
      const cfg=config();
      if(!cfg)return res.status(503).json({error:'Falta activar Google OAuth al servidor.'});

      const verifier=crypto.randomBytes(32).toString('base64url');
      const challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
      const nonce=crypto.randomBytes(18).toString('base64url');
      const stateToken=sign({centerId:center.id,nonce,ts:Date.now()});

      await miniappState.write('reserves-mail-oauth',center.id,{
        nonce,
        verifier,
        expiresAt:Date.now()+10*60*1000
      });

      const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search=new URLSearchParams({
        client_id:cfg.clientId,
        redirect_uri:cfg.redirectUri,
        response_type:'code',
        scope:'openid email '+SEND_SCOPE,
        access_type:'offline',
        prompt:'consent',
        state:stateToken,
        code_challenge:challenge,
        code_challenge_method:'S256'
      }).toString();
      res.json({url:url.toString()});
    }catch(error){next(error)}
  });

  router.get('/callback',async(req,res)=>{
    try{
      const cfg=config();
      if(!cfg)throw new Error('Google OAuth no està configurat al servidor.');
      const payload=verify(req.query.state);
      if(!payload?.centerId)throw new Error('Autorització caducada o no vàlida.');
      const center=govern.getCenter(payload.centerId);
      if(!center)throw new Error('Centre no trobat.');

      const pending=await miniappState.read('reserves-mail-oauth',center.id,()=>({}));
      if(!pending.nonce||pending.nonce!==payload.nonce||Date.now()>Number(pending.expiresAt||0))throw new Error('Autorització caducada.');
      if(req.query.error)throw new Error('Google no ha autoritzat l’enviament de correu.');
      const code=String(req.query.code||'');
      if(!code)throw new Error('Google no ha retornat cap codi d’autorització.');

      const tokens=await postForm('oauth2.googleapis.com','/token',{
        client_id:cfg.clientId,
        client_secret:cfg.clientSecret,
        grant_type:'authorization_code',
        code,
        redirect_uri:cfg.redirectUri,
        code_verifier:pending.verifier
      });
      if(!tokens.access_token||!tokens.refresh_token)throw new Error('Google no ha retornat una connexió persistent.');

      const identity=await googleJson('https://openidconnect.googleapis.com/v1/userinfo',{Authorization:'Bearer '+tokens.access_token});
      const email=String(identity.email||'').trim();
      if(!email)throw new Error('Google no ha retornat l’adreça Gmail.');

      await miniappState.write('reserves-mail',center.id,{
        gmail:{
          email,
          refreshToken:tokens.refresh_token,
          accessToken:tokens.access_token,
          expiresAt:Date.now()+Number(tokens.expires_in||3600)*1000,
          connectedAt:new Date().toISOString()
        }
      });
      await miniappState.write('reserves-mail-oauth',center.id,{});

      res.redirect('/?gmail=connected&centerId='+encodeURIComponent(center.id));
    }catch(error){
      res.status(400).send('<!doctype html><meta charset="utf-8"><title>Gmail</title><body style="font-family:Arial;padding:40px"><h2>No s\'ha pogut connectar Gmail</h2><p>'+String(error.message||error).replace(/[&<>]/g,'')+'</p><p><a href="/">Tornar a Direcció</a></p></body>');
    }
  });

  router.delete('/:centerId',async(req,res,next)=>{
    try{
      const center=govern.getCenter(req.params.centerId);
      if(!center)return res.status(404).json({error:'Centre no trobat.'});
      await miniappState.write('reserves-mail',center.id,{gmail:null});
      res.json({ok:true});
    }catch(error){next(error)}
  });

  return router;
}

module.exports={createReservesGmailRouter};
