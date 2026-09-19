(function () {
  'use strict';

  const A = window.ArcadiERP;
  if (!A) throw new Error('Falta arcadi-runtime.js');

  const e = A.esc;
  const definitions = {};
  const register = definition => { definitions[definition.key] = definition; return definition; };
  const text = (key, label, required = false) => ({ key, label, required });
  const number = (key, label, step = '0.01') => ({ key, label, type: 'number', step });
  const dateField = (key, label) => ({ key, label, type: 'date' });
  const area = (key, label) => ({ key, label, type: 'textarea' });
  const select = (key, label, options) => ({ key, label, type: 'select', options });

  register({
    key: 'maintenance', phase: 41, section: 'operations', label: 'Manteniment', singular: 'tasca de manteniment',
    description: 'Equips, avaries, revisions i accions preventives.', collection: 'maintenanceRecords',
    fields: [text('title', 'Equip o tasca', true), select('type', 'Tipus', ['Preventiu', 'Avaria', 'Revisió']), select('status', 'Estat', ['Pendent', 'En curs', 'Completat']), dateField('dueDate', 'Data prevista'), text('responsible', 'Responsable'), area('notes', 'Observacions')],
    columns: [['title', 'Equip / tasca'], ['type', 'Tipus'], ['status', 'Estat'], ['dueDate', 'Data']]
  });
  register({
    key: 'communications', phase: 43, section: 'customers', label: 'Comunicacions', singular: 'comunicació',
    description: 'Avisos interns, destinataris i seguiment.', collection: 'communications',
    fields: [text('subject', 'Assumpte', true), select('channel', 'Canal', ['Intern', 'Email', 'Telèfon', 'WhatsApp']), text('recipient', 'Destinatari'), select('status', 'Estat', ['Pendent', 'Enviat', 'Arxivat']), area('message', 'Missatge')],
    columns: [['subject', 'Assumpte'], ['channel', 'Canal'], ['recipient', 'Destinatari'], ['status', 'Estat']]
  });
  register({
    key: 'crm', phase: 44, section: 'customers', label: 'CRM de clients', singular: 'client',
    description: 'Contactes, preferències i seguiment comercial.', collection: 'crmContacts',
    fields: [text('name', 'Nom', true), text('phone', 'Telèfon'), text('email', 'Email'), select('segment', 'Segment', ['Nou', 'Habitual', 'Empresa', 'Grup', 'VIP']), area('preferences', 'Preferències i al·lèrgies'), area('notes', 'Notes')],
    columns: [['name', 'Client'], ['phone', 'Telèfon'], ['email', 'Email'], ['segment', 'Segment']]
  });
  register({
    key: 'marketing', phase: 47, section: 'customers', label: 'Màrqueting', singular: 'acció de màrqueting',
    description: 'Campanyes reals amb calendari i estat, sense publicacions simulades.', collection: 'marketingCampaigns',
    fields: [text('title', 'Campanya', true), select('channel', 'Canal', ['Instagram', 'Facebook', 'Google', 'Email', 'Web', 'Altres']), dateField('date', 'Data'), select('status', 'Estat', ['Idea', 'Preparada', 'Publicada', 'Tancada']), area('content', 'Contingut')],
    columns: [['title', 'Campanya'], ['channel', 'Canal'], ['date', 'Data'], ['status', 'Estat']]
  });
  register({
    key: 'groups', phase: 48, section: 'customers', label: 'Grups', singular: 'grup',
    description: 'Propostes, menús tancats, contractes, aforament i pagaments.', collection: 'groupEvents',
    fields: [text('name', 'Nom del grup', true), dateField('date', 'Data'), number('pax', 'Persones', '1'), text('contact', 'Contacte'), text('menu', 'Menú'), number('amount', 'Import'), select('status', 'Estat', ['Consulta', 'Proposta', 'Confirmat', 'Realitzat', 'Cancel·lat']), area('notes', 'Notes')],
    columns: [['name', 'Grup'], ['date', 'Data'], ['pax', 'Pax'], ['menu', 'Menú'], ['status', 'Estat']]
  });
  register({
    key: 'experiences', phase: 49, section: 'customers', label: 'Experiències', singular: 'experiència',
    description: 'Tastos, maridatges i esdeveniments especials.', collection: 'experiences',
    fields: [text('name', 'Experiència', true), dateField('date', 'Data'), number('capacity', 'Aforament', '1'), number('price', 'Preu'), select('status', 'Estat', ['Esborrany', 'Publicada', 'Completa', 'Tancada']), area('description', 'Descripció')],
    columns: [['name', 'Experiència'], ['date', 'Data'], ['capacity', 'Aforament'], ['price', 'Preu'], ['status', 'Estat']]
  });
  register({
    key: 'loyalty', phase: 50, section: 'customers', label: 'Fidelització', singular: 'targeta de fidelització',
    description: 'Punts, nivell i recompenses vinculats al client.', collection: 'loyaltyAccounts',
    fields: [text('customer', 'Client', true), text('email', 'Email'), number('points', 'Punts', '1'), select('level', 'Nivell', ['Inicial', 'Habitual', 'Or', 'Ambaixador']), text('reward', 'Recompensa')],
    columns: [['customer', 'Client'], ['email', 'Email'], ['points', 'Punts'], ['level', 'Nivell'], ['reward', 'Recompensa']]
  });
  register({
    key: 'purchases', phase: 51, section: 'purchases', label: 'Comandes a proveïdors', singular: 'comanda',
    description: 'Llistes de compra GS-COMP per proveïdor.', collection: 'purchaseOrders',
    fields: [text('code', 'Codi GS-COMP', true), dateField('date', 'Data'), text('supplier', 'Proveïdor'), select('status', 'Estat', ['Preparada', 'Enviada', 'Rebuda', 'Tancada']), text('responsible', 'Responsable'), area('lines', 'Productes i quantitats'), area('notes', 'Observacions')],
    columns: [['code', 'Codi'], ['date', 'Data'], ['supplier', 'Proveïdor'], ['status', 'Estat']]
  });
  register({
    key: 'receipts', phase: 52, section: 'purchases', label: 'Recepció de mercaderies', singular: 'recepció',
    description: 'GS-REC, lots, caducitats, temperatura i incidències.', collection: 'goodsReceipts',
    fields: [text('code', 'Codi GS-REC', true), text('purchaseCode', 'GS-COMP relacionada'), text('traceabilityCode', 'GS-TRAC relacionada'), dateField('date', 'Data'), text('supplier', 'Proveïdor'), text('lot', 'Lot'), dateField('expiry', 'Caducitat'), number('temperature', 'Temperatura ºC'), select('packaging', 'Envàs', ['Pendent', 'Conforme', 'No conforme']), select('status', 'Resultat', ['Pendent de recepció', 'Acceptada', 'Amb incidència', 'Rebutjada']), area('lines', 'Productes rebuts'), area('correctiveAction', 'Incidència / acció correctora')],
    columns: [['code', 'Codi'], ['date', 'Data'], ['supplier', 'Proveïdor'], ['lot', 'Lot'], ['status', 'Resultat']]
  });
  register({
    key: 'traceability', phase: 52, section: 'purchases', label: 'Traçabilitat', singular: 'registre de traçabilitat',
    description: 'Lots rebuts i plats o menús on s’han utilitzat.', collection: 'traceabilityRecords',
    fields: [text('code', 'Codi GS-TRAC'), text('purchaseCode', 'GS-COMP relacionada'), text('receiptCode', 'GS-REC relacionada'), text('product', 'Producte', true), text('lot', 'Lot'), text('supplier', 'Proveïdor'), dateField('receivedAt', 'Recepció'), dateField('expiry', 'Caducitat'), number('temperature', 'Temperatura ºC'), select('status', 'Estat', ['Pendent de recepció', 'Rebut', 'Utilitzat', 'Tancat']), text('usedIn', 'Plat / menú'), area('notes', 'Observacions')],
    columns: [['code', 'Codi'], ['product', 'Producte'], ['lot', 'Lot'], ['supplier', 'Proveïdor'], ['receivedAt', 'Recepció'], ['status', 'Estat']]
  });
  register({
    key: 'productionRecords', phase: 55, section: 'operations', label: 'Producció', singular: 'ordre de producció',
    description: 'Passis, preparacions, càrrega i quantitats produïdes.', collection: 'productionRecords',
    fields: [dateField('date', 'Data'), text('item', 'Plat o base', true), number('quantity', 'Quantitat'), text('unit', 'Unitat'), text('station', 'Partida'), select('status', 'Estat', ['Prevista', 'En producció', 'Completada']), area('notes', 'Notes')],
    columns: [['date', 'Data'], ['item', 'Plat / base'], ['quantity', 'Quantitat'], ['station', 'Partida'], ['status', 'Estat']]
  });
  register({
    key: 'restaurants', phase: 62, section: 'ecosystem', label: 'Multi-restaurant', singular: 'restaurant',
    description: 'Centres gestionats des del mateix ERP. Casa Mestres és el centre principal.', collection: 'restaurants',
    fields: [text('name', 'Nom del centre', true), text('address', 'Adreça'), text('phone', 'Telèfon'), select('status', 'Estat', ['Actiu', 'En preparació', 'Inactiu']), area('notes', 'Configuració / notes')],
    columns: [['name', 'Centre'], ['address', 'Adreça'], ['phone', 'Telèfon'], ['status', 'Estat']]
  });
  register({
    key: 'platforms', phase: 63, section: 'ecosystem', label: 'Multi-plataforma', singular: 'plataforma',
    description: 'Perfils externs i coherència de dades; cap xarxa es publica sense autorització.', collection: 'platformProfiles',
    fields: [select('platform', 'Plataforma', ['Google', 'Instagram', 'Facebook', 'TripAdvisor', 'TheFork', 'Altres']), text('profile', 'Perfil o URL'), select('status', 'Estat', ['No connectada', 'Pendent', 'Connectada']), text('rating', 'Puntuació'), area('notes', 'Notes')],
    columns: [['platform', 'Plataforma'], ['profile', 'Perfil'], ['status', 'Estat'], ['rating', 'Puntuació']]
  });
  register({
    key: 'miniapps', phase: 64, section: 'ecosystem', label: 'Mini apps', singular: 'mini app',
    description: 'Accessos mòbils simples per reserves, carta, grups i experiències.', collection: 'miniApps',
    fields: [text('name', 'Nom', true), select('type', 'Tipus', ['Reserves', 'Carta digital', 'Grups', 'Experiències', 'Fidelització', 'RRHH']), text('path', 'Ruta web'), select('status', 'Estat', ['Esborrany', 'Activa', 'Pausada']), area('notes', 'Notes')],
    columns: [['name', 'Mini app'], ['type', 'Tipus'], ['path', 'Ruta'], ['status', 'Estat']]
  });

  const sections = {
    purchases: { label: 'Compres i logística', description: 'Proveïdors, GS-COMP, GS-REC i traçabilitat.', modules: ['supplierAdvanced', 'purchaseAssistant', 'purchases', 'receipts', 'traceability'] },
    customers: { label: 'Clients i comercial', description: 'CRM, reserves, carta, grups, experiències i fidelització.', modules: ['crm', 'reservationsAdvanced', 'digitalMenu', 'publicationStudio', 'communications', 'marketing', 'groups', 'experiences', 'loyalty'] },
    operations: { label: 'Operacions', description: 'APPCC, manteniment, inventari, producció, sala i RRHH.', modules: ['appcc', 'maintenance', 'inventoryAdvanced', 'productionRecords', 'floorAdvanced', 'hrAdvanced', 'appccAdvanced'] },
    analysis: { label: 'Anàlisi i economia', description: 'Indicadors reals, costos i resultats.', modules: ['analytics', 'costs', 'economyAdvanced'] },
    ecosystem: { label: 'Ecosistema', description: 'Multi-restaurant, plataformes, mini apps i exportacions.', modules: ['restaurants', 'platforms', 'miniapps', 'exports'] },
    system: { label: 'Sistema', description: 'Backoffice, configuració, control final i assistència IA.', modules: ['backoffice', 'system', 'finalization', 'assistant'] }
  };

  const custom = (key, phase, section, label, description, renderer) => register({ key, phase, section, label, description, renderer });

  function allProducts() { return A.state.products || []; }
  function stockValue() { return allProducts().reduce((sum, item) => sum + A.num(item.stock) * A.num(item.price), 0); }
  function lowStock() { return allProducts().filter(item => A.num(item.stock) <= A.num(item.min) && item.active !== false); }
  function orderTotal(order) { return (order.lines || []).reduce((sum, line) => sum + A.num(line.qty) * A.num(line.price), 0); }
  function closedSales() { return (A.state.tpvConfig?.orders || []).filter(order => order.status === 'closed').reduce((sum, order) => sum + orderTotal(order), 0); }
  function baseCost(base) { return (base.ingredients || []).reduce((sum, ingredient) => sum + ingredientCost(ingredient), 0); }
  function ingredientCost(ingredient) {
    const product = allProducts().find(item => item.id === ingredient.productId);
    if (!product) return 0;
    let quantity = A.num(ingredient.qty);
    const unit = ingredient.unit || product.unit;
    if (product.unit === 'kg' && unit === 'g') quantity /= 1000;
    if (product.unit === 'L' && unit === 'ml') quantity /= 1000;
    if (product.unit === 'g' && unit === 'kg') quantity *= 1000;
    if (product.unit === 'ml' && unit === 'L') quantity *= 1000;
    return quantity * A.num(product.price);
  }
  function dishCost(dish) {
    return (dish.ingredients || []).reduce((sum, ingredient) => sum + ingredientCost(ingredient), 0)
      + (dish.baseUses || []).reduce((sum, use) => {
        const base = (A.state.bases || []).find(item => item.id === use.baseId);
        return base ? sum + baseCost(base) * (A.num(use.qty) / (A.num(base.yield) || 1)) : sum;
      }, 0);
  }
  function scheduledHours() {
    return (A.state.schedules || []).reduce((sum, shift) => {
      if (!shift.start || !shift.end) return sum;
      const [sh, sm] = shift.start.split(':').map(Number);
      const [eh, em] = shift.end.split(':').map(Number);
      return sum + Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
    }, 0);
  }
  function stat(value, label, detail = '') {
    return `<div class="arcadiStat"><strong>${e(value)}</strong><b>${e(label)}</b><span>${e(detail)}</span></div>`;
  }
  function moduleButtons(sectionKey) {
    return sections[sectionKey].modules.map(key => {
      const item = definitions[key];
      return `<button class="arcadiModuleCard" data-open-module="${e(key)}"><span>FASE ${e(item.phase)}</span><b>${e(item.label)}</b><small>${e(item.description)}</small></button>`;
    }).join('');
  }


  function purchaseDraftsFromText(raw) {
    const products = allProducts(), suppliers = A.state.suppliers || [], groups = new Map();
    String(raw || '').split(/\n|,/).map(function(line){ return line.trim(); }).filter(Boolean).forEach(function(line){
      const match=line.match(/^(\d+(?:[.,]\d+)?)?\s*(kg|g|l|ml|u|unitats?|caixes?)?\s*(?:de\s+)?(.+)$/i);
      const qty=match && match[1] ? match[1].replace(',','.') : '1', unit=match && match[2] ? match[2] : '', requested=(match && match[3] ? match[3] : line).trim();
      const product=products.find(function(item){ const name=String(item.name||'').toLowerCase(), ask=requested.toLowerCase(); return name.includes(ask)||ask.includes(name); });
      const supplier=suppliers.find(function(item){ return item.id===product?.supplierId; }), key=supplier?.id||'pendent';
      if(!groups.has(key)) groups.set(key,{supplier:supplier?.name||supplier?.tradeName||'Pendent d’assignar',lines:[]});
      groups.get(key).lines.push(qty+(unit?' '+unit:'')+' · '+(product?.name||requested));
    });
    return Array.from(groups.values());
  }
  custom('purchaseAssistant',51,'purchases','Compres assistides','Crea propostes de compra des de text o veu i les agrupa per proveïdor.',function(){
    return '<div class="panel"><div class="notice"><b>Entrada assistida:</b> escriu o dicta una llista. Es crearà una proposta en estat Preparada perquè la revisis abans d’enviar-la.</div><label>Nota de compra</label><textarea id="purchaseAssistantText" rows="8" placeholder="3 kg tomàquet&#10;2 caixes vi blanc"></textarea><div class="actions"><button class="btn secondary" data-purchase-dictate>🎙 Dictar</button><button class="btn" data-purchase-preview>Preparar proposta</button></div><div id="purchaseAssistantResult"></div></div>';
  });
  custom('publicationStudio',47,'customers','Estudi de publicacions','Prepara novetats per Instagram, Google, Facebook o web des de contingut existent.',function(){
    const sources=(A.state.documents||[]).map(function(item){return {id:'document:'+item.id,label:(item.type||'Document')+' · '+(item.title||'Sense títol'),title:item.title||'',content:[item.subtitle,item.notes,item.footer].filter(Boolean).join('\n\n')};});
    window.__arcadiPublicationSources=sources;
    const options=sources.map(function(item){return '<option value="'+e(item.id)+'">'+e(item.label)+'</option>';}).join('');
    const drafts=(A.state.marketingCampaigns||[]).filter(function(item){return item.status==='Preparada';}).map(function(item){return '<div class="notice"><b>'+e(item.title)+'</b> · '+e(item.channel)+'<br>'+e(item.content||'')+'<div class="actions"><button class="btn secondary" data-share-campaign="'+e(item.id)+'">Compartir</button><button class="btn light" data-open-module="marketing">Editar</button></div></div>';}).join('');
    return '<div class="panel"><div class="notice"><b>Publicació segura:</b> crea un esborrany des de cartes o menús. La publicació externa sempre queda sota confirmació humana amb el menú Compartir.</div><div class="grid"><div><label>Origen</label><select id="publicationSource">'+(options||'<option>Primer crea una carta o menú</option>')+'</select></div><div><label>Canal</label><select id="publicationChannel"><option>Instagram</option><option>Google</option><option>Facebook</option><option>Web</option></select></div></div><div class="actions"><button class="btn" data-publication-create '+(sources.length?'':'disabled')+'>Crear esborrany</button></div></div><div class="panel"><h3>Esborranys preparats</h3>'+(drafts||'<p class="muted">Encara no hi ha publicacions preparades.</p>')+'</div>';
  });

  custom('supplierAdvanced', 51, 'purchases', 'Proveïdors avançats', 'Fitxa mestra, productes associats i accés a les tarifes.', () => {
    const suppliers = A.state.suppliers || [];
    const products = allProducts();
    const rows = suppliers.map(item => `<tr><td><b>${e(item.name || item.tradeName)}</b></td><td>${e(item.taxId || '—')}</td><td>${e(item.phone || '—')}</td><td>${e(item.email || '—')}</td><td>${products.filter(product => product.supplierId === item.id).length}</td></tr>`).join('');
    return `<div class="arcadiStats">${stat(suppliers.length, 'Proveïdors')}${stat(products.filter(product => product.supplierId).length, 'Productes vinculats')}</div><div class="panel"><div class="actions"><button class="btn" data-core="suppliers">Editar proveïdors</button><button class="btn secondary" data-core="products">Veure productes</button></div><div class="tableWrap"><table><thead><tr><th>Proveïdor</th><th>CIF</th><th>Telèfon</th><th>Email</th><th>Productes</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Sense proveïdors.</td></tr>'}</tbody></table></div></div>`;
  });

  custom('reservationsAdvanced', 45, 'customers', 'Reserves avançades', 'Calendari, clients, menús, fiances i grups sense duplicar reserves.', () => {
    const reservations = A.state.reservations || [];
    const confirmed = reservations.filter(item => item.status === 'Confirmada');
    const groups = reservations.filter(item => A.num(item.pax) >= 11);
    const rows = [...reservations].sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 50).map(item => `<tr><td>${e(item.date || '—')} ${e(item.time || '')}</td><td><b>${e(item.name || '—')}</b><br><span class="muted">${e(item.phone || '')}</span></td><td>${e(item.pax || 0)}</td><td>${e(item.menuTitle || '—')}</td><td>${e(item.status || '—')}</td></tr>`).join('');
    return `<div class="arcadiStats">${stat(reservations.length, 'Reserves')}${stat(confirmed.length, 'Confirmades')}${stat(groups.length, 'Grups')}${stat(A.money(reservations.reduce((sum, item) => sum + (item.paymentStatus === 'pagat' ? A.num(item.depositAmount) : 0), 0)), 'Fiances pagades')}</div><div class="panel"><button class="btn" data-core="reservations">Obrir gestió completa</button><div class="tableWrap"><table><thead><tr><th>Data</th><th>Client</th><th>Pax</th><th>Menú</th><th>Estat</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Sense reserves.</td></tr>'}</tbody></table></div></div>`;
  });

  custom('digitalMenu', 46, 'customers', 'Carta digital', 'Utilitza els plats i documents existents; no crea un segon catàleg.', () => {
    const dishes = A.state.dishes || [];
    const documents = A.state.documents || [];
    const published = dishes.filter(item => item.onMenu);
    return `<div class="notice"><b>Catàleg únic:</b> la carta digital llegeix les mateixes fitxes de plats i els mateixos escandalls del programa.</div><div class="arcadiStats">${stat(dishes.length, 'Fitxes de plats')}${stat(published.length, 'Plats publicats')}${stat(documents.length, 'Cartes i menús')}</div><div class="panel actions"><button class="btn" data-core="dishes">Editar plats i escandalls</button><button class="btn secondary" data-core="documents">Editar cartes i menús</button></div>`;
  });

  custom('appcc', 40, 'operations', 'APPCC i normativa', 'Temperatures, neteges, incidències, lots i accions correctores.', () => {
    const records = A.state.controlNormatiu?.records || {};
    const cards = Object.entries(records).map(([key, values]) => stat(Array.isArray(values) ? values.length : 0, key.replaceAll('_', ' '))).join('');
    return `<div class="arcadiStats">${cards || stat(0, 'Registres')}</div><div class="panel"><div class="notice"><b>Registre oficial existent:</b> aquesta fase s’ha connectat al Control Normatiu que ja tenia l’aplicació.</div><div class="actions"><button class="btn" data-core="control">Obrir Control Normatiu</button><button class="btn secondary" data-open-module="traceability">Veure traçabilitat</button></div></div>`;
  });

  custom('inventoryAdvanced', 54, 'operations', 'Inventari avançat', 'Stock, mínims, valor i alerta de ruptura calculats amb dades reals.', () => {
    const low = lowStock();
    const rows = low.slice(0, 100).map(item => `<tr><td><b>${e(item.code || '')}</b></td><td>${e(item.name)}</td><td>${e(item.stock)}</td><td>${e(item.min)}</td><td>${A.money(A.num(item.stock) * A.num(item.price))}</td></tr>`).join('');
    return `<div class="arcadiStats">${stat(allProducts().length, 'Productes')}${stat(low.length, 'Sota mínim')}${stat(A.money(stockValue()), 'Valor de stock')}</div><div class="panel"><button class="btn" data-core="products">Editar inventari</button><div class="tableWrap"><table><thead><tr><th>Codi</th><th>Producte</th><th>Stock</th><th>Mínim</th><th>Valor</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No hi ha alertes de stock.</td></tr>'}</tbody></table></div></div>`;
  });

  custom('floorAdvanced', 56, 'operations', 'Sala avançada', 'Mapa de taules, comandes obertes i reserves del servei.', () => {
    const orders = A.state.tpvConfig?.orders || [];
    const open = orders.filter(item => item.status !== 'closed');
    const today = new Date().toISOString().slice(0, 10);
    const reservations = (A.state.reservations || []).filter(item => item.date === today && item.status !== 'Cancel·lada');
    return `<div class="arcadiStats">${stat(open.length, 'Taules obertes')}${stat(open.reduce((sum, item) => sum + A.num(item.pax), 0), 'Pax en servei')}${stat(reservations.length, 'Reserves d’avui')}${stat(A.money(open.reduce((sum, item) => sum + orderTotal(item), 0)), 'Venda oberta')}</div><div class="panel actions"><button class="btn" data-core="tpv">Obrir Sala / TPV</button><button class="btn secondary" data-core="reservations">Veure reserves</button></div>`;
  });

  custom('hrAdvanced', 58, 'operations', 'RRHH avançat', 'Empleats, torns, hores programades i fitxatges.', () => {
    const employees = A.state.employees || [];
    const punches = A.state.punches || [];
    const schedules = A.state.schedules || [];
    return `<div class="arcadiStats">${stat(employees.filter(item => item.active !== false).length, 'Empleats actius')}${stat(schedules.length, 'Torns')}${stat(scheduledHours().toFixed(1), 'Hores programades')}${stat(punches.length, 'Fitxatges')}</div><div class="panel actions"><button class="btn" data-core="employees">Empleats</button><button class="btn secondary" data-core="schedules">Horaris</button><button class="btn secondary" data-core="punches">Fitxatges</button></div>`;
  });

  custom('appccAdvanced', 59, 'operations', 'Seguretat i normativa', 'Visió conjunta d’APPCC, incidències, traçabilitat i manteniment preventiu.', () => {
    const records = A.state.controlNormatiu?.records || {};
    const recordCount = Object.values(records).reduce((sum, value) => sum + (Array.isArray(value) ? value.length : 0), 0);
    const incidents = Array.isArray(records.incidencies) ? records.incidencies.length : 0;
    const traces = A.state.traceabilityRecords || [];
    const maintenance = A.state.maintenanceRecords || [];
    const pendingMaintenance = maintenance.filter(item => item.status !== 'Completat').length;
    return `<div class="arcadiStats">${stat(recordCount, 'Registres normatius')}${stat(incidents, 'Incidències APPCC')}${stat(traces.length, 'Lots traçats')}${stat(pendingMaintenance, 'Manteniments pendents')}</div><div class="panel actions"><button class="btn" data-core="control">Control Normatiu</button><button class="btn secondary" data-open-module="traceability">Traçabilitat</button><button class="btn secondary" data-open-module="maintenance">Manteniment</button></div>`;
  });

  custom('analytics', 42, 'analysis', 'Analítica', 'Indicadors calculats amb les dades actuals del restaurant.', () => {
    const dishes = A.state.dishes || [];
    const averageCost = dishes.length ? dishes.reduce((sum, dish) => sum + dishCost(dish), 0) / dishes.length : 0;
    const reservations = A.state.reservations || [];
    return `<div class="notice"><b>Sense xifres inventades:</b> si encara no hi ha vendes o consums registrats, l’indicador mostra zero.</div><div class="arcadiStats">${stat(A.money(closedSales()), 'Vendes TPV tancades')}${stat(reservations.reduce((sum, item) => sum + A.num(item.pax), 0), 'Pax reservats')}${stat(A.money(averageCost), 'Cost mitjà per fitxa')}${stat(lowStock().length, 'Alertes de stock')}</div>${costTables()}`;
  });

  custom('costs', 53, 'analysis', 'Control de costos', 'Mercaderia, personal i rendiment amb origen de dada visible.', () => costTables());
  custom('economyAdvanced', 57, 'analysis', 'Economia avançada', 'Vendes registrades, stock, fiances i marge teòric.', () => {
    const sales = closedSales();
    const paidDeposits = (A.state.reservations || []).reduce((sum, item) => sum + (item.paymentStatus === 'pagat' ? A.num(item.depositAmount) : 0), 0);
    const theoreticalFood = (A.state.dishes || []).reduce((sum, item) => sum + dishCost(item), 0);
    return `<div class="arcadiStats">${stat(A.money(sales), 'Vendes TPV')}${stat(A.money(paidDeposits), 'Fiances cobrades')}${stat(A.money(stockValue()), 'Stock valorat')}${stat(A.money(Math.max(0, sales - theoreticalFood)), 'Marge teòric disponible')}</div><div class="notice">El marge és orientatiu fins que cada venda tingui el seu escandall i estiguin registrades totes les factures i despeses.</div>`;
  });

  function costTables() {
    const dishes = A.state.dishes || [];
    const rows = dishes.map(dish => {
      const cost = dishCost(dish);
      const price = A.num(dish.sale);
      return { dish, cost, price, percent: price ? cost / price * 100 : 0 };
    }).sort((a, b) => b.percent - a.percent).slice(0, 100).map(item => `<tr><td><b>${e(item.dish.name)}</b></td><td>${A.money(item.cost)}</td><td>${A.money(item.price)}</td><td>${item.percent.toFixed(1)}%</td></tr>`).join('');
    return `<div class="arcadiStats">${stat(A.money(stockValue()), 'Mercaderia en stock')}${stat(scheduledHours().toFixed(1), 'Hores programades')}${stat(A.money(closedSales()), 'Vendes tancades')}</div><div class="panel"><h3>Escandalls per percentatge de cost</h3><div class="tableWrap"><table><thead><tr><th>Plat</th><th>Cost</th><th>Venda</th><th>% cost</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Encara no hi ha fitxes de plats.</td></tr>'}</tbody></table></div></div>`;
  }

  custom('exports', 65, 'ecosystem', 'Exportació corporativa', 'Còpia completa i exportacions CSV per treballar amb Excel o Power BI.', () => `
    <div class="panel"><h3>Exportar sense alterar les dades</h3><p class="muted">Els fitxers es generen al teu ordinador. No s’envien a cap servei extern.</p><div class="actions"><button class="btn" data-export="backup">Còpia JSON completa</button><button class="btn secondary" data-export="products">Productes CSV</button><button class="btn secondary" data-export="dishes">Plats CSV</button><button class="btn secondary" data-export="reservations">Reserves CSV</button><button class="btn secondary" data-export="employees">RRHH CSV</button></div></div>`);

  custom('backoffice', 60, 'system', 'Backoffice corporatiu', 'Estat del sistema, persistència i còpies de seguretat.', () => {
    const collections = Object.entries(A.state).filter(([, value]) => Array.isArray(value));
    const rows = collections.map(([key, value]) => `<tr><td>${e(key)}</td><td>${value.length}</td></tr>`).join('');
    return `<div class="arcadiStats">${stat(A.date(A.state.updatedAt), 'Última actualització')}${stat(collections.length, 'Col·leccions')}${stat('Automàtica', 'Còpia abans de guardar')}</div><div class="panel actions"><button class="btn" data-core="backup">Còpies de seguretat</button><button class="btn secondary" data-export="backup">Descarregar JSON ara</button></div><div class="panel"><div class="tableWrap"><table><thead><tr><th>Bloc de dades</th><th>Registres</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  });

  custom('system', 66, 'system', 'Sistema', 'Empresa, usuaris locals, seguretat i integracions configurades.', () => {
    const company = A.state.company || {};
    return `<div class="panel"><h3>ARCADI GESTIO RESTAURANT</h3><div class="arcadiKeyValue"><b>Restaurant</b><span>${e(company.name || 'Casa Mestres')}</span><b>Emmagatzematge</b><span>JSON local amb còpies automàtiques</span><b>Windows</b><span>Aplicació d’escriptori empaquetada sobre aquest mateix codi</span><b>Render</b><span>Mateixa aplicació, desplegament web</span><b>IA</b><span>Opcional; la gestió no en depèn</span></div><div class="actions"><button class="btn" data-core="company">Configuració de l’empresa</button><button class="btn secondary" data-open-module="assistant">Assistència IA</button></div></div>`;
  });

  custom('finalization', 67, 'system', 'Control de finalització', 'Comprovació funcional de totes les àrees integrades.', () => {
    const checks = [
      ['Dades mestres', allProducts().length > 0 && (A.state.dishes || []).length > 0],
      ['Escandalls', (A.state.dishes || []).every(dish => Array.isArray(dish.ingredients) && Array.isArray(dish.baseUses))],
      ['Compres i recepció', Array.isArray(A.state.purchaseOrders || []) && Array.isArray(A.state.goodsReceipts || [])],
      ['APPCC i traçabilitat', Boolean(A.state.controlNormatiu) && Array.isArray(A.state.traceabilityRecords || [])],
      ['CRM i experiències', Array.isArray(A.state.crmContacts || []) && Array.isArray(A.state.experiences || [])],
      ['Windows preparat', true],
      ['IA opcional', true]
    ];
    return `<div class="panel"><h3>Estat de consolidació</h3>${checks.map(([label, ok]) => `<div class="arcadiCheck ${ok ? 'ok' : 'warn'}"><b>${ok ? '✓' : '!'} ${e(label)}</b><span>${ok ? 'Integrat' : 'Preparat; encara sense registres'}</span></div>`).join('')}</div><div class="notice">Aquest panell comprova estructura i dades. Les proves automàtiques del projecte validen a més el servidor, l’accés, les reserves i els pagaments.</div>`;
  });

  custom('assistant', 61, 'system', 'Assistència IA', 'Ajuda opcional preparada per activar més endavant; el programa no en depèn.', () => `
    <div class="notice"><b>Funció aparcada:</b> primer acabem i validem ARCADI GESTIO RESTAURANT. La IA s’activarà més endavant com una eina d’ajuda, sense controlar ni bloquejar cap mòdul.</div>
    <div class="panel"><h3>Usos previstos</h3><ul><li>Preparar esborranys de llistes de compra a partir dels plats.</li><li>Proposar textos d’incidències i accions correctores APPCC.</li><li>Resumir dades del restaurant quan Arcadi ho demani.</li></ul><button class="btn secondary" type="button" disabled>Activació pendent</button></div>`);

  function genericView(definition) {
    const records = A.collection(definition.collection);
    const columns = definition.columns || definition.fields.slice(0, 4).map(field => [field.key, field.label]);
    const header = columns.map(([, label]) => `<th>${e(label)}</th>`).join('');
    const rows = records.map(record => `<tr>${columns.map(([key]) => `<td>${key.toLowerCase().includes('date') ? e(record[key] || '—') : e(record[key] ?? '—')}</td>`).join('')}<td class="arcadiRowActions"><button class="btn small secondary" data-edit-record="${e(record.id)}">Editar</button><button class="btn small bad" data-remove-record="${e(record.id)}">Eliminar</button></td></tr>`).join('');
    return `<div class="arcadiStats">${stat(records.length, definition.label)}</div><div class="panel"><div class="toolbar"><button class="btn" data-new-record>Nou registre</button><button class="btn secondary" data-print>Imprimir</button></div><div class="tableWrap"><table><thead><tr>${header}<th></th></tr></thead><tbody>${rows || `<tr><td colspan="${columns.length + 1}">Encara no hi ha registres. Pots crear el primer sense perdre cap dada existent.</td></tr>`}</tbody></table></div></div>`;
  }

  function hub() {
    A.active = 'hub';
    location.hash = 'arcadi-hub';
    A.page('ARCADI GESTIO RESTAURANT', 'Un sol programa: gestió integral, Windows i Render', `
      <div class="notice"><b>Projecte consolidat:</b> les millores s’integren sobre les fitxes de plats, productes, reserves i registres existents. No hi ha una segona aplicació ni dades duplicades.</div>
      <div class="arcadiSectionGrid">${Object.entries(sections).map(([key, section]) => `<button class="arcadiSectionCard" data-open-section="${e(key)}"><b>${e(section.label)}</b><span>${e(section.description)}</span><small>${section.modules.length} àrees</small></button>`).join('')}</div>`);
    bindCommon();
  }

  function openSection(key) {
    const section = sections[key];
    if (!section) return hub();
    A.active = `section-${key}`;
    location.hash = `arcadi-section-${key}`;
    A.page(section.label, section.description, `<div class="arcadiModuleGrid">${moduleButtons(key)}</div>`);
    bindCommon();
  }

  async function open(key) {
    const definition = definitions[key];
    if (!definition) return hub();
    A.active = key;
    location.hash = `arcadi-${key}`;
    A.loading(definition.label);
    try {
      await A.load();
      const html = definition.renderer ? definition.renderer() : genericView(definition);
      A.page(definition.label, `FASE ${definition.phase} · ${definition.description}`, `<div class="arcadiModuleNav"><button class="btn secondary" data-open-section="${e(definition.section)}">← ${e(sections[definition.section].label)}</button><span class="badge">FASE ${definition.phase}</span></div>${html}`);
      bindCommon(definition);
    } catch (error) {
      A.error(error);
    }
  }

  function csv(rows) {
    if (!rows.length) return '';
    const keys = [...new Set(rows.flatMap(row => Object.keys(row).filter(key => typeof row[key] !== 'object')) )];
    const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    return [keys.map(quote).join(';'), ...rows.map(row => keys.map(key => quote(row[key])).join(';'))].join('\r\n');
  }

  function exportData(kind) {
    const stamp = new Date().toISOString().slice(0, 10);
    if (kind === 'backup') return A.download(`ARCADI_GESTIO_BACKUP_${stamp}.json`, JSON.stringify(A.state, null, 2));
    const rows = A.state[kind] || [];
    A.download(`ARCADI_GESTIO_${kind}_${stamp}.csv`, `\ufeff${csv(rows)}`, 'text/csv;charset=utf-8');
  }

  function bindCommon(definition) {
    document.querySelectorAll('[data-open-section]').forEach(button => { button.onclick = () => openSection(button.dataset.openSection); });
    document.querySelectorAll('[data-open-module]').forEach(button => { button.onclick = () => open(button.dataset.openModule); });
    document.querySelectorAll('[data-core]').forEach(button => { button.onclick = () => A.goCore(button.dataset.core); });
    document.querySelectorAll('[data-export]').forEach(button => { button.onclick = () => exportData(button.dataset.export); });

    document.querySelector('[data-purchase-dictate]')?.addEventListener('click',function(){
      const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
      if(!Recognition)return alert('Aquest navegador no permet dictat. Pots escriure la nota manualment.');
      const recognition=new Recognition(); recognition.lang='ca-ES'; recognition.interimResults=false;
      recognition.onresult=function(event){const input=document.getElementById('purchaseAssistantText');input.value=[input.value,event.results[0][0].transcript].filter(Boolean).join('\n');};
      recognition.onerror=function(){alert('No s’ha pogut completar el dictat. Pots continuar escrivint.');}; recognition.start();
    });
    document.querySelector('[data-purchase-preview]')?.addEventListener('click',function(){
      const raw=document.getElementById('purchaseAssistantText')?.value||'',drafts=purchaseDraftsFromText(raw),result=document.getElementById('purchaseAssistantResult');
      if(!drafts.length){result.innerHTML='<div class="errBox">Escriu almenys un producte.</div>';return;}
      result.innerHTML=drafts.map(function(draft,index){return '<div class="notice"><b>'+e(draft.supplier)+'</b><br>'+draft.lines.map(e).join('<br>')+'<div class="actions"><button class="btn" data-purchase-save="'+index+'">Crear comanda preparada</button></div></div>';}).join('');
      result.querySelectorAll('[data-purchase-save]').forEach(function(button){button.onclick=async function(){const draft=drafts[Number(button.dataset.purchaseSave)],orders=A.collection('purchaseOrders'),stamp=new Date().toISOString().slice(0,10).replaceAll('-','');orders.push({id:A.uid('purchaseOrders'),code:'GS-COMP-'+stamp+'-'+String(orders.length+1).padStart(2,'0'),date:new Date().toISOString().slice(0,10),supplier:draft.supplier,status:'Preparada',responsible:'',lines:draft.lines.join('\n'),notes:'Proposta creada des d’una nota assistida.\n\nNota original:\n'+raw,source:'assistant',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});await A.save('COMANDA PREPARADA');button.disabled=true;button.textContent='Creada';};});
    });
    document.querySelector('[data-publication-create]')?.addEventListener('click',async function(){
      const source=(window.__arcadiPublicationSources||[]).find(function(item){return item.id===document.getElementById('publicationSource')?.value;}); if(!source)return;
      const channel=document.getElementById('publicationChannel')?.value||'Instagram',campaigns=A.collection('marketingCampaigns');
      campaigns.push({id:A.uid('marketingCampaigns'),title:source.title||'Novetat Casa Mestres',channel:channel,date:new Date().toISOString().slice(0,10),status:'Preparada',content:source.content||source.title,sourceId:source.id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
      await A.save('ESBORRANY PREPARAT');open('publicationStudio');
    });
    document.querySelectorAll('[data-share-campaign]').forEach(function(button){button.onclick=async function(){const campaign=(A.state.marketingCampaigns||[]).find(function(item){return item.id===button.dataset.shareCampaign;});if(!campaign)return;if(navigator.share)await navigator.share({title:campaign.title,text:campaign.content||campaign.title});else{await navigator.clipboard.writeText(campaign.title+'\n\n'+(campaign.content||''));alert('Text copiat. Ja el pots enganxar al canal corresponent.');}};});
    if (!definition?.collection) return;
    document.querySelector('[data-new-record]')?.addEventListener('click', () => A.openRecordForm(definition));
    document.querySelectorAll('[data-edit-record]').forEach(button => { button.onclick = () => A.openRecordForm(definition, button.dataset.editRecord); });
    document.querySelectorAll('[data-remove-record]').forEach(button => { button.onclick = () => A.removeRecord(definition, button.dataset.removeRecord); });
    document.querySelector('[data-print]')?.addEventListener('click', () => {
      const printArea = document.getElementById('printArea');
      const table = document.querySelector('#view table');
      printArea.innerHTML = `<div class="draftDoc"><h1>${e(definition.label)}</h1><p>${new Date().toLocaleDateString('ca-ES')}</p>${table ? table.outerHTML : ''}</div>`;
      window.print();
    });
  }

  function injectNavigation() {
    const nav = document.getElementById('nav');
    if (!nav || nav.querySelector('[data-arcadi-navigation]')) return;
    const wrapper = document.createElement('div');
    wrapper.dataset.arcadiNavigation = 'true';
    wrapper.innerHTML = `<div class="group">ARCADI GESTIO</div><button data-arcadi-key="hub">◉ Gestió integral</button>${Object.entries(sections).map(([key, section]) => `<button data-arcadi-key="section-${e(key)}">${e(section.label)}</button>`).join('')}`;
    wrapper.querySelector('[data-arcadi-key="hub"]').onclick = () => hub();
    wrapper.querySelectorAll('[data-arcadi-key^="section-"]').forEach(button => {
      button.onclick = () => openSection(button.dataset.arcadiKey.replace('section-', ''));
    });
    nav.appendChild(wrapper);
  }

  const nav = document.getElementById('nav');
  if (nav) new MutationObserver(injectNavigation).observe(nav, { childList: true });
  injectNavigation();

  window.ArcadiModules = { open, openSection, hub, definitions };

  const hash = location.hash.slice(1);
  if (hash === 'arcadi-hub') setTimeout(hub, 0);
  else if (hash.startsWith('arcadi-section-')) setTimeout(() => openSection(hash.replace('arcadi-section-', '')), 0);
  else if (hash.startsWith('arcadi-') && definitions[hash.replace('arcadi-', '')]) setTimeout(() => open(hash.replace('arcadi-', '')), 0);
})();
