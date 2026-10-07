'use strict';

const https = require('https');

function postForm(hostname, path, headers, form) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(form).toString();
    const req = https.request({
      hostname, path, method:'POST',
      headers:{ 'Content-Type':'application/x-www-form-urlencoded', 'Content-Length':Buffer.byteLength(body), ...headers }
    }, res => {
      let data='';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed={};
        try { parsed=JSON.parse(data); } catch {}
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
        else reject(new Error(parsed.error_description || parsed.message || 'Error del proveïdor de notificació'));
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

async function gmailAccessToken() {
  const clientId=String(process.env.GOOGLE_CLIENT_ID||'').trim();
  const clientSecret=String(process.env.GOOGLE_CLIENT_SECRET||'').trim();
  const refreshToken=String(process.env.RESERVES_GMAIL_REFRESH_TOKEN||'').trim();
  if(!clientId||!clientSecret||!refreshToken)return '';
  const out=await postForm('oauth2.googleapis.com','/token',{},{
    client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'
  });
  return String(out.access_token||'');
}

function validEmail(value){return /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(String(value||''))}
function messageText(center,reservation){
  const lines=[
    'Reserva confirmada · '+String(center.name||'Restaurant'),
    '',
    'Codi: '+String(reservation.code||''),
    'Data: '+String(reservation.date||''),
    'Hora: '+String(reservation.time||''),
    'Comensals: '+String(reservation.pax||''),
    reservation.offerName ? 'Menú / oferta: '+reservation.offerName : '',
    reservation.zoneName ? 'Zona: '+reservation.zoneName : '',
    '',
    'Nom: '+String(reservation.name||''),
    reservation.depositAmount>0 ? 'Fiança pagada: '+Number(reservation.depositAmount).toFixed(2)+' €' : '',
    '',
    'Gràcies. La teva reserva està confirmada.'
  ].filter(Boolean);
  return lines.join('\n');
}
function messageHtml(center,reservation){
  return '<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#102b38"><h2>Reserva confirmada</h2><h3>'+escapeHtml(center.name||'Restaurant')+'</h3><p><b>Codi:</b> '+escapeHtml(reservation.code||'')+'<br><b>Data:</b> '+escapeHtml(reservation.date||'')+'<br><b>Hora:</b> '+escapeHtml(reservation.time||'')+'<br><b>Comensals:</b> '+escapeHtml(reservation.pax||'')+'</p>'+(reservation.offerName?'<p><b>Menú / oferta:</b> '+escapeHtml(reservation.offerName)+'</p>':'')+(reservation.depositAmount>0?'<p><b>Fiança pagada:</b> '+Number(reservation.depositAmount).toFixed(2)+' €</p>':'')+'<p>Gràcies. La teva reserva està confirmada.</p></div>';
}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

function mimeMessage(from,to,subject,text,html){
  const boundary='arcadi_res_'+Date.now();
  const enc=v=>Buffer.from(String(v||''),'utf8').toString('base64');
  const wrap=v=>(enc(v).match(/.{1,76}/g)||[]).join('\r\n');
  return [
    'From: '+from,'To: '+to,'Subject: =?UTF-8?B?'+enc(subject)+'?=','MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="'+boundary+'"','',
    '--'+boundary,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',wrap(text),
    '--'+boundary,'Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',wrap(html),
    '--'+boundary+'--',''
  ].join('\r\n');
}

async function sendEmail(center,reservation){
  const from=String(process.env.RESERVES_FROM_EMAIL||'').trim();
  if(!from||!validEmail(from)||!validEmail(reservation.email))return {status:'NO_CONFIGURAT'};
  const token=await gmailAccessToken();
  if(!token)return {status:'NO_CONFIGURAT'};
  const raw=Buffer.from(mimeMessage(from,reservation.email,'Reserva confirmada · '+String(center.name||''),messageText(center,reservation),messageHtml(center,reservation))).toString('base64url');
  const response=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{
    method:'POST',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({raw}),
    signal:AbortSignal.timeout(20000)
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok||!body.id)throw new Error(body.error?.message||'Google no ha confirmat l’enviament');
  return {status:'ENVIAT',id:body.id};
}

function normalizePhone(phone){
  const raw=String(phone||'').trim().replace(/[\s().-]/g,'');
  if(!raw)return '';
  if(raw.startsWith('+'))return raw;
  if(raw.startsWith('00'))return '+'+raw.slice(2);
  if(/^\d{9}$/.test(raw))return '+34'+raw;
  return raw;
}

async function sendWhatsApp(center,reservation){
  const sid=String(process.env.TWILIO_ACCOUNT_SID||'').trim();
  const token=String(process.env.TWILIO_AUTH_TOKEN||'').trim();
  const from=String(process.env.TWILIO_WHATSAPP_FROM||'').trim();
  const to=normalizePhone(reservation.phone);
  if(!sid||!token||!from||!to)return {status:'NO_CONFIGURAT'};
  const auth='Basic '+Buffer.from(sid+':'+token).toString('base64');
  const out=await postForm('api.twilio.com','/2010-04-01/Accounts/'+encodeURIComponent(sid)+'/Messages.json',{Authorization:auth},{
    From:from.startsWith('whatsapp:')?from:'whatsapp:'+from,
    To:'whatsapp:'+to,
    Body:messageText(center,reservation)
  });
  return {status:'ENVIAT',id:String(out.sid||'')};
}

async function sendReservationConfirmation(center,reservation){
  const now=new Date().toISOString();
  const result={email:{status:'NO_CONFIGURAT',at:now},whatsapp:{status:'NO_CONFIGURAT',at:now}};
  try{result.email={...(await sendEmail(center,reservation)),at:now}}catch(error){result.email={status:'ERROR',error:String(error.message||error),at:now}}
  try{result.whatsapp={...(await sendWhatsApp(center,reservation)),at:now}}catch(error){result.whatsapp={status:'ERROR',error:String(error.message||error),at:now}}
  return result;
}

module.exports={sendReservationConfirmation};
