(()=>{'use strict';
const previousFetch=window.fetch.bind(window);
const ACTIONS=['Consultar','Crear','Editar','Eliminar','Imprimir'];
const MODULES=['Sala / TPV','Documents','Còpies de seguretat','Cuina','Reserves','RRHH','Inventari','APPCC','Horaris','Fitxatges GPS','Criteris de torns','Resum d’hores','Tasques'];
function fullMatrix(){return Object.fromEntries(MODULES.map(module=>[module,Object.fromEntries(ACTIONS.map(action=>[action,true]))]));}
function injectDirection(state){
  if(!state||typeof state!=='object')return state;
  const permissions=Array.isArray(state.permissions)?state.permissions.filter(item=>item?.id!=='__arcadi_direction_runtime__'):[];
  permissions.push({id:'__arcadi_direction_runtime__',companyId:'',centreId:'',employeeId:'__direction__',employeeName:'Direcció',level:'Direcció',matrix:fullMatrix(),runtimeOnly:true});
  return {...state,permissions};
}
window.fetch=async function(input,init={}){
  const response=await previousFetch(input,init);
  const url=typeof input==='string'?input:String(input?.url||'');
  const method=String(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();
  if(method==='GET'&&/\/api\/state(?:\?|$)/.test(url)&&response.ok){
    try{
      const payload=JSON.parse(await response.clone().text());
      return new Response(JSON.stringify(injectDirection(payload)),{status:response.status,statusText:response.statusText,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
    }catch{}
  }
  return response;
};
})();
