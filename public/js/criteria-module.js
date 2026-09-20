(function () {
  'use strict';

  const A = window.ArcadiERP;
  const e = value => A.esc(value);
  const STATES = {
    DETECTADA: 'Detectada',
    EN_ESTUDI: 'En estudi',
    EN_PROVA: 'En prova',
    PENDENT_APROVACIO: 'Pendent aprovació',
    APROVADA: 'Aprovada',
    PUBLICADA: 'Publicada',
    EN_IMPLANTACIO: 'En implantació',
    IMPLANTADA: 'Implantada',
    REBUTJADA: 'Rebutjada',
    SUBSTITUIDA: 'Substituïda'
  };
  const NEXT = {
    DETECTADA: ['EN_ESTUDI', 'REBUTJADA'],
    EN_ESTUDI: ['EN_PROVA', 'PENDENT_APROVACIO', 'REBUTJADA'],
    EN_PROVA: ['EN_ESTUDI', 'PENDENT_APROVACIO', 'REBUTJADA'],
    PENDENT_APROVACIO: ['EN_ESTUDI', 'APROVADA', 'REBUTJADA'],
    APROVADA: ['PUBLICADA', 'SUBSTITUIDA'],
    PUBLICADA: ['EN_IMPLANTACIO', 'SUBSTITUIDA'],
    EN_IMPLANTACIO: ['IMPLANTADA', 'PUBLICADA', 'SUBSTITUIDA'],
    IMPLANTADA: ['SUBSTITUIDA'],
    REBUTJADA: ['EN_ESTUDI'],
    SUBSTITUIDA: []
  };

  function organisations() {
    const items = A.state.organizations || [];
    if (items.length) return items;
    return [{ id: 'company_casa_mestres', name: A.state.company?.name || 'Casa Mestres', status: 'Activa' }];
  }

  function centresFor(companyId) {
    return (A.state.restaurants || []).filter(item => !companyId || !item.organizationId || item.organizationId === companyId);
  }

  function render() {
    const criteria = A.state.governanceCriteria || [];
    const standards = A.state.corporateStandards || [];
    const tasks = A.state.governanceTasks || [];
    const communications = A.state.communications || [];
    const centreName = id => (A.state.restaurants || []).find(item => item.id === id)?.name || id;
    const rows = [...criteria].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))).map(item => {
      const centres = (item.centreIds || []).map(centreName).join(', ') || 'Per determinar';
      return `<tr>
        <td><b>${e(item.title)}</b><br><span class="muted">${e(item.area || 'Operacions')}</span></td>
        <td>${e(centres)}</td>
        <td><span class="badge">${e(STATES[item.state] || item.state)}</span></td>
        <td>v${e(item.version || 1)}</td>
        <td>${e(item.ownerId || 'Per assignar')}</td>
        <td class="arcadiRowActions"><button class="btn small secondary" data-criterion-edit="${e(item.id)}">Obrir</button></td>
      </tr>`;
    }).join('');

    return `
      <div class="notice"><b>Ús de Direcció:</b> aquest mòdul transforma una necessitat pendent en un criteri estudiat, aprovat, publicat i implantat. Una proposta no modifica receptes ni APPCC fins que Direcció l'aprova.</div>
      <div class="arcadiStats">
        <div class="arcadiStat"><strong>${criteria.length}</strong><b>Criteris</b><span>Total registrat</span></div>
        <div class="arcadiStat"><strong>${criteria.filter(x => x.state === 'PENDENT_APROVACIO').length}</strong><b>Pendents</b><span>Esperen decisió</span></div>
        <div class="arcadiStat"><strong>${standards.filter(x => x.status !== 'SUBSTITUIDA').length}</strong><b>Estàndards</b><span>Corporatius vigents</span></div>
        <div class="arcadiStat"><strong>${tasks.filter(x => x.status !== 'COMPLETADA').length}</strong><b>Tasques</b><span>Seguiment pendent</span></div>
      </div>
      <div class="panel">
        <div class="toolbar"><button class="btn" data-criterion-new>Nou criteri</button><button class="btn secondary" data-criterion-refresh>Actualitzar</button></div>
        <div class="tableWrap"><table><thead><tr><th>Criteri</th><th>Centres</th><th>Estat</th><th>Versió</th><th>Responsable</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6">Encara no hi ha criteris. Crea el primer quan detectis una qüestió que Direcció ha de definir.</td></tr>'}</tbody></table></div>
      </div>
      <div class="panel">
        <h3>Connexions del sistema</h3>
        <div class="arcadiKeyValue">
          <b>Receptes i bases</b><span>Els criteris aprovats poden generar un estàndard corporatiu sense sobreescriure fitxes locals.</span>
          <b>APPCC</b><span>Les plantilles comunes es publiquen; cada centre manté equips, punts crítics i registres propis.</span>
          <b>Comunicacions</b><span>${communications.filter(x => x.sourceType === 'criterion').length} avisos generats des de criteris.</span>
          <b>Tasques</b><span>${tasks.length} tasques de preparació o implantació vinculades.</span>
        </div>
      </div>`;
  }

  function organisationOptions(selected) {
    return organisations().map(item => `<option value="${e(item.id)}" ${item.id === selected ? 'selected' : ''}>${e(item.name)}</option>`).join('');
  }

  function centreChecks(selected, companyId) {
    const active = new Set(selected || []);
    return centresFor(companyId).map(item => `<label class="arcadiCheckOption"><input type="checkbox" name="centreIds" value="${e(item.id)}" ${active.has(item.id) ? 'checked' : ''}> <span>${e(item.name)}</span></label>`).join('') || '<span class="muted">Primer cal assignar centres a aquesta empresa.</span>';
  }

  function openForm(id = '') {
    const criterion = (A.state.governanceCriteria || []).find(item => item.id === id) || {};
    const companyId = criterion.companyId || organisations()[0]?.id || '';
    A.modal(id ? 'Criteri i estàndard' : 'Nou criteri pendent', `
      <form id="criterionForm" class="arcadiForm">
        <div class="arcadiFormGrid">
          <div class="arcadiField"><label>Empresa</label><select name="companyId" id="criterionCompany" required>${organisationOptions(companyId)}</select></div>
          <div class="arcadiField"><label>Àrea</label><select name="area"><option>Operacions</option><option>Cuina</option><option>APPCC</option><option>Compres</option><option>RRHH</option><option>Direcció</option><option>Comercial</option></select></div>
          <div class="arcadiField arcadiFieldWide"><label>Títol</label><input name="title" value="${e(criterion.title || '')}" required></div>
          <div class="arcadiField arcadiFieldWide"><label>Problema o necessitat detectada</label><textarea name="problem" required>${e(criterion.problem || '')}</textarea></div>
          <div class="arcadiField arcadiFieldWide"><label>Proposta tècnica</label><textarea name="proposal" placeholder="Pot quedar pendent fins que s'hagi estudiat.">${e(criterion.proposal || '')}</textarea></div>
          <div class="arcadiField"><label>Prioritat</label><select name="priority"><option>BAIXA</option><option selected>MITJANA</option><option>ALTA</option><option>URGENT</option></select></div>
          <div class="arcadiField"><label>Tipus de resultat</label><select name="targetType"><option value="">Per definir</option><option value="BASE_RECIPE">Base o recepta</option><option value="DISH_RECIPE">Fitxa de plat</option><option value="APPCC_TEMPLATE">Plantilla APPCC</option><option value="PRODUCT_STANDARD">Producte homologat</option><option value="SUPPLIER_STANDARD">Proveïdor homologat</option><option value="OPERATING_PROTOCOL">Protocol operatiu</option></select></div>
          <div class="arcadiField"><label>Responsable</label><input name="ownerId" value="${e(criterion.ownerId || '')}"></div>
          <div class="arcadiField"><label>Data límit</label><input name="dueDate" type="date" value="${e(criterion.dueDate || '')}"></div>
          <div class="arcadiField arcadiFieldWide"><label>Pròxim pas</label><input name="nextStep" value="${e(criterion.nextStep || '')}"></div>
          <div class="arcadiField arcadiFieldWide"><label>Centres afectats</label><div id="criterionCentres" class="arcadiCheckList">${centreChecks(criterion.centreIds, companyId)}</div></div>
          <div class="arcadiField arcadiFieldWide"><label>Evidències i proves</label><textarea name="evidenceText" placeholder="Rendiments, costos, resultats de prova, documents o fotografies.">${e((criterion.evidence || []).map(x => x.note || x.url || '').filter(Boolean).join('\n'))}</textarea></div>
        </div>
        <div class="actions"><button class="btn" type="submit">Guardar</button><button class="btn secondary" type="button" data-criterion-cancel>Cancel·lar</button></div>
      </form>
      ${id ? transitionPanel(criterion) : ''}`);

    const form = document.getElementById('criterionForm');
    form.elements.area.value = criterion.area || 'Operacions';
    form.elements.priority.value = criterion.priority || 'MITJANA';
    form.elements.targetType.value = criterion.targetType || '';
    document.getElementById('criterionCompany').onchange = event => {
      document.getElementById('criterionCentres').innerHTML = centreChecks([], event.target.value);
    };
    document.querySelector('[data-criterion-cancel]').onclick = () => A.closeModal();
    form.onsubmit = async event => {
      event.preventDefault();
      const fd = new FormData(form);
      const evidenceText = String(fd.get('evidenceText') || '').trim();
      const payload = {
        companyId: fd.get('companyId'),
        area: fd.get('area'),
        title: fd.get('title'),
        problem: fd.get('problem'),
        proposal: fd.get('proposal'),
        priority: fd.get('priority'),
        targetType: fd.get('targetType'),
        ownerId: fd.get('ownerId'),
        dueDate: fd.get('dueDate'),
        nextStep: fd.get('nextStep'),
        centreIds: fd.getAll('centreIds'),
        evidence: evidenceText ? evidenceText.split(/\n+/).map(note => ({ type: 'note', note })) : []
      };
      await A.api(id ? `/api/criteria/${encodeURIComponent(id)}` : '/api/criteria', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });
      A.closeModal();
      await window.ArcadiModules.open('criteriaStandards');
    };
    document.querySelectorAll('[data-criterion-transition]').forEach(button => {
      button.onclick = async () => {
        const note = document.getElementById('criterionTransitionNote')?.value || '';
        if (!confirm(`Canviar l'estat a ${STATES[button.dataset.criterionTransition]}?`)) return;
        await A.api(`/api/criteria/${encodeURIComponent(id)}/transition`, {
          method: 'POST',
          body: JSON.stringify({ state: button.dataset.criterionTransition, note })
        });
        A.closeModal();
        await window.ArcadiModules.open('criteriaStandards');
      };
    });
  }

  function transitionPanel(criterion) {
    const buttons = (NEXT[criterion.state] || []).map(state => `<button type="button" class="btn secondary" data-criterion-transition="${e(state)}">${e(STATES[state])}</button>`).join('');
    const history = [...(criterion.history || [])].reverse().slice(0, 12).map(item => `<tr><td>${e(new Date(item.at).toLocaleString('ca-ES'))}</td><td>${e(item.actor)}</td><td>${e(item.action)}</td></tr>`).join('');
    return `<div class="panel"><h3>Canviar l'estat</h3><label>Nota de decisió</label><textarea id="criterionTransitionNote" rows="3"></textarea><div class="actions">${buttons || '<span class="muted">No hi ha transicions disponibles.</span>'}</div></div>
      <div class="panel"><h3>Historial immutable</h3><div class="tableWrap"><table><thead><tr><th>Data</th><th>Persona</th><th>Acció</th></tr></thead><tbody>${history}</tbody></table></div></div>`;
  }

  function bind() {
    document.querySelector('[data-criterion-new]')?.addEventListener('click', () => openForm());
    document.querySelector('[data-criterion-refresh]')?.addEventListener('click', () => window.ArcadiModules.open('criteriaStandards'));
    document.querySelectorAll('[data-criterion-edit]').forEach(button => button.onclick = () => openForm(button.dataset.criterionEdit));
  }

  window.ArcadiCriteria = { render, bind };
})();
