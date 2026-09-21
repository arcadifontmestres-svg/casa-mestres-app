(function () {
  'use strict';

  let installed = false;
  let observer;
  const A = () => window.ArcadiERP;

  function proposal(id) {
    return (A().state?.commercialProposals || []).find(item => item.id === id);
  }

  function money(value) {
    const n = Number(value || 0);
    return `${Number.isFinite(n) ? n.toFixed(2).replace('.', ',') : '0,00'} €`;
  }

  function centreName(item) {
    const centre = (A().state?.restaurants || []).find(row => row.id === item.centreId);
    const company = (A().state?.organizations || []).find(row => row.id === item.companyId);
    return centre?.name || company?.name || A().state?.company?.name || 'ARCADI GESTIO RESTAURANT';
  }

  function emailSubject(item) {
    return `Proposta comercial ${item.code || ''} · ${centreName(item)}`;
  }

  function emailBody(item) {
    const lines = [
      `Bon dia${item.clientName ? ` ${item.clientName}` : ''},`,
      '',
      `Us fem arribar la proposta comercial ${item.code || ''}.`,
      '',
      `Data del servei: ${item.eventDate || 'A concretar'}`,
      `Persones: ${Number(item.pax || 0)}`,
      `Menú: ${item.menuName || 'A concretar'}`,
      item.pricePerPerson != null ? `Preu per persona: ${money(item.pricePerPerson)}` : '',
      item.totalAmount != null ? `Import total: ${money(item.totalAmount)}` : '',
      '',
      item.menuSummary ? `PROPOSTA DE MENÚ\n${item.menuSummary}` : '',
      item.notes ? `\nObservacions\n${item.notes}` : '',
      '',
      'Quedem a la vostra disposició per qualsevol aclariment o modificació.',
      '',
      `Atentament,`,
      centreName(item)
    ].filter(value => value !== '');
    return lines.join('\n').slice(0, 14000);
  }

  function gmailComposeUrl(item) {
    const params = new URLSearchParams({
      view: 'cm',
      fs: '1',
      to: String(item.clientEmail || '').trim(),
      su: emailSubject(item),
      body: emailBody(item)
    });
    return `https://mail.google.com/mail/?${params.toString()}`;
  }

  function showHistory(id) {
    const item = proposal(id);
    if (!item) return;
    const rows = (item.sendHistory || []).map(entry => `<tr><td>${A().esc(new Date(entry.at).toLocaleString('ca-ES'))}</td><td>${A().esc(entry.from || 'Gmail')}</td><td>${A().esc(entry.to || '')}</td><td>${A().esc(entry.provider === 'gmail-compose' ? 'Confirmat per Direcció' : (entry.providerId || entry.provider || ''))}</td></tr>`).join('');
    A().modal('Historial d’enviaments', `<div class="tableWrap"><table><thead><tr><th>Data</th><th>Remitent</th><th>Destinatari</th><th>Registre</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Encara no s’ha enviat.</td></tr>'}</tbody></table></div>`);
  }

  async function confirmSent(id) {
    const item = proposal(id);
    if (!item) return;
    const now = new Date().toISOString();
    item.sendHistory = Array.isArray(item.sendHistory) ? item.sendHistory : [];
    item.sendHistory.push({
      at: now,
      to: item.clientEmail,
      from: 'Gmail del navegador',
      provider: 'gmail-compose',
      providerId: 'manual-confirmation'
    });
    item.status = 'ENVIADA';
    item.sentAt = now;
    item.sentTo = item.clientEmail;
    item.updatedAt = now;
    A().closeModal();
    await A().save('PROPOSTA ENVIADA');
    window.ArcadiModules?.open(location.hash.includes('crm') ? 'crm' : 'groups');
  }

  function sendProposal(id) {
    const item = proposal(id);
    if (!item) return;
    if (!['VALIDADA', 'ENVIADA'].includes(String(item.status || ''))) {
      return alert('Direcció ha de validar la proposta abans d’enviar-la.');
    }
    if (!String(item.clientEmail || '').trim()) {
      return alert('Aquesta proposta no té email de client.');
    }

    const popup = window.open(gmailComposeUrl(item), '_blank', 'noopener,noreferrer');
    if (!popup) {
      window.location.href = gmailComposeUrl(item);
      return;
    }

    A().modal('Enviar proposta', `
      <div class="notice"><b>Gmail ja s’ha obert</b> amb el client, l’assumpte i la proposta preparats.</div>
      <p>Revisa el correu i prem <b>Envia</b> a Gmail. Quan l’hagis enviat, torna aquí i confirma-ho perquè quedi registrat a l’historial del client.</p>
      <div class="actions">
        <button class="btn" id="commercialConfirmSent">Ja l’he enviat</button>
        <button class="btn secondary" type="button" onclick="ArcadiERP.closeModal()">Tornar sense marcar</button>
      </div>
    `);
    document.getElementById('commercialConfirmSent').onclick = () => confirmSent(id).catch(error => alert(error.message || 'No s’ha pogut guardar l’enviament.'));
  }

  function openConfig() {
    A().modal('Enviament de propostes', `
      <div class="notice"><b>No cal configurar res.</b></div>
      <p>Quan Direcció valida una proposta, el botó <b>Enviar email</b> obre Gmail amb el correu complet ja preparat. Només cal revisar-lo i prémer <b>Envia</b>.</p>
      <div class="actions"><button class="btn" onclick="ArcadiERP.closeModal()">Entès</button></div>
    `);
  }

  function removeLegacyButton() {
    document.querySelectorAll('[data-commercial-email-settings]').forEach(node => node.remove());
  }

  function install(attempt = 0) {
    if (installed) return true;
    if (!window.ArcadiERP || !window.ArcadiCommercial) {
      if (attempt < 40) setTimeout(() => install(attempt + 1), 100);
      return false;
    }
    installed = true;
    window.ArcadiCommercial.openEmailConfig = openConfig;
    window.ArcadiCommercial.sendProposal = sendProposal;
    window.ArcadiCommercial.showSendHistory = showHistory;
    removeLegacyButton();
    observer = new MutationObserver(removeLegacyButton);
    observer.observe(document.body, { childList: true, subtree: true });
    return true;
  }

  window.ArcadiCommercialEmailSettings = {
    install,
    openConfig,
    sendProposal,
    showHistory,
    confirmSent,
    gmailComposeUrl
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => install(), { once: true });
  else install();
})();
