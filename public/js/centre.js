(()=>{
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>Number.isFinite(Number(v))?Number(v):0;
let ctx={};try{ctx=JSON.parse(localStorage.getItem('arcadi_work_context_v1')||'{}')}catch{}
let state=null,centre=null,org=null,agendaWeekStart=mondayISO();
const DAY_NAMES=['Dilluns','Dimarts','Dimecres','Dijous','Divendres','Dissabte','Diumenge'];
const DAY_KEYS=['dl','dt','dc','dj','dv','ds','dg'];

function mondayISO(value=new Date()){
  const d=new Date(value);d.setHours(12,0,0,0);const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);return d.toISOString().slice(0,10);
}
function isoPlus(iso,days){const d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+days);return d.toISOString().slice(0,10)}
function shortDate(iso){return new Date(iso+'T12:00:00').toLocaleDateString('ca-ES',{day:'2-digit',month:'2-digit'})}
function uid(prefix='ag'){return prefix+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7)}
function contextHeaders(){return {'Content-Type':'application/json','X-Arcadi-Company-Id':ctx.companyId||centre?.organizationId||'','X-Arcadi-Centre-Id':ctx.centreId||centre?.id||''}}
async function loadState(){const r=await fetch('/api/state',{headers:contextHeaders()});if(!r.ok)throw new Error('No s’han pogut carregar les dades.');state=await r.json();centre=(state.restaurants||[]).find(x=>x.id===ctx.centreId)||null;org=(state.organizations||[]).find(x=>x.id===(ctx.companyId||centre?.organizationId))||null;renderIdentity();return state}
async function saveState(){const r=await fetch('/api/state',{method:'POST',headers:contextHeaders(),body:JSON.stringify(state)});if(!r.ok)throw new Error('No s’han pogut guardar les dades.');const out=await r.json();state=out.state||state;centre=(state.restaurants||[]).find(x=>x.id===ctx.centreId)||centre;renderIdentity();return state}
function renderIdentity(){if(centre)$('centreName').textContent=centre.name;else $('centreName').textContent='Centre de treball';if(org)$('centreContext').textContent=org.name}
async function ensureState(){if(!state)await loadState()}

function head(title,desc){return `<div class="screenHead"><div><h2>${esc(title)}</h2><p>${esc(desc)}</p></div><button class="back" onclick="CentreApp.home()">← Inici</button></div>`}
function show(html){$('centreHome').classList.add('hidden');$('screen').classList.remove('hidden');$('screen').innerHTML=html}
function home(){$('screen').classList.add('hidden');$('centreHome').classList.remove('hidden')}

function centreItems(name){if(!state)return[];const cid=centre?.id||ctx.centreId,coy=centre?.organizationId||ctx.companyId;return (state[name]||[]).filter(x=>{
  if(coy&&x.companyId&&x.companyId!==coy)return false;
  if(!cid)return !x.centreId;
  return x.centreId===cid || (Array.isArray(x.centreIds)&&x.centreIds.includes(cid));
})}
function activeReservations(){return centreItems('reservations').filter(x=>String(x.status||'').toLowerCase()!=='cancel·lada')}
function activeGroups(){return centreItems('groupEvents').filter(x=>!['cancel·lat','cancel·lada'].includes(String(x.status||'').toLowerCase()))}
function agendaItems(){return centreItems('communications').filter(x=>x.agendaDate&&['TASCA','AVIS'].includes(x.agendaKind))}
function hoursConfig(){return centre?.agendaHours||{}}
function dayHours(index){return hoursConfig()[DAY_KEYS[index]]||{lunch:{open:false,start:'13:00',end:'16:00'},dinner:{open:false,start:'20:00',end:'23:30'}}}
function serviceForTime(time=''){return String(time)>='17:00'?'dinner':'lunch'}
function openingText(index){const h=dayHours(index),parts=[];if(h.lunch?.open)parts.push(`Migdia ${h.lunch.start||''}–${h.lunch.end||''}`);if(h.dinner?.open)parts.push(`Nit ${h.dinner.start||''}–${h.dinner.end||''}`);return parts.join(' · ')||'TANCAT'}
function isOpenFor(index,time){const h=dayHours(index),s=serviceForTime(time);return Boolean(h[s]?.open)}
function dateItems(date){return {
  reservations:activeReservations().filter(x=>x.date===date),
  groups:activeGroups().filter(x=>x.date===date),
  schedules:centreItems('schedules').filter(x=>x.date===date),
  agenda:agendaItems().filter(x=>x.agendaDate===date)
}}
function conflictAlerts(days){const alerts=[];days.forEach((date,index)=>{
  const d=dateItems(date);
  [...d.reservations.map(x=>({...x,_source:'Reserva'})),...d.groups.map(x=>({...x,time:x.time||x.serviceTime||'',_source:'Grup'}))].forEach(item=>{
    if(!item.time)return;
    if(Object.keys(hoursConfig()).length&&!isOpenFor(index,item.time))alerts.push({date,time:item.time,text:`${item._source}: ${item.name||item.client||'servei'} (${item.pax||'?'} pax) fora de l’horari configurat.`});
  });
});return alerts}

async function agenda(){
  await ensureState();
  if(!centre)return show(head('Agenda Centre','Horaris, ocupació, torns, grups, tasques i avisos.')+`<div class="notice"><b>Falta identificar el centre.</b> Per provar aquesta agenda, selecciona primer un centre concret a ARCADI GESTIÓ i torna a obrir la mini app. Més endavant aquesta identificació quedarà fixada pel codi de vinculació del centre.</div>`);
  const days=Array.from({length:7},(_,i)=>isoPlus(agendaWeekStart,i));
  const alerts=conflictAlerts(days),weekRes=days.flatMap(d=>dateItems(d).reservations),weekGroups=days.flatMap(d=>dateItems(d).groups),weekTasks=days.flatMap(d=>dateItems(d).agenda).filter(x=>x.status!=='Arxivat');
  const resPax=weekRes.reduce((s,x)=>s+n(x.pax),0),groupPax=weekGroups.reduce((s,x)=>s+n(x.pax),0);
  show(head('Agenda Centre',`${centre.name} · setmana del ${shortDate(agendaWeekStart)}`)+`
    <div class="agendaToolbar">
      <button class="back" onclick="CentreApp.shiftAgenda(-7)">← Setmana anterior</button>
      <button class="agendaPrimary" onclick="CentreApp.todayAgenda()">Aquesta setmana</button>
      <button class="back" onclick="CentreApp.shiftAgenda(7)">Setmana següent →</button>
      <span class="agendaSpacer"></span>
      <button class="agendaPrimary" onclick="CentreApp.openHours()">Horari del centre</button>
      <button class="agendaPrimary" onclick="CentreApp.newAgendaItem()">+ Tasca / avís</button>
    </div>
    <div class="agendaStats">
      <div><small>RESERVES</small><b>${weekRes.length}</b><span>${resPax} pax</span></div>
      <div><small>GRUPS</small><b>${weekGroups.length}</b><span>${groupPax} pax</span></div>
      <div><small>TASQUES / AVISOS</small><b>${weekTasks.length}</b><span>pendents setmana</span></div>
      <div class="${alerts.length?'agendaStatAlert':''}"><small>ALERTES</small><b>${alerts.length}</b><span>conflictes detectats</span></div>
    </div>
    ${alerts.length?`<div class="agendaAlerts"><b>⚠ Alertes automàtiques</b>${alerts.map(a=>`<div><strong>${esc(a.date)} · ${esc(a.time)}</strong> ${esc(a.text)}</div>`).join('')}</div>`:''}
    <div class="agendaWeek">${days.map((date,i)=>renderAgendaDay(date,i)).join('')}</div>
    <div class="notice"><b>Criteri:</b> Agenda Centre no duplica Reserves ni Horaris. Reuneix en una sola vista l’horari d’obertura del centre, ocupació, grups confirmats, torns de personal, tasques i avisos. Direcció veu aquesta mateixa informació des de la matriu.</div>`);
}
function renderAgendaDay(date,index){const d=dateItems(date),pax=d.reservations.reduce((s,x)=>s+n(x.pax),0),gpax=d.groups.reduce((s,x)=>s+n(x.pax),0),pending=d.agenda.filter(x=>x.status!=='Arxivat');return `<article class="agendaDay">
  <header><div><small>${DAY_NAMES[index]}</small><b>${shortDate(date)}</b></div><span class="agendaOpen ${openingText(index)==='TANCAT'?'closed':''}">${esc(openingText(index))}</span></header>
  <div class="agendaLine"><b>Reserves</b><span>${d.reservations.length} · ${pax} pax</span></div>
  ${d.reservations.slice(0,3).map(x=>`<div class="agendaDetail">${esc(x.time||'—')} · ${esc(x.name||'Client')} · ${esc(x.pax||0)} pax</div>`).join('')}${d.reservations.length>3?`<div class="agendaMore">+ ${d.reservations.length-3} reserves</div>`:''}
  <div class="agendaLine"><b>Grups</b><span>${d.groups.length} · ${gpax} pax</span></div>
  ${d.groups.slice(0,2).map(x=>`<div class="agendaDetail">${esc(x.time||x.serviceTime||'—')} · ${esc(x.name||'Grup')} · ${esc(x.pax||0)} pax</div>`).join('')}
  <div class="agendaLine"><b>Personal</b><span>${d.schedules.length} torns</span></div>
  ${d.schedules.slice(0,2).map(x=>`<div class="agendaDetail">${esc(x.employeeName||'')} · ${esc(x.start||'')}–${esc(x.end||'')}</div>`).join('')}
  <div class="agendaLine"><b>Tasques / avisos</b><span>${pending.length}</span></div>
  ${pending.slice(0,3).map(x=>`<button class="agendaTask ${x.agendaKind==='AVIS'?'warn':''}" onclick="CentreApp.toggleAgendaItem('${esc(x.id)}')"><b>${esc(x.agendaTime||'')} ${esc(x.subject||'')}</b><small>${esc(x.recipient||x.responsible||'Centre')}</small></button>`).join('')}
</article>`}
function shiftAgenda(days){agendaWeekStart=isoPlus(agendaWeekStart,days);agenda()}
function todayAgenda(){agendaWeekStart=mondayISO();agenda()}

function openHours(){
  if(!centre)return agenda();
  const rows=DAY_NAMES.map((name,i)=>{const h=dayHours(i);return `<tr><td><b>${name}</b></td><td><label><input type="checkbox" data-h="${DAY_KEYS[i]}-lunch-open" ${h.lunch?.open?'checked':''}> Obert</label></td><td><input type="time" data-h="${DAY_KEYS[i]}-lunch-start" value="${esc(h.lunch?.start||'13:00')}"> – <input type="time" data-h="${DAY_KEYS[i]}-lunch-end" value="${esc(h.lunch?.end||'16:00')}"></td><td><label><input type="checkbox" data-h="${DAY_KEYS[i]}-dinner-open" ${h.dinner?.open?'checked':''}> Obert</label></td><td><input type="time" data-h="${DAY_KEYS[i]}-dinner-start" value="${esc(h.dinner?.start||'20:00')}"> – <input type="time" data-h="${DAY_KEYS[i]}-dinner-end" value="${esc(h.dinner?.end||'23:30')}"></td></tr>`}).join('');
  show(head('Horari del centre','Horari habitual que utilitza Agenda per detectar conflictes amb reserves i grups.')+`<div class="agendaForm"><div class="tableScroll"><table class="hoursTable"><thead><tr><th>Dia</th><th>Migdia</th><th>Horari</th><th>Nit</th><th>Horari</th></tr></thead><tbody>${rows}</tbody></table></div><div class="agendaFormActions"><button class="agendaPrimary" onclick="CentreApp.saveHours()">Guardar horari</button><button class="back" onclick="CentreApp.agenda()">Cancel·lar</button></div></div>`)
}
async function saveHours(){const cfg={};DAY_KEYS.forEach(k=>{cfg[k]={lunch:{open:Boolean(document.querySelector(`[data-h="${k}-lunch-open"]`)?.checked),start:document.querySelector(`[data-h="${k}-lunch-start"]`)?.value||'',end:document.querySelector(`[data-h="${k}-lunch-end"]`)?.value||''},dinner:{open:Boolean(document.querySelector(`[data-h="${k}-dinner-open"]`)?.checked),start:document.querySelector(`[data-h="${k}-dinner-start"]`)?.value||'',end:document.querySelector(`[data-h="${k}-dinner-end"]`)?.value||''}}});centre.agendaHours=cfg;await saveState();agenda()}

function newAgendaItem(){
  if(!centre)return agenda();
  const today=new Date().toISOString().slice(0,10);
  show(head('Nova tasca / avís','Creació autònoma del centre. Direcció també podrà crear-ne des de la matriu.')+`<form id="agendaItemForm" class="agendaForm"><div class="agendaFormGrid"><div><label>Tipus</label><select id="ai_kind"><option>TASCA</option><option>AVIS</option></select></div><div><label>Data</label><input id="ai_date" type="date" value="${today}"></div><div><label>Hora</label><input id="ai_time" type="time"></div><div><label>Responsable / destinatari</label><input id="ai_recipient" placeholder="C1, Sala, Nadia, Tot el centre..."></div><div class="wide"><label>Assumpte</label><input id="ai_subject" required placeholder="Ex. Preparar producció fondo de carn"></div><div class="wide"><label>Missatge / detall</label><textarea id="ai_message" rows="4"></textarea></div></div><div class="agendaFormActions"><button class="agendaPrimary" type="submit">Crear</button><button class="back" type="button" onclick="CentreApp.agenda()">Cancel·lar</button></div></form>`);
  $('agendaItemForm').onsubmit=async e=>{e.preventDefault();state.communications=state.communications||[];state.communications.push({id:uid('comm'),companyId:centre.organizationId||ctx.companyId,centreId:centre.id,scope:'CENTRE',agendaKind:$('ai_kind').value,agendaDate:$('ai_date').value,agendaTime:$('ai_time').value,subject:$('ai_subject').value.trim(),recipient:$('ai_recipient').value.trim(),message:$('ai_message').value.trim(),channel:'Intern',status:'Pendent',createdAt:new Date().toISOString()});await saveState();agendaWeekStart=mondayISO($('ai_date').value?new Date($('ai_date').value+'T12:00:00'):new Date());agenda()}
}
async function toggleAgendaItem(id){const x=(state.communications||[]).find(v=>v.id===id);if(!x)return;x.status=x.status==='Arxivat'?'Pendent':'Arxivat';x.updatedAt=new Date().toISOString();await saveState();agenda()}

function reserves(){show(head('Reserves','Llibre de reserves i gestió operativa pròpia del centre.')+`<div class="notice">Les reserves confirmades pertanyen a l’Agenda/Ocupació única. El centre pot corregir pax, hora, trona i observacions operatives.</div>`)}
function operativa(){show(head('Operativa','Funcions autoritzades per Direcció per a aquest centre.')+`<div class="moduleGrid"><button class="moduleCard" onclick="CentreApp.cuina()"><b>Cuina</b><span>Nou plat o base, receptari, produccions i llista de necessitats.</span><em>OBRIR →</em></button><a class="moduleCard linkCard" href="/control_normatiu.html"><b>APPCC / Control Normatiu</b><span>Registres transversals del centre. Accessible fora de Cuina.</span><em>OBRIR →</em></a></div><div class="notice">La resta de funcions d’Operativa s’afegiran quan quedin definides i Direcció les activi.</div>`)}
function goKitchen(target){localStorage.setItem('arcadi_kitchen_target_v1',target);location.href='/#kitchen'}
function cuina(){show(head('Cuina','Funció estàndard del centre.')+`<div class="moduleGrid"><button class="moduleCard" onclick="CentreApp.goKitchen('new')"><b>Nou plat o base</b><span>Crear la fitxa mestra culinària.</span><em>OBRIR →</em></button><button class="moduleCard" onclick="CentreApp.goKitchen('recipes')"><b>Receptari / Fitxes</b><span>Consultar plats i bases sense dades econòmiques.</span><em>OBRIR →</em></button><button class="moduleCard" onclick="CentreApp.goKitchen('productions')"><b>Produccions</b><span>Programar quantitats a produir a partir de la recepta.</span><em>OBRIR →</em></button><button class="moduleCard" onclick="CentreApp.goKitchen('needs')"><b>Llista de necessitats</b><span>Mancances de producte vinculades a stock i producció.</span><em>OBRIR →</em></button></div>`)}

document.querySelectorAll('[data-screen]').forEach(b=>b.addEventListener('click',()=>({agenda,reserves,operativa}[b.dataset.screen]||home)()));
window.CentreApp={home,agenda,reserves,operativa,cuina,goKitchen,shiftAgenda,todayAgenda,openHours,saveHours,newAgendaItem,toggleAgendaItem};
loadState().catch(()=>renderIdentity());
})();
