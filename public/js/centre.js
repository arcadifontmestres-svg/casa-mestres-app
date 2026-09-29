(()=>{
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let ctx={};try{ctx=JSON.parse(localStorage.getItem('arcadi_work_context_v1')||'{}')}catch{}

async function loadIdentity(){
  try{
    const r=await fetch('/api/state');
    if(!r.ok)return;
    const state=await r.json();
    const centre=(state.restaurants||[]).find(x=>x.id===ctx.centreId);
    const org=(state.organizations||[]).find(x=>x.id===(ctx.companyId||centre?.organizationId));
    if(centre)$('centreName').textContent=centre.name;
    if(org)$('centreContext').textContent=org.name;
  }catch{}
}

function head(title,desc){return `<div class="screenHead"><div><h2>${esc(title)}</h2><p>${esc(desc)}</p></div><button class="back" onclick="CentreApp.home()">← Inici</button></div>`}
function show(html){$('centreHome').classList.add('hidden');$('screen').classList.remove('hidden');$('screen').innerHTML=html}
function home(){$('screen').classList.add('hidden');$('centreHome').classList.remove('hidden')}
function agenda(){show(head('Agenda Centre','Horaris, torns, ocupació, grups, tasques i avisos del centre.')+`<div class="notice">Aquest mòdul es connectarà amb l’agenda única del centre. No crea una segona agenda.</div>`)}
function reserves(){show(head('Reserves','Llibre de reserves i gestió operativa pròpia del centre.')+`<div class="notice">Les reserves confirmades pertanyen a l’Agenda/Ocupació única. El centre pot corregir pax, hora, trona i observacions operatives.</div>`)}
function operativa(){show(head('Operativa','Funcions autoritzades per Direcció per a aquest centre.')+`<div class="moduleGrid"><button class="moduleCard" onclick="CentreApp.cuina()"><b>Cuina</b><span>Nou plat o base, receptari, produccions i llista de necessitats.</span><em>OBRIR →</em></button><a class="moduleCard linkCard" href="/control_normatiu.html"><b>APPCC / Control Normatiu</b><span>Registres transversals del centre. Accessible fora de Cuina.</span><em>OBRIR →</em></a></div><div class="notice">La resta de funcions d’Operativa s’afegiran quan quedin definides i Direcció les activi.</div>`)}
function goKitchen(target){localStorage.setItem('arcadi_kitchen_target_v1',target);location.href='/#kitchen'}
function cuina(){show(head('Cuina','Funció estàndard del centre.')+`<div class="moduleGrid"><button class="moduleCard" onclick="CentreApp.goKitchen('new')"><b>Nou plat o base</b><span>Crear la fitxa mestra culinària.</span><em>OBRIR →</em></button><button class="moduleCard" onclick="CentreApp.goKitchen('recipes')"><b>Receptari / Fitxes</b><span>Consultar plats i bases sense dades econòmiques.</span><em>OBRIR →</em></button><button class="moduleCard" onclick="CentreApp.goKitchen('productions')"><b>Produccions</b><span>Programar quantitats a produir a partir de la recepta.</span><em>OBRIR →</em></button><button class="moduleCard" onclick="CentreApp.goKitchen('needs')"><b>Llista de necessitats</b><span>Mancances de producte vinculades a stock i producció.</span><em>OBRIR →</em></button></div>`)}

document.querySelectorAll('[data-screen]').forEach(b=>b.addEventListener('click',()=>({agenda,reserves,operativa}[b.dataset.screen]||home)()));
window.CentreApp={home,agenda,reserves,operativa,cuina,goKitchen};
loadIdentity();
})();
