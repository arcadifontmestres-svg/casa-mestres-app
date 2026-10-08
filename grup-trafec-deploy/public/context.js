'use strict';

(() => {
  const nativeFetch = window.fetch.bind(window);
  const STORAGE_KEY = 'grupTrafeCenterId';
  let centers = [];
  let employees = [];
  let catalog = [];
  let currentCenterId = localStorage.getItem(STORAGE_KEY) || '';
  let currentShell = 'home';

  function withCenter(url) {
    if (!currentCenterId || typeof url !== 'string' || !url.startsWith('/api/') || url.startsWith('/api/govern')) return url;
    const parsed = new URL(url, window.location.origin);
    parsed.searchParams.set('centerId', currentCenterId);
    return parsed.pathname + parsed.search;
  }

  window.fetch = function(input, init) {
    if (typeof input === 'string') return nativeFetch(withCenter(input), init);
    return nativeFetch(input, init);
  };

  async function govApi(url, options = {}) {
    const response = await nativeFetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
    return data;
  }

  async function openDirectionTpv(path) {
    const access = await govApi('/api/govern/tpv-direction-token', { method: 'POST', body: '{}' });
    const url = new URL(path, window.location.origin);
    url.searchParams.set('direction_token', access.token);
    window.location.href = url.pathname + url.search;
  }

  async function openMiniapp(path) {
    let center = selectedCenter();
    const activeCenters = centers.filter(item => item.active !== false);

    if (!center && activeCenters.length === 1) center = activeCenters[0];

    if (!center && activeCenters.length > 1) {
      const chooser = document.createElement('div');
      chooser.id = 'miniappCenterChooser';
      chooser.style.cssText = 'position:fixed;inset:0;background:#0008;display:grid;place-items:center;z-index:9999;padding:20px';
      chooser.innerHTML = '<div style="background:#fff;border-radius:16px;padding:20px;width:min(520px,95vw);max-height:80vh;overflow:auto"><h2 style="margin-top:0">Selecciona centre</h2><p class="muted">Direcció té accés a la miniapp. Tria quin centre vols gestionar.</p><div id="miniappCenterList" style="display:grid;gap:10px"></div><button type="button" class="btn secondary" id="miniappCenterCancel" style="margin-top:14px">Cancel·lar</button></div>';
      document.body.appendChild(chooser);

      center = await new Promise(resolve => {
        const list = chooser.querySelector('#miniappCenterList');
        list.innerHTML = activeCenters.map(item =>
          '<button type="button" class="btn" data-miniapp-center="' + esc(item.id) + '">' + esc(item.name) + '</button>'
        ).join('');
        list.querySelectorAll('[data-miniapp-center]').forEach(btn => {
          btn.onclick = () => resolve(activeCenters.find(item => item.id === btn.dataset.miniappCenter) || null);
        });
        chooser.querySelector('#miniappCenterCancel').onclick = () => resolve(null);
      });
      chooser.remove();
      if (!center) return;
    }

    if (!center) {
      showError(new Error('No hi ha cap centre actiu creat.'));
      return;
    }

    const access = await govApi('/api/govern/centres/' + encodeURIComponent(center.id) + '/access-token', { method: 'POST', body: '{}' });
    const url = new URL(path, window.location.origin);
    url.searchParams.set('direction_token', access.token);
    window.location.href = url.pathname + url.search;
  }

  function selectedCenter() {
    return centers.find(item => item.id === currentCenterId) || null;
  }

  function functionAllowed(key) {
    const center = selectedCenter();
    if (!center) return true;
    return center.permissions?.[key] === true;
  }

  function shellActive(name) {
    currentShell = name;
    document.querySelectorAll('[data-shell]').forEach(btn => btn.classList.toggle('active', btn.dataset.shell === name));
  }

  function toolCard(title, text, action, disabled = false) {
    return `<button class="toolCard" ${disabled ? 'disabled' : ''} data-tool="${esc(action)}"><span class="toolTitle">${esc(title)}</span><span class="toolText">${esc(text)}</span></button>`;
  }

  function bindToolCards() {
    document.querySelectorAll('[data-tool]').forEach(btn => {
      btn.onclick = () => {
        if (btn.disabled) return;
        const tool = btn.dataset.tool;
        if (tool === 'reserves') {
          shellActive('front');
          return loadReservations().catch(showError);
        }
        if (tool === 'crm') {
          shellActive('back');
          return loadCrm().catch(showError);
        }
        if (tool === 'commercial') {
          shellActive('back');
          return loadCommercial().catch(showError);
        }
        if (tool === 'fitxatges') {
          const label = document.getElementById('centerContextSelect')?.selectedOptions?.[0]?.textContent || '';
          const params = new URLSearchParams({ companyId: 'company_grup_trafec' });
          if (/sarriera/i.test(label)) params.set('centreId', 'restaurant_sarriera');
          window.location.href = 'https://grup-trafec-operatiu.onrender.com/fitxatges.html?' + params.toString();
          return;
        }
      };
    });
  }

  function renderBadge() {
    let badge = document.getElementById('contextBadge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'contextBadge';
      badge.className = 'contextBadge';
      document.querySelector('.main').insertBefore(badge, document.getElementById('status'));
    }
    const center = selectedCenter();
    badge.textContent = center ? `Centre actiu: ${center.name}` : 'Context: GRUP TRÀFEC · visió global';
  }

  function renderSelector() {
    let box = document.getElementById('centerContextBox');
    if (!centers.some(item => item.active !== false)) {
      if (box) box.remove();
      return;
    }
    if (!box) {
      box = document.createElement('div');
      box.id = 'centerContextBox';
      box.className = 'contextBox';
      box.innerHTML = '<label>Centre de treball</label><select id="centerContextSelect"></select>';
      const mount = document.getElementById('centerContextMount');
      if (mount) mount.appendChild(box);
    }
    const select = document.getElementById('centerContextSelect');
    select.innerHTML = '<option value="">GRUP TRÀFEC · tots</option>' + centers
      .filter(item => item.active !== false)
      .map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`)
      .join('');
    select.value = currentCenterId;
    select.onchange = () => {
      currentCenterId = select.value;
      if (currentCenterId) localStorage.setItem(STORAGE_KEY, currentCenterId);
      else localStorage.removeItem(STORAGE_KEY);
      renderBadge();
      reloadShell();
    };
  }

  async function refreshGovernState() {
    const [centerOut, employeeOut, catalogOut] = await Promise.all([
      govApi('/api/govern/centres?includeInactive=1'),
      govApi('/api/govern/employees?includeInactive=1'),
      govApi('/api/govern/catalog')
    ]);
    centers = centerOut.items || [];
    employees = employeeOut.items || [];
    catalog = catalogOut.items || centerOut.catalog || [];
    if (currentCenterId && !centers.some(item => item.id === currentCenterId && item.active !== false)) {
      currentCenterId = '';
      localStorage.removeItem(STORAGE_KEY);
    }
    renderSelector();
    renderBadge();
  }

  function pendingCards(area) {
    const center = selectedCenter();
    if (!center) return '';
    return catalog
      .filter(item => item.area === area && item.connected === false && center.permissions?.[item.key] === true)
      .map(item => toolCard(item.label, 'Assignada a aquest centre · pendent de connectar.', `pending_${item.key}`, true))
      .join('');
  }

  function renderHome() {
    shellActive('home');
    view.innerHTML = `
      <div class="head"><div><h1>Gestió Grup Tràfec</h1><div class="muted">Porta de govern per utilitzar, connectar i configurar les eines del grup.</div></div></div>
      <div class="toolGrid">
        ${toolCard('FRONT', 'Accés a les eines Front Office autoritzades.', 'home_front')}
        ${toolCard('BACK', 'Accés a les miniapps i funcions de Back Office.', 'home_back')}
        ${toolCard('CONFIG', 'Centres, permisos, vincles i empleats.', 'home_config')}

      </div>`;
    setStatus('');
    document.querySelector('[data-tool="home_front"]').onclick = renderFrontOffice;
    document.querySelector('[data-tool="home_back"]').onclick = renderBackOffice;
    document.querySelector('[data-tool="home_config"]').onclick = () => refreshGovernState().then(renderConfig).catch(showError);
  }

  function renderFrontOffice() {
    shellActive('front');
    const cards = [
      toolCard('RESERVES ONLINE', 'Obre el front públic que es pot enllaçar des de Google o la web.', 'public_reserves'),
      functionAllowed('front_office_tpv') ? toolCard('TPV', 'Obre la miniapp TPV independent.', 'front_tpv') : '',
      functionAllowed('reservations') ? toolCard('Reserves / Ocupació', 'Obre la miniapp interna Reserves del centre.', 'front_reserves') : '',
      functionAllowed('fitxatges') ? toolCard('Fitxatges', 'Obre la miniapp Fitxatges independent.', 'front_fitxatges') : ''
    ].join('');
    view.innerHTML = `
      <div class="head"><div><h1>FRONT</h1><div class="muted">Accessos a miniapps operatives. Direcció no les incorpora.</div></div></div>
      <div class="toolGrid">${cards || '<div class="panel empty">Aquest centre no té eines Front assignades.</div>'}</div>`;
    setStatus('');
    const routes = {front_tpv:'/tpv.html',front_reserves:'/reserves-centre.html',front_fitxatges:'/fitxatges-centre.html'};
    document.querySelectorAll('[data-tool]').forEach(btn => btn.onclick = () => {
      if (btn.dataset.tool === 'public_reserves') return window.open('/reserves','_blank');
      if (btn.dataset.tool === 'front_tpv') {
        return openDirectionTpv('/tpv.html').catch(showError);
      }
      const url=routes[btn.dataset.tool];
      if(url) openMiniapp(url).catch(showError);
    });
  }

  function renderBackOffice() {
    shellActive('back');
    const center = selectedCenter();
    const cards = [
      toolCard('RRHH / Empleats', 'Crear i gestionar empleats des de Direcció.', 'rrhh_admin'),
      functionAllowed('front_office_tpv') ? toolCard('TPV', 'Obre la miniapp TPV independent.', 'mini_tpv') : '',
      functionAllowed('reservations') ? toolCard('Reserves', 'Obre la miniapp Reserves independent.', 'mini_reserves') : '',
      functionAllowed('fitxatges') ? toolCard('Fitxatges', 'Obre la miniapp Fitxatges independent.', 'mini_fitxatges') : '',
      functionAllowed('gestio_cuina') ? toolCard('Cuina', 'Obre la miniapp Cuina independent.', 'mini_cuina') : '',
      functionAllowed('control_normatiu') ? toolCard('APPCC / Control Normatiu', 'Obre la miniapp APPCC independent.', 'mini_appcc') : '',
      functionAllowed('gestio_magatzem') ? toolCard('Magatzem', 'Obre la miniapp Magatzem independent.', 'mini_magatzem') : '',
      functionAllowed('crm') ? toolCard('CRM', 'Contactes i seguiment CRM.', 'crm') : '',
      functionAllowed('commercial') ? toolCard('Comercial / Grups', 'Gestió comercial.', 'commercial') : ''
    ].join('');
    view.innerHTML = `
      <div class="head"><div><h1>BACK</h1><div class="muted">Llista d’eines i miniapps. Direcció hi té accés, però no les incorpora.</div></div></div>
      <div class="toolGrid">${cards || '<div class="panel empty">No hi ha eines disponibles.</div>'}</div>`;
    setStatus(center ? center.name : 'Visió global');
    document.querySelectorAll('[data-tool]').forEach(btn => {
      btn.onclick = () => {
        const t = btn.dataset.tool;
        if (t === 'rrhh_admin') return refreshGovernState().then(renderRrhh).catch(showError);
        if (t === 'mini_tpv') return openDirectionTpv('/tpv-back.html').catch(showError);
        const routes = {mini_reserves:'/reserves-centre.html',mini_fitxatges:'/fitxatges-centre.html',mini_cuina:'/cuina.html',mini_appcc:'/appcc.html',mini_magatzem:'/magatzem.html'};
        if (routes[t]) return openMiniapp(routes[t]).catch(showError);
        if (t === 'crm') return loadCrm().catch(showError);
        if (t === 'commercial') return loadCommercial().catch(showError);
      };
    });
  }

  function centerNames(ids) {
    const selected = new Set(ids || []);
    return centers.filter(item => selected.has(item.id)).map(item => item.name).join(', ') || '—';
  }

  function visibleEmployees() {
    if (!currentCenterId) return employees;
    return employees.filter(item => (item.centerIds || []).includes(currentCenterId));
  }

  function renderRrhh() {
    shellActive('back');
    const rows = visibleEmployees();
    const fitxatges = functionAllowed('fitxatges') ? toolCard('App Fitxatges', 'Entrada, pausa, retorn i sortida del personal.', 'fitxatges') : '';
    const pending = pendingCards('RRHH');
    view.innerHTML = `
      <div class="head"><div><h1>RRHH</h1><div class="muted">No hi ha empleats predefinits: només es mostren els que s’han creat.</div></div><button class="btn" id="newEmployee">+ Nou empleat</button></div>
      ${fitxatges || pending ? `<div class="toolGrid" style="margin-bottom:18px">${fitxatges}${pending}</div>` : ''}
      <div class="panel tableWrap"><table><thead><tr><th>Nom</th><th>Funció / rol</th><th>Centre</th><th>Estat</th><th></th></tr></thead><tbody>
        ${rows.map(item => `<tr><td><b>${esc(item.name)}</b></td><td>${esc(item.role || '—')}</td><td>${esc(centerNames(item.centerIds))}</td><td>${item.active === false ? 'Inactiu' : 'Actiu'}</td><td><button class="rowBtn" data-edit-employee="${esc(item.id)}">Editar</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">No hi ha empleats creats en aquest context.</td></tr>'}
      </tbody></table></div>`;
    bindToolCards();
    document.getElementById('newEmployee').onclick = () => renderEmployeeForm(null, 'back');
    document.querySelectorAll('[data-edit-employee]').forEach(btn => {
      btn.onclick = () => renderEmployeeForm(employees.find(item => item.id === btn.dataset.editEmployee), 'back');
    });
    setStatus(`${rows.length} empleats`);
  }

  function enabledCatalogNames(center) {
    return catalog
      .filter(item => center.permissions?.[item.key] === true)
      .map(item => item.label)
      .join(', ') || '—';
  }

  function renderConfig() {
    shellActive('config');
    view.innerHTML = `
      <div class="head"><div><h1>Configuració</h1><div class="muted">Aquí es creen les dades reals i es decideix què té cada centre.</div></div><div class="toolbar"><button class="btn secondary" id="newEmployeeConfig">+ Nou empleat</button><button class="btn" id="newCenter">+ Nou centre</button></div></div>
      <div class="panel tableWrap"><h3 class="sectionTitle">Centres</h3><table><thead><tr><th>Codi</th><th>Centre</th><th>Eines / miniapps assignades</th><th>Estat</th><th></th></tr></thead><tbody>
        ${centers.map(item => `<tr><td><b>${esc(item.code)}</b></td><td>${esc(item.name)}</td><td>${esc(enabledCatalogNames(item))}</td><td>${item.active === false ? 'Inactiu' : 'Actiu'}</td><td><button class="rowBtn" data-edit-center="${esc(item.id)}">Configurar</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">No hi ha cap centre creat.</td></tr>'}
      </tbody></table></div>
      <div class="panel tableWrap"><h3 class="sectionTitle">Empleats</h3><table><thead><tr><th>Nom</th><th>Funció / rol</th><th>Centre</th><th>Estat</th><th></th></tr></thead><tbody>
        ${employees.map(item => `<tr><td><b>${esc(item.name)}</b></td><td>${esc(item.role || '—')}</td><td>${esc(centerNames(item.centerIds))}</td><td>${item.active === false ? 'Inactiu' : 'Actiu'}</td><td><button class="rowBtn" data-edit-employee="${esc(item.id)}">Editar</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">No hi ha empleats creats.</td></tr>'}
      </tbody></table></div>
      <div class="panel"><h3 class="sectionTitle">Catàleg d’eines i miniapps</h3>${catalog.map(item => `<div class="catalogRow"><div><b>${esc(item.label)}</b><div class="muted">${esc(item.area)}</div></div><div>${item.connected ? 'Connectada' : 'Pendent de connectar'}</div></div>`).join('') || '<div class="empty">Catàleg buit.</div>'}</div>`;
    document.getElementById('newCenter').onclick = () => renderCenterForm();
    document.getElementById('newEmployeeConfig').onclick = () => renderEmployeeForm(null, 'config');
    document.querySelectorAll('[data-edit-center]').forEach(btn => {
      btn.onclick = () => renderCenterForm(centers.find(item => item.id === btn.dataset.editCenter));
    });
    document.querySelectorAll('[data-edit-employee]').forEach(btn => {
      btn.onclick = () => renderEmployeeForm(employees.find(item => item.id === btn.dataset.editEmployee), 'config');
    });
    setStatus('');
  }

  function dayRow(key, label, criteria) {
    const d = criteria.openingHours?.[key] || {};
    return `<div class="panel" style="padding:12px;margin:8px 0"><div class="grid">
      <div><label><input type="checkbox" data-day="${key}" data-field="open" ${d.open ? 'checked' : ''}> ${label} obert</label></div>
      <div><label>Inici migdia</label><input type="time" data-day="${key}" data-field="lunchStart" value="${esc(d.lunchStart || '')}"></div>
      <div><label>Última reserva migdia</label><input type="time" data-day="${key}" data-field="lunchEnd" value="${esc(d.lunchEnd || '')}"></div>
      <div><label>Inici nit</label><input type="time" data-day="${key}" data-field="dinnerStart" value="${esc(d.dinnerStart || '')}"></div>
      <div><label>Última reserva nit</label><input type="time" data-day="${key}" data-field="dinnerEnd" value="${esc(d.dinnerEnd || '')}"></div>
    </div></div>`;
  }

  async function refreshGmailStatus(centerId) {
    const box = document.getElementById('gmailStatus');
    const connect = document.getElementById('connectGmail');
    const disconnect = document.getElementById('disconnectGmail');
    if (!box || !centerId) return;
    try {
      const s = await govApi('/api/reserves-gmail/status/' + encodeURIComponent(centerId));
      if (!s.ready) {
        box.innerHTML = '<b>Gmail: SERVIDOR PENDENT DE GOOGLE OAUTH</b><div class="muted">Calen les credencials OAuth de Google al servei.</div>';
        connect.disabled = true;
        disconnect.disabled = true;
        return;
      }
      if (s.connected) {
        box.innerHTML = '<b>Gmail: CONNECTAT</b><div class="muted">' + esc(s.email || '') + '</div>';
        connect.textContent = 'Reconnectar Gmail';
        connect.disabled = false;
        disconnect.disabled = false;
      } else {
        box.innerHTML = '<b>Gmail: NO CONNECTAT</b><div class="muted">Autoritza el compte que enviarà les confirmacions.</div>';
        connect.textContent = 'Connectar Gmail';
        connect.disabled = false;
        disconnect.disabled = true;
      }
    } catch (error) {
      box.textContent = error.message || 'Error Gmail';
    }
  }

  async function startGmail(centerId) {
    const out = await govApi('/api/reserves-gmail/start/' + encodeURIComponent(centerId), { method:'POST', body:'{}' });
    if (out.url) window.location.href = out.url;
  }

  function renderCenterForm(center = null) {
    shellActive('config');
    const c = center || {};
    const permissions = c.permissions || {};
    const criteria = c.operatingCriteria || { openingHours:{}, reservations:{ maxPax:10, slotMinutes:10, oneReservationPerSlot:true, groupPhone:'', cancellationPolicy:'' } };
    view.innerHTML = `
      <div class="head"><div><h1>${center ? 'Configurar centre' : 'Nou centre'}</h1><div class="muted">El centre es crea buit: tu decideixes quines eines o miniapps hi poses.</div></div><button class="btn secondary" id="backConfig">← Configuració</button></div>
      <form class="panel" id="centerForm"><div class="grid">
        <div><label>Codi *</label><input id="g_code" required value="${esc(c.code || '')}"></div>
        <div><label>Nom *</label><input id="g_name" required value="${esc(c.name || '')}"></div>
        <div><label>Tipus</label><input id="g_type" value="${esc(c.type || '')}"></div>
        <div><label>Empresa</label><input id="g_company" value="${esc(c.company || '')}"></div>
      </div>
      ${center ? `<div class="panel" style="margin:16px 0"><h3>Activació del centre</h3><div class="grid"><div><label>Codi d'activació</label><input value="${esc(c.activationCode || '')}" readonly></div><div><label>Estat</label><input value="${esc(c.activationStatus === 'VINCULAT' ? 'Vinculat' : 'No vinculat')}" readonly></div><div class="wide"><label>HTML / URL satèl·lit</label><input value="${esc(c.satellitePath || '/centre.html')}" readonly></div></div><div class="toolbar" style="margin-top:12px"><button type="button" class="btn secondary" id="regenActivation">Regenerar codi</button></div></div>` : ''}
      <h3>Criteris operatius del centre</h3>
      <div class="panel" style="margin:16px 0">
        <h4>Horaris i dies d'obertura</h4>
        ${dayRow('mon','Dilluns',criteria)}
        ${dayRow('tue','Dimarts',criteria)}
        ${dayRow('wed','Dimecres',criteria)}
        ${dayRow('thu','Dijous',criteria)}
        ${dayRow('fri','Divendres',criteria)}
        ${dayRow('sat','Dissabte',criteria)}
        ${dayRow('sun','Diumenge',criteria)}
      </div>
      <div class="panel" style="margin:16px 0">
        <h4>Criteris de Reserves</h4>
        <div class="grid">
          <div><label>Màxim pax online</label><input id="c_maxPax" type="number" min="1" value="${Number(criteria.reservations?.maxPax || 10)}"></div>
          <div><label>Interval reserves (min)</label><input id="c_slotMinutes" type="number" min="5" step="5" value="${Number(criteria.reservations?.slotMinutes || 10)}"></div>
          <div><label><input id="c_onePerSlot" type="checkbox" ${criteria.reservations?.oneReservationPerSlot === false ? '' : 'checked'}> Una reserva online per interval</label></div>
          <div><label>Telèfon grups</label><input id="c_groupPhone" value="${esc(criteria.reservations?.groupPhone || '')}"></div>
          <div class="wide"><label>Política de cancel·lació</label><textarea id="c_cancelPolicy">${esc(criteria.reservations?.cancellationPolicy || '')}</textarea></div>
        </div>
      </div>
      ${center ? `<h3>Reserves · Gmail</h3>
      <div class="panel" style="margin:16px 0">
        <div id="gmailStatus">Comprovant Gmail...</div>
        <div class="toolbar" style="margin-top:12px">
          <button type="button" class="btn" id="connectGmail">Connectar Gmail</button>
          <button type="button" class="btn secondary" id="disconnectGmail">Desconnectar</button>
        </div>
      </div>` : ''}
      <h3>Eines / miniapps del centre</h3>
      <div class="checkGrid">${catalog.map(item => `<label class="checkItem"><input type="checkbox" name="centerTool" value="${esc(item.key)}" ${permissions[item.key] === true ? 'checked' : ''}><span><b>${esc(item.label)}</b>${item.connected ? '' : '<span class="tag">pendent connexió</span>'}<br><span class="muted">${esc(item.area)}</span></span></label>`).join('')}</div>
      <div class="toolbar formActions"><label class="inlineCheck"><input id="g_active" type="checkbox" ${c.active === false ? '' : 'checked'}> Centre actiu</label><button class="btn" type="submit">Guardar centre</button></div></form>`;
    document.getElementById('backConfig').onclick = () => refreshGovernState().then(renderConfig).catch(showError);
    const regen = document.getElementById('regenActivation');
    if (regen && center) regen.onclick = async () => {
      try {
        setStatus('Generant codi...');
        const updated = await govApi(`/api/govern/centres/${encodeURIComponent(center.id)}/regenerar-activacio`, { method: 'POST', body: '{}' });
        await refreshGovernState();
        renderCenterForm({ ...center, ...updated, permissions: center.permissions || {} });
        setStatus('Nou codi generat');
      } catch (error) { showError(error); }
    };
    if (center) {
      refreshGmailStatus(center.id);
      const connectGmail = document.getElementById('connectGmail');
      const disconnectGmail = document.getElementById('disconnectGmail');
      if (connectGmail) connectGmail.onclick = () => startGmail(center.id).catch(showError);
      if (disconnectGmail) disconnectGmail.onclick = async () => {
        try {
          await govApi('/api/reserves-gmail/' + encodeURIComponent(center.id), { method:'DELETE' });
          await refreshGmailStatus(center.id);
        } catch (error) { showError(error); }
      };
    }

    document.getElementById('centerForm').onsubmit = async event => {
      event.preventDefault();
      const f = id => document.getElementById(id);
      const openingHours = {};
      for (const key of ['mon','tue','wed','thu','fri','sat','sun']) {
        const pick = field => document.querySelector('[data-day="'+key+'"][data-field="'+field+'"]');
        openingHours[key] = {
          open: pick('open')?.checked === true,
          lunchStart: pick('lunchStart')?.value || '',
          lunchEnd: pick('lunchEnd')?.value || '',
          dinnerStart: pick('dinnerStart')?.value || '',
          dinnerEnd: pick('dinnerEnd')?.value || ''
        };
      }
      const payload = {
        code: f('g_code').value.trim(),
        name: f('g_name').value.trim(),
        type: f('g_type').value.trim(),
        company: f('g_company').value.trim(),
        operatingCriteria: {
          openingHours,
          reservations: {
            maxPax: Number(f('c_maxPax').value || 10),
            slotMinutes: Number(f('c_slotMinutes').value || 10),
            oneReservationPerSlot: f('c_onePerSlot').checked,
            groupPhone: f('c_groupPhone').value.trim(),
            cancellationPolicy: f('c_cancelPolicy').value.trim()
          }
        },
        active: f('g_active').checked
      };
      const selected = new Set([...document.querySelectorAll('input[name="centerTool"]:checked')].map(item => item.value));
      const functions = Object.fromEntries(catalog.map(item => [item.key, selected.has(item.key)]));
      try {
        setStatus('Guardant...');
        const saved = center
          ? await govApi(`/api/govern/centres/${encodeURIComponent(center.id)}`, { method: 'PUT', body: JSON.stringify(payload) })
          : await govApi('/api/govern/centres', { method: 'POST', body: JSON.stringify(payload) });
        await govApi(`/api/govern/centres/${encodeURIComponent(saved.id)}/permisos`, { method: 'PUT', body: JSON.stringify({ functions }) });
        await refreshGovernState();
        renderConfig();
        setStatus('Centre guardat');
      } catch (error) { showError(error); }
    };
  }

  function renderEmployeeForm(employee = null, returnTarget = 'config') {
    shellActive(returnTarget === 'back' ? 'back' : 'config');
    const item = employee || {};
    const assigned = new Set(item.centerIds || []);
    view.innerHTML = `
      <div class="head"><div><h1>${employee ? 'Editar empleat' : 'Nou empleat'}</h1><div class="muted">No es crea cap persona per defecte: només guardem les dades que introdueixes.</div></div><button class="btn secondary" id="backEmployees">← ${returnTarget === 'back' ? 'BACK' : 'Configuració'}</button></div>
      <form class="panel" id="employeeForm"><div class="grid">
        <div><label>Nom *</label><input id="e_name" required value="${esc(item.name || '')}"></div>
        <div><label>Funció / rol</label><input id="e_role" value="${esc(item.role || '')}"></div>
        <div><label>Telèfon</label><input id="e_phone" value="${esc(item.phone || '')}"></div>
        <div><label>Email</label><input id="e_email" type="email" value="${esc(item.email || '')}"></div>
      </div>
      <h3>Centres assignats</h3>
      <div class="checkGrid">${centers.map(center => `<label class="checkItem"><input type="checkbox" name="employeeCenter" value="${esc(center.id)}" ${assigned.has(center.id) ? 'checked' : ''}><span>${esc(center.name)}</span></label>`).join('') || '<div class="empty compact">Encara no hi ha centres creats. L’empleat pot quedar sense centre.</div>'}</div>
      <div class="toolbar formActions"><label class="inlineCheck"><input id="e_active" type="checkbox" ${item.active === false ? '' : 'checked'}> Empleat actiu</label><button class="btn" type="submit">Guardar empleat</button></div></form>`;
    const back = () => refreshGovernState().then(returnTarget === 'back' ? renderBackOffice : renderConfig).catch(showError);
    document.getElementById('backEmployees').onclick = back;
    document.getElementById('employeeForm').onsubmit = async event => {
      event.preventDefault();
      const f = id => document.getElementById(id);
      const payload = {
        name: f('e_name').value.trim(),
        role: f('e_role').value.trim(),
        phone: f('e_phone').value.trim(),
        email: f('e_email').value.trim(),
        centerIds: [...document.querySelectorAll('input[name="employeeCenter"]:checked')].map(input => input.value),
        active: f('e_active').checked
      };
      try {
        setStatus('Guardant...');
        if (employee) await govApi(`/api/govern/employees/${encodeURIComponent(employee.id)}`, { method: 'PUT', body: JSON.stringify(payload) });
        else await govApi('/api/govern/employees', { method: 'POST', body: JSON.stringify(payload) });
        await refreshGovernState();
        if (returnTarget === 'back') renderBackOffice(); else renderConfig();
        setStatus('Empleat guardat');
      } catch (error) { showError(error); }
    };
  }

  function reloadShell() {
    if (currentShell === 'front') return renderFrontOffice();
    if (currentShell === 'back') return renderBackOffice();
    if (currentShell === 'config') return renderConfig();
    return renderHome();
  }

  document.querySelector('[data-shell="front"]').onclick = renderFrontOffice;
  document.querySelector('[data-shell="back"]').onclick = renderBackOffice;
  document.querySelector('[data-shell="config"]').onclick = () => refreshGovernState().then(renderConfig).catch(showError);

  const bootQuery = new URLSearchParams(location.search);
  refreshGovernState().then(() => {
    if (bootQuery.get('gmail') === 'connected' && bootQuery.get('centerId')) {
      currentCenterId = bootQuery.get('centerId');
      localStorage.setItem(STORAGE_KEY, currentCenterId);
      renderSelector();
      renderBadge();
      const center = centers.find(item => item.id === currentCenterId);
      if (center) {
        history.replaceState({}, '', '/');
        return renderCenterForm(center);
      }
    }
    renderHome();
  }).catch(showError);
})();
