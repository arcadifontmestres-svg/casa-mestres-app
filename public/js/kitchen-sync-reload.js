(()=>{
'use strict';
const previous=window.saveForm;
if(typeof previous!=='function')return;
window.saveForm=async(...args)=>{
  const body=document.getElementById('modalBody');
  const kitchenForm=['dishes','bases'].includes(body?.dataset?.kfm||'');
  const result=await previous(...args);
  if(kitchenForm){
    location.hash='kitchen';
    location.reload();
  }
  return result;
};
})();
