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
      const brand = document.querySelector('.side .brand');
      brand.insertAdjacentElement('afterend', box);
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
        ${toolCard('Front Office', 'Eines operatives de cara al servei.', 'home_front')}
        ${toolCard('Back Office', 'Eines de gestió i seguiment.', 'home_back')}
        ${toolCard('RRHH', 'Empleats i eines de persones.', 'home_rrhh')}
        ${toolCard('Configuració', 'Crear centres, empleats i assignar eines o miniapps.', 'home_config')}
      </div>`;
    setStatus('');
    document.querySelector('[data-tool="home_front"]').onclick = renderFrontOffice;
    document.querySelector('[data-tool="home_back"]').onclick = renderBackOffice;
    document.querySelector('[data-tool="home_rrhh"]').onclick = () => refreshGovernState().then(renderRrhh).catch(showError);
    document.querySelector('[data-tool="home_config"]').onclick = () => refreshGovernState().then(renderConfig).catch(showError);
  }

  function renderFrontOffice() {
    shellActive('front');
    const cards = [
      functionAllowed('reservations') ? toolCard('Reserves / Ocupació', 'Obre l’eina de reserves existent.', 'reserves') : ''
    ].join('') + pendingCards('Front Office');
    view.innerHTML = `
      <div class="head"><div><h1>Front Office</h1><div class="muted">Aquí només apareixen eines reals connectades o assignacions pendents identificades com a tals.</div></div></div>
      <div class="toolGrid">${cards || '<div class="panel empty">Aquest centre no té eines de Front Office assignades.</div>'}</div>`;
    setStatus('');
    bindToolCards();
  }

  function renderBackOffice() {
    shellActive('back');
    const cards = [
      functionAllowed('crm') ? toolCard('CRM', 'Contactes i seguiment CRM existent.', 'crm') : '',
      functionAllowed('commercial') ? toolCard('Comercial / Grups', 'Gestió comercial existent.', 'commercial') : ''
    ].join('') + pendingCards('Back Office');
    view.innerHTML = `
      <div class="head"><div><h1>Back Office</h1><div class="muted">Eines de gestió connectades al sistema.</div></div></div>
      <div class="toolGrid">${cards || '<div class="panel empty">Aquest centre no té eines de Back Office assignades.</div>'}</div>`;
    setStatus('');
    bindToolCards();
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
    shellActive('rrhh');
    const rows = visibleEmployees();
    const pending = pendingCards('RRHH');
    view.innerHTML = `
      <div class="head"><div><h1>RRHH</h1><div class="muted">No hi ha empleats predefinits: només es mostren els que s’han creat.</div></div><button class="btn" id="newEmployee">+ Nou empleat</button></div>
      ${pending ? `<div class="toolGrid" style="margin-bottom:18px">${pending}</div>` : ''}
      <div class="panel tableWrap"><table><thead><tr><th>Nom</th><th>Funció / rol</th><th>Centre</th><th>Estat</th><th></th></tr></thead><tbody>
        ${rows.map(item => `<tr><td><b>${esc(item.name)}</b></td><td>${esc(item.role || '—')}</td><td>${esc(centerNames(item.centerIds))}</td><td>${item.active === false ? 'Inactiu' : 'Actiu'}</td><td><button class="rowBtn" data-edit-employee="${esc(item.id)}">Editar</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">No hi ha empleats creats en aquest context.</td></tr>'}
      </tbody></table></div>`;
    document.getElementById('newEmployee').onclick = () => renderEmployeeForm(null, 'rrhh');
    document.querySelectorAll('[data-edit-employee]').forEach(btn => {
      btn.onclick = () => renderEmployeeForm(employees.find(item => item.id === btn.dataset.editEmployee), 'rrhh');
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

  function renderCenterForm(center = null) {
    shellActive('config');
    const c = center || {};
    const permissions = c.permissions || {};
    view.innerHTML = `
      <div class="head"><div><h1>${center ? 'Configurar centre' : 'Nou centre'}</h1><div class="muted">El centre es crea buit: tu decideixes quines eines o miniapps hi poses.</div></div><button class="btn secondary" id="backConfig">← Configuració</button></div>
      <form class="panel" id="centerForm"><div class="grid">
        <div><label>Codi *</label><input id="g_code" required value="${esc(c.code || '')}"></div>
        <div><label>Nom *</label><input id="g_name" required value="${esc(c.name || '')}"></div>
        <div><label>Tipus</label><input id="g_type" value="${esc(c.type || '')}"></div>
        <div><label>Empresa</label><input id="g_company" value="${esc(c.company || '')}"></div>
      </div>
      <h3>Eines / miniapps del centre</h3>
      <div class="checkGrid">${catalog.map(item => `<label class="checkItem"><input type="checkbox" name="centerTool" value="${esc(item.key)}" ${permissions[item.key] === true ? 'checked' : ''}><span><b>${esc(item.label)}</b>${item.connected ? '' : '<span class="tag">pendent connexió</span>'}<br><span class="muted">${esc(item.area)}</span></span></label>`).join('')}</div>
      <div class="toolbar formActions"><label class="inlineCheck"><input id="g_active" type="checkbox" ${c.active === false ? '' : 'checked'}> Centre actiu</label><button class="btn" type="submit">Guardar centre</button></div></form>`;
    document.getElementById('backConfig').onclick = () => refreshGovernState().then(renderConfig).catch(showError);
    document.getElementById('centerForm').onsubmit = async event => {
      event.preventDefault();
      const f = id => document.getElementById(id);
      const payload = {
        code: f('g_code').value.trim(),
        name: f('g_name').value.trim(),
        type: f('g_type').value.trim(),
        company: f('g_company').value.trim(),
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
    shellActive(returnTarget === 'rrhh' ? 'rrhh' : 'config');
    const item = employee || {};
    const assigned = new Set(item.centerIds || []);
    view.innerHTML = `
      <div class="head"><div><h1>${employee ? 'Editar empleat' : 'Nou empleat'}</h1><div class="muted">No es crea cap persona per defecte: només guardem les dades que introdueixes.</div></div><button class="btn secondary" id="backEmployees">← ${returnTarget === 'rrhh' ? 'RRHH' : 'Configuració'}</button></div>
      <form class="panel" id="employeeForm"><div class="grid">
        <div><label>Nom *</label><input id="e_name" required value="${esc(item.name || '')}"></div>
        <div><label>Funció / rol</label><input id="e_role" value="${esc(item.role || '')}"></div>
        <div><label>Telèfon</label><input id="e_phone" value="${esc(item.phone || '')}"></div>
        <div><label>Email</label><input id="e_email" type="email" value="${esc(item.email || '')}"></div>
      </div>
      <h3>Centres assignats</h3>
      <div class="checkGrid">${centers.map(center => `<label class="checkItem"><input type="checkbox" name="employeeCenter" value="${esc(center.id)}" ${assigned.has(center.id) ? 'checked' : ''}><span>${esc(center.name)}</span></label>`).join('') || '<div class="empty compact">Encara no hi ha centres creats. L’empleat pot quedar sense centre.</div>'}</div>
      <div class="toolbar formActions"><label class="inlineCheck"><input id="e_active" type="checkbox" ${item.active === false ? '' : 'checked'}> Empleat actiu</label><button class="btn" type="submit">Guardar empleat</button></div></form>`;
    const back = () => refreshGovernState().then(returnTarget === 'rrhh' ? renderRrhh : renderConfig).catch(showError);
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
        if (returnTarget === 'rrhh') renderRrhh(); else renderConfig();
        setStatus('Empleat guardat');
      } catch (error) { showError(error); }
    };
  }

  function reloadShell() {
    if (currentShell === 'front') return renderFrontOffice();
    if (currentShell === 'back') return renderBackOffice();
    if (currentShell === 'rrhh') return renderRrhh();
    if (currentShell === 'config') return renderConfig();
    return renderHome();
  }

  document.querySelector('[data-shell="home"]').onclick = renderHome;
  document.querySelector('[data-shell="front"]').onclick = renderFrontOffice;
  document.querySelector('[data-shell="back"]').onclick = renderBackOffice;
  document.querySelector('[data-shell="rrhh"]').onclick = () => refreshGovernState().then(renderRrhh).catch(showError);
  document.querySelector('[data-shell="config"]').onclick = () => refreshGovernState().then(renderConfig).catch(showError);

  refreshGovernState().then(renderHome).catch(showError);
})();
