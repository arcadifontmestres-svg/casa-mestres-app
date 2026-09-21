(function () {
  'use strict';

  let installed = false;
  let observer = null;
  const A = () => window.ArcadiERP;
  const C = () => window.ArcadiCommercial;

  function proposal(id) {
    return (A().state?.commercialProposals || []).find(item => item.id === id);
  }

  function scopeFor(item = {}) {
    return {
      companyId: item.companyId || item.menuSnapshot?.companyId || A().context?.companyId || 'company_casa_mestres',
      centreId: item.centreId || item.menuSnapshot?.centreId || item.menuSnapshot?.restaurantId || A().context?.centreId || ''
    };
  }

  async function getStatus(item = {}) {
    const scope = scopeFor(item);
    const query = new URLSearchParams(scope).toString();
    return A().api(`/api/commercial-email-status?${query}`);
  }

  function companyName(item) {
    const centreId = scopeFor(item).centreId;
    const centre = (A().state?.restaurants || []).find(row => row.id === centreId);
    const org = (A().state?.organizations || []).find(row => row.id === scopeFor(item).companyId);
    return centre?.name || org?.name || 'ARCADI GESTIO RESTAURANT';
  }

  function shortMailBody(item) {
    return [
      `Bon dia${item.clientName ? ` ${item.clientName}` : ''},`,
      '',
      `Us fem arribar la proposta comercial ${item.code || ''} de ${companyName(item)}.`,
      item.eventDate ? `Data prevista del servei: ${item.eventDate}.` : '',
      '',
      'Adjunto la proposta comercial amb el menú, l’import i les condicions del servei.',
      '',
      'Per qualsevol aclariment o modificació, podeu respondre directament aquest correu.',
      '',
      'Cordialment,',
      companyName(item)
    ].filter(Boolean).join('\n');
  }

  function gmailComposeUrl(item) {
    const params = new URLSearchParams({
      view: 'cm', fs: '1', to: String(item.clientEmail || '').trim(),
      su: `Proposta comercial · ${companyName(item)} · ${item.code || ''}`,
      body: shortMailBody(item)
    });
    return `https://mail.google.com/mail/?${params.toString()}`;
  }

  async function connectGmail(item = {}) {
    const scope = scopeFor(item);
    try {
      const result = await A().api('/api/gmail/connect', { method: 'POST', body: JSON.stringify(scope) });
      if (result.connected) {
        alert('Gmail ja està connectat per aquest centre.');
        return true;
      }
      if (result.url) {
        window.location.assign(result.url);
        return true;
      }
      alert('No s’ha pogut iniciar la connexió amb Gmail.');
    } catch (error) {
      alert(error.message || 'No s’ha pogut connectar Gmail.');
    }
    return false;
  }

  function openConnection(item = {}) {
    getStatus(item).then(status => {
      const centre = companyName(item);
      const readyText = status.ready
        ? `<div class="notice"><b>Enviament corporatiu:</b> connecta una sola vegada el Gmail de Direcció. No cal cap contrasenya d’aplicació ni cap API key.</div>`
        : `<div class="notice"><b>Enviament directe no activat al servidor.</b> La proposta es pot imprimir en format corporatiu i enviar amb Gmail manualment, sense exposar dades internes.</div>`;
      A().modal('Enviament comercial · ' + centre, `
        ${readyText}
        <div class="commercialSendChoice">
          <p><b>Marca:</b> ${A().esc(centre)}</p>
          ${status.configured ? `<p><span class="badge ok">GMAIL CONNECTAT</span> ${A().esc(status.from || '')}</p>` : '<p><span class="badge warn">PENDENT</span></p>'}
        </div>
        <div class="actions">
          ${status.ready && !status.configured ? '<button class="btn" id="commercialConnectGmail">Connectar Gmail</button>' : ''}
          <button class="btn secondary" id="commercialCloseConnection">Tancar</button>
        </div>
      `);
      const connect = document.getElementById('commercialConnectGmail');
      if (connect) connect.onclick = () => connectGmail(item);
      document.getElementById('commercialCloseConnection').onclick = () => A().closeModal();
    }).catch(error => alert(error.message || 'No s’ha pogut consultar Gmail.'));
  }

  function showManualFallback(item) {
    A().modal('Enviar proposta · format corporatiu', `
      <div class="notice"><b>La proposta ja té un disseny corporatiu.</b> Per mantenir-lo intacte, guarda-la com a PDF i adjunta-la al correu.</div>
      <p>El correu de Gmail s’obrirà amb un text breu i professional. El menú complet, imports i condicions aniran a la proposta corporativa, no enganxats com a text brut.</p>
      <div class="actions">
        <button class="btn" id="commercialPrintFirst">1 · Obrir proposta / PDF</button>
        <button class="btn" id="commercialOpenGmail">2 · Obrir Gmail</button>
        <button class="btn secondary" type="button" onclick="ArcadiERP.closeModal()">Tancar</button>
      </div>
    `);
    document.getElementById('commercialPrintFirst').onclick = () => C().printProposal(item.id);
    document.getElementById('commercialOpenGmail').onclick = () => window.open(gmailComposeUrl(item), '_blank', 'noopener,noreferrer');
  }

  async function sendProposal(id) {
    const item = proposal(id);
    if (!item) return;
    if (!['VALIDADA', 'ENVIADA'].includes(String(item.status || ''))) return alert('Direcció ha de validar la proposta abans d’enviar-la.');
    if (!String(item.clientEmail || '').trim()) return alert('Aquesta proposta no té email de client.');

    let status;
    try { status = await getStatus(item); }
    catch { return showManualFallback(item); }

    if (!status.configured) {
      if (!status.ready) return showManualFallback(item);
      A().modal('Connectar Gmail · una sola vegada', `
        <div class="notice"><b>Sense passwords.</b> Google obrirà la seva pantalla oficial perquè Direcció autoritzi únicament l’enviament de correu.</div>
        <p>Després, ARCADI enviarà la proposta amb el disseny corporatiu complet de <b>${A().esc(companyName(item))}</b>.</p>
        <div class="actions"><button class="btn" id="commercialConnectNow">Connectar Gmail</button><button class="btn secondary" onclick="ArcadiERP.closeModal()">Ara no</button></div>
      `);
      document.getElementById('commercialConnectNow').onclick = () => connectGmail(item);
      return;
    }

    if (!confirm(`Enviar ${item.code} a ${item.clientEmail} amb el format corporatiu de ${companyName(item)}?`)) return;
    try {
      const result = await A().api(`/api/commercial-proposals/${encodeURIComponent(id)}/send`, { method: 'POST', body: '{}' });
      await A().load();
      alert(result.message || 'Proposta enviada correctament.');
      window.ArcadiModules?.open(location.hash.includes('crm') ? 'crm' : 'groups');
    } catch (error) {
      const message = String(error.message || 'No s’ha pogut enviar la proposta.');
      if (/connectar gmail|gmail/i.test(message)) return openConnection(item);
      alert(message);
    }
  }

  function showHistory(id) {
    const item = proposal(id);
    if (!item) return;
    const rows = (item.sendHistory || []).map(entry => `<tr><td>${A().esc(new Date(entry.at).toLocaleString('ca-ES'))}</td><td>${A().esc(entry.from || 'Gmail')}</td><td>${A().esc(entry.to || '')}</td><td>${A().esc(entry.providerId || entry.provider || '')}</td></tr>`).join('');
    A().modal('Historial d’enviaments', `<div class="tableWrap"><table><thead><tr><th>Data</th><th>Remitent</th><th>Destinatari</th><th>Registre</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Encara no s’ha enviat.</td></tr>'}</tbody></table></div>`);
  }

  function removeLegacyButton() {
    document.querySelectorAll('[data-commercial-email-settings]').forEach(node => node.remove());
  }

  function handleOAuthReturn() {
    const params = new URLSearchParams(location.search);
    const result = params.get('gmail');
    if (!result) return;
    if (result === 'connected') setTimeout(() => alert('Gmail connectat. Ja pots enviar les propostes amb el format corporatiu.'), 100);
    else if (result === 'failed') setTimeout(() => alert('Google no ha completat la connexió. Pots tornar-ho a provar des d’Enviar email.'), 100);
    params.delete('gmail');
    const query = params.toString();
    history.replaceState(null, '', location.pathname + (query ? `?${query}` : '') + location.hash);
  }

  function install(attempt = 0) {
    if (installed) return true;
    if (!window.ArcadiERP || !window.ArcadiCommercial) {
      if (attempt < 40) setTimeout(() => install(attempt + 1), 100);
      return false;
    }
    installed = true;
    window.ArcadiCommercial.openEmailConfig = openConnection;
    window.ArcadiCommercial.sendProposal = sendProposal;
    window.ArcadiCommercial.showSendHistory = showHistory;
    removeLegacyButton();
    observer = new MutationObserver(removeLegacyButton);
    observer.observe(document.body, { childList: true, subtree: true });
    handleOAuthReturn();
    return true;
  }

  window.ArcadiCommercialEmailSettings = { install, openConnection, sendProposal, showHistory, getStatus, connectGmail, gmailComposeUrl };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => install(), { once: true });
  else install();
})();