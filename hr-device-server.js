'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const ROOT = __dirname;
const DATA_DIR = path.resolve(String(process.env.DATA_DIR || ROOT));
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const CENTRES_DIR = path.join(DATA_DIR, 'centres');
const originalCreateServer = http.createServer;
const activationAttempts = new Map();

function json(res,status,body,extraHeaders={}){
  res.writeHead(status,{
    'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN','Referrer-Policy':'same-origin',
    ...extraHeaders
  });
  res.end(JSON.stringify(body));
}
function safeJson(file,fallback={}){try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return fallback}}
function readBody(req,limit=1024*1024){return new Promise((resolve,reject)=>{let raw='';req.on('data',chunk=>{raw+=chunk;if(Buffer.byteLength(raw)>limit){const e=new Error('Petició massa gran');e.statusCode=413;reject(e);req.destroy()}});req.on('end',()=>{if(!raw.trim())return resolve({});try{resolve(JSON.parse(raw))}catch{const e=new Error('JSON no vàlid');e.statusCode=400;reject(e)}});req.on('error',reject)})}
function hashSecret(value){return crypto.createHash('sha256').update(String(value||'')).digest('hex')}
function safeEqual(a,b){const aa=Buffer.from(String(a||'')),bb=Buffer.from(String(b||''));return aa.length===bb.length&&aa.length>0&&crypto.timingSafeEqual(aa,bb)}
function cookieValue(req,name){for(const item of String(req.headers.cookie||'').split(';')){const i=item.indexOf('=');if(i<0)continue;if(item.slice(0,i).trim()===name)return decodeURIComponent(item.slice(i+1).trim())}return ''}
function core(){return require('./server.js')}
function rootData(){return safeJson(DATA_FILE,{})}
function centreFiles(){if(!fs.existsSync(CENTRES_DIR))return[];return fs.readdirSync(CENTRES_DIR).filter(name=>name.endsWith('.json')).map(name=>path.join(CENTRES_DIR,name))}
function localRecords(){const out=[];for(const file of centreFiles()){const local=safeJson(file,null);if(!local||!local.centreId)continue;for(const employee of local.collections?.employees||[])out.push({employee,companyId:local.companyId||employee.companyId||'',centreId:local.centreId||employee.centreId||'',file})}const root=rootData();for(const employee of root.employees||[])out.push({employee,companyId:employee.companyId||'',centreId:employee.centreId||'',file:''});return out}
function findById(id){return localRecords().find(row=>String(row.employee?.id||'')===String(id||''))||null}
function findByCode(code,activationHash=''){return localRecords().find(row=>String(row.employee?.code||'')===String(code||'')&&row.employee?.active!==false&&(!activationHash||(row.employee.deviceActivationHash&&safeEqual(row.employee.deviceActivationHash,activationHash))))||null}
function findByToken(req){const token=cookieValue(req,'arcadi_employee_device');if(!token)return null;const tokenHash=hashSecret(token);return localRecords().find(row=>row.employee?.active!==false&&row.employee?.deviceTokenHash&&safeEqual(row.employee.deviceTokenHash,tokenHash))||null}
function scopedState(location){const root=rootData(),local=location?.centreId?safeJson(path.join(CENTRES_DIR,`${location.centreId}.json`),{collections:{}}):{collections:{}};const state={...root};for(const key of ['employees','schedules','punches','communications']){const companyRecords=(root[key]||[]).filter(item=>(item.companyId||'company_casa_mestres')===location.companyId&&(item.scope==='COMPANY'||item.scope==='CORPORATE'));state[key]=[...companyRecords,...(local.collections?.[key]||[])]}return state}
function activationKey(req,code){const ip=String(req.headers['x-forwarded-for']||'').split(',')[0].trim()||req.socket?.remoteAddress||'unknown';return `${ip}:${String(code||'')}`}
function blocked(req,code){const key=activationKey(req,code),current=activationAttempts.get(key);if(!current)return false;if(current.resetAt<=Date.now()){activationAttempts.delete(key);return false}return current.count>=8}
function failAttempt(req,code){const key=activationKey(req,code),current=activationAttempts.get(key);if(!current||current.resetAt<=Date.now())activationAttempts.set(key,{count:1,resetAt:Date.now()+15*60*1000});else current.count+=1}
function employeeCookie(res,token,body){const secure=process.env.ARCADI_DESKTOP==='1'?'':'; Secure';json(res,200,body,{'Set-Cookie':`arcadi_employee_device=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${secure}`})}
function haversine(lat1,lon1,lat2,lon2){const radius=6371000,rad=v=>v*Math.PI/180,dLat=rad(lat2-lat1),dLon=rad(lon2-lon1),a=Math.sin(dLat/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLon/2)**2;return 2*radius*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))}
async function mutateEmployee(location,change){return core().mutateData(data=>{const employee=(data.employees||[]).find(item=>item.id===location.employee.id);if(!employee)return null;return change(employee,data)}, {companyId:location.companyId,centreId:location.centreId})}

async function handleHrDevice(req,res){
  const url=new URL(req.url,'http://localhost'),pathname=url.pathname;
  const adminActivation=pathname.match(/^\/api\/employees\/([^/]+)\/device-activation$/);
  const adminUnlink=pathname.match(/^\/api\/employees\/([^/]+)\/device-unlink$/);
  const handled=Boolean(adminActivation||adminUnlink||['/api/device-activate','/api/device-session','/api/employee-schedule','/api/punch'].includes(pathname));
  if(!handled)return false;
  try{
    if(adminActivation&&req.method==='POST'){
      if(!core().requireAdmin(req,res))return true;
      const location=findById(decodeURIComponent(adminActivation[1]));
      if(!location){json(res,404,{error:'Empleat no trobat'});return true}
      const activation=await mutateEmployee(location,employee=>{const code=String(crypto.randomInt(100000,1000000));employee.deviceActivationHash=hashSecret(code);employee.deviceActivationExpiresAt=new Date(Date.now()+24*60*60*1000).toISOString();employee.deviceActivationCreatedAt=new Date().toISOString();return{code,employee:{id:employee.id,code:employee.code,name:employee.name,phone:employee.phone||''},expiresAt:employee.deviceActivationExpiresAt}});
      json(res,200,{ok:true,...activation});return true
    }
    if(adminUnlink&&req.method==='POST'){
      if(!core().requireAdmin(req,res))return true;
      const location=findById(decodeURIComponent(adminUnlink[1]));
      if(!location){json(res,404,{error:'Empleat no trobat'});return true}
      await mutateEmployee(location,employee=>{delete employee.deviceTokenHash;delete employee.deviceActivatedAt;delete employee.deviceActivationHash;delete employee.deviceActivationExpiresAt;delete employee.deviceActivationCreatedAt;return true});
      json(res,200,{ok:true});return true
    }
    if(pathname==='/api/device-activate'&&req.method==='POST'){
      const input=await readBody(req);
      if(blocked(req,input.code)){json(res,429,{error:'Massa intents. Torna-ho a provar d’aquí a 15 minuts.'});return true}
      const activationHash=hashSecret(String(input.activationCode||'')),location=findByCode(input.code,activationHash);
      if(!location||!location.employee.deviceActivationExpiresAt||Date.parse(location.employee.deviceActivationExpiresAt)<=Date.now()){failAttempt(req,input.code);json(res,401,{error:'Codi d’empleat o activació incorrecte o caducat'});return true}
      let payload;
      const token=crypto.randomBytes(32).toString('base64url');
      await mutateEmployee(location,employee=>{employee.deviceTokenHash=hashSecret(token);employee.deviceActivatedAt=new Date().toISOString();delete employee.deviceActivationHash;delete employee.deviceActivationExpiresAt;delete employee.deviceActivationCreatedAt;delete employee.schedulePin;payload={code:employee.code,name:employee.name};return true});
      activationAttempts.delete(activationKey(req,input.code));employeeCookie(res,token,{ok:true,employee:payload});return true
    }
    if(pathname==='/api/device-session'&&req.method==='GET'){
      const location=findByToken(req);if(!location){json(res,401,{error:'Dispositiu no activat'});return true}
      const root=rootData(),employee=location.employee,centre=(root.restaurants||[]).find(item=>item.id===location.centreId)||null,companyId=location.companyId||centre?.organizationId||'',company=(root.organizations||[]).find(item=>item.id===companyId)||null;
      json(res,200,{ok:true,employee:{code:employee.code,name:employee.name,level:employee.level||'',role:employee.role||employee.roleBase||''},company:company?{id:company.id,name:company.name||''}:{id:companyId,name:''},centre:centre?{id:centre.id,name:centre.name||''}:{id:location.centreId,name:''}});return true
    }
    if(pathname==='/api/employee-schedule'&&req.method==='POST'){
      const input=await readBody(req),location=findByToken(req);if(!location){json(res,401,{error:'Aquest dispositiu no està activat'});return true}
      const data=scopedState(location),employee=(data.employees||[]).find(item=>item.id===location.employee.id)||location.employee,from=String(input.from||new Date().toISOString().slice(0,10)),to=String(input.to||from);
      const items=(data.schedules||[]).filter(item=>item.employeeId===employee.id&&item.date>=from&&item.date<=to).sort((a,b)=>String(a.date).localeCompare(String(b.date))).map(item=>({date:item.date,start:item.start||'',end:item.end||'',area:item.area||'',shiftCode:item.shiftCode||'',exception:item.exception===true,notes:item.notes||''}));
      const communications=(data.communications||[]).filter(item=>item.status!=='Arxivat'&&(!item.companyId||item.companyId===location.companyId)&&(!item.centreId||item.centreId===location.centreId)&&(!Array.isArray(item.centreIds)||!item.centreIds.length||item.centreIds.includes(location.centreId))).slice(-20).map(item=>({subject:item.subject,message:item.message,priority:item.priority||'',createdAt:item.createdAt||''}));
      json(res,200,{employee:{code:employee.code,name:employee.name,level:employee.level||'',role:employee.role||employee.roleBase||'',tasks:employee.tasks||'',responsibilities:employee.responsibilities||'',notes:employee.notes||''},from,to,items,communications});return true
    }
    if(pathname==='/api/punch'&&req.method==='POST'){
      const input=await readBody(req),location=findByToken(req);if(!location){json(res,401,{error:'Aquest dispositiu no està activat'});return true}
      if(!['ENTRADA','PAUSA','TORNAR','SORTIDA'].includes(String(input.type||''))){json(res,400,{error:'Tipus de fitxatge no vàlid'});return true}
      const root=rootData(),centre=(root.restaurants||[]).find(item=>item.id===location.centreId)||null,gps=centre&&Number.isFinite(Number(centre.gpsLat))&&Number.isFinite(Number(centre.gpsLng))?{lat:centre.gpsLat,lng:centre.gpsLng,radius:centre.gpsRadius||60}:(root.company?.gps||{});
      if(![input.lat,input.lng,gps.lat,gps.lng].every(value=>Number.isFinite(Number(value)))){json(res,400,{error:'No es pot fitxar sense una ubicació GPS vàlida'});return true}
      const accuracy=Number(input.accuracy);if(!Number.isFinite(accuracy)||accuracy>100){json(res,400,{error:'La precisió del GPS és insuficient. Apropa’t al local i torna-ho a provar.'});return true}
      const distance=haversine(Number(input.lat),Number(input.lng),Number(gps.lat),Number(gps.lng)),radius=Number(gps.radius||60);if(distance>radius){json(res,403,{error:`Fitxatge bloquejat: ets a ${Math.round(distance)} m del local (radi autoritzat: ${radius} m).`});return true}
      let punch;await core().mutateData(data=>{data.punches=data.punches||[];const employee=(data.employees||[]).find(item=>item.id===location.employee.id)||location.employee;punch={id:`punch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`,employeeId:employee.id,employeeCode:employee.code,employeeName:employee.name,companyId:location.companyId,centreId:location.centreId,scope:'CENTRE',type:input.type,dateTime:new Date().toISOString(),lat:input.lat,lng:input.lng,accuracy:input.accuracy,distance:Math.round(distance),status:'DINS DE ZONA'};data.punches.push(punch)}, {companyId:location.companyId,centreId:location.centreId});
      json(res,200,{ok:true,punch});return true
    }
    json(res,405,{error:'Mètode no permès'});return true
  }catch(error){if(res.headersSent||res.writableEnded)return true;json(res,error.statusCode||500,{error:error.statusCode?error.message:'Error de RRHH / fitxatges.'});return true}
}

http.createServer=function patchedCreateServer(listener){return originalCreateServer.call(http,(req,res)=>{Promise.resolve(handleHrDevice(req,res)).then(done=>{if(!done)listener(req,res)}).catch(()=>json(res,500,{error:'Error de RRHH / fitxatges.'}))})};

module.exports={handleHrDevice,findById,findByCode,findByToken};
