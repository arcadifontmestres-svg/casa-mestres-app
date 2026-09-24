(()=>{
'use strict';
const core=()=>window.ArcadiCore;
const data=()=>core().getData();
const e=value=>core().esc(value);
const num=value=>core().n(value);
const id=prefix=>core().uid(prefix);
const ctx=()=>core().contextValues();

function productLines(dish,portions){
  const state=data();
  const factor=Math.max(1,num(portions))/(num(dish.servings)||1);
  const lines=[];
  for(const item of dish.ingredients||[]){
    const product=(state.products||[]).find(row=>row.id===item.productId);
    lines.push({productId:item.productId||'',productName:product?.name||item.name||'Producte pendent',qty:num(item.qty)*factor,unit:item.unit||product?.unit||'unitat',source:'PLAT'});
  }
  for(const item of dish.baseUses||[]){
    const base=(state.bases||[]).find(row=>row.id===item.baseId);
    lines.push({productId:item.baseId||'',productName:'Base: '+(item.name||base?.name||'Base pendent'),qty:num(item.qty)*factor,unit:item.unit||'unitat',source:'BASE'});
  }
  return lines;
}

function renderProductions(){
  const state=data();
  state.productionPlans=state.productionPlans||[];
  const rows=state.productionPlans.slice().reverse().map(item=>'<tr><td>'+e(item.date||'')+'</td><td><b>'+e(item.itemName)+'</b><br><span class="muted">'+e(item.notes||'')+'</span></td><td>'+e(item.qty)+' racions</td><td>'+e(item.requestedBy||'Cuina')+'</td><td><span class="badge warn">'+e(item.status||'PROPOSTA')+'</span></td><td>'+((item.needLines||[]).map(line=>e(line.productName)+': '+e(Number(line.qty||0).toFixed(2))+' '+e(line.unit)).join('<br>'))+'</td></tr>').join('');
  document.getElementById('view').innerHTML='<div class="notice"><b>Criteri operatiu:</b> cuina proposa què necessita produir. La proposta genera necessitats de producte, però no modifica estoc ni crea cap compra. Direcció revisa i autoritza.</div><div class="panel"><div class="toolbar"><button class="btn" onclick="ProductionNeeds.openProduction()">Nova proposta de producció</button></div><div class="tableWrap"><table><thead><tr><th>Data</th><th>Producció</th><th>Quantitat</th><th>Proposa</th><th>Estat</th><th>Necessitats calculades</th></tr></thead><tbody>'+(rows||'<tr><td colspan="6">Encara no hi ha propostes de producció.</td></tr>')+'</tbody></table></div></div>';
}

function openProduction(){
  const state=data();
  const dishes=state.dishes||[];
  core().openModal('Nova proposta de producció','<form id="productionForm"><div class="grid"><div><label>Plat o elaboració</label><select id="prod_dish">'+dishes.map(row=>'<option value="'+e(row.id)+'">'+e(row.name)+'</option>').join('')+'</select></div><div><label>Racions previstes</label><input id="prod_qty" type="number" min="1" step="1" value="1"></div><div><label>Data de producció</label><input id="prod_date" type="date" value="'+new Date().toISOString().slice(0,10)+'"></div><div><label>Responsable / partida</label><input id="prod_by"></div></div><div><label>Motiu o servei previst</label><textarea id="prod_notes"></textarea></div><div class="actions"><button class="btn" type="submit">Crear fitxa i necessitats</button><button class="btn secondary" type="button" onclick="closeModal()">Cancel·lar</button></div></form>');
  document.getElementById('productionForm').onsubmit=async event=>{
    event.preventDefault();
    const dish=dishes.find(row=>row.id===document.getElementById('prod_dish').value);
    if(!dish)return;
    const quantity=Math.max(1,num(document.getElementById('prod_qty').value));
    const context=ctx();
    const now=new Date().toISOString();
    const lines=productLines(dish,quantity);
    const productionId=id('production');
    const production={id:productionId,companyId:context.companyId,centreId:context.centreId,scope:'CENTRE',date:document.getElementById('prod_date').value,itemId:dish.id,itemName:dish.name,qty:quantity,requestedBy:document.getElementById('prod_by').value.trim()||'Cuina',notes:document.getElementById('prod_notes').value.trim(),status:'PROPOSTA',needLines:lines,createdAt:now};
    state.productionPlans=state.productionPlans||[];
    state.productionPlans.push(production);
    state.operationalNeeds=state.operationalNeeds||[];
    for(const line of lines)state.operationalNeeds.push({id:id('need'),companyId:context.companyId,centreId:context.centreId,scope:'CENTRE',date:production.date,area:'CUINA',productionId,productId:line.productId,productName:line.productName,qty:line.qty,unit:line.unit,requestedBy:production.requestedBy,reason:'Producció: '+dish.name,status:'PENDENT_DIRECCIO',createdAt:now});
    await core().save();
    core().closeModal();
    renderProductions();
  };
}

function summary(){
  const grouped={};
  for(const item of data().operationalNeeds||[]){
    const key=[item.centreId||'sense-centre',item.date||'',item.productId||item.productName,item.unit,item.status].join('|');
    if(!grouped[key])grouped[key]={...item,ids:[],qty:0,count:0};
    grouped[key].ids.push(item.id);
    grouped[key].qty+=num(item.qty);
    grouped[key].count+=1;
  }
  return Object.values(grouped);
}

function renderNeeds(){
  const state=data();
  state.operationalNeeds=state.operationalNeeds||[];
  const rows=summary().sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(item=>{
    const statusClass=item.status==='PENDENT_DIRECCIO'?'warn':item.status==='AUTORITZADA'?'ok':'bad';
    const buttons=item.status==='PENDENT_DIRECCIO'?'<button class="btn small" onclick=\'ProductionNeeds.decide('+JSON.stringify(item.ids)+',"AUTORITZADA")\'>Autoritzar</button> <button class="btn small bad" onclick=\'ProductionNeeds.decide('+JSON.stringify(item.ids)+',"REBUTJADA")\'>Rebutjar</button>':'—';
    return '<tr><td>'+e(item.date||'')+'</td><td>'+e(item.centreId||'Centre actual')+'</td><td>'+e(item.area||'')+'</td><td><b>'+e(item.productName)+'</b><br><span class="muted">'+item.count+' registre(s)</span></td><td>'+e(item.qty.toFixed(2))+' '+e(item.unit)+'</td><td>'+e(item.reason||'')+'</td><td><span class="badge '+statusClass+'">'+e(item.status)+'</span></td><td>'+buttons+'</td></tr>';
  }).join('');
  document.getElementById('view').innerHTML='<div class="notice"><b>Direcció controla estoc i compra:</b> aquest resum consolida les necessitats creades per cuina, sala o manteniment. Autoritzar valida la necessitat; no descompta estoc ni confirma cap compra.</div><div class="panel"><div class="toolbar"><button class="btn secondary" onclick="show(\'needs\')">Actualitzar resum</button></div><div class="tableWrap"><table><thead><tr><th>Data</th><th>Centre</th><th>Àrea</th><th>Producte / necessitat</th><th>Quantitat</th><th>Origen</th><th>Estat</th><th>Decisió</th></tr></thead><tbody>'+(rows||'<tr><td colspan="8">No hi ha necessitats registrades.</td></tr>')+'</tbody></table></div></div>';
}

async function decide(ids,status){
  const state=data();
  const now=new Date().toISOString();
  for(const item of state.operationalNeeds||[])if(ids.includes(item.id)){item.status=status;item.decidedAt=now;item.decidedBy='Direcció';}
  await core().save();
  renderNeeds();
}

window.ProductionNeeds={renderProductions,openProduction,renderNeeds,decide};
})();