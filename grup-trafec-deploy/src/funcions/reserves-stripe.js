'use strict';

const https = require('https');
const crypto = require('crypto');

function safeEqual(left,right){
  const a=Buffer.from(String(left||'')),b=Buffer.from(String(right||''));
  return a.length===b.length && a.length>0 && crypto.timingSafeEqual(a,b);
}

function stripeRequest(method,endpoint,parameters={}){
  return new Promise((resolve,reject)=>{
    const clean=Object.fromEntries(Object.entries(parameters).filter(([,v])=>v!==undefined&&v!==null&&v!==''));
    const body=new URLSearchParams(clean).toString();
    const isGet=method==='GET';
    const requestPath='/v1'+endpoint+(isGet&&body?'?'+body:'');
    const headers={Authorization:'Bearer '+String(process.env.STRIPE_SECRET_KEY||'')};
    if(!isGet){
      headers['Content-Type']='application/x-www-form-urlencoded';
      headers['Content-Length']=Buffer.byteLength(body);
    }
    const request=https.request({hostname:'api.stripe.com',path:requestPath,method,headers},response=>{
      let chunks='';
      response.on('data',chunk=>{chunks+=chunk});
      response.on('end',()=>{
        let parsed;
        try{parsed=JSON.parse(chunks)}catch{parsed={error:{message:chunks||'Resposta Stripe no vàlida'}}}
        if(response.statusCode>=200&&response.statusCode<300)resolve(parsed);
        else reject(new Error(parsed?.error?.message||'Error Stripe'));
      });
    });
    request.on('error',reject);
    if(!isGet&&body)request.write(body);
    request.end();
  });
}

function publicBaseUrl(req){
  const proto=String(req.headers['x-forwarded-proto']||'').split(',')[0].trim()||(req.socket.encrypted?'https':'http');
  const host=String(req.headers['x-forwarded-host']||'').split(',')[0].trim()||String(req.headers.host||'').trim();
  return (host?proto+'://'+host:'').replace(/\/$/,'');
}

async function createCheckoutSession(req,reservation,currency='EUR'){
  const base=publicBaseUrl(req);
  const p={
    mode:'payment',
    success_url:base+'/reserves.html?stripe=success&session_id={CHECKOUT_SESSION_ID}',
    cancel_url:base+'/reserves.html?stripe=cancel&reservation_id='+encodeURIComponent(reservation.id)+'&token='+encodeURIComponent(reservation.manageToken),
    client_reference_id:reservation.id,
    customer_email:reservation.email,
    locale:'auto',
    'metadata[reservation_id]':reservation.id,
    'metadata[center_id]':reservation.centerId,
    'line_items[0][quantity]':'1',
    'line_items[0][price_data][currency]':String(currency||'EUR').toLowerCase(),
    'line_items[0][price_data][unit_amount]':String(Math.round(Number(reservation.depositAmount||0)*100)),
    'line_items[0][price_data][product_data][name]':('Fiança reserva · '+String(reservation.offerName||'Reserva')).slice(0,127),
    'line_items[0][price_data][product_data][description]':(reservation.date+' '+reservation.time+' · '+reservation.pax+' pax').slice(0,127)
  };
  return stripeRequest('POST','/checkout/sessions',p);
}

function verifyStripeSignature(rawBody,signatureHeader,secret){
  const pieces=String(signatureHeader||'').split(',').map(piece=>piece.trim().split('='));
  const timestamp=pieces.find(([key])=>key==='t')?.[1];
  const signatures=pieces.filter(([key])=>key==='v1').map(([,value])=>value);
  if(!timestamp||!signatures.length)return false;
  if(Math.abs(Date.now()/1000-Number(timestamp))>300)return false;
  const expected=crypto.createHmac('sha256',secret).update(timestamp+'.'+rawBody.toString('utf8')).digest('hex');
  return signatures.some(signature=>safeEqual(signature,expected));
}

module.exports={stripeRequest,createCheckoutSession,verifyStripeSignature};
