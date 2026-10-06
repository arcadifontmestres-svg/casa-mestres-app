(function () {
  'use strict';

  const A = window.ArcadiERP;
  if (!A) throw new Error('Falta arcadi-runtime.js');
  const STORAGE_KEY = 'arcadi_work_context_v1';
  const LEGACY_COMPANY = 'company_casa_mestres';
  const LEGACY_CENTRE = 'restaurant_casa_mestres';

  function savedContext() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
  }

  const params = new URLSearchParams(location.search);
  const incomingContext = {
    companyId: String(params.get('companyId') || '').trim(),
    centreId: String(params.get('centreId') || '').trim(),
    centreName: String(params.get('centreName') || '').trim(),
    miniapp: params.get('miniapp') === '1'
  };
  A.context = { companyId: '', centreId: '', ...savedContext() };
  if (incomingContext.companyId) {
    A.context.companyId = incomingContext.companyId;
    A.context.centreId = incomingContext.centreId;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(A.context));
  }

  A.organisations = function () {
    return Array.isArray(this.state?.organizations) ? this.state.organizations.filter(x => x.status !== 'Inactiva') : [];
  };

  A.centres = function (companyId = this.context.companyId) {
    return (this.state?.restaurants || []).filter(x =>
      x.kind !== 'GROUP' && x.status !== 'Inactiu' && (!companyId || x.organizationId === companyId)
    );
  };

  A.contextRecord = function (record = {}) {
    const companyId = this.context.companyId || LEGACY_COMPANY;
    const centreId = this.context.centreId || '';
    return {
      ...record,
      companyId: record.companyId || companyId,
      centreId: record.centreId || centreId,
      scope: record.scope || (centreId ? 'CENTRE' : 'COMPANY')
    };
  };

  A.recordInContext = function (record) {
    const companyId = this.context.companyId;
    const centreId = this.context.centreId;
    const recordCompany = record.companyId || LEGACY_COMPANY;
    const recordCentre = record.centreId || (recordCompany === LEGACY_COMPANY ? LEGACY_CENTRE : '');
    if (companyId && recordCompany !== companyId) return false;
    if (!centreId) return true;
    if (record.scope === 'COMPANY' || record.scope === 'CORPORATE') return recordCompany === companyId;
    return recordCentre === centreId || (Array.isArray(record.centreIds) && record.centreIds.includes(centreId));
  };

  A.scopedCollection = function (name) {
    return this.collection(name).filter(record => this.recordInContext(record));
  };

  A.setContext = function (companyId, centreId = '') {
    this.context = { companyId: String(companyId || ''), centreId: String(centreId || '') };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.context));
    renderSelector();
    if (typeof window.applyCoreContext === 'function') window.applyCoreContext();
    const hash = location.hash.slice(1);
    if (hash.startsWith('arcadi-') && window.ArcadiModules) {
      const key = hash.replace('arcadi-', '');
      if (key.startsWith('section-')) window.ArcadiModules.openSection(key.replace('section-', ''));
      else if (key === 'hub') window.ArcadiModules.hub();
      else window.ArcadiModules.open(key);
    } else if (typeof window.show === 'function') {
      window.show('home');
    }
  };

  function option(value, label, selected) {
    return `<option value="${A.esc(value)}" ${value === selected ? 'selected' : ''}>${A.esc(label)}</option>`;
  }

  function renderSelector() {
    if (!A.state) return;
    const top = document.querySelector('.top');
    if (!top) return;
    let bar = document.getElementById('arcadiContextBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'arcadiContextBar';
      bar.className = 'arcadiContextBar';
      top.insertAdjacentElement('afterend', bar);
    }
    const orgs = A.organisations();
    if (!A.context.companyId || !orgs.some(x => x.id === A.context.companyId)) {
      A.context.companyId = orgs[0]?.id || '';
      A.context.centreId = '';
    }
    const centres = A.centres(A.context.companyId);
    if (incomingContext.centreName) {
      const wanted = incomingContext.centreName.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
      const matched = centres.find(x => String(x.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim() === wanted);
      if (matched) A.context.centreId = matched.id;
    }
    if (A.context.centreId && !centres.some(x => x.id === A.context.centreId)) A.context.centreId = '';
    const companyName = orgs.find(x => x.id === A.context.companyId)?.name || 'Empresa';
    const centreName = centres.find(x => x.id === A.context.centreId)?.name || 'Tot el grup';
    if (incomingContext.miniapp) {
      bar.innerHTML = `<div class="arcadiContextCurrent"><small>CENTRE ACTIU</small><b>${A.esc(centreName)}</b></div>`;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(A.context));
    } else {
      bar.innerHTML = `
        <div><small>EMPRESA</small><select id="arcadiCompanySelect">${orgs.map(x => option(x.id, x.name, A.context.companyId)).join('')}</select></div>
        <div><small>CENTRE DE TREBALL</small><select id="arcadiCentreSelect">${option('', 'Tot el grup · visió de Direcció', A.context.centreId)}${centres.map(x => option(x.id, x.name, A.context.centreId)).join('')}</select></div>
        <div class="arcadiContextCurrent"><small>CONTEXT ACTIU</small><b>${A.esc(companyName)} · ${A.esc(centreName)}</b></div>`;
      document.getElementById('arcadiCompanySelect').onchange = event => A.setContext(event.target.value, '');
      document.getElementById('arcadiCentreSelect').onchange = event => A.setContext(A.context.companyId, event.target.value);
    }
  }

  const originalLoad = A.load.bind(A);
  A.load = async function () {
    const state = await originalLoad();
    renderSelector();
    return state;
  };

  window.addEventListener('load', async () => {
    if (!A.state) await A.load();
    renderSelector();
  });

  window.ArcadiContext = { render: renderSelector };
})();
