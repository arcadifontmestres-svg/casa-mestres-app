(()=>{'use strict';
const A=window.ArcadiERP;
const M=window.ArcadiModules;
if(!A||!M?.definitions?.restaurants)return;

const MODULES=[
  'Sala / TPV',
  'Documents',
  'Còpies de seguretat',
  'Cuina',
  'Reserves',
  'RRHH',
  'Inventari',
  'APPCC',
  'Horaris',
  'Fitxatges GPS',
  'Tasques'
];

const def=M.definitions.restaurants;
def.label='Centres de treball';
def.singular='centre de treball';
def.description='Alta de centres i autorització de les eines o miniapps que pot utilitzar cadascun.';
def.columns=[
  ['name','Centre'],
  ['organizationId','Empresa'],
  ['enabledModules','Mini apps / eines'],
  ['address','Adreça'],
  ['status','Estat']
];

const original=A.openRecordForm.bind(A);

function esc(v){return A.esc(v)}
function checked(set,value){return set.has(value)?'checked':''}
function options(value){
  return (A.state?.organizations||[])
    .filter(x=>x.status!=='Inactiva')
    .map(x=>`<option value="${esc(x.id)}" ${x.id===value?'selected':''}>${esc(x.name)}</option>`)
    .join('');
}

A.openRecordForm=function(definition,id=''){
  if(definition?.key!=='restaurants')return original(definition,id);

  const records=A.collection('restaurants');
  const record=records.find(item=>item.id===id)||{};
  const selected=new Set(Array.isArray(record.enabledModules)?record.enabledModules:[]);
  const companyId=record.organizationId||A.context?.companyId||(A.state.organizations||[])[0]?.id||'';

  A.modal(id?'Editar · centre de treball':'Nou · centre de treball',`
    <form id="centreGovernForm" class="arcadiForm">
      <div class="arcadiFormGrid">
        <div class="arcadiField"><label>Empresa</label><select id="centre_company" required>${options(companyId)}</select></div>
        <div class="arcadiField"><label>Nom del centre</label><input id="centre_name" required value="${esc(record.name||'')}"></div>
        <div class="arcadiField"><label>Adreça</label><input id="centre_address" value="${esc(record.address||'')}"></div>
        <div class="arcadiField"><label>Telèfon</label><input id="centre_phone" value="${esc(record.phone||'')}"></div>
        <div class="arcadiField"><label>Latitud GPS</label><input id="centre_lat" type="number" step="0.000001" value="${esc(record.gpsLat??'')}"></div>
        <div class="arcadiField"><label>Longitud GPS</label><input id="centre_lng" type="number" step="0.000001" value="${esc(record.gpsLng??'')}"></div>
        <div class="arcadiField"><label>Radi GPS (m)</label><input id="centre_radius" type="number" step="1" value="${esc(record.gpsRadius??'')}"></div>
        <div class="arcadiField"><label>Estat</label><select id="centre_status"><option ${record.status==='Actiu'||!record.status?'selected':''}>Actiu</option><option ${record.status==='En preparació'?'selected':''}>En preparació</option><option ${record.status==='Inactiu'?'selected':''}>Inactiu</option></select></div>
        <div class="arcadiField arcadiFieldWide"><label>Notes</label><textarea id="centre_notes">${esc(record.notes||'')}</textarea></div>
      </div>

      <div class="panel" style="margin-top:16px">
        <h3>Mini apps / eines autoritzades</h3>
        <p class="muted">El centre només podrà utilitzar les eines marcades aquí. Els permisos de cada empleat es defineixen després a Direcció → Matriu de permisos.</p>
        <div class="checkGrid">
          ${MODULES.map(module=>`<label class="checkItem"><input type="checkbox" name="centreModule" value="${esc(module)}" ${checked(selected,module)}><span><b>${esc(module)}</b></span></label>`).join('')}
        </div>
      </div>

      <div class="actions">
        <button class="btn" type="submit">Guardar centre</button>
        <button class="btn secondary" type="button" id="centreCancel">Cancel·lar</button>
      </div>
    </form>`);

  document.getElementById('centreCancel').onclick=()=>A.closeModal();
  document.getElementById('centreGovernForm').onsubmit=async event=>{
    event.preventDefault();
    const value=id=>document.getElementById(id)?.value??'';
    const enabledModules=[...document.querySelectorAll('input[name="centreModule"]:checked')].map(input=>input.value);
    const next={
      ...record,
      id:record.id||A.uid('restaurants'),
      organizationId:value('centre_company'),
      name:value('centre_name').trim(),
      address:value('centre_address').trim(),
      phone:value('centre_phone').trim(),
      gpsLat:Number(value('centre_lat'))||0,
      gpsLng:Number(value('centre_lng'))||0,
      gpsRadius:Number(value('centre_radius'))||0,
      status:value('centre_status')||'Actiu',
      notes:value('centre_notes').trim(),
      kind:record.kind==='GROUP'?'GROUP':'RESTAURANT',
      enabledModules,
      updatedAt:new Date().toISOString()
    };
    if(!record.id){
      next.createdAt=next.updatedAt;
      records.push(next);
    }else{
      Object.assign(record,next);
    }
    await A.save('CENTRE GUARDAT');
    A.closeModal();
    window.ArcadiContext?.render?.();
    M.open('restaurants');
  };
};

function ensureDirectButton(){
  const nav=document.getElementById('nav');
  if(!nav||nav.querySelector('[data-centres-direct]'))return;
  const buttons=[...nav.querySelectorAll('button')];
  const anchor=buttons.find(button=>/Empresa, logotip i GPS/i.test(button.textContent||''));
  const button=document.createElement('button');
  button.dataset.centresDirect='1';
  button.textContent='Centres de treball';
  button.onclick=()=>M.open('restaurants');
  if(anchor)anchor.insertAdjacentElement('afterend',button);
  else nav.appendChild(button);
}

const nav=document.getElementById('nav');
if(nav)new MutationObserver(ensureDirectButton).observe(nav,{childList:true,subtree:false});
ensureDirectButton();

window.ArcadiCentreGovern={modules:MODULES};
})();