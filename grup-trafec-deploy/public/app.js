'use strict';

const view = document.getElementById('view');
const statusEl = document.getElementById('status');
let contacts = [];
let segments = ['Nou','Habitual','Empresa','Grup','VIP'];
let proposals = [];
let commercialStatus = {};
let reservationRows = [];
let occupancyData = { reservations: [], blocks: [], totals: { reservations: 0, confirmed: 0, paxConfirmed: 0 } };
let reservationStatus = {};
let reservationFilter = { dateFrom: '', dateTo: '' };

function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function api(url, options={}){
  const response = await fetch(url,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  const data = await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.error||`Error ${response.status}`);
  return data;
}
function setStatus(text=''){statusEl.textContent=text}
function setActive(name){document.querySelectorAll('.side button').forEach(x=>x.classList.toggle('active',x.dataset.view===name))}
function money(value){return `${(Number(value)||0).toFixed(2).replace('.',',')} €`}
function statusLabel(value){return ({ESBORRANY:'Esborrany',PENDENT_VALIDACIO:'Pendent validació',VALIDADA:'Validada',ENVIADA:'Enviada',ACCEPTADA:'Acceptada',REBUTJADA:'Rebutjada',CANCEL_LADA:'Cancel·lada',PENDENT:'Pendent',CONFIRMADA:'Confirmada'})[value]||value||''}
function queryString(params){const q=new URLSearchParams();Object.entries(params||{}).forEach(([k,v])=>{if(v)q.set(k,v)});const s=q.toString();return s?`?${s}`:''}

async function loadCrm(q=''){
  setStatus('Carregant...');
  const out=await api('/api/crm/contacts'+(q?`?q=${encodeURIComponent(q)}`:''));
  contacts=out.items||[];segments=out.segments||segments;
  renderCrm();setStatus(`${contacts.length} contactes`);
}
function renderCrm(){
  view.innerHTML=`
    <div class="head"><div><h1>CRM</h1><div class="muted">Contactes, preferències i seguiment comercial del Grup Tràfec.</div></div><button class="btn" id="newContact">+ Nou contacte</button></div>
    <div class="panel toolbar"><input id="search" placeholder="Buscar per nom, telèfon, email, segment..." style="max-width:420px"><button class="btn secondary" id="searchBtn">Buscar</button><button class="btn secondary" id="clearBtn">Netejar</button></div>
    <div class="panel tableWrap"><table><thead><tr><th>Client</th><th>Telèfon</th><th>Email</th><th>Segment</th><th></th></tr></thead><tbody>
      ${contacts.map(c=>`<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.phone)}</td><td>${esc(c.email)}</td><td>${esc(c.segment)}</td><td><button class="rowBtn" data-edit="${esc(c.id)}">Editar</button></td></tr>`).join('')||'<tr><td colspan="5" class="empty">Encara no hi ha contactes CRM.</td></tr>'}
    </tbody></table></div>`;
  document.getElementById('newContact').onclick=()=>renderContactForm();
  document.getElementById('searchBtn').onclick=()=>loadCrm(document.getElementById('search').value.trim()).catch(showError);
  document.getElementById('clearBtn').onclick=()=>loadCrm().catch(showError);
  document.getElementById('search').onkeydown=e=>{if(e.key==='Enter')loadCrm(e.target.value.trim()).catch(showError)};
  document.querySelectorAll('[data-edit]').forEach(btn=>btn.onclick=()=>renderContactForm(contacts.find(x=>x.id===btn.dataset.edit)));
}
function renderContactForm(contact=null){
  const c=contact||{};
  view.innerHTML=`
    <div class="head"><div><h1>${contact?'Editar contacte':'Nou contacte'}</h1><div class="muted">CRM global de Grup Tràfec.</div></div><button class="btn secondary" id="back">← CRM</button></div>
    <form class="panel" id="contactForm"><div class="grid">
      <div><label>Nom *</label><input id="f_name" required value="${esc(c.name||'')}"></div>
      <div><label>Segment</label><select id="f_segment">${segments.map(s=>`<option ${s===c.segment?'selected':''}>${esc(s)}</option>`).join('')}</select></div>
      <div><label>Telèfon</label><input id="f_phone" value="${esc(c.phone||'')}"></div>
      <div><label>Email</label><input id="f_email" type="email" value="${esc(c.email||'')}"></div>
      <div class="wide"><label>Preferències i al·lèrgies</label><textarea id="f_preferences">${esc(c.preferences||'')}</textarea></div>
      <div class="wide"><label>Notes</label><textarea id="f_notes">${esc(c.notes||'')}</textarea></div>
      <div class="wide"><label><input id="f_active" type="checkbox" style="width:auto" ${c.active===false?'':'checked'}> Actiu</label></div>
    </div><div class="toolbar" style="margin-top:16px"><button class="btn" type="submit">Guardar</button><button class="btn secondary" type="button" id="cancel">Cancel·lar</button></div></form>`;
  document.getElementById('back').onclick=()=>loadCrm().catch(showError);
  document.getElementById('cancel').onclick=()=>loadCrm().catch(showError);
  document.getElementById('contactForm').onsubmit=async e=>{
    e.preventDefault();setStatus('Guardant...');
    const field=id=>document.getElementById(id);
    const payload={name:field('f_name').value.trim(),phone:field('f_phone').value.trim(),email:field('f_email').value.trim(),segment:field('f_segment').value,preferences:field('f_preferences').value.trim(),notes:field('f_notes').value.trim(),active:field('f_active').checked};
    try{
      if(contact) await api(`/api/crm/contacts/${encodeURIComponent(contact.id)}`,{method:'PUT',body:JSON.stringify(payload)});
      else await api('/api/crm/contacts',{method:'POST',body:JSON.stringify(payload)});
      await loadCrm();setStatus('Guardat');
    }catch(error){showError(error)}
  };
}

async function loadCommercial(){
  setStatus('Carregant...');
  const [proposalOut,contactOut]=await Promise.all([api('/api/comercial/proposals'),api('/api/crm/contacts?includeInactive=1')]);
  proposals=proposalOut.items||[];commercialStatus=proposalOut.status||{};contacts=contactOut.items||[];segments=contactOut.segments||segments;
  renderCommercial();setStatus(`${proposals.length} propostes`);
}
function commercialActions(p){
  const buttons=[];
  if(['ESBORRANY','PENDENT_VALIDACIO','VALIDADA'].includes(p.status)) buttons.push(`<button class="rowBtn" data-edit-proposal="${esc(p.id)}">Editar</button>`);
  if(p.status==='ESBORRANY') buttons.push(`<button class="rowBtn" data-status="PENDENT_VALIDACIO" data-id="${esc(p.id)}">Enviar a validació</button>`);
  if(p.status==='PENDENT_VALIDACIO') buttons.push(`<button class="rowBtn" data-status="VALIDADA" data-id="${esc(p.id)}">Validar</button>`);
  if(p.status==='VALIDADA') buttons.push(`<button class="rowBtn" data-status="ENVIADA" data-id="${esc(p.id)}">Marcar enviada</button>`);
  if(p.status==='ENVIADA'){
    buttons.push(`<button class="rowBtn" data-status="ACCEPTADA" data-id="${esc(p.id)}">Acceptada</button>`);
    buttons.push(`<button class="rowBtn" data-status="REBUTJADA" data-id="${esc(p.id)}">Rebutjada</button>`);
  }
  return buttons.join(' · ');
}
function renderCommercial(){
  view.innerHTML=`
    <div class="head"><div><h1>Comercial / Grups</h1><div class="muted">Propostes comercials globals vinculades al CRM.</div></div><button class="btn" id="newProposal">+ Nova proposta</button></div>
    <div class="panel"><div class="muted">Flux: Esborrany → Pendent validació → Validada → Enviada → Acceptada/Rebutjada. Quan una proposta queda acceptada, passa automàticament a Reserves / Ocupació.</div></div>
    <div class="panel tableWrap"><table><thead><tr><th>Codi</th><th>Client</th><th>Servei</th><th>Pax</th><th>Menú</th><th>Total</th><th>Estat</th><th></th></tr></thead><tbody>
    ${proposals.map(p=>`<tr><td><b>${esc(p.code)}</b></td><td>${esc(p.clientName)}</td><td>${esc(p.eventDate)} ${esc(p.eventTime||'')}</td><td>${esc(p.pax)}</td><td>${esc(p.menuName||'—')}</td><td>${money(p.totalAmount)}</td><td>${esc(statusLabel(p.status))}</td><td>${commercialActions(p)}</td></tr>`).join('')||'<tr><td colspan="8" class="empty">Encara no hi ha propostes comercials.</td></tr>'}
    </tbody></table></div>`;
  document.getElementById('newProposal').onclick=()=>renderProposalForm();
  document.querySelectorAll('[data-edit-proposal]').forEach(btn=>btn.onclick=()=>renderProposalForm(proposals.find(x=>x.id===btn.dataset.editProposal)));
  document.querySelectorAll('[data-status]').forEach(btn=>btn.onclick=()=>changeProposalStatus(btn.dataset.id,btn.dataset.status));
}
function renderProposalForm(proposal=null){
  const p=proposal||{};
  view.innerHTML=`
    <div class="head"><div><h1>${proposal?'Editar proposta':'Nova proposta comercial'}</h1><div class="muted">Funció global de Grup Tràfec.</div></div><button class="btn secondary" id="backCommercial">← Comercial</button></div>
    <form class="panel" id="proposalForm"><div class="grid">
      <div class="wide"><label>Client existent</label><select id="p_client"><option value="">— Crear / escriure client —</option>${contacts.map(c=>`<option value="${esc(c.id)}" ${c.id===p.clientId?'selected':''}>${esc(c.name)}${c.phone?` · ${esc(c.phone)}`:''}</option>`).join('')}</select></div>
      <div><label>Nom client</label><input id="p_name" value="${esc(p.clientName||'')}"></div>
      <div><label>Telèfon</label><input id="p_phone" value="${esc(p.clientPhone||'')}"></div>
      <div><label>Email</label><input id="p_email" type="email" value="${esc(p.clientEmail||'')}"></div>
      <div><label>Data servei *</label><input id="p_date" type="date" required value="${esc(p.eventDate||'')}"></div>
      <div><label>Hora</label><input id="p_time" type="time" value="${esc(p.eventTime||'')}"></div>
      <div><label>Pax *</label><input id="p_pax" type="number" min="1" value="${esc(p.pax||1)}"></div>
      <div><label>Menú / proposta</label><input id="p_menu" value="${esc(p.menuName||'')}"></div>
      <div><label>Preu per persona</label><input id="p_price" type="number" min="0" step="0.01" value="${esc(p.pricePerPerson||0)}"></div>
      <div class="wide"><label>Notes</label><textarea id="p_notes">${esc(p.notes||'')}</textarea></div>
    </div><div class="toolbar" style="margin-top:16px"><button class="btn" type="submit">Guardar proposta</button><button class="btn secondary" type="button" id="cancelProposal">Cancel·lar</button></div></form>`;
  const goBack=()=>loadCommercial().catch(showError);
  document.getElementById('backCommercial').onclick=goBack;document.getElementById('cancelProposal').onclick=goBack;
  const clientSelect=document.getElementById('p_client');
  clientSelect.onchange=()=>{const c=contacts.find(x=>x.id===clientSelect.value);if(c){document.getElementById('p_name').value=c.name||'';document.getElementById('p_phone').value=c.phone||'';document.getElementById('p_email').value=c.email||'';}};
  document.getElementById('proposalForm').onsubmit=async e=>{
    e.preventDefault();const f=id=>document.getElementById(id);const payload={clientId:f('p_client').value,clientName:f('p_name').value.trim(),clientPhone:f('p_phone').value.trim(),clientEmail:f('p_email').value.trim(),eventDate:f('p_date').value,eventTime:f('p_time').value,pax:Number(f('p_pax').value)||1,menuName:f('p_menu').value.trim(),pricePerPerson:Number(f('p_price').value)||0,notes:f('p_notes').value.trim()};
    try{setStatus('Guardant...');if(proposal)await api(`/api/comercial/proposals/${encodeURIComponent(proposal.id)}`,{method:'PUT',body:JSON.stringify(payload)});else await api('/api/comercial/proposals',{method:'POST',body:JSON.stringify(payload)});await loadCommercial();setStatus('Guardat');}catch(error){showError(error)}
  };
}
async function changeProposalStatus(id,status){try{setStatus('Actualitzant...');await api(`/api/comercial/proposals/${encodeURIComponent(id)}/status`,{method:'PATCH',body:JSON.stringify({status})});await loadCommercial();}catch(error){showError(error)}}

async function loadReservations(){
  setStatus('Carregant...');
  const qs=queryString(reservationFilter);
  const [rowsOut,occupancyOut]=await Promise.all([api('/api/reserves'+qs),api('/api/reserves/ocupacio/resum'+qs)]);
  reservationRows=rowsOut.items||[];reservationStatus=rowsOut.status||{};occupancyData=occupancyOut||occupancyData;
  renderReservations();setStatus(`${reservationRows.length} reserves`);
}
function renderReservations(){
  const totals=occupancyData.totals||{};
  view.innerHTML=`
    <div class="head"><div><h1>Reserves / Ocupació</h1><div class="muted">Agenda única: reserves manuals + grups comercials acceptats + bloquejos interns.</div></div><div class="toolbar"><button class="btn secondary" id="newBlock">+ Bloqueig</button><button class="btn" id="newReservation">+ Nova reserva</button></div></div>
    <div class="grid" style="margin-bottom:18px"><div class="panel"><div class="muted">Reserves actives</div><div style="font-size:28px;font-weight:800">${esc(totals.reservations||0)}</div></div><div class="panel"><div class="muted">Pax confirmats</div><div style="font-size:28px;font-weight:800">${esc(totals.paxConfirmed||0)}</div></div></div>
    <div class="panel toolbar"><div><label>Des de</label><input id="r_from" type="date" value="${esc(reservationFilter.dateFrom)}"></div><div><label>Fins</label><input id="r_to" type="date" value="${esc(reservationFilter.dateTo)}"></div><button class="btn secondary" id="applyReservationFilter">Aplicar</button><button class="btn secondary" id="clearReservationFilter">Netejar</button></div>
    <div class="panel tableWrap"><h3>Agenda</h3><table><thead><tr><th>Codi</th><th>Data</th><th>Client</th><th>Pax</th><th>Origen</th><th>Estat</th><th></th></tr></thead><tbody>${reservationRows.map(r=>`<tr><td><b>${esc(r.code)}</b></td><td>${esc(r.date)} ${esc(r.time||'')}</td><td>${esc(r.name)}</td><td>${esc(r.pax)}</td><td>${esc(r.source||'MANUAL')}</td><td>${esc(statusLabel(r.status))}</td><td><button class="rowBtn" data-edit-reservation="${esc(r.id)}">Editar</button></td></tr>`).join('')||'<tr><td colspan="7" class="empty">No hi ha reserves en aquest període.</td></tr>'}</tbody></table></div>
    <div class="panel tableWrap"><h3>Bloquejos d’ocupació</h3><table><thead><tr><th>Data</th><th>Motiu</th><th>Notes</th></tr></thead><tbody>${(occupancyData.blocks||[]).map(b=>`<tr><td>${esc(b.date)} ${esc(b.time||'')}</td><td><b>${esc(b.reason)}</b></td><td>${esc(b.notes||'')}</td></tr>`).join('')||'<tr><td colspan="3" class="empty">No hi ha bloquejos en aquest període.</td></tr>'}</tbody></table></div>`;
  document.getElementById('newReservation').onclick=()=>renderReservationForm();
  document.getElementById('newBlock').onclick=()=>renderBlockForm();
  document.getElementById('applyReservationFilter').onclick=()=>{reservationFilter={dateFrom:document.getElementById('r_from').value,dateTo:document.getElementById('r_to').value};loadReservations().catch(showError)};
  document.getElementById('clearReservationFilter').onclick=()=>{reservationFilter={dateFrom:'',dateTo:''};loadReservations().catch(showError)};
  document.querySelectorAll('[data-edit-reservation]').forEach(btn=>btn.onclick=()=>renderReservationForm(reservationRows.find(x=>x.id===btn.dataset.editReservation)));
}
function renderReservationForm(reservation=null){
  const r=reservation||{};
  view.innerHTML=`
    <div class="head"><div><h1>${reservation?'Editar reserva':'Nova reserva'}</h1><div class="muted">Registre únic d’agenda i ocupació.</div></div><button class="btn secondary" id="backReservations">← Reserves</button></div>
    <form class="panel" id="reservationForm"><div class="grid">
      <div><label>Data *</label><input id="r_date" type="date" required value="${esc(r.date||'')}"></div>
      <div><label>Hora</label><input id="r_time" type="time" value="${esc(r.time||'')}"></div>
      <div><label>Nom *</label><input id="r_name" required value="${esc(r.name||'')}"></div>
      <div><label>Pax *</label><input id="r_pax" type="number" min="1" value="${esc(r.pax||1)}"></div>
      <div><label>Telèfon</label><input id="r_phone" value="${esc(r.phone||'')}"></div>
      <div><label>Email</label><input id="r_email" type="email" value="${esc(r.email||'')}"></div>
      <div><label>Zona</label><input id="r_zone" value="${esc(r.zone||'')}"></div>
      <div><label>Menú / servei</label><input id="r_menu" value="${esc(r.menuName||'')}"></div>
      <div><label>Estat</label><select id="r_status"><option value="PENDENT" ${r.status==='PENDENT'?'selected':''}>Pendent</option><option value="CONFIRMADA" ${r.status!=='PENDENT'&&r.status!=='CANCEL_LADA'?'selected':''}>Confirmada</option><option value="CANCEL_LADA" ${r.status==='CANCEL_LADA'?'selected':''}>Cancel·lada</option></select></div>
      <div><label>Origen</label><input value="${esc(r.source||'MANUAL')}" disabled></div>
      <div class="wide"><label>Notes</label><textarea id="r_notes">${esc(r.notes||'')}</textarea></div>
    </div><div class="toolbar" style="margin-top:16px"><button class="btn" type="submit">Guardar reserva</button><button class="btn secondary" type="button" id="cancelReservation">Cancel·lar</button></div></form>`;
  const back=()=>loadReservations().catch(showError);document.getElementById('backReservations').onclick=back;document.getElementById('cancelReservation').onclick=back;
  document.getElementById('reservationForm').onsubmit=async e=>{e.preventDefault();const f=id=>document.getElementById(id);const payload={date:f('r_date').value,time:f('r_time').value,name:f('r_name').value.trim(),pax:Number(f('r_pax').value)||1,phone:f('r_phone').value.trim(),email:f('r_email').value.trim(),zone:f('r_zone').value.trim(),menuName:f('r_menu').value.trim(),status:f('r_status').value,notes:f('r_notes').value.trim(),source:r.source||'MANUAL'};try{setStatus('Guardant...');if(reservation)await api(`/api/reserves/${encodeURIComponent(reservation.id)}`,{method:'PUT',body:JSON.stringify(payload)});else await api('/api/reserves',{method:'POST',body:JSON.stringify(payload)});await loadReservations();setStatus('Guardat');}catch(error){showError(error)}};
}
function renderBlockForm(){
  view.innerHTML=`<div class="head"><div><h1>Nou bloqueig d’ocupació</h1><div class="muted">Per tancament, manteniment, reserva interna o qualsevol indisponibilitat.</div></div><button class="btn secondary" id="backBlocks">← Reserves</button></div><form class="panel" id="blockForm"><div class="grid"><div><label>Data *</label><input id="b_date" type="date" required></div><div><label>Hora</label><input id="b_time" type="time"></div><div class="wide"><label>Motiu *</label><input id="b_reason" required></div><div class="wide"><label>Notes</label><textarea id="b_notes"></textarea></div></div><div class="toolbar" style="margin-top:16px"><button class="btn" type="submit">Guardar bloqueig</button><button class="btn secondary" type="button" id="cancelBlock">Cancel·lar</button></div></form>`;
  const back=()=>loadReservations().catch(showError);document.getElementById('backBlocks').onclick=back;document.getElementById('cancelBlock').onclick=back;
  document.getElementById('blockForm').onsubmit=async e=>{e.preventDefault();const f=id=>document.getElementById(id);try{setStatus('Guardant...');await api('/api/reserves/ocupacio/bloquejos',{method:'POST',body:JSON.stringify({date:f('b_date').value,time:f('b_time').value,reason:f('b_reason').value.trim(),notes:f('b_notes').value.trim()})});await loadReservations();setStatus('Guardat');}catch(error){showError(error)}};
}

function renderHome(){view.innerHTML=`<div class="head"><div><h1>GRUP TRÀFEC</h1><div class="muted">Gestió central del grup.</div></div></div><div class="panel"><b>Nucli nou actiu.</b><p>Les funcions es construeixen aquí una sola vegada. CRM, Comercial/Grups i Reserves/Ocupació ja comparteixen la mateixa font de dades.</p></div>`;setStatus('')}
function showError(error){setStatus('Error');alert(error.message||error)}

document.querySelector('[data-view="home"]').onclick=()=>{setActive('home');renderHome()};
document.querySelector('[data-view="crm"]').onclick=()=>{setActive('crm');loadCrm().catch(showError)};
document.querySelector('[data-view="commercial"]').onclick=()=>{setActive('commercial');loadCommercial().catch(showError)};
document.querySelector('[data-view="reservations"]').onclick=()=>{setActive('reservations');loadReservations().catch(showError)};
renderHome();
