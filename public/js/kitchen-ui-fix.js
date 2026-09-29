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
installStyles();
const previousOpen=window.openForm;
if(typeof previousOpen==='function'){
  window.openForm=(module,id=null)=>{
    const result=previousOpen(module,id);
    if(module==='dishes'||module==='bases')setTimeout(()=>{installStyles();refreshProductPicker();},20);
    return result;
  };
}
window.addEventListener('load',()=>setTimeout(()=>{installStyles();refreshProductPicker();},100));
})();
