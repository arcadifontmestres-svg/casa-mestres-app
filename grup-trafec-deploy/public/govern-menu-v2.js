'use strict';

(() => {
  const view = document.getElementById('view');
  const statusEl = document.getElementById('status');

  async function getCatalog() {
    const response = await fetch('/api/govern/catalog');
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
    return data.items || [];
  }

  function setStatusLocal(text = '') {
    if (statusEl) statusEl.textContent = text;
  }

  function escLocal(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function card(item, text, disabled = false) {
    return `<button class="toolCard" data-govern-tool="${escLocal(item.key)}" ${disabled ? 'disabled' : ''}>
      <span class="toolTitle">${escLocal(item.label)}</span>
      <span class="toolText">${escLocal(text)}</span>
    </button>`;
  }

  function forceGlobalContext() {
    const select = document.getElementById('centerContextSelect');
    if (select && select.value) {
      select.value = '';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function openConnectedTool(key) {
    forceGlobalContext();
    if (key === 'reservations' && typeof loadReservations === 'function') return loadReservations().catch(showError);
    if (key === 'crm' && typeof loadCrm === 'function') return loadCrm().catch(showError);
    if (key === 'commercial' && typeof loadCommercial === 'function') return loadCommercial().catch(showError);
  }

  function bindBackOfficeCards(catalog) {
    document.querySelectorAll('[data-govern-tool]').forEach(button => {
      button.addEventListener('click', () => {
        if (button.disabled) return;
        const key = button.dataset.governTool;
        const item = catalog.find(x => x.key === key);
        if (!item) return;
        if (key === 'front_office_tpv') return renderTpvGateway(item);
        return openConnectedTool(key);
      });
    });
  }

  async function renderBackOfficeGovern() {
    try {
      setStatusLocal('Carregant eines...');
      const catalog = await getCatalog();
      const tools = catalog.filter(item => item.key !== 'front_office_tpv');
      const cards = tools.map(item => {
        if (item.connected) return card(item, 'Connectada · accés de direcció en visió global.');
        return card(item, 'Miniapp pendent de connectar al sistema.', true);
      }).join('');

      view.innerHTML = `
        <div class="head"><div><h1>Back Office</h1><div class="muted">Accés de direcció a totes les miniapps i eines del Grup Tràfec. No depèn dels permisos assignats a cap centre.</div></div></div>
        <div class="panel"><b>Criteri de govern</b><p>Gestió Grup Tràfec no és un centre de treball i no s'ha d'autoritzar a si mateixa. Les autoritzacions de centre només decideixen quines miniapps pot utilitzar aquell centre.</p></div>
        <div class="toolGrid">${cards || '<div class="panel empty">No hi ha eines al catàleg.</div>'}</div>`;
      setStatusLocal('');
      bindBackOfficeCards(catalog);
    } catch (error) {
      if (typeof showError === 'function') showError(error);
    }
  }

  function renderTpvGateway(tpvItem = { connected: false }) {
    const state = tpvItem.connected ? 'Miniapp TPV connectada' : 'Estructura preparada · miniapp TPV pendent de connexió funcional';
    view.innerHTML = `
      <div class="head"><div><h1>Front Office / TPV</h1><div class="muted">Porta de direcció per configurar els punts de venda i el servei del local.</div></div></div>
      <div class="panel"><b>${escLocal(state)}</b><p>Aquest espai és de configuració i govern del TPV. No és la pantalla operativa de cobrament.</p></div>
      <div class="toolGrid">
        ${card({ key: 'tpv_points', label: 'Punts de venda' }, 'Crear i configurar terminals o punts de venda.', !tpvItem.connected)}
        ${card({ key: 'tpv_products', label: 'Productes de venda' }, 'Alta de productes i articles disponibles al TPV.', !tpvItem.connected)}
        ${card({ key: 'tpv_prices', label: 'Preus de venda' }, 'Modificar i governar preus de venda.', !tpvItem.connected)}
        ${card({ key: 'tpv_local', label: 'Configuració del local' }, 'Paràmetres generals de funcionament del centre.', !tpvItem.connected)}
        ${card({ key: 'tpv_zones', label: 'Zones i taules' }, 'Definir sales, zones, taules i distribució.', !tpvItem.connected)}
        ${card({ key: 'tpv_occupancy', label: 'Ocupació' }, 'Configuració de capacitats i ocupació vinculada al servei.', !tpvItem.connected)}
      </div>`;
    setStatusLocal('');
  }

  async function renderFrontOfficeGovern() {
    try {
      setStatusLocal('Carregant TPV...');
      const catalog = await getCatalog();
      const tpv = catalog.find(item => item.key === 'front_office_tpv') || {
        key: 'front_office_tpv', label: 'Front Office / TPV', connected: false
      };
      view.innerHTML = `
        <div class="head"><div><h1>Front Office</h1><div class="muted">Per Direcció, Front Office és la porta d'entrada a la configuració de la miniapp TPV.</div></div></div>
        <div class="toolGrid">${card(tpv, 'Configurar punts de venda, productes, preus, local, zones, taules i ocupació.')}</div>`;
      setStatusLocal('');
      const button = document.querySelector('[data-govern-tool="front_office_tpv"]');
      if (button) button.addEventListener('click', () => renderTpvGateway(tpv));
    } catch (error) {
      if (typeof showError === 'function') showError(error);
    }
  }

  function hookShell(selector, renderer) {
    const button = document.querySelector(selector);
    if (!button) return;
    button.addEventListener('click', () => setTimeout(renderer, 0));
  }

  hookShell('[data-shell="front"]', renderFrontOfficeGovern);
  hookShell('[data-shell="back"]', renderBackOfficeGovern);

  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-tool="home_front"], [data-tool="home_back"]');
    if (!trigger) return;
    if (trigger.dataset.tool === 'home_front') setTimeout(renderFrontOfficeGovern, 0);
    if (trigger.dataset.tool === 'home_back') setTimeout(renderBackOfficeGovern, 0);
  });
})();
