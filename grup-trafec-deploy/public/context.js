'use strict';

(() => {
  const nativeFetch = window.fetch.bind(window);
  const STORAGE_KEY = 'grupTrafeCenterId';
  const SATELLITES = Object.freeze({
    '/sarriera': 'S1930',
    '/sarriera/': 'S1930'
  });
  const satelliteCode = SATELLITES[window.location.pathname.toLowerCase()] || '';
  const satelliteMode = Boolean(satelliteCode);
  let centers = [];
  let currentCenterId = satelliteMode ? '' : (localStorage.getItem(STORAGE_KEY) || '');

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
    if (!center) return !satelliteMode;
    return !center.permissions || center.permissions[key] !== false;
  }

  function applySatelliteIdentity() {
    if (!satelliteMode) return;
    const center = selectedCenter();
    const brand = document.querySelector('.side .brand');
    if (brand) brand.textContent = center?.name || 'SARRIERA 1930';
    document.title = `${center?.name || 'SARRIERA 1930'} · GRUP TRÀFEC`;
  }

  function applyMenuPermissions() {
    const mapping = {
      crm: 'crm',
      commercial: 'commercial',
      reservations: 'reservations'
    };
    Object.entries(mapping).forEach(([viewName, permissionKey]) => {
      const button = document.querySelector(`[data-view="${viewName}"]`);
      if (button) button.style.display = functionAllowed(permissionKey) ? '' : 'none';
    });

    const governButton = document.querySelector('[data-view="govern"]');
    if (governButton && satelliteMode) governButton.remove();

    const active = document.querySelector('.side button.active');
    const activeName = active?.dataset.view || 'home';
    if (mapping[activeName] && !functionAllowed(mapping[activeName])) {
      setActive('home');
      renderHome();
    }
  }

  function renderBadge() {
    let badge = document.getElementById('contextBadge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'contextBadge';
      badge.style.marginBottom = '12px';
      badge.style.fontSize = '13px';
      badge.style.fontWeight = '700';
      document.querySelector('.main').insertBefore(badge, document.getElementById('status'));
    }
    const center = selectedCenter();
    if (!center) {
      badge.textContent = satelliteMode ? 'Sarriera 1930 · connexió pendent' : 'Context: GRUP TRÀFEC · visió global';
      return;
    }
    const enabled = [
      functionAllowed('crm') ? 'CRM' : '',
      functionAllowed('commercial') ? 'Comercial' : '',
      functionAllowed('reservations') ? 'Reserves' : ''
    ].filter(Boolean).join(' · ');
    badge.textContent = satelliteMode
      ? `${center.name} · ${enabled || 'sense funcions operatives'}`
      : `Centre actiu: ${center.name} · ${enabled || 'sense funcions operatives'}`;
  }

  function renderSelector() {
    let box = document.getElementById('centerContextBox');
    if (satelliteMode) {
      if (box) box.remove();
      return;
    }
    if (!box) {
      box = document.createElement('div');
      box.id = 'centerContextBox';
      box.style.marginBottom = '18px';
      box.innerHTML = '<label style="color:#aaa;font-size:11px;text-transform:uppercase">Centre de treball</label><select id="centerContextSelect" style="margin-top:5px;background:#fff;color:#111"></select>';
      const brand = document.querySelector('.side .brand');
      brand.insertAdjacentElement('afterend', box);
    }
    const select = document.getElementById('centerContextSelect');
    select.innerHTML = '<option value="">GRUP TRÀFEC · tots</option>' + centers
      .filter(item => item.active !== false)
      .map(item => `<option value="${String(item.id).replace(/"/g, '&quot;')}">${item.name}</option>`)
      .join('');
    select.value = currentCenterId;
    select.onchange = () => {
      currentCenterId = select.value;
      localStorage.setItem(STORAGE_KEY, currentCenterId);
      applyMenuPermissions();
      renderBadge();
      reloadCurrentView();
    };
  }

  function reloadCurrentView() {
    const active = document.querySelector('.side button.active');
    const name = active?.dataset.view || 'home';
    if (name === 'crm' && functionAllowed('crm')) return loadCrm().catch(showError);
    if (name === 'commercial' && functionAllowed('commercial')) return loadCommercial().catch(showError);
    if (name === 'reservations' && functionAllowed('reservations')) return loadReservations().catch(showError);
    if (name === 'govern' && !satelliteMode) return loadGovern().catch(showError);
    setActive('home');
    renderHome();
  }

  function ensureGovernButton() {
    if (satelliteMode || document.querySelector('[data-view="govern"]')) return;
    const button = document.createElement('button');
    button.dataset.view = 'govern';
    button.textContent = 'Govern / Centres';
    const home = document.querySelector('[data-view="home"]');
    home.insertAdjacentElement('afterend', button);
    button.onclick = () => {
      setActive('govern');
      loadGovern().catch(showError);
    };
  }

  async function refreshCenters() {
    const out = await govApi('/api/govern/centres?includeInactive=1');
    centers = out.items || [];

    if (satelliteMode) {
      const satellite = centers.find(item => item.active !== false && String(item.code || '').toUpperCase() === satelliteCode);
      currentCenterId = satellite?.id || '';
    } else if (currentCenterId && !centers.some(item => item.id === currentCenterId && item.active !== false)) {
      currentCenterId = '';
      localStorage.setItem(STORAGE_KEY, '');
    }

    applySatelliteIdentity();
    renderSelector();
    applyMenuPermissions();
    renderBadge();
    return out;
  }

  async function loadGovern() {
    if (satelliteMode) return reloadCurrentView();
    setStatus('Carregant centres...');
    const out = await refreshCenters();
    const root = document.getElementById('view');
    root.innerHTML = `
      <div class="head"><div><h1>Govern · Centres de treball</h1><div class="muted">Identitat dels centres, estat i funcions habilitades des d'un únic nucli.</div></div><button class="btn" id="newCenter">+ Nou centre</button></div>
      <div class="panel tableWrap"><table><thead><tr><th>Codi</th><th>Centre</th><th>Empresa</th><th>Estat</th><th>Funcions</th><th></th></tr></thead><tbody>
      ${(out.items || []).map(item => {
        const p = item.permissions || {};
        const enabled = [p.crm !== false ? 'CRM' : '', p.commercial !== false ? 'Comercial' : '', p.reservations !== false ? 'Reserves' : ''].filter(Boolean).join(' · ');
        return `<tr><td><b>${esc(item.code)}</b></td><td>${esc(item.name)}</td><td>${esc(item.company || '—')}</td><td>${item.active === false ? 'Inactiu' : 'Actiu'}</td><td>${esc(enabled || 'Cap')}</td><td><button class="rowBtn" data-edit-center="${esc(item.id)}">Editar</button></td></tr>`;
      }).join('') || '<tr><td colspan="6" class="empty">No hi ha centres definits.</td></tr>'}
      </tbody></table></div>`;
    document.getElementById('newCenter').onclick = () => renderCenterForm();
    document.querySelectorAll('[data-edit-center]').forEach(btn => {
      btn.onclick = () => renderCenterForm(centers.find(item => item.id === btn.dataset.editCenter));
    });
    setStatus(`${centers.length} centres configurats`);
  }

  function renderCenterForm(center = null) {
    const c = center || {};
    const p = c.permissions || { crm: true, commercial: true, reservations: true };
    const root = document.getElementById('view');
    root.innerHTML = `
      <div class="head"><div><h1>${center ? 'Editar centre' : 'Nou centre'}</h1><div class="muted">Govern central de GRUP TRÀFEC.</div></div><button class="btn secondary" id="backGovern">← Centres</button></div>
      <form class="panel" id="centerForm"><div class="grid">
        <div><label>Codi *</label><input id="g_code" required value="${esc(c.code || '')}"></div>
        <div><label>Nom *</label><input id="g_name" required value="${esc(c.name || '')}"></div>
        <div><label>Tipus</label><input id="g_type" value="${esc(c.type || 'Restaurant')}"></div>
        <div><label>Empresa</label><input id="g_company" value="${esc(c.company || 'Grup Tràfec')}"></div>
        <div class="wide"><label><input id="g_active" type="checkbox" style="width:auto" ${c.active === false ? '' : 'checked'}> Centre actiu</label></div>
        <div class="wide"><label>Funcions habilitades</label><div class="toolbar">
          <label><input id="g_crm" type="checkbox" style="width:auto" ${p.crm === false ? '' : 'checked'}> CRM</label>
          <label><input id="g_commercial" type="checkbox" style="width:auto" ${p.commercial === false ? '' : 'checked'}> Comercial / Grups</label>
          <label><input id="g_reservations" type="checkbox" style="width:auto" ${p.reservations === false ? '' : 'checked'}> Reserves / Ocupació</label>
        </div></div>
      </div><div class="toolbar" style="margin-top:16px"><button class="btn" type="submit">Guardar centre</button><button class="btn secondary" type="button" id="cancelCenter">Cancel·lar</button></div></form>`;
    const back = () => loadGovern().catch(showError);
    document.getElementById('backGovern').onclick = back;
    document.getElementById('cancelCenter').onclick = back;
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
      const permissions = { functions: { crm: f('g_crm').checked, commercial: f('g_commercial').checked, reservations: f('g_reservations').checked } };
      try {
        setStatus('Guardant...');
        let saved;
        if (center) saved = await govApi(`/api/govern/centres/${encodeURIComponent(center.id)}`, { method: 'PUT', body: JSON.stringify(payload) });
        else saved = await govApi('/api/govern/centres', { method: 'POST', body: JSON.stringify(payload) });
        await govApi(`/api/govern/centres/${encodeURIComponent(saved.id)}/permisos`, { method: 'PUT', body: JSON.stringify(permissions) });
        await loadGovern();
        setStatus('Centre guardat');
      } catch (error) { showError(error); }
    };
  }

  ensureGovernButton();
  refreshCenters().catch(showError);
})();
