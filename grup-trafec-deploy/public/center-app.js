'use strict';
const TOKEN_KEY='arcadi_center_device_token_v1';
const DIRECTION_KEY='arcadi_direction_center_token_v1';
const params=new URLSearchParams(location.search);
const incoming=params.get('direction_token')||'';
if(incoming){sessionStorage.setItem(DIRECTION_KEY,incoming);params.delete('direction_token');const query=params.toString();history.replaceState({},'',location.pathname+(query?'?'+query:'')+location.hash);}
const token=incoming||sessionStorage.getItem(DIRECTION_KEY)||localStorage.getItem(TOKEN_KEY)||'';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path,opt={}){
 const r=await fetch(path,{...opt,headers:{'Content-Type':'application/json','X-Center-Device-Token':token,...(opt.headers||{})}});
 const d=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(d.error||'Error '+r.status);
 return d;
}
function shellTitle(title,centre){
 document.title=(centre?.name?centre.name+' · ':'')+title;
 const c=$('centreName'); if(c)c.textContent=centre?.name||centre?.code||'Centre';
 const s=$('status'); if(s)s.textContent='AUTORITZAT';
}
function blocked(error){
 const s=$('status');if(s)s.textContent='BLOQUEJAT';
 const c=$('content');if(c)c.innerHTML='<div class="err">'+esc(error.message||error)+'</div>';
}
async function sessionFor(key){
 const out=await api('/api/govern/center-module/'+encodeURIComponent(key));
 return out;
}
function backButton(){location.href=(incoming||sessionStorage.getItem(DIRECTION_KEY))?'/':'/centre.html'}
