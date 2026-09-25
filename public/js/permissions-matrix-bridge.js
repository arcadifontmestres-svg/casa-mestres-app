(()=>{'use strict';
const EXTRA_MODULES=['Sala / TPV','Documents','Còpies de seguretat','Cuina','Reserves','RRHH'];
const ACTIONS=['Consultar','Crear','Editar','Eliminar','Imprimir'];
const originalFetch=window.fetch.bind(window);
let pendingMatrix=null;
let wrappingOpenPermission=false;

function contextHeaders(){
  try{
    const ctx=JSON.parse(localStorage.getItem('arcadi_work_context_v1')||'{}');
    return {'X-Arcadi-Company-Id':ctx.companyId||'','X-Arcadi-Centre-Id':ctx.centreId||''};
  }catch{return {};}
}

function fullActionMatrix(){
  return Object.fromEntries(EXTRA_MODULES.concat(['Inventari','APPCC','Horaris','Fitxatges GPS','Criteris de torns','Resum d’hores','Tasques'])
    .map(module=>[module,Object.fromEntries(ACTIONS.map(action=>[action,true]))]));
}

async function directionUnlocked(){
  try{
    const response=await originalFetch('/api/direction/status',{headers:{'Content-Type':'application/json',...contextHeaders()}});
    if(!response.ok)return false;
    const state=await response.json();
    return state.unlocked===true;
  }catch{return false;}
}

function withRuntimeDirectionPermission(state){
  if(!state||typeof state!=='object')return state;
  const permissions=Array.isArray(state.permissions)?state.permissions.slice():[];
  permissions.push({
    id:'__arcadi_direction_runtime__',
    companyId:'',
    centreId:'',
    employeeId:'__direction__',
    employeeName:'Direcció',
    level:'Direcció',
    matrix:fullActionMatrix(),
    runtimeOnly:true
  });
  return {...state,permissions};
}

function stripRuntimePermission(state){
  if(!state||typeof state!=='object')return state;
  if(Array.isArray(state.permissions)){
    state.permissions=state.permissions.filter(item=>item?.id!=='__arcadi_direction_runtime__');
  }
  return state;
}

function applyPendingMatrix(state){
  if(!pendingMatrix||!Array.isArray(state?.permissions))return state;
  const candidates=state.permissions.filter(item=>
    item?.companyId===pendingMatrix.companyId &&
    item?.centreId===pendingMatrix.centreId &&
    item?.employeeId===pendingMatrix.employeeId
  );
  const record=candidates[candidates.length-1];
  if(!record)return state;
  record.matrix=record.matrix&&typeof record.matrix==='object'?record.matrix:{};
  for(const module of EXTRA_MODULES){
    record.matrix[module]={...pendingMatrix.values[module]};
  }
  return state;
}

window.fetch=async function(input,init={}){
  const url=typeof input==='string'?input:String(input?.url||'');
  const method=String(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();
  const isState=/\/api\/state(?:\?|$)/.test(url);
  const isDirectionUnlock=/\/api\/direction\/(?:unlock|setup)(?:\?|$)/.test(url);

  if(isState&&['POST','PUT'].includes(method)&&typeof init.body==='string'){
    try{
      let state=JSON.parse(init.body);
      state=stripRuntimePermission(state);
      state=applyPendingMatrix(state);
      init={...init,body:JSON.stringify(state)};
    }catch{}
  }

  const response=await originalFetch(input,init);

  if(isState&&response.ok){
    try{
      const text=await response.clone().text();
      const payload=JSON.parse(text);
      if(await directionUnlocked()){
        const patched=method==='GET'
          ? withRuntimeDirectionPermission(payload)
          : (payload?.state?{...payload,state:withRuntimeDirectionPermission(payload.state)}:payload);
        return new Response(JSON.stringify(patched),{
          status:response.status,
          statusText:response.statusText,
          headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}
        });
      }
    }catch{}
  }

  if(isDirectionUnlock&&method==='POST'&&response.ok){
    setTimeout(()=>location.reload(),80);
  }
  return response;
};

async function permissionRecord(id){
  if(!id)return null;
  try{
    const response=await originalFetch('/api/state',{headers:{'Content-Type':'application/json',...contextHeaders()}});
    if(!response.ok)return null;
    const state=await response.json();
    return (state.permissions||[]).find(item=>item.id===id)||null;
  }catch{return null;}
}

function appendPermissionRows(form,id){
  if(!form||form.dataset.arcadiExtraPermissions==='1')return;
  const tbody=form.querySelector('.tableWrap table tbody');
  if(!tbody)return;
  form.dataset.arcadiExtraPermissions='1';

  for(const module of EXTRA_MODULES){
    if(form.querySelector(`[data-perm-module="${CSS.escape(module)}"]`))continue;
    const row=document.createElement('tr');
    row.dataset.arcadiExtraModule=module;
    const title=document.createElement('td');
    const strong=document.createElement('b');
    strong.textContent=module;
    title.appendChild(strong);
    row.appendChild(title);
    for(const action of ACTIONS){
      const cell=document.createElement('td');
      const input=document.createElement('input');
      input.type='checkbox';
      input.dataset.permModule=module;
      input.dataset.permAction=action;
      cell.appendChild(input);
      row.appendChild(cell);
    }
    tbody.appendChild(row);
  }

  const previousSubmit=form.onsubmit;
  form.onsubmit=async function(event){
    const values={};
    for(const module of EXTRA_MODULES){
      values[module]={};
      for(const action of ACTIONS){
        values[module][action]=form.querySelector(`[data-perm-module="${CSS.escape(module)}"][data-perm-action="${action}"]`)?.checked===true;
      }
    }
    pendingMatrix={
      companyId:form.querySelector('#perm_company')?.value||'',
      centreId:form.querySelector('#perm_centre')?.value||'',
      employeeId:form.querySelector('#perm_employee')?.value||'',
      values
    };
    try{
      return previousSubmit?await previousSubmit.call(this,event):undefined;
    }finally{
      pendingMatrix=null;
    }
  };

  if(id){
    permissionRecord(id).then(record=>{
      if(!record||!document.body.contains(form))return;
      for(const module of EXTRA_MODULES){
        for(const action of ACTIONS){
          const input=form.querySelector(`[data-perm-module="${CSS.escape(module)}"][data-perm-action="${action}"]`);
          if(input)input.checked=record.matrix?.[module]?.[action]===true;
        }
      }
    });
  }
}

function wrapOpenPermission(){
  if(wrappingOpenPermission||typeof window.openPermission!=='function')return false;
  wrappingOpenPermission=true;
  const originalOpenPermission=window.openPermission;
  window.openPermission=function(id=''){
    const result=originalOpenPermission(id);
    appendPermissionRows(document.getElementById('permissionForm'),id);
    return result;
  };
  return true;
}

if(!wrapOpenPermission()){
  const timer=setInterval(()=>{if(wrapOpenPermission())clearInterval(timer);},25);
  setTimeout(()=>clearInterval(timer),5000);
}
})();
