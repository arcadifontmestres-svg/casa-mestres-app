/* TPV BACK. Uses the existing per-centre /api/tpv-layout; never writes /api/state. */
(() => {
  'use strict';
  const M = window.TpvButtons, $ = id => document.getElementById(id);
  const CONTEXT_KEY = 'arcadi_work_context_v1';
  const labels = {product:'Magatzem',dish:'Cuina · plat',sale:'Article de venda'};
  let context, remote, draft, catalogue = [], activeGroup = '', selected = null;
  let dirty = false, busy = false, mode = 'edit', originalContext = '', preview = [];
  let pickerMode = 'many', picked = new Set(), visibleSources = [], drag = null;
  let loadGeneration = 0, leaveApproved = false, serverSavedButNotVerified = false;
  let flushProperties = () => true, propertiesPending = false;
  const money = value => new Intl.NumberFormat('ca-ES', {style:'currency',currency:'EUR'}).format(value);
  const id = prefix => prefix + '_' + Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2,'0')).join('');
  function node(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    for (const [key,value] of Object.entries(attrs)) {
      if (key === 'text') el.textContent = value;
      else if (key === 'class') el.className = value;
      else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
      else if (key === 'checked') el.checked = value;
      else if (key === 'disabled') el.disabled = value;
      else el.setAttribute(key, String(value));
    }
    for (const child of children) el.append(child);
    return el;
  }
  function button(text, fn, className = '') { return node('button',{type:'button',text,class:`tb-btn ${className}`,onclick:fn}); }
  function storageContext() { try { return JSON.parse(localStorage.getItem(CONTEXT_KEY) || '{}'); } catch { return {}; } }
  function message(text, isError = false) {
    $('error').hidden = true; $('notice').hidden = true;
    if (!text) return;
    const el = $(isError ? 'error' : 'notice'); el.textContent = text; el.hidden = false;
  }
  function setBusy(value) {
    busy = value; $('editor').setAttribute('aria-busy', String(value));
    for (const name of ['saveDraft','publish','discard','editMode','previewMode','addGroup','addButton','addFromCatalog']) $(name).disabled = value;
    for (const field of document.querySelectorAll('#properties input,#properties select,#properties button')) field.disabled = value;
    if (!value && draft) {
      $('addButton').disabled = !activeGroup; $('addFromCatalog').disabled = !activeGroup;
      $('discard').disabled = !dirty;
    }
  }
  function status() {
    if (!draft || !remote) return;
    const published = remote.published && JSON.stringify(draft) === JSON.stringify(remote.published);
    $('status').textContent = dirty ? 'Canvis sense desar' : serverSavedButNotVerified ? 'Cal comprovar el desat' : published ? 'Publicat al centre' : 'Esborrany · pendent de publicar';
    $('status').className = `tb-status${dirty || serverSavedButNotVerified ? ' dirty' : ''}`;
    $('revision').textContent = `Revisió ${remote.revision} · ${draft.categories.length} grups · ${draft.buttons.length} botons. El FRONT només utilitza la distribució publicada.`;
    $('discard').disabled = busy || !dirty;
  }
  function changed() { dirty = true; serverSavedButNotVerified = false; status(); }
  async function api(path, options = {}) {
    const timeout = new AbortController(), timer = setTimeout(() => timeout.abort(), 18000);
    try {
      const response = await fetch(path, { credentials:'same-origin',cache:'no-store',...options,signal:timeout.signal,
        headers:{'Content-Type':'application/json','X-Arcadi-Company-Id':context.companyId,'X-Arcadi-Centre-Id':context.centreId || '',...(options.headers || {})} });
      let result;
      try { result = await response.json(); } catch { throw Error('El servidor no ha retornat dades vàlides. No s’ha canviat la configuració local.'); }
      if (!response.ok) throw Object.assign(Error(result.error || `Error ${response.status}`),{status:response.status});
      return result;
    } catch (error) {
      if (error.name === 'AbortError') throw Error('El servidor no ha respost a temps. Es conserva l’esborrany; comprova l’estat abans de repetir el desat.');
      throw error;
    } finally { clearTimeout(timer); }
  }
  function contextUnchanged() {
    if (JSON.stringify(storageContext()) !== originalContext) throw Error('El centre de treball ha canviat en una altra pantalla. No s’ha enviat cap canvi. Torna a obrir la configuració des del centre correcte.');
  }
  async function load() {
    const generation = ++loadGeneration; setBusy(true); message(''); $('workspace').hidden = true;
    try {
      const [layout, state] = await Promise.all([api('/api/tpv-layout'),api('/api/state')]);
      if (generation !== loadGeneration) return;
      if (!Number.isInteger(layout.revision) || layout.revision < 0) throw Error('Revisió de configuració no vàlida.');
      draft = M.sanitizeLayout(layout.draft); remote = M.clone(layout); catalogue = M.sources(state);
      const centre = (state.restaurants || []).find(c => c.id === context.centreId);
      $('centreName').textContent = centre?.name || context.centreId;
      $('contextText').textContent = 'TPV del centre · botons vinculats per codi, sense canviar el catàleg d’origen.';
      dirty = false; selected = null; serverSavedButNotVerified = false; activeGroup = draft.categories[0]?.id || '';
      $('chooseCentre').hidden = true; $('workspace').hidden = false; render();
    } catch (error) { message(error.message,true); $('status').textContent='No s’ha carregat'; $('status').className='tb-status failed'; }
    finally { if (generation === loadGeneration) setBusy(false); }
  }
  async function chooseCentre() {
    setBusy(true);
    try {
      const state = await api('/api/state');
      const centres = (state.restaurants || []).filter(c => c.active !== false && c.kind !== 'GROUP' && c.organizationId === context.companyId);
      $('centreName').textContent = 'TPV BACK · Configuració'; $('status').textContent='Selecciona centre';
      $('chooseCentre').hidden = false;
      $('centreSelect').replaceChildren(new Option('Selecciona un centre…',''),...centres.map(c=>new Option(c.name,c.id)));
      $('useCentre').disabled = !centres.length;
      if (!centres.length) message('No hi ha centres disponibles per a l’empresa seleccionada. No se n’ha creat cap de nou.',true);
      $('useCentre').onclick=()=>{
        if (!$('centreSelect').value) return;
        context.centreId=$('centreSelect').value;
        const next={...storageContext(),companyId:context.companyId,centreId:context.centreId};
        localStorage.setItem(CONTEXT_KEY,JSON.stringify(next)); originalContext=JSON.stringify(storageContext());
        load();
      };
    } catch(error){message(error.message,true);} finally{setBusy(false);}
  }
  function paintTile(el,row) {
    el.style.setProperty('--tile-color',row.color || '#1b6470');
    el.style.setProperty('--tile-ink',M.ink(row.color));
    el.style.setProperty('--tile-span',row.size===2?'2':'1');
  }
  function handle(kind,row) {
    const el=node('button',{type:'button',class:'tb-drag',text:'⠿','aria-label':`Moure ${row.name}`,'aria-keyshortcuts':'Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown',title:'Arrossegar · Alt + fletxes per moure'});
    el.addEventListener('pointerdown',event=>{
      if (busy || event.button !== 0 || !flushProperties()) return;
      event.preventDefault(); el.setPointerCapture(event.pointerId);
      drag={kind,id:row.id,target:row.id,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,moved:false,el};
    });
    el.addEventListener('pointermove',event=>{
      if (!drag || drag.el!==el || drag.pointerId!==event.pointerId) return;
      if (Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)<6 && !drag.moved) return;
      drag.moved=true;el.closest('[data-tile-id]')?.classList.add('tb-dragging');
      document.querySelectorAll('.tb-drop-target').forEach(x=>x.classList.remove('tb-drop-target'));
      const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-tile-id]');
      drag.target=row.id;
      if (target && target.dataset.kind===kind && target.dataset.tileId!==row.id) {drag.target=target.dataset.tileId;target.classList.add('tb-drop-target');}
    });
    const finish=event=>{
      if (!drag || drag.el!==el || drag.pointerId!==event.pointerId) return;
      const current=drag;drag=null;
      document.querySelectorAll('.tb-drop-target,.tb-dragging').forEach(x=>x.classList.remove('tb-drop-target','tb-dragging'));
      if (event.type==='pointerup' && current.moved && M.reorder(draft,kind,current.id,current.target)) {changed();render();message('Ordre actualitzat a l’esborrany.');}
    };
    el.addEventListener('pointerup',finish);el.addEventListener('pointercancel',finish);
    el.addEventListener('keydown',event=>{
      if (!event.altKey || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key) || busy) return;
      event.preventDefault(); const step=['ArrowLeft','ArrowUp'].includes(event.key)?-1:1;
      move(kind,row.id,step);
    });
    return el;
  }
  function move(kind,rowId,step) {
    if (busy || !flushProperties() || !M.move(draft,kind,rowId,step)) return;
    changed(); render();
    document.querySelector(`[data-tile-id="${rowId}"] .tb-drag`)?.focus();
  }
  function render() {
    if (!draft) return;
    if (!draft.categories.some(c=>c.id===activeGroup)) activeGroup=draft.categories[0]?.id || '';
    $('groups').replaceChildren();
    for (const row of draft.categories) {
      const box=node('div',{class:`tb-group${row.id===activeGroup?' selected':''}`,'data-kind':'categories','data-tile-id':row.id});
      const select=node('button',{type:'button',class:'tb-group-select',onclick:()=>{if(busy||!flushProperties())return;activeGroup=row.id;selected={kind:'categories',id:row.id};render();}});
      const dot=node('span',{class:'tb-dot'});dot.style.backgroundColor=row.color;
      select.append(dot,document.createTextNode(row.name),node('small',{text:`${draft.buttons.filter(b=>b.categoryId===row.id).length} botons`}));
      box.append(handle('categories',row),select,node('button',{type:'button',class:'tb-group-edit',text:'✎','aria-label':`Editar ${row.name}`,onclick:()=>{if(busy||!flushProperties())return;selected={kind:'categories',id:row.id};renderProperties();}}));
      $('groups').append(box);
    }
    if (!draft.categories.length) $('groups').append(node('p',{class:'tb-help',text:'Crea el primer grup de pantalla. No s’importa cap família automàticament.'}));
    $('groupName').textContent=draft.categories.find(c=>c.id===activeGroup)?.name || 'Botons de venda';
    const rows=draft.buttons.filter(b=>b.categoryId===activeGroup); $('tiles').replaceChildren();
    for (const row of rows) {
      const linked=Boolean(row.code && row.itemId), price=M.effectivePrice(row,catalogue);
      const box=node('article',{class:`tb-tile${selected?.id===row.id?' selected':''}${linked?'':' tb-unlinked'}`,'data-kind':'buttons','data-tile-id':row.id});paintTile(box,row);
      const select=node('button',{type:'button',class:'tb-tile-select',onclick:()=>{if(busy||!flushProperties())return;selected={kind:'buttons',id:row.id};render();}},[
        node('strong',{text:row.name}),node('small',{text:linked?`${row.code} · ${labels[row.type]}`:'Pendent de vincular'}),node('span',{class:'tb-price',text:price==null?'PVP pendent':money(price)})]);
      box.append(handle('buttons',row),select);$('tiles').append(box);
    }
    if (!rows.length) $('tiles').append(node('div',{class:'tb-empty'},[node('strong',{text:activeGroup?'Aquest grup encara no té botons':'Comença amb un grup de pantalla'}),node('span',{text:activeGroup?'Crea un botó o selecciona articles existents per codi.':'Després hi podràs distribuir els articles de venda.'})]));
    $('addButton').disabled=busy||!activeGroup;$('addFromCatalog').disabled=busy||!activeGroup;
    renderProperties(); status(); renderPreview();
  }
  function field(label,key,value,type='text') {
    const input=node('input',{id:key,name:key,type,value:value ?? ''});if(type==='text')input.maxLength=100;
    const out=node('label',{text:label},[input]);return out;
  }
  function renderProperties() {
    const host=$('properties');host.replaceChildren();propertiesPending=false;flushProperties=()=>true;
    const row=selected && draft[selected.kind]?.find(x=>x.id===selected.id);
    if (!row) {host.append(node('p',{class:'tb-help',text:'Selecciona un grup o un botó per editar-ne el nom, el color i la mida.'}));return;}
    const kind=selected.kind, rowId=row.id, form=node('form');
    form.append(field('Nom visible','tileName',row.name));
    const size=node('select',{id:'tileSize',name:'tileSize'},[new Option('Normal','1'),new Option('Doble amplada','2')]);size.value=String(row.size);
    form.append(node('div',{class:'tb-two'},[field('Color','tileColor',row.color,'color'),node('label',{text:'Mida'},[size])]));
    if (kind==='buttons') {
      const group=node('select',{id:'tileGroup',name:'tileGroup'},draft.categories.map(c=>new Option(c.name,c.id)));group.value=row.categoryId;
      form.append(node('label',{text:'Grup de pantalla'},[group]));
      const ref=node('div',{class:'tb-source-ref'},[node('strong',{text:row.code ? `${row.code} · ${labels[row.type]}`:'Sense article vinculat'}),node('span',{text:catalogue.find(x=>M.sourceKey(x)===M.sourceKey(row))?.name || 'Selecciona el producte o el plat pel seu codi.'})]);
      ref.append(button(row.itemId?'Canviar vinculació':'Vincular article',()=>openPicker('one')));form.append(ref);
      const f=field('PVP de venda (€)','tilePrice',row.price ?? '','number');f.querySelector('input').min='0';f.querySelector('input').step='0.01';form.append(f);
      form.append(node('p',{class:'tb-help',text:row.type==='product'?'Indica el PVP. No s’utilitza el cost de compra de Magatzem.':'En blanc: utilitzar el PVP de l’article d’origen. Un import aquí només afecta aquest botó.'}));
    }
    form.append(node('div',{class:'tb-actions'},[node('button',{type:'submit',class:'tb-btn tb-primary',text:'Aplicar canvis'})]));
    form.addEventListener('input',()=>{propertiesPending=true;changed();});
    flushProperties=()=>{
      if(!propertiesPending)return true;if(busy)return false;
      const name=$('tileName').value.trim();if(!name || name.length>100){message('Cal un nom d’entre 1 i 100 caràcters.',true);return false;}
      const next={...row,name,color:$('tileColor').value,size:Number($('tileSize').value)};
      if(kind==='buttons'){
        next.categoryId=$('tileGroup').value;if(!$('tilePrice').validity.valid){message('PVP no vàlid.',true);return false;}const raw=$('tilePrice').value;
        if(raw==='')delete next.price;else {next.price=Number(raw);if(!Number.isFinite(next.price)||next.price<0){message('PVP no vàlid.',true);return false;}}
        activeGroup=next.categoryId;
      }
      Object.assign(row,next);propertiesPending=false;changed();return true;
    };
    form.addEventListener('submit',event=>{event.preventDefault();if(flushProperties()){message('Canvis aplicats a l’esborrany.');render();}});
    host.append(form,node('div',{class:'tb-order-tools'},[button('← Moure',()=>move(kind,rowId,-1)),button('Moure →',()=>move(kind,rowId,1))]),node('div',{class:'tb-actions'},[button(kind==='buttons'?'Eliminar botó':'Eliminar grup',()=>remove(kind,rowId),'tb-danger')]));
    if(busy)for(const control of host.querySelectorAll('input,select,button'))control.disabled=true;
  }
  function remove(kind,rowId) {
    if (busy) return;
    if (kind==='categories' && draft.buttons.some(b=>b.categoryId===rowId)) {message('Aquest grup conté botons. Mou-los a un altre grup o elimina els botons abans.',true);return;}
    if (!confirm('Eliminar només de la distribució del TPV? El producte o la fitxa d’origen no es tocaran.'))return;
    draft[kind]=draft[kind].filter(x=>x.id!==rowId);selected=null;changed();render();
  }
  function openPicker(type) {
    if (busy || !flushProperties()) return;
    pickerMode=type;picked=new Set();$('sourceSearch').value='';$('sourceType').value='';
    if(type==='one'){
      const row=draft.buttons.find(x=>x.id===selected?.id);if(!row)return;
      if(row.itemId)picked.add(M.sourceKey(row));
    }
    $('selectVisible').parentElement.hidden=type==='one';$('applySources').textContent=type==='one'?'Vincular article':'Crear botons seleccionats';
    renderSources();$('picker').showModal();$('sourceSearch').focus();
  }
  function renderSources() {
    const query=M.normalize($('sourceSearch').value),type=$('sourceType').value;
    visibleSources=catalogue.filter(s=>(!type||s.type===type)&&(!query||M.normalize(`${s.code} ${s.name}`).includes(query)));
    $('sourceList').replaceChildren();
    for (const source of visibleSources) {
      const key=M.sourceKey(source),exists=pickerMode==='many'&&draft.buttons.some(b=>b.categoryId===activeGroup&&M.sourceKey(b)===key),disabled=!source.code.trim()||exists;
      const input=node('input',{type:pickerMode==='one'?'radio':'checkbox',name:pickerMode==='one'?'source':'source-'+key,value:key,checked:picked.has(key),disabled,'aria-label':`${source.code||'Sense codi'} ${source.name}`});
      input.onchange=()=>{if(pickerMode==='one')picked.clear();if(input.checked)picked.add(key);else picked.delete(key);pickerCount();};
      $('sourceList').append(node('label',{class:`tb-source-row${disabled?' disabled':''}`},[input,node('span',{text:source.name},[node('small',{text:!source.code.trim()?'Sense codi · codificació pendent a l’origen':exists?`${source.code} · ja incorporat en aquest grup`:`${source.code}${source.unit?' · '+source.unit:''}${source.price==null?' · PVP per definir':' · '+money(source.price)}`})]),node('span',{class:'tb-source-tag',text:labels[source.type]})]));
    }
    if(!visibleSources.length)$('sourceList').append(node('p',{class:'tb-empty',text:'No hi ha articles que coincideixin amb la cerca.'}));
    $('sourceHint').textContent='Cada article seleccionat crea un botó vinculat al codi existent. Els articles sense codi no s’assignen automàticament.';pickerCount();
  }
  function pickerCount() {
    $('pickedCount').textContent=`${picked.size} seleccionat${picked.size===1?'':'s'}`;$('applySources').disabled=!picked.size;
    const enabled=[...$('sourceList').querySelectorAll('input:not(:disabled)')];
    $('selectVisible').checked=Boolean(enabled.length)&&enabled.every(x=>picked.has(x.value));
    $('selectVisible').indeterminate=enabled.some(x=>picked.has(x.value))&&!$('selectVisible').checked;
  }
  function applySources() {
    const rows=catalogue.filter(x=>picked.has(M.sourceKey(x))&&x.code.trim());if(!rows.length)return;
    if(pickerMode==='one'){
      const row=draft.buttons.find(x=>x.id===selected?.id),source=rows[0];if(!row)return;
      Object.assign(row,{type:source.type,itemId:source.id,code:source.code});
      if(row.name==='Nou article'||!row.name)row.name=source.name.slice(0,100);
    }else{
      const group=draft.categories.find(x=>x.id===activeGroup);if(!group)return;
      for(const source of rows){
        if(draft.buttons.some(b=>b.categoryId===activeGroup&&M.sourceKey(b)===M.sourceKey(source)))continue;
        if(draft.buttons.length>=2000){message('Límit de 2.000 botons assolit.',true);break;}
        draft.buttons.push({id:id('button'),categoryId:activeGroup,name:source.name.slice(0,100),color:group.color,size:1,type:source.type,itemId:source.id,code:source.code});
      }
      selected=draft.buttons.length?{kind:'buttons',id:draft.buttons.at(-1).id}:null;
    }
    $('picker').close();changed();render();
  }
  function renderPreview() {
    if(mode!=='preview'||!draft)return;
    $('previewGroups').replaceChildren();
    for(const row of draft.categories){const b=button(row.name,()=>{activeGroup=row.id;renderPreview();});b.style.backgroundColor=row.color;b.style.color=M.ink(row.color);b.setAttribute('aria-pressed',String(row.id===activeGroup));$('previewGroups').append(b);}
    $('previewTiles').replaceChildren();
    for(const row of draft.buttons.filter(b=>b.categoryId===activeGroup)){
      const price=M.effectivePrice(row,catalogue),ok=price!=null&&row.code&&row.itemId;
      const box=node('article',{class:'tb-tile'});paintTile(box,row);
      box.append(node('button',{type:'button',class:'tb-tile-select',disabled:!ok,onclick:()=>{
        let line=preview.find(x=>x.id===row.id);if(line)line.qty++;else preview.push({id:row.id,name:row.name,price,qty:1});renderPreviewLines();
      }},[node('strong',{text:row.name}),node('small',{text:row.code||'Sense codi'}),node('span',{class:'tb-price',text:price==null?'PVP pendent':money(price)})]));$('previewTiles').append(box);
    }
    if(!$('previewTiles').children.length)$('previewTiles').append(node('p',{class:'tb-empty',text:'Encara no hi ha botons en aquest grup.'}));
    renderPreviewLines();
  }
  function renderPreviewLines() {
    $('previewLines').replaceChildren();let total=0;
    for(const line of preview){
      total+=line.qty*line.price;
      const controls=node('div',{class:'tb-ticket-qty'},[button('−',()=>{line.qty--;preview=preview.filter(x=>x.qty>0);renderPreviewLines();}),node('span',{text:String(line.qty)}),button('+',()=>{line.qty++;renderPreviewLines();})]);
      $('previewLines').append(node('div',{class:'tb-ticket-line'},[node('div',{text:line.name},[node('small',{text:money(line.price)+' / unitat'}),controls]),node('strong',{text:money(line.qty*line.price)})]));
    }
    if(!preview.length)$('previewLines').append(node('p',{class:'tb-help',text:'Prem un article per provar la comanda.'}));
    $('previewTotal').textContent=money(total);
  }
  function setMode(value) {
    if(busy||!flushProperties())return; mode=value;$('editArea').hidden=value!=='edit';$('previewArea').hidden=value!=='preview';
    for(const [name,val] of [['editMode','edit'],['previewMode','preview']]){$(name).classList.toggle('active',val===value);$(name).setAttribute('aria-pressed',String(val===value));}
    if(value==='preview')renderPreview();else render();
  }
  async function save(publish) {
    if(busy||!draft||!flushProperties())return;
    message('');
    try{contextUnchanged();}catch(error){message(error.message,true);return;}
    const problems=M.issues(draft,catalogue,publish);
    if(problems.length){message(problems.join('\n'),true);return;}
    if(publish&&!confirm(`Publicar ${draft.buttons.length} botons per a ${$('centreName').textContent}?\nNomés canviarà la distribució de venda d’aquest centre.`))return;
    const snapshot=M.clone(draft),revision=remote.revision;setBusy(true);
    try {
      const result=await api('/api/tpv-layout',{method:'PUT',body:JSON.stringify({revision,draft:snapshot,publish})});
      if(result.revision!==revision+1||JSON.stringify(result.draft)!==JSON.stringify(snapshot))throw Error('El servidor no ha confirmat la distribució enviada. Conserva aquesta pantalla i comprova l’estat.');
      remote=M.clone(result);draft=M.sanitizeLayout(result.draft);dirty=false;serverSavedButNotVerified=true;
      const checked=await api('/api/tpv-layout');
      if(checked.revision!==result.revision||JSON.stringify(checked.draft)!==JSON.stringify(snapshot)||(publish&&JSON.stringify(checked.published)!==JSON.stringify(snapshot)))throw Error('El desat ha respost, però la lectura posterior és diferent. No s’ha sobreescrit res més. Recarrega abans de continuar.');
      remote=M.clone(checked);serverSavedButNotVerified=false;render();
      message(publish?'Distribució publicada i comprovada. El FRONT la carregarà en tornar-hi.':'Esborrany desat i comprovat. El FRONT no s’ha modificat.');
    } catch(error) {
      if(error.status===409)message('Un altre terminal ha canviat la configuració. Es conserva el teu esborrany i no s’ha sobreescrit la versió del servidor. Recarrega després de revisar els canvis.',true);
      else message(error.message,true);
      status();
    } finally {setBusy(false);}
  }
  $('addGroup').onclick=()=>{if(busy||!flushProperties())return;const row={id:id('group'),name:'Nou grup',color:'#159ea3',size:1};draft.categories.push(row);activeGroup=row.id;selected={kind:'categories',id:row.id};changed();render();$('tileName').select();};
  $('addButton').onclick=()=>{if(busy||!activeGroup||!flushProperties())return;const row={id:id('button'),name:'Nou article',color:draft.categories.find(x=>x.id===activeGroup)?.color||'#159ea3',size:1,categoryId:activeGroup};draft.buttons.push(row);selected={kind:'buttons',id:row.id};changed();render();$('tileName').select();};
  $('addFromCatalog').onclick=()=>openPicker('many');$('sourceSearch').oninput=renderSources;$('sourceType').onchange=renderSources;$('applySources').onclick=applySources;
  $('selectVisible').onchange=event=>{for(const el of $('sourceList').querySelectorAll('input:not(:disabled)')){el.checked=event.target.checked;if(el.checked)picked.add(el.value);else picked.delete(el.value);}pickerCount();};
  $('saveDraft').onclick=()=>save(false);$('publish').onclick=()=>save(true);
  $('discard').onclick=()=>{if(busy||!dirty||!confirm('Descartar els canvis que encara no has desat?'))return;draft=M.clone(remote.draft);dirty=false;selected=null;render();message('Canvis locals descartats.');};
  $('editMode').onclick=()=>setMode('edit');$('previewMode').onclick=()=>setMode('preview');$('clearPreview').onclick=()=>{preview=[];renderPreviewLines();};
  $('back').onclick=event=>{if(busy||(dirty&&!confirm('Hi ha canvis sense desar. Vols tornar al FRONT sense desar-los?'))){event.preventDefault();return;}leaveApproved=true;};
  window.addEventListener('beforeunload',event=>{if((dirty||busy)&&!leaveApproved){event.preventDefault();event.returnValue='';}});
  window.addEventListener('storage',event=>{if(event.key===CONTEXT_KEY&&JSON.stringify(storageContext())!==originalContext)message('El centre s’ha canviat en una altra finestra. Per seguretat, no desis fins a tornar a obrir la configuració.',true);});
  const current=storageContext(),params=new URLSearchParams(location.search);
  context={companyId:params.get('companyId')||current.companyId||'',centreId:params.get('centreId')||current.centreId||''};originalContext=JSON.stringify(current);
  if(!context.companyId){message('Obre la configuració des de GRUP TRÀFEC amb una empresa seleccionada.',true);$('status').textContent='Falta empresa';setBusy(false);return;}
  if(current.companyId&&context.companyId!==current.companyId||current.centreId&&context.centreId&&context.centreId!==current.centreId){message('L’enllaç correspon a un altre centre. Torna a obrir-lo des del TPV correcte; no s’ha canviat el context.',true);$('status').textContent='Context diferent';setBusy(false);return;}
  if(new URLSearchParams(location.search).get('miniapp')==='1'){message('La configuració es fa des del BACK de Direcció. Aquesta és una entrada de servei.',true);setBusy(false);return;}
  if(context.centreId)load();else chooseCentre();
})();
