(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.ArcadiCommercial = api;
    const boot = () => api.install();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const LEGACY_COMPANY = 'company_casa_mestres';
  const LEGACY_CENTRE = 'restaurant_casa_mestres';
  const STATUS = Object.freeze({
    DRAFT: 'ESBORRANY',
    REVIEW: 'PENDENT_VALIDACIO',
    VALIDATED: 'VALIDADA',
    SENT: 'ENVIADA',
    ACCEPTED: 'ACCEPTADA',
    REJECTED: 'REBUTJADA',
    CANCELLED: 'CANCEL_LADA'
  });
  let originalCRM = null;
  const ui = { clientId: '' };

  function currentA() { return typeof window !== 'undefined' ? window.ArcadiERP : null; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function num(value) { return Number.isFinite(Number(value)) ? Number(value) : 0; }
  function money(value) { return `${num(value).toFixed(2).replace('.', ',')} €`; }
  function today() { return new Date().toISOString().slice(0, 10); }
  function addDays(iso, days) {
    const date = new Date(`${iso}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + Number(days || 0));
    return date.toISOString().slice(0, 10);
  }
  function norm(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }
  function menuPrice(menu) {
    if (Number.isFinite(Number(menu?.reservationPrice))) return Number(menu.reservationPrice);
    if (Number.isFinite(Number(menu?.priceNumeric))) return Number(menu.priceNumeric);
    if (Number.isFinite(Number(menu?.pricePerPerson))) return Number(menu.pricePerPerson);
    if (Number.isFinite(Number(menu?.price))) return Number(menu.price);
    const match = String(menu?.price || '').replace(',', '.').match(/\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : 0;
  }
  function proposalTotal(pax, pricePerPerson) { return Math.round(num(pax) * num(pricePerPerson) * 100) / 100; }
  function proposalCode(existing, year = new Date().getFullYear()) {
    const prefix = `PROP-${year}-`;
    let max = 0;
    for (const item of existing || []) {
      const match = String(item.code || '').match(new RegExp(`^PROP-${year}-(\\d+)$`));
      if (match) max = Math.max(max, Number(match[1]));
    }
    return `${prefix}${String(max + 1).padStart(4, '0')}`;
  }
  function isMenu(document) {
    const value = norm(document?.type || document?.kind || document?.category || '');
    return value === 'menu' || value.includes('menu');
  }
  function textFromItem(item) {
    if (item == null) return '';
    if (typeof item === 'string' || typeof item === 'number') return String(item);
    if (Array.isArray(item)) return item.map(textFromItem).filter(Boolean).join('\n');
    if (typeof item !== 'object') return '';
    const label = item.title || item.name || item.label || item.dishName || item.description || item.text || '';
    const children = item.items || item.lines || item.dishes || item.courses || item.options || [];
    const nested = textFromItem(children);
    return [label, nested].filter(Boolean).join('\n');
  }
  function menuSummary(menu) {
    if (!menu) return '';
    const blocks = [
      menu.title || menu.name || '',
      menu.subtitle || '',
      menu.description || menu.desc || '',
      textFromItem(menu.sections || []),
      textFromItem(menu.items || []),
      textFromItem(menu.lines || []),
      textFromItem(menu.courses || []),
      typeof menu.content === 'string' ? menu.content : '',
      menu.notes || ''
    ].map(value => String(value || '').trim()).filter(Boolean);
    return [...new Set(blocks)].join('\n').replace(/\n{3,}/g, '\n\n');
  }
  function companyOf(record) { return record?.companyId || LEGACY_COMPANY; }
  function centreOf(record) { return record?.centreId || (companyOf(record) === LEGACY_COMPANY ? LEGACY_CENTRE : ''); }
  function inContext(A, record) {
    if (A.recordInContext) return A.recordInContext(record);
    if (A.context?.companyId && companyOf(record) !== A.context.companyId) return false;
    if (A.context?.centreId && centreOf(record) !== A.context.centreId) return false;
    return true;
  }
  function clients(A) { return (A.state.crmContacts || []).filter(item => inContext(A, item)).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ca')); }
  function proposals(A) { return (A.state.commercialProposals || []).filter(item => inContext(A, item)).sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))); }
  function menus(A) {
    const source = A.scopedCollection ? A.scopedCollection('documents') : (A.state.documents || []).filter(item => inContext(A, item));
    return source.filter(isMenu).sort((a, b) => String(a.title || a.name || '').localeCompare(String(b.title || b.name || ''), 'ca'));
  }
  function clientById(A, id) { return (A.state.crmContacts || []).find(item => item.id === id); }
  function proposalById(A, id) { return (A.state.commercialProposals || []).find(item => item.id === id); }
  function menuById(A, id) { return (A.state.documents || []).find(item => item.id === id); }
  function clientName(A, proposal) { return clientById(A, proposal.clientId)?.name || proposal.clientName || 'Client'; }
  function statusLabel(status) {
    return ({
      ESBORRANY: 'Esborrany',
      PENDENT_VALIDACIO: 'Pendent validació',
      VALIDADA: 'Validada per Direcció',
      ENVIADA: 'Enviada',
      ACCEPTADA: 'Acceptada',
      REBUTJADA: 'Rebutjada',
      CANCEL_LADA: 'Cancel·lada'
    })[status] || status || 'Esborrany';
  }
  function statusClass(status) {
    if ([STATUS.VALIDATED, STATUS.ACCEPTED].includes(status)) return 'ok';
    if ([STATUS.REVIEW].includes(status)) return 'warn';
    if ([STATUS.REJECTED, STATUS.CANCELLED].includes(status)) return 'bad';
    return '';
  }
  function badge(status) { return `<span class="badge ${statusClass(status)}">${statusLabel(status)}</span>`; }
  function contactMatch(client, email, phone, name) {
    if (email && norm(client.email) === norm(email)) return true;
    if (phone && String(client.phone || '').replace(/\D/g, '') === String(phone).replace(/\D/g, '')) return true;
    return name && norm(client.name) === norm(name);
  }
  function ensureClient(A, values) {
    const selected = values.clientId ? clientById(A, values.clientId) : null;
    if (selected) return selected;
    const name = String(values.clientName || '').trim();
    const email = String(values.clientEmail || '').trim();
    const phone = String(values.clientPhone || '').trim();
    let found = (A.state.crmContacts || []).find(item => inContext(A, item) && contactMatch(item, email, phone, name));
    if (found) return found;
    const now = new Date().toISOString();
    found = A.contextRecord ? A.contextRecord({
      id: A.uid('crmContacts'), name, email, phone, segment: 'Grup', preferences: '', notes: 'Creat des d’una proposta comercial.', active: true, createdAt: now, updatedAt: now
    }) : { id: A.uid('crmContacts'), name, email, phone, segment: 'Grup', createdAt: now, updatedAt: now };
    A.state.crmContacts = A.state.crmContacts || [];
    A.state.crmContacts.push(found);
    return found;
  }
  function proposalActions(A, proposal, compact = false) {
    const id = A.esc(proposal.id);
    const buttons = [];
    if ([STATUS.DRAFT, STATUS.REVIEW, STATUS.VALIDATED].includes(proposal.status)) buttons.push(`<button class="btn small secondary" onclick="ArcadiCommercial.openProposal('${id}')">Editar</button>`);
    if (proposal.status === STATUS.DRAFT) buttons.push(`<button class="btn small" onclick="ArcadiCommercial.requestValidation('${id}')">Enviar a validació</button>`);
    if (proposal.status === STATUS.REVIEW) buttons.push(`<button class="btn small" onclick="ArcadiCommercial.validateProposal('${id}')">Validar</button>`);
    if ([STATUS.VALIDATED, STATUS.SENT].includes(proposal.status) && proposal.clientEmail) buttons.push(`<button class="btn small" onclick="ArcadiCommercial.sendProposal('${id}')">${proposal.status === STATUS.SENT ? 'Reenviar email' : 'Enviar email'}</button>`);
    if (proposal.status === STATUS.SENT) {
      buttons.push(`<button class="btn small secondary" onclick="ArcadiCommercial.markProposal('${id}','${STATUS.ACCEPTED}')">Acceptada</button>`);
      buttons.push(`<button class="btn small secondary" onclick="ArcadiCommercial.markProposal('${id}','${STATUS.REJECTED}')">Rebutjada</button>`);
    }
    buttons.push(`<button class="btn small secondary" onclick="ArcadiCommercial.printProposal('${id}')">Imprimir</button>`);
    if (!compact && ![STATUS.SENT, STATUS.ACCEPTED].includes(proposal.status)) buttons.push(`<button class="btn small bad" onclick="ArcadiCommercial.removeProposal('${id}')">Eliminar</button>`);
    return `<div class="commercialActions">${buttons.join(' ')}</div>`;
  }
  function renderProposalTable(A, rows) {
    return `<div class="tableWrap"><table><thead><tr><th>Codi</th><th>Client</th><th>Data servei</th><th>Pax</th><th>Menú</th><th>Total</th><th>Estat</th><th></th></tr></thead><tbody>${rows.map(item => `<tr><td><b>${A.esc(item.code || '')}</b></td><td>${A.esc(clientName(A, item))}</td><td>${A.esc(item.eventDate || '—')}</td><td>${num(item.pax)}</td><td>${A.esc(item.menuName || '—')}</td><td>${money(item.totalAmount)}</td><td>${badge(item.status)}</td><td>${proposalActions(A, item, true)}</td></tr>`).join('') || '<tr><td colspan="8">Encara no hi ha propostes comercials.</td></tr>'}</tbody></table></div>`;
  }
  function renderProposals() {
    const A = currentA();
    const rows = proposals(A);
    const pending = rows.filter(item => item.status === STATUS.REVIEW).length;
    const validated = rows.filter(item => item.status === STATUS.VALIDATED).length;
    const sent = rows.filter(item => item.status === STATUS.SENT).length;
    return `<div class="notice"><b>Flux comercial:</b> la proposta es confecciona a partir d’un menú existent, queda vinculada a un client i <b>no es pot enviar</b> fins que Direcció l’ha validat. L’enviament es fa des de la fitxa del client o des d’aquest historial.</div><div class="commercialStats"><div><b>${rows.length}</b><span>Propostes</span></div><div><b>${pending}</b><span>Pendents validar</span></div><div><b>${validated}</b><span>Validades</span></div><div><b>${sent}</b><span>Enviades</span></div></div><div class="panel"><div class="toolbar"><div><h3>Propostes comercials</h3><p class="muted">Menú existent + client + servei + validació de Direcció.</p></div><button class="btn" onclick="ArcadiCommercial.openProposal()">Nova proposta</button></div>${renderProposalTable(A, rows)}</div>`;
  }
  function renderCRM() {
    const A = currentA();
    const list = clients(A);
    if (ui.clientId) {
      const client = clientById(A, ui.clientId);
      if (!client || !inContext(A, client)) ui.clientId = '';
      else {
        const history = proposals(A).filter(item => item.clientId === client.id);
        return `<div class="panel"><div class="toolbar"><button class="btn secondary" onclick="ArcadiCommercial.backToClients()">← Clients</button><div class="actions"><button class="btn secondary" data-edit-record="${A.esc(client.id)}">Editar client</button><button class="btn" onclick="ArcadiCommercial.openProposal('', '${A.esc(client.id)}')">Nova proposta</button></div></div><h3>${A.esc(client.name || 'Client')}</h3><div class="commercialClientGrid"><div><small>TELÈFON</small><b>${A.esc(client.phone || '—')}</b></div><div><small>EMAIL</small><b>${A.esc(client.email || '—')}</b></div><div><small>SEGMENT</small><b>${A.esc(client.segment || '—')}</b></div></div></div><div class="panel"><h3>Històric de propostes comercials</h3><p class="muted">Des d’aquesta fitxa Direcció valida i envia la proposta al client.</p>${renderProposalTable(A, history)}</div>`;
      }
    }
    const rows = list.map(client => {
      const count = proposals(A).filter(item => item.clientId === client.id).length;
      return `<tr><td><b>${A.esc(client.name || '')}</b></td><td>${A.esc(client.phone || '—')}</td><td>${A.esc(client.email || '—')}</td><td>${A.esc(client.segment || '—')}</td><td>${count}</td><td><button class="btn small" onclick="ArcadiCommercial.openClient('${A.esc(client.id)}')">Fitxa</button> <button class="btn small secondary" data-edit-record="${A.esc(client.id)}">Editar</button></td></tr>`;
    }).join('');
    return `<div class="panel"><div class="toolbar"><div><h3>Clients</h3><p class="muted">Cada client conserva l’històric de propostes, validacions i enviaments.</p></div><button class="btn" data-new-record>Nou client</button></div><div class="tableWrap"><table><thead><tr><th>Client</th><th>Telèfon</th><th>Email</th><th>Segment</th><th>Propostes</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="6">Encara no hi ha clients.</td></tr>'}</tbody></table></div></div>`;
  }
  function previewHtml(A, proposal) {
    const summary = proposal.menuSummary || menuSummary(proposal.menuSnapshot || menuById(A, proposal.menuId));
    return `<div class="commercialProposalSheet"><div class="commercialProposalHead"><div><small>PROPOSTA COMERCIAL</small><h2>${A.esc(proposal.code || '')}</h2></div><div>${badge(proposal.status)}</div></div><div class="commercialClientGrid"><div><small>CLIENT</small><b>${A.esc(proposal.clientName || clientName(A, proposal))}</b></div><div><small>CONTACTE</small><b>${A.esc(proposal.clientEmail || proposal.clientPhone || '—')}</b></div><div><small>DATA SERVEI</small><b>${A.esc(proposal.eventDate || '—')}</b></div><div><small>PERSONES</small><b>${num(proposal.pax)}</b></div></div><div class="commercialMenuBox"><h3>${A.esc(proposal.menuName || 'Menú')}</h3><pre>${A.esc(summary || 'Menú seleccionat')}</pre></div><div class="commercialPrice"><span>${num(proposal.pax)} pax × ${money(proposal.pricePerPerson)}</span><strong>${money(proposal.totalAmount)}</strong></div>${proposal.notes ? `<div><h4>Observacions</h4><p>${A.esc(proposal.notes)}</p></div>` : ''}${proposal.validUntil ? `<p class="muted">Proposta vàlida fins al ${A.esc(proposal.validUntil)}.</p>` : ''}</div>`;
  }
  function openProposal(proposalId = '', presetClientId = '') {
    const A = currentA();
    const proposal = proposalId ? proposalById(A, proposalId) : null;
    const clientId = proposal?.clientId || presetClientId || '';
    const selectedClient = clientId ? clientById(A, clientId) : null;
    const availableClients = clients(A);
    const availableMenus = menus(A);
    const selectedMenu = proposal?.menuId ? menuById(A, proposal.menuId) : availableMenus[0];
    const price = proposal ? num(proposal.pricePerPerson) : menuPrice(selectedMenu);
    const pax = proposal ? num(proposal.pax) : 1;
    const clientOptions = [`<option value="">— Nou contacte / escriure dades —</option>`, ...availableClients.map(item => `<option value="${A.esc(item.id)}" ${item.id === clientId ? 'selected' : ''}>${A.esc(item.name || item.email || item.phone || 'Client')}</option>`)].join('');
    const menuOptions = availableMenus.map(item => `<option value="${A.esc(item.id)}" ${item.id === selectedMenu?.id ? 'selected' : ''}>${A.esc(item.title || item.name || 'Menú')} · ${money(menuPrice(item))}/pax</option>`).join('');
    A.modal(proposal ? `Editar proposta · ${proposal.code}` : 'Nova proposta comercial', `<form id="commercialProposalForm" class="arcadiForm"><div class="notice"><b>Important:</b> des d’aquest formulari es confecciona la proposta. L’enviament al client només apareix després de la validació de Direcció.</div><div class="arcadiFormGrid"><div class="arcadiField arcadiFieldWide"><label>Client existent</label><select name="clientId" id="commercialClientSelect">${clientOptions}</select></div><div class="arcadiField"><label>Nom / empresa client</label><input name="clientName" id="commercialClientName" value="${A.esc(proposal?.clientName || selectedClient?.name || '')}" required></div><div class="arcadiField"><label>Telèfon</label><input name="clientPhone" id="commercialClientPhone" value="${A.esc(proposal?.clientPhone || selectedClient?.phone || '')}"></div><div class="arcadiField"><label>Email</label><input name="clientEmail" id="commercialClientEmail" type="email" value="${A.esc(proposal?.clientEmail || selectedClient?.email || '')}"></div><div class="arcadiField"><label>Nom del grup / servei</label><input name="eventName" value="${A.esc(proposal?.eventName || '')}"></div><div class="arcadiField"><label>Data del servei</label><input name="eventDate" type="date" value="${A.esc(proposal?.eventDate || '')}" required></div><div class="arcadiField"><label>Persones</label><input name="pax" id="commercialPax" type="number" min="1" step="1" value="${pax}" required></div><div class="arcadiField arcadiFieldWide"><label>Menú existent</label><select name="menuId" id="commercialMenuSelect" required>${menuOptions || '<option value="">No hi ha menús creats</option>'}</select></div><div class="arcadiField"><label>Preu per persona</label><input name="pricePerPerson" id="commercialPrice" type="number" min="0" step="0.01" value="${price.toFixed(2)}" required></div><div class="arcadiField"><label>Import total calculat</label><input id="commercialTotal" value="${money(proposalTotal(pax, price))}" readonly></div><div class="arcadiField"><label>Vàlida fins</label><input name="validUntil" type="date" value="${A.esc(proposal?.validUntil || addDays(today(), 15))}"></div><div class="arcadiField arcadiFieldWide"><label>Notes comercials / condicions</label><textarea name="notes">${A.esc(proposal?.notes || '')}</textarea></div></div><div id="commercialMenuPreview" class="commercialMenuPreview"></div><div class="actions"><button class="btn secondary" type="submit" name="intent" value="draft">Guardar esborrany</button><button class="btn" type="submit" name="intent" value="review">Guardar i enviar a validació</button><button class="btn secondary" type="button" onclick="ArcadiERP.closeModal()">Cancel·lar</button></div></form>`);

    const selectClient = document.getElementById('commercialClientSelect');
    const selectMenu = document.getElementById('commercialMenuSelect');
    const priceInput = document.getElementById('commercialPrice');
    const paxInput = document.getElementById('commercialPax');
    const updateTotal = () => { document.getElementById('commercialTotal').value = money(proposalTotal(paxInput.value, priceInput.value)); };
    const updateMenu = () => {
      const menu = menuById(A, selectMenu.value);
      if (!proposal || selectMenu.value !== proposal.menuId) priceInput.value = menuPrice(menu).toFixed(2);
      document.getElementById('commercialMenuPreview').innerHTML = menu ? `<b>${A.esc(menu.title || menu.name || 'Menú')}</b><pre>${A.esc(menuSummary(menu) || 'Menú creat a l’aplicació')}</pre>` : '<span class="muted">Crea primer un menú a l’apartat Menús.</span>';
      updateTotal();
    };
    selectClient.onchange = () => {
      const client = clientById(A, selectClient.value);
      if (!client) return;
      document.getElementById('commercialClientName').value = client.name || '';
      document.getElementById('commercialClientPhone').value = client.phone || '';
      document.getElementById('commercialClientEmail').value = client.email || '';
    };
    selectMenu.onchange = updateMenu;
    priceInput.oninput = updateTotal;
    paxInput.oninput = updateTotal;
    updateMenu();

    document.getElementById('commercialProposalForm').onsubmit = async event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      const intent = event.submitter?.value || 'draft';
      if (!values.menuId) return alert('Cal seleccionar un menú existent.');
      if (!values.clientEmail && !values.clientPhone) return alert('Cal indicar almenys un email o telèfon del client.');
      const client = ensureClient(A, values);
      const menu = menuById(A, values.menuId);
      const collection = A.collection('commercialProposals');
      const now = new Date().toISOString();
      let record = proposal || null;
      if (!record) {
        record = A.contextRecord ? A.contextRecord({ id: A.uid('commercialProposals') }) : { id: A.uid('commercialProposals') };
        record.code = proposalCode(collection);
        record.createdAt = now;
        collection.push(record);
      }
      const previousStatus = record.status || STATUS.DRAFT;
      Object.assign(record, {
        clientId: client.id,
        clientName: String(values.clientName || client.name || '').trim(),
        clientPhone: String(values.clientPhone || client.phone || '').trim(),
        clientEmail: String(values.clientEmail || client.email || '').trim(),
        eventName: String(values.eventName || '').trim(),
        eventDate: String(values.eventDate || ''),
        pax: Math.max(1, Math.round(num(values.pax))),
        menuId: menu.id,
        menuName: menu.title || menu.name || 'Menú',
        menuSnapshot: clone(menu),
        menuSummary: menuSummary(menu),
        pricePerPerson: num(values.pricePerPerson),
        totalAmount: proposalTotal(values.pax, values.pricePerPerson),
        validUntil: String(values.validUntil || ''),
        notes: String(values.notes || '').trim(),
        updatedAt: now,
        status: intent === 'review' ? STATUS.REVIEW : STATUS.DRAFT
      });
      if ([STATUS.VALIDATED, STATUS.SENT, STATUS.ACCEPTED, STATUS.REJECTED].includes(previousStatus)) {
        record.status = STATUS.REVIEW;
        delete record.validatedAt; delete record.validatedBy; delete record.sentAt; delete record.sentTo;
      }
      await A.save(intent === 'review' ? 'PROPOSTA PENDENT DE VALIDACIÓ' : 'ESBORRANY GUARDAT');
      A.closeModal();
      ui.clientId = client.id;
      window.ArcadiModules.open('crm');
    };
  }
  async function requestValidation(id) {
    const A = currentA();
    const item = proposalById(A, id); if (!item) return;
    item.status = STATUS.REVIEW; item.updatedAt = new Date().toISOString();
    await A.save('PENDENT DE VALIDACIÓ');
    window.ArcadiModules.open(ui.clientId ? 'crm' : 'groups');
  }
  async function validateProposal(id) {
    const A = currentA();
    const item = proposalById(A, id); if (!item) return;
    item.status = STATUS.VALIDATED; item.validatedAt = new Date().toISOString(); item.validatedBy = 'Direcció'; item.updatedAt = item.validatedAt;
    await A.save('PROPOSTA VALIDADA');
    window.ArcadiModules.open(ui.clientId ? 'crm' : 'groups');
  }
  async function markProposal(id, status) {
    const A = currentA();
    const item = proposalById(A, id); if (!item) return;
    item.status = status; item.updatedAt = new Date().toISOString();
    await A.save('ESTAT COMERCIAL ACTUALITZAT');
    window.ArcadiModules.open(ui.clientId ? 'crm' : 'groups');
  }
  async function sendProposal(id) {
    const A = currentA();
    const item = proposalById(A, id); if (!item) return;
    if (![STATUS.VALIDATED, STATUS.SENT].includes(item.status)) return alert('Direcció ha de validar la proposta abans d’enviar-la.');
    if (!item.clientEmail) return alert('Aquesta proposta no té email de client.');
    if (!confirm(`Enviar ${item.code} a ${item.clientEmail}?`)) return;
    try {
      const result = await A.api(`/api/commercial-proposals/${encodeURIComponent(id)}/send`, { method: 'POST', body: '{}' });
      await A.load();
      alert(result.message || 'Proposta enviada correctament.');
      window.ArcadiModules.open(ui.clientId ? 'crm' : 'groups');
    } catch (error) {
      alert(error.message || 'No s’ha pogut enviar la proposta.');
    }
  }
  async function removeProposal(id) {
    if (!confirm('Eliminar aquesta proposta comercial?')) return;
    const A = currentA();
    A.state.commercialProposals = (A.state.commercialProposals || []).filter(item => item.id !== id);
    await A.save('PROPOSTA ELIMINADA');
    window.ArcadiModules.open(ui.clientId ? 'crm' : 'groups');
  }
  function printProposal(id) {
    const A = currentA();
    const proposal = proposalById(A, id); if (!proposal) return;
    const target = document.getElementById('printArea');
    target.innerHTML = `<div class="draftDoc">${previewHtml(A, proposal)}</div>`;
    window.print();
  }
  function openClient(id) { ui.clientId = id; window.ArcadiModules.open('crm'); }
  function backToClients() { ui.clientId = ''; window.ArcadiModules.open('crm'); }
  function injectStyles() {
    if (document.getElementById('commercialProposalStyles')) return;
    const style = document.createElement('style');
    style.id = 'commercialProposalStyles';
    style.textContent = `.commercialStats{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:10px;margin:14px 0}.commercialStats>div,.commercialClientGrid>div{border:1px solid #d9cbb9;border-radius:10px;padding:12px;background:#fffaf2}.commercialStats b{display:block;font-size:1.4rem}.commercialStats span,.commercialClientGrid small{font-size:.78rem;color:#6b625a}.commercialClientGrid{display:grid;grid-template-columns:repeat(3,minmax(150px,1fr));gap:10px;margin:14px 0}.commercialClientGrid b{display:block;margin-top:4px}.commercialActions{display:flex;flex-wrap:wrap;gap:5px}.commercialMenuPreview,.commercialMenuBox{border:1px solid #d9cbb9;border-radius:10px;padding:12px;background:#fffaf2;margin:12px 0}.commercialMenuPreview pre,.commercialMenuBox pre{white-space:pre-wrap;font-family:inherit;margin:8px 0 0}.commercialProposalSheet{max-width:850px;margin:auto}.commercialProposalHead{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;border-bottom:2px solid #234d40;padding-bottom:12px}.commercialProposalHead h2{margin:3px 0}.commercialPrice{display:flex;justify-content:space-between;align-items:center;border-top:1px solid #d9cbb9;border-bottom:1px solid #d9cbb9;padding:16px 0;margin:18px 0}.commercialPrice strong{font-size:1.4rem}@media(max-width:800px){.commercialStats,.commercialClientGrid{grid-template-columns:1fr 1fr}}@media(max-width:520px){.commercialStats,.commercialClientGrid{grid-template-columns:1fr}}`;
    document.head.appendChild(style);
  }
  function install(attempt = 0) {
    if (typeof window === 'undefined') return false;
    const A = window.ArcadiERP;
    const modules = window.ArcadiModules;
    if (!A || !modules?.definitions) {
      if (attempt < 30) setTimeout(() => install(attempt + 1), 100);
      return false;
    }
    if (!originalCRM) originalCRM = modules.definitions.crm;
    if (!originalCRM) return false;
    modules.definitions.groups = {
      key: 'groups', phase: 48, section: 'customers', label: 'Propostes comercials',
      description: 'Pressupostos construïts des de menús existents, vinculats a clients i validats abans de l’enviament.',
      renderer: renderProposals
    };
    modules.definitions.crm = { ...originalCRM, label: 'CRM de clients', description: 'Fitxa de client amb històric comercial, validació i enviament de propostes.', renderer: renderCRM };
    injectStyles();
    return true;
  }

  return {
    STATUS, menuPrice, proposalTotal, proposalCode, isMenu, menuSummary, statusLabel,
    install, renderProposals, renderCRM, openProposal, requestValidation, validateProposal, markProposal,
    sendProposal, removeProposal, printProposal, openClient, backToClients
  };
});
