(()=>{
'use strict';
const A=window.ArcadiERP;
if(!A)return;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
function installStyles(){
  if(document.getElementById('kitchenUiFixStyle'))return;
  const s=document.createElement('style');
  s.id='kitchenUiFixStyle';
  s.textContent=`
    .kfallgrid label,.kfpick{font-size:12px!important;line-height:1.2}
    .kfallgrid input[type="checkbox"],.kfpick input[type="checkbox"]{width:13px!important;height:13px!important;min-width:13px!important;margin:0 5px 0 0!important;vertical-align:middle}
    .kfallgrid{grid-template-columns:repeat(auto-fit,minmax(125px,1fr))!important;gap:4px!important}
    .kfpick{padding:6px 7px!important;gap:4px!important}
    .kfSelectedItem{min-height:42px;border:1px solid var(--line);background:#fff;border-radius:9px;padding:9px 10px;display:flex;align-items:center;font-size:13px;font-weight:800;color:var(--ink)}
    #ingredientRows .lineRow>div:first-child>select[data-ing="productId"],#baseRows .lineRow>div:first-child>select[data-base="baseId"]{display:none!important}
    #ingredientRows .lineRow>div:first-child>label,#baseRows .lineRow>div:first-child>label{margin-bottom:5px}
  `;
  document.head.appendChild(s);
}
function companyProducts(){
  const cid=A.context?.companyId||'';
  return (A.state?.products||[])
    .filter(x=>x.active!==false)
    .filter(x=>!cid||!x.companyId||x.companyId===cid||x.scope==='CORPORATE')
    .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'ca'));
}
function companyBases(){
  const cid=A.context?.companyId||'';
  return (A.state?.bases||[])
    .filter(x=>x.active!==false)
    .filter(x=>!cid||!x.companyId||x.companyId===cid||x.scope==='CORPORATE'||x.scope==='COMPANY')
    .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'ca'));
}
function refreshProductPicker(){
  const details=document.querySelector('details[data-kfp="p"]');
  const list=details?.querySelector('.kflist');
  if(!details||!list)return;
  const products=companyProducts();
  list.innerHTML=products.length?products.map(x=>`<label class="kfpick" data-kfr="p" data-t="${esc(norm((x.code||'')+' '+(x.name||'')+' '+(x.family||'')))}"><input type="checkbox" data-kfc="p" value="${esc(x.id)}"><span>${esc(x.code?x.code+' · ':'')}${esc(x.name||'')}</span></label>`).join(''):'<div class="muted" style="padding:8px">No hi ha productes actius al catàleg mestre de l’empresa.</div>';
  const search=details.querySelector('[data-kfs="p"]');
  if(search)search.oninput=e=>{
    const z=norm(e.target.value);
    details.querySelectorAll('[data-kfr="p"]').forEach(r=>r.style.display=!z||r.dataset.t.includes(z)?'':'none');
  };
}
function selectedText(select,records){
  const id=select?.value||'';
  const item=records.find(x=>x.id===id);
  if(item)return `${item.code?item.code+' · ':''}${item.name||''}`;
  const txt=select?.selectedOptions?.[0]?.textContent?.trim()||'';
  return txt&&txt!=='Selecciona...'?txt:'Producte pendent de seleccionar';
}
function decorateRecipeRows(){
  const products=companyProducts(),bases=companyBases();
  document.querySelectorAll('#ingredientRows .lineRow').forEach(row=>{
    const select=row.querySelector('select[data-ing="productId"]');
    const host=select?.parentElement;
    if(!select||!host)return;
    let box=host.querySelector('.kfSelectedItem');
    if(!box){box=document.createElement('div');box.className='kfSelectedItem';host.appendChild(box)}
    const text=selectedText(select,products);
    if(box.textContent!==text)box.textContent=text;
  });
  document.querySelectorAll('#baseRows .lineRow').forEach(row=>{
    const select=row.querySelector('select[data-base="baseId"]');
    const host=select?.parentElement;
    if(!select||!host)return;
    let box=host.querySelector('.kfSelectedItem');
    if(!box){box=document.createElement('div');box.className='kfSelectedItem';host.appendChild(box)}
    const text=selectedText(select,bases);
    if(box.textContent!==text)box.textContent=text;
  });
}
function watchRecipeRows(){
  ['ingredientRows','baseRows'].forEach(id=>{
    const el=document.getElementById(id);
    if(!el||el.dataset.kfObserved==='1')return;
    el.dataset.kfObserved='1';
    new MutationObserver(()=>decorateRecipeRows()).observe(el,{childList:true});
  });
  decorateRecipeRows();
}
function afterOpen(){
  installStyles();
  refreshProductPicker();
  watchRecipeRows();
}
installStyles();
const previousOpen=window.openForm;
if(typeof previousOpen==='function'){
  window.openForm=(module,id=null)=>{
    const result=previousOpen(module,id);
    if(module==='dishes'||module==='bases')setTimeout(afterOpen,30);
    return result;
  };
}
if(window.KitchenFinal?.applyPicker){
  const originalApply=window.KitchenFinal.applyPicker;
  window.KitchenFinal.applyPicker=k=>{
    const result=originalApply(k);
    setTimeout(()=>{
      decorateRecipeRows();
      const details=document.querySelector(`details[data-kfp="${k}"]`);
      if(details)details.open=false;
    },0);
    return result;
  };
}
window.addEventListener('load',()=>setTimeout(afterOpen,120));
})();
