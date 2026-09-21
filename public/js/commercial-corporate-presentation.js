(function () {
  'use strict';

  let installed = false;
  const A = () => window.ArcadiERP;
  const C = () => window.ArcadiCommercial;

  function num(value) { return Number.isFinite(Number(value)) ? Number(value) : 0; }
  function money(value) { return new Intl.NumberFormat('ca-ES', { style: 'currency', currency: 'EUR' }).format(num(value)); }
  function formatDate(value) {
    const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : (value || 'A concretar');
  }
  function technical(line) {
    const text = String(line || '').trim();
    return /^(trafec_copy|company|restaurant|document|doc|menu|proposal|crm|commercial)_[A-Za-z0-9_-]{8,}$/i.test(text)
      || /^[a-z][a-z0-9_-]*_[a-f0-9]{12,}$/i.test(text)
      || /^[a-f0-9]{24,}$/i.test(text);
  }
  function cleanMenu(value, title = '') {
    const wantedTitle = String(title || '').trim().toLowerCase();
    const seen = new Set();
    const rows = [];
    for (const raw of String(value || '').split(/\r?\n/)) {
      const line = raw.replace(/\s+/g, ' ').trim();
      if (!line || technical(line)) continue;
      const key = line.toLowerCase();
      if (key === wantedTitle && rows.length === 0) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(line);
    }
    return rows.join('\n');
  }
  function proposalById(id) { return (A().state?.commercialProposals || []).find(item => item.id === id); }
  function centreFor(item = {}) {
    const centreId = item.centreId || item.menuSnapshot?.centreId || item.menuSnapshot?.restaurantId || A().context?.centreId || '';
    return (A().state?.restaurants || []).find(row => row.id === centreId) || null;
  }
  function orgFor(item = {}) {
    const companyId = item.companyId || item.menuSnapshot?.companyId || A().context?.companyId || '';
    return (A().state?.organizations || []).find(row => row.id === companyId) || null;
  }
  function brand(item = {}) {
    const centre = centreFor(item);
    const org = orgFor(item);
    const name = centre?.name || org?.name || A().state?.company?.name || 'ARCADI GESTIO RESTAURANT';
    const sarriera = /sarriera/i.test(name);
    return {
      name: sarriera ? 'SARRIERA 1930' : String(name).toUpperCase(),
      displayName: sarriera ? 'Sarriera 1930' : name,
      tagline: centre?.tagline || centre?.subtitle || (sarriera ? 'SIDRERIA · CUINA BASCO-CATALANA' : 'PROPOSTA GASTRONÒMICA'),
      phone: centre?.phone || org?.phone || A().state?.company?.phone || '',
      email: centre?.email || org?.email || A().state?.company?.email || '',
      address: centre?.address || centre?.postalAddress || org?.address || A().state?.company?.address || '',
      logoUrl: centre?.logoUrl || centre?.logo || centre?.brandLogo || org?.logoUrl || org?.logo || A().state?.company?.logoUrl || ''
    };
  }
  function wordmark(b) {
    if (b.logoUrl && /^https?:\/\//i.test(b.logoUrl)) return `<img class="cpLogoImage" src="${A().esc(b.logoUrl)}" alt="${A().esc(b.displayName)}">`;
    return `<div class="cpWordmark">${A().esc(b.name)}</div><div class="cpTagline">${A().esc(b.tagline)}</div>`;
  }
  function detail(label, value) { return `<div class="cpDetail"><small>${label}</small><strong>${A().esc(value || '—')}</strong></div>`; }

  function corporateSheet(item) {
    const b = brand(item);
    const menu = cleanMenu(item.menuSummary || '', item.menuName).split('\n').filter(Boolean);
    const contact = [b.phone ? `Tel. ${b.phone}` : '', b.email, b.address].filter(Boolean).join(' · ');
    return `<article class="corporateProposal">
      <header class="cpHeader"><div>${wordmark(b)}</div><div class="cpMeta"><b>PROPOSTA COMERCIAL</b><span>${A().esc(item.code || '')}</span><span>${A().esc(formatDate(item.eventDate))}</span></div></header>
      <section class="cpIntro"><div class="cpEyebrow">PROPOSTA PERSONALITZADA</div><h1>Una experiència pensada per al vostre grup</h1><p>Gràcies per comptar amb <b>${A().esc(b.displayName)}</b>. Aquesta proposta recull els detalls del servei, la proposta gastronòmica i l’import acordat.</p></section>
      <section class="cpDetails">${detail('CLIENT', item.clientName)}${detail('DATA DEL SERVEI', formatDate(item.eventDate))}${detail('SERVEI / GRUP', item.eventName || 'A concretar')}${detail('PERSONES', String(num(item.pax)))}</section>
      <section class="cpMenu"><div class="cpEyebrow">PROPOSTA GASTRONÒMICA</div><h2>${A().esc(item.menuName || 'Menú')}</h2><div class="cpMenuLines">${menu.length ? menu.map(line => `<div>${A().esc(line)}</div>`).join('') : '<div>Menú seleccionat a la proposta.</div>'}</div></section>
      <section class="cpPrice"><div><span>${num(item.pax)} persones</span><small>${money(item.pricePerPerson)} / persona</small></div><strong>${money(item.totalAmount)}</strong></section>
      ${item.notes ? `<section class="cpNotes"><div class="cpEyebrow">CONDICIONS I OBSERVACIONS</div><p>${A().esc(item.notes).replace(/\n/g, '<br>')}</p></section>` : ''}
      <section class="cpConfirm"><b>Confirmació de la proposta</b><p>Per confirmar-la o comentar qualsevol ajust, podeu respondre directament al correu de Direcció.</p>${item.validUntil ? `<small>Proposta vàlida fins al ${A().esc(formatDate(item.validUntil))}.</small>` : ''}</section>
      <footer class="cpFooter"><b>${A().esc(b.displayName)}</b>${contact ? `<span>${A().esc(contact)}</span>` : ''}</footer>
    </article>`;
  }

  function buildLiveProposal() {
    const form = document.getElementById('commercialProposalForm');
    if (!form) return null;
    const menuSelect = document.getElementById('commercialMenuSelect');
    const preview = document.querySelector('#commercialMenuPreview pre');
    const existingId = form.dataset.proposalId || '';
    const original = existingId ? proposalById(existingId) : {};
    return {
      ...original,
      clientName: form.elements.clientName?.value || '',
      clientEmail: form.elements.clientEmail?.value || '',
      clientPhone: form.elements.clientPhone?.value || '',
      eventName: form.elements.eventName?.value || '',
      eventDate: form.elements.eventDate?.value || '',
      pax: form.elements.pax?.value || 0,
      menuId: menuSelect?.value || '',
      menuName: menuSelect?.selectedOptions?.[0]?.textContent?.replace(/ · .*$/, '') || original.menuName || 'Menú',
      menuSummary: cleanMenu(preview?.textContent || original.menuSummary || '', menuSelect?.selectedOptions?.[0]?.textContent || original.menuName || ''),
      pricePerPerson: form.elements.pricePerPerson?.value || 0,
      totalAmount: num(form.elements.pax?.value) * num(form.elements.pricePerPerson?.value),
      validUntil: form.elements.validUntil?.value || '',
      notes: form.elements.notes?.value || '',
      companyId: original.companyId || A().context?.companyId || '',
      centreId: original.centreId || centreFor({ menuSnapshot: (A().state?.documents || []).find(x => x.id === menuSelect?.value) })?.id || A().context?.centreId || '',
      menuSnapshot: (A().state?.documents || []).find(x => x.id === menuSelect?.value) || original.menuSnapshot || null,
      code: original.code || 'ESBORRANY'
    };
  }

  function attachLivePreview(proposalId) {
    const form = document.getElementById('commercialProposalForm');
    if (!form || form.querySelector('[data-corporate-preview]')) return;
    form.dataset.proposalId = proposalId || '';
    const host = document.createElement('div');
    host.dataset.corporatePreview = '1';
    host.innerHTML = '<div class="cpPreviewTitle"><b>Vista del client</b><span>Aquest és el format comercial que s’imprimeix i s’envia.</span></div><div class="cpPreviewSurface"></div>';
    const actions = form.querySelector('.actions');
    form.insertBefore(host, actions || null);
    const render = () => {
      const item = buildLiveProposal();
      if (!item) return;
      const surface = host.querySelector('.cpPreviewSurface');
      surface.innerHTML = corporateSheet(item);
      document.querySelectorAll('#commercialMenuPreview pre').forEach(node => { node.textContent = cleanMenu(node.textContent, item.menuName); });
    };
    form.addEventListener('input', render);
    form.addEventListener('change', () => setTimeout(render, 0));
    setTimeout(render, 0);
  }

  function installStyles() {
    if (document.getElementById('corporateCommercialStyles')) return;
    const style = document.createElement('style');
    style.id = 'corporateCommercialStyles';
    style.textContent = `
      .cpPreviewTitle{display:flex;justify-content:space-between;gap:12px;align-items:end;margin:24px 0 10px;padding-top:18px;border-top:1px solid #d9cbb9}.cpPreviewTitle span{font-size:.82rem;color:#746d63}.cpPreviewSurface{background:#e9e4db;padding:20px;border-radius:12px;overflow:auto}
      .corporateProposal{--green:#183e33;--red:#9a3f34;--gold:#b08a55;--paper:#fbf7ef;max-width:780px;margin:auto;background:#fff;color:#24332d;border:1px solid #ded5c8;font-family:Arial,Helvetica,sans-serif;box-shadow:0 10px 30px rgba(37,45,40,.08)}
      .cpHeader{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;padding:28px 34px 24px;background:var(--paper);border-top:8px solid var(--green)}.cpWordmark{font-family:Georgia,'Times New Roman',serif;font-size:31px;line-height:1;color:var(--green);font-weight:700;letter-spacing:.04em}.cpTagline{margin-top:7px;font-size:10px;letter-spacing:.19em;color:var(--gold);font-weight:700}.cpLogoImage{display:block;max-width:210px;max-height:82px}.cpMeta{text-align:right;display:flex;flex-direction:column;gap:4px;color:#746d63;font-size:12px}.cpMeta b{color:#24332d;letter-spacing:.08em}
      .cpIntro{padding:26px 34px 10px}.cpEyebrow{font-size:10px;letter-spacing:.15em;color:var(--gold);font-weight:700}.cpIntro h1{font-family:Georgia,'Times New Roman',serif;color:var(--green);font-size:27px;line-height:1.2;margin:8px 0 10px}.cpIntro p{color:#555d57;line-height:1.6;margin:0}
      .cpDetails{display:grid;grid-template-columns:1fr 1fr;margin:12px 34px;border:1px solid #e5ddcf;background:#f8f4ed}.cpDetail{padding:14px 17px;border-bottom:1px solid #e5ddcf}.cpDetail:nth-child(odd){border-right:1px solid #e5ddcf}.cpDetail:nth-last-child(-n+2){border-bottom:0}.cpDetail small{display:block;color:#746d63;font-size:10px;letter-spacing:.11em;font-weight:700}.cpDetail strong{display:block;margin-top:5px;font-size:15px}
      .cpMenu{padding:22px 34px 10px}.cpMenu h2{font-family:Georgia,'Times New Roman',serif;color:var(--green);font-size:23px;margin:7px 0 10px}.cpMenuLines{border-top:1px solid #e8e0d5}.cpMenuLines>div{padding:8px 0;border-bottom:1px solid #eee6da;font-size:15px;line-height:1.45}
      .cpPrice{margin:18px 34px 6px;padding:17px 20px;background:var(--green);color:#fff;display:flex;justify-content:space-between;align-items:center;gap:20px}.cpPrice div{display:flex;flex-direction:column;gap:3px}.cpPrice small{opacity:.78}.cpPrice strong{font-size:24px}.cpNotes{padding:18px 34px 0}.cpNotes p{line-height:1.6}.cpConfirm{margin:24px 34px;padding:17px 19px;border-left:4px solid var(--red);background:#faf7f2}.cpConfirm p{margin:6px 0;line-height:1.55}.cpConfirm small{color:#746d63}.cpFooter{padding:20px 34px;background:var(--paper);border-top:1px solid #e5ddcf;display:flex;flex-direction:column;gap:4px;color:#746d63;font-size:12px;border-bottom:5px solid var(--red)}.cpFooter b{color:var(--green);font-size:14px}
      @media(max-width:640px){.cpHeader{padding:22px}.cpWordmark{font-size:25px}.cpDetails{grid-template-columns:1fr;margin:12px 22px}.cpDetail,.cpDetail:nth-child(odd){border-right:0;border-bottom:1px solid #e5ddcf}.cpDetail:last-child{border-bottom:0}.cpIntro,.cpMenu,.cpNotes{padding-left:22px;padding-right:22px}.cpPrice,.cpConfirm{margin-left:22px;margin-right:22px}.cpPreviewSurface{padding:8px}}
      @media print{body *{visibility:hidden!important}#printArea,#printArea *{visibility:visible!important}#printArea{position:absolute!important;left:0!important;top:0!important;width:100%!important}.corporateProposal{box-shadow:none!important;border:0!important;max-width:none!important}.cpPreviewTitle{display:none!important}}
    `;
    document.head.appendChild(style);
  }

  function install(attempt = 0) {
    if (installed) return true;
    if (!window.ArcadiERP || !window.ArcadiCommercial) {
      if (attempt < 40) setTimeout(() => install(attempt + 1), 100);
      return false;
    }
    installed = true;
    installStyles();
    const originalOpen = C().openProposal;
    C().openProposal = function (proposalId, presetClientId) {
      const result = originalOpen.call(C(), proposalId, presetClientId);
      setTimeout(() => attachLivePreview(proposalId), 0);
      return result;
    };
    C().printProposal = function (id) {
      const item = proposalById(id);
      if (!item) return;
      const target = document.getElementById('printArea');
      target.innerHTML = corporateSheet(item);
      window.print();
    };
    C().corporateSheet = corporateSheet;
    C().cleanMenuText = cleanMenu;
    return true;
  }

  window.ArcadiCommercialCorporate = { install, corporateSheet, cleanMenu, brand, formatDate };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => install(), { once: true });
  else install();
})();