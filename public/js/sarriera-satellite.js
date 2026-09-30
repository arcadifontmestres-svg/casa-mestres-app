(()=>{
'use strict';

const TOKEN_KEY='arcadi_sarriera_device_token_v1';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const today=()=>{const d=new Date(),o=d.getTimezoneOffset();return new Date(d.getTime()-o*60000).toISOString().slice(0,10)};
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
let token=localStorage.getItem(TOKEN_KEY)||'';
let state=null;
let draftIngredients=[];

function head(title,desc){return `<div class="screenHead"><div><h2>${esc(title)}</h2><p>${esc(desc)}</p></div><button class="back" onclick="SarrieraSatellite.home()">← Inici</button></div>`}
function show(html){$('centreHome').classList.add('hidden');$('screen').classList.remove('hidden');$('screen').innerHTML=html}
function home(){if(!state)return activation();$('screen').classList.add('hidden');$('centreHome').classList.remove('hidden');applyModuleVisibility();renderStatus()}
function renderStatus(text){const el=$('localStatus');if(!el)return;el.textContent=text||`● ${state?.centre?.name||'SARRIERA'} · VINCULAT`;}
function applyModuleVisibility(){
  const enabled=state?.enabledModules||{};
  document.querySelectorAll('[data-screen]').forEach(btn=>{
    const key=btn.dataset.screen;
    btn.style.display=key==='agenda'||enabled[key]!==false?'':'none';
  });
}
async function api(path,opt={}){
  const headers={'Content-Type':'application/json',...(token?{'X-Arcadi-Satellite-Token':token}:{}),...(opt.headers||{})};
  const response=await fetch(path,{...opt,headers});
  const text=await response.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={error:text}}
  if(response.status===401&&path!=='/api/satellite/sarriera/activate'){
    localStorage.removeItem(TOKEN_KEY);token='';state=null;
    activation('Aquest dispositiu encara no està validat o la vinculació ha caducat.');
    throw new Error('Dispositiu no validat');
  }
  if(!response.ok)throw new Error(data.error||`Error ${response.status}`);
  return data;
}
async function refresh(){state=await api('/api/satellite/sarriera/bootstrap');renderStatus();applyModuleVisibility();return state}

function activation(message=''){
  renderStatus('● CENTRE NO VALIDAT');
  show(`<div class="screenHead"><div><h2>Vincular aquest dispositiu</h2><p>La miniapp queda vinculada a Sarriera 1930. No dona accés a la matriu central.</p></div></div>
    <form id="activationForm" class="agendaForm" style="max-width:620px">
      ${message?`<div class="agendaAlerts"><b>${esc(message)}</b></div>`:''}
      <div class="agendaFormGrid">
        <div class="wide"><label>Codi de vinculació del centre</label><input id="activationCode" autocomplete="one-time-code" required placeholder="Codi facilitat per Direcció"></div>
        <div class="wide"><label>Nom del dispositiu</label><input id="deviceLabel" value="Sarriera · dispositiu centre" maxlength="120"></div>
      </div>
      <div class="notice"><b>Criteri:</b> el codi només valida aquest dispositiu per executar les funcions autoritzades de Sarriera. No obre ARCADI Gestió Central.</div>
      <div class="agendaFormActions"><button class="agendaPrimary" type="submit">VALIDAR CENTRE</button></div>
    </form>`);
  $('activationForm').onsubmit=async e=>{
    e.preventDefault();
    const btn=e.submitter;btn.disabled=true;btn.textContent='VALIDANT...';
    try{
      const out=await api('/api/satellite/sarriera/activate',{method:'POST',body:JSON.stringify({activationCode:$('activationCode').value.trim(),label:$('deviceLabel').value.trim()})});
      token=out.token;localStorage.setItem(TOKEN_KEY,token);await refresh();home();
    }catch(error){btn.disabled=false;btn.textContent='VALIDAR CENTRE';activation(error.message)}
  };
}

function agenda(){
  if(!state)return activation();
  const tasks=(state.tasks||[]).filter(x=>!['Arxivat','Tancada','Completat'].includes(x.status)).sort((a,b)=>`${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const reservations=(state.reservations||[]).filter(x=>!String(x.status||'').toLowerCase().includes('cancel')).sort((a,b)=>`${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  show(head('Agenda Centre','Operativa de Sarriera. El satèl·lit executa; Direcció governa des de la seva aplicació.')+`
    <div class="agendaStats">
      <div><small>RESERVES</small><b>${reservations.length}</b><span>del centre</span></div>
      <div><small>TASQUES / AVISOS</small><b>${tasks.length}</b><span>oberts</span></div>
      <div><small>PLATS / BASES</small><b>${(state.recipes||[]).length}</b><span>font mestra compartida</span></div>
      <div><small>APPCC</small><b>${(state.appcc||[]).length}</b><span>registres del centre</span></div>
    </div>
    <div class="agendaFormActions"><button class="agendaPrimary" onclick="SarrieraSatellite.newTask()">+ Tasca / avís</button></div>
    <div class="moduleGrid" style="margin-top:14px">
      <div class="moduleCard"><b>Properes reserves</b>${reservations.slice(0,6).map(x=>`<span style="display:block;margin:7px 0">${esc(x.date)} · ${esc(x.time)} · ${esc(x.name)} · ${esc(x.pax)} pax</span>`).join('')||'<span>Sense reserves registrades.</span>'}</div>
      <div class="moduleCard"><b>Tasques i avisos</b>${tasks.slice(0,8).map(x=>`<button class="agendaTask ${x.kind==='AVÍS'?'warn':''}" onclick="SarrieraSatellite.closeTask('${esc(x.id)}')"><b>${esc(x.date)} ${esc(x.time||'')} · ${esc(x.subject)}</b><small>${esc(x.responsible||'Centre')} · tocar per tancar</small></button>`).join('')||'<span>Sense tasques obertes.</span>'}</div>
    </div>`);
}
function newTask(){show(head('Nova tasca / avís','Registre operatiu de Sarriera dins la font de dades mestra.')+`<form id="taskForm" class="agendaForm"><div class="agendaFormGrid"><div><label>Tipus</label><select id="t_kind"><option>TASCA</option><option>AVÍS</option></select></div><div><label>Data</label><input id="t_date" type="date" value="${today()}"></div><div><label>Hora</label><input id="t_time" type="time"></div><div><label>Responsable</label><input id="t_resp" list="employeeList" placeholder="S1, S2, C1, Cuina, Sala..."><datalist id="employeeList">${(state.employees||[]).map(x=>`<option value="${esc(x.name)}">${esc(x.level||x.role||'')}</option>`).join('')}</datalist></div><div class="wide"><label>Assumpte</label><input id="t_subject" required></div><div class="wide"><label>Detall</label><textarea id="t_detail" rows="4"></textarea></div></div><div class="agendaFormActions"><button class="agendaPrimary" type="submit">Guardar</button><button class="back" type="button" onclick="SarrieraSatellite.agenda()">Cancel·lar</button></div></form>`);$('taskForm').onsubmit=async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;try{await api('/api/satellite/sarriera/task',{method:'POST',body:JSON.stringify({kind:$('t_kind').value,date:$('t_date').value,time:$('t_time').value,responsible:$('t_resp').value.trim(),subject:$('t_subject').value.trim(),detail:$('t_detail').value.trim()})});await refresh();agenda()}catch(error){btn.disabled=false;alert(error.message)}}}
async function closeTask(id){try{await api('/api/satellite/sarriera/task/close',{method:'POST',body:JSON.stringify({id})});await refresh();agenda()}catch(error){alert(error.message)}}

function reserves(){
  if(state?.enabledModules?.reserves===false)return home();
  const rows=[...(state.reservations||[])].sort((a,b)=>`${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  show(head('Reserves','Llibre operatiu de reserves de Sarriera. Sense accés a la matriu central.')+`
    <div class="agendaFormActions"><button class="agendaPrimary" onclick="SarrieraSatellite.newReservation()">+ Nova reserva</button></div>
    <div class="agendaForm" style="margin-top:14px"><div class="tableScroll"><table class="hoursTable"><thead><tr><th>Data</th><th>Hora</th><th>Client</th><th>Pax</th><th>Telèfon</th><th>Estat</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(x.time)}</td><td><b>${esc(x.name)}</b></td><td>${esc(x.pax)}</td><td>${esc(x.phone||'')}</td><td>${esc(x.status)}</td></tr>`).join('')||'<tr><td colspan="6">Sense reserves.</td></tr>'}</tbody></table></div></div>`);
}
function newReservation(){show(head('Nova reserva','Entrada manual autoritzada per al centre.')+`<form id="resForm" class="agendaForm"><div class="agendaFormGrid"><div><label>Data</label><input id="r_date" type="date" value="${today()}" required></div><div><label>Hora</label><input id="r_time" type="time" required></div><div><label>Nom</label><input id="r_name" required></div><div><label>Pax</label><input id="r_pax" type="number" min="1" value="2" required></div><div><label>Telèfon</label><input id="r_phone"></div><div><label>Estat</label><select id="r_status"><option>Confirmada</option><option>Pendent</option></select></div><div class="wide"><label>Observacions</label><textarea id="r_notes"></textarea></div></div><div class="agendaFormActions"><button class="agendaPrimary" type="submit">Guardar reserva</button><button class="back" type="button" onclick="SarrieraSatellite.reserves()">Cancel·lar</button></div></form>`);$('resForm').onsubmit=async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;try{await api('/api/satellite/sarriera/reservation',{method:'POST',body:JSON.stringify({date:$('r_date').value,time:$('r_time').value,name:$('r_name').value.trim(),pax:Number($('r_pax').value)||1,phone:$('r_phone').value.trim(),status:$('r_status').value,notes:$('r_notes').value.trim()})});await refresh();reserves()}catch(error){btn.disabled=false;alert(error.message)}}}

function operativa(){if(!state)return activation();show(head('Operativa','Només funcions habilitades per Direcció per a Sarriera.')+`<div class="moduleGrid">${state.enabledModules.kitchen?'<button class="moduleCard" onclick="SarrieraSatellite.kitchen()"><b>Cuina</b><span>Crear plats i bases, consultar receptari i executar operativa autoritzada.</span><em>OBRIR →</em></button>':''}${state.enabledModules.appcc?'<button class="moduleCard" onclick="SarrieraSatellite.appcc()"><b>APPCC / Control Normatiu</b><span>Registres operatius del centre.</span><em>OBRIR →</em></button>':''}</div>`)}
function kitchen(){if(state?.enabledModules?.kitchen===false)return operativa();show(head('Cuina','Interfície del satèl·lit. Cap acció obre ARCADI Gestió Central.')+`<div class="moduleGrid"><button class="moduleCard" onclick="SarrieraSatellite.newRecipe()"><b>Nou plat o base</b><span>Crear una fitxa a la font mestra, des de Sarriera.</span><em>OBRIR →</em></button><button class="moduleCard" onclick="SarrieraSatellite.recipeList()"><b>Receptari / Fitxes</b><span>${(state.recipes||[]).length} fitxes disponibles.</span><em>OBRIR →</em></button></div>`)}
function nextCode(type){const pre=type==='Base'?'BA':'PL';let max=0;for(const x of state.recipes||[]){if(x.type!==type)continue;const m=String(x.code||'').match(new RegExp('^'+pre+'(\\d+)$','i'));if(m)max=Math.max(max,Number(m[1]))}return pre+String(max+1).padStart(3,'0')}
function productPicker(){return `<details class="kfpicker" id="satProductPicker" open><summary>Seleccionar productes del catàleg mestre</summary><input id="satProductSearch" placeholder="Buscar producte..." style="width:100%;margin:8px 0"><div class="kflist" id="satProductList">${(state.products||[]).map(p=>`<label class="kfpick" data-search="${esc(norm(`${p.code||''} ${p.name||''} ${p.family||''}`))}"><input type="checkbox" data-product-id="${esc(p.id)}"> <span>${esc(p.code?`${p.code} · `:'')}${esc(p.name)}</span></label>`).join('')||'<span>No hi ha productes autoritzats.</span>'}</div><button type="button" class="agendaPrimary" id="addSelectedProducts" style="margin-top:8px">Afegir seleccionats</button></details>`}
function renderDraftIngredients(){const host=$('satIngredientRows');if(!host)return;host.innerHTML=draftIngredients.length?draftIngredients.map((line,i)=>`<div class="lineRow" style="grid-template-columns:2fr 1fr 1fr auto"><div><label>Producte</label><div class="kfSelectedItem">${esc(line.code?`${line.code} · `:'')}${esc(line.name)}</div></div><div><label>Quantitat</label><input type="number" min="0" step="0.001" value="${esc(line.qty||'')}" data-q="${i}"></div><div><label>Unitat</label><select data-u="${i}">${['kg','g','L','ml','unitat','ració','caixa','paquet','ampolla','sac'].map(u=>`<option ${u===line.unit?'selected':''}>${u}</option>`).join('')}</select></div><button type="button" class="btn bad small" data-rm="${i}">×</button></div>`).join(''):'<div class="muted" style="padding:10px">Encara no has afegit productes.</div>';
  host.querySelectorAll('[data-q]').forEach(x=>x.oninput=e=>draftIngredients[Number(e.target.dataset.q)].qty=Number(e.target.value)||0);
  host.querySelectorAll('[data-u]').forEach(x=>x.onchange=e=>draftIngredients[Number(e.target.dataset.u)].unit=e.target.value);
  host.querySelectorAll('[data-rm]').forEach(x=>x.onclick=e=>{draftIngredients.splice(Number(e.target.dataset.rm),1);renderDraftIngredients()});
}
function installProductPicker(){const search=$('satProductSearch'),list=$('satProductList'),add=$('addSelectedProducts');if(search)search.oninput=e=>{const q=norm(e.target.value);list.querySelectorAll('[data-search]').forEach(row=>row.style.display=!q||row.dataset.search.includes(q)?'':'none')};if(add)add.onclick=()=>{const have=new Set(draftIngredients.map(x=>x.productId));document.querySelectorAll('[data-product-id]:checked').forEach(c=>{if(have.has(c.dataset.productId))return;const p=(state.products||[]).find(x=>x.id===c.dataset.productId);if(!p)return;draftIngredients.push({productId:p.id,code:p.code,name:p.name,qty:0,unit:p.unit||'unitat'});have.add(p.id);c.checked=false});renderDraftIngredients()}}
function toggleRecipeFields(){const type=$('p_type')?.value||'Plat';const isBase=type==='Base';$('platFields')?.classList.toggle('hidden',isBase);$('baseFields')?.classList.toggle('hidden',!isBase);if($('p_code'))$('p_code').value=nextCode(type)}
function newRecipe(){
  draftIngredients=[];
  show(head('Nou plat o base','La fitxa es crea des del satèl·lit, però es desa a la font mestra. No s’obre la matriu central.')+`<form id="recipeForm" class="agendaForm"><div class="agendaFormGrid"><div><label>Tipus</label><select id="p_type"><option>Plat</option><option>Base</option></select></div><div><label>Codi</label><input id="p_code" value="${nextCode('Plat')}" readonly></div><div><label>Nom</label><input id="p_name" required></div><div><label>Categoria / tipus</label><input id="p_category"></div><div><label>Partida</label><input id="p_station" placeholder="C1, C2, C3..."></div><div id="platFields"><label>Racions</label><input id="p_servings" type="number" min="1" value="1"><label style="margin-top:8px">Al·lèrgens</label><input id="p_allergens"></div><div id="baseFields" class="hidden"><label>Rendiment</label><input id="p_yield" type="number" min="0" step="0.001"><label style="margin-top:8px">Unitat rendiment</label><select id="p_yield_unit">${['kg','g','L','ml','unitat','ració','caixa','paquet','ampolla','sac'].map(u=>`<option>${u}</option>`).join('')}</select></div><div class="wide">${productPicker()}</div><div class="wide"><h3>Ingredients seleccionats</h3><div id="satIngredientRows" class="lineRows"></div></div><div class="wide"><label>Elaboració</label><textarea id="p_process" rows="6"></textarea></div><div class="wide" id="platingField"><label>Acabat i emplatat</label><textarea id="p_plating" rows="3"></textarea></div></div><div class="agendaFormActions"><button class="agendaPrimary" type="submit">Guardar fitxa</button><button class="back" type="button" onclick="SarrieraSatellite.kitchen()">Cancel·lar</button></div></form>`);
  $('p_type').onchange=()=>{toggleRecipeFields();$('platingField').classList.toggle('hidden',$('p_type').value==='Base')};
  renderDraftIngredients();installProductPicker();toggleRecipeFields();
  $('recipeForm').onsubmit=async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;const type=$('p_type').value;try{await api('/api/satellite/sarriera/recipe',{method:'POST',body:JSON.stringify({type,code:$('p_code').value,name:$('p_name').value.trim(),category:$('p_category').value.trim(),station:$('p_station').value.trim(),servings:Number($('p_servings')?.value)||1,allergens:$('p_allergens')?.value.trim()||'',yield:$('p_yield')?.value||'',yieldUnit:$('p_yield_unit')?.value||'unitat',ingredients:draftIngredients,process:$('p_process').value.trim(),plating:$('p_plating')?.value.trim()||''})});await refresh();recipeList()}catch(error){btn.disabled=false;alert(error.message)}}
}
function recipeList(){const rows=[...(state.recipes||[])].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'ca'));show(head('Receptari / Fitxes','Consulta autoritzada de la font mestra des del satèl·lit.')+`<div class="agendaForm"><div class="tableScroll"><table class="hoursTable"><thead><tr><th>Codi</th><th>Tipus</th><th>Nom</th><th>Categoria / tipus</th><th>Partida</th><th>Rendiment</th></tr></thead><tbody>${rows.map(x=>`<tr><td><b>${esc(x.code||'—')}</b></td><td>${esc(x.type)}</td><td><b>${esc(x.name)}</b></td><td>${esc(x.cat||'—')}</td><td>${esc(x.station||'—')}</td><td>${esc(x.type==='Plat'?`${x.servings||1} racions`:`${x.yield??'—'} ${x.yieldUnit||''}`)}</td></tr>`).join('')||'<tr><td colspan="6">Sense fitxes.</td></tr>'}</tbody></table></div></div>`)}

function appcc(){if(state?.enabledModules?.appcc===false)return operativa();show(head('APPCC / Control Normatiu','Registres del centre. El satèl·lit no pot entrar a la configuració central.')+`<div class="agendaFormActions"><button class="agendaPrimary" onclick="SarrieraSatellite.newAppcc()">+ Nou registre</button></div><div class="agendaForm" style="margin-top:14px"><div class="tableScroll"><table class="hoursTable"><thead><tr><th>Data</th><th>Tipus</th><th>Responsable</th><th>Resultat</th></tr></thead><tbody>${(state.appcc||[]).map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(x.type)}</td><td>${esc(x.responsible)}</td><td>${esc(x.result)}</td></tr>`).join('')||'<tr><td colspan="4">Sense registres APPCC.</td></tr>'}</tbody></table></div></div>`)}
function newAppcc(){show(head('Nou registre APPCC','Registre operatiu autoritzat per al centre.')+`<form id="appccForm" class="agendaForm"><div class="agendaFormGrid"><div><label>Data</label><input id="a_date" type="date" value="${today()}"></div><div><label>Tipus</label><select id="a_type"><option>Obertura</option><option>Temperatures</option><option>Neteja</option><option>Recepció</option><option>Incidència</option></select></div><div><label>Responsable</label><input id="a_resp" list="employeeList2"><datalist id="employeeList2">${(state.employees||[]).map(x=>`<option value="${esc(x.name)}">${esc(x.level||x.role||'')}</option>`).join('')}</datalist></div><div><label>Resultat</label><select id="a_result"><option>Conforme</option><option>No conforme</option><option>Pendent</option></select></div><div class="wide"><label>Observacions</label><textarea id="a_notes"></textarea></div></div><div class="agendaFormActions"><button class="agendaPrimary" type="submit">Guardar registre</button><button class="back" type="button" onclick="SarrieraSatellite.appcc()">Cancel·lar</button></div></form>`);$('appccForm').onsubmit=async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;try{await api('/api/satellite/sarriera/appcc',{method:'POST',body:JSON.stringify({date:$('a_date').value,type:$('a_type').value,responsible:$('a_resp').value.trim(),result:$('a_result').value,notes:$('a_notes').value.trim()})});await refresh();appcc()}catch(error){btn.disabled=false;alert(error.message)}}}

async function boot(){
  document.querySelectorAll('[data-screen]').forEach(b=>b.addEventListener('click',()=>({agenda,reserves,operativa}[b.dataset.screen]||home)()));
  if(!token)return activation();
  try{await refresh();home()}catch(error){if(token)activation(error.message)}
}

window.SarrieraSatellite={home,agenda,newTask,closeTask,reserves,newReservation,operativa,kitchen,newRecipe,recipeList,appcc,newAppcc,activation};
boot();
})();
