(function () {
  'use strict';
  let installed = false;
  let observer;
  const A = () => window.ArcadiERP;
  const scope = item => ({ companyId: (item ? item.companyId : A().context?.companyId) || 'company_casa_mestres',
    centreId: item ? (item.centreId || '') : (A().context?.centreId || '') });
  const getConfig = item => A().api('/api/commercial-email-status?' + new URLSearchParams(scope(item)));

  function showHistory(id) {
    const item = (A().state.commercialProposals || []).find(x => x.id === id);
    if (!item) return;
    const rows = (item.sendHistory || []).map(entry => `<tr><td>${A().esc(new Date(entry.at).toLocaleString('ca-ES'))}</td><td>${A().esc(entry.from || '—')}</td><td>${A().esc(entry.to || '')}</td><td>${A().esc(entry.providerId || '')}</td></tr>`).join('');
    A().modal('Historial d’enviaments', `<div class="tableWrap"><table><thead><tr><th>Data</th><th>Remitent</th><th>Destinatari</th><th>Referència</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Encara no s’ha enviat.</td></tr>'}</tbody></table></div>`);
  }

  async function openConfig(proposalId = '') {
    const item = (A().state?.commercialProposals || []).find(x => x.id === proposalId);
    try {
      const config = await getConfig(item);
      if (config.configured) {
        A().modal('Gmail connectat', `<p>Enviament des de <b>${A().esc(config.from)}</b>.</p><p>Ja pots enviar les propostes validades per Direcció.</p><div class="actions"><button class="btn secondary" id="gmailDisconnect">Desconnectar Gmail</button><button class="btn" onclick="ArcadiERP.closeModal()">Tancar</button></div>`);
        document.getElementById('gmailDisconnect').onclick = async () => {
          if (!confirm('Desconnectar Gmail per a aquest centre?')) return;
          try {
            await A().api('/api/gmail/disconnect', {method:'POST', body:JSON.stringify(scope(item))});
            A().closeModal();
            document.querySelector('[data-commercial-email-settings]')?.remove();
            injectButton();
          } catch (error) { alert(error.message); }
        };
        return;
      }
      const result = await A().api('/api/gmail/connect', {method:'POST', body:JSON.stringify(scope(item))});
      if (result.connected) return openConfig(proposalId);
      sessionStorage.setItem('arcadi_gmail_pending_proposal', proposalId);
      location.assign(result.url);
    } catch (error) { alert(error.message || 'No s’ha pogut connectar Gmail.'); }
  }

  async function sendProposal(id) {
    const item = (A().state.commercialProposals || []).find(x => x.id === id);
    if (!item) return;
    if (!['VALIDADA','ENVIADA'].includes(item.status)) return alert('Direcció ha de validar la proposta abans d’enviar-la.');
    if (!item.clientEmail) return alert('Aquesta proposta no té email de client.');
    try {
      const config = await getConfig(item);
      if (!config.configured) return openConfig(id);
      if (!confirm(`Enviar ${item.code} a ${item.clientEmail} des de ${config.from}?`)) return;
      const result = await A().api(`/api/commercial-proposals/${encodeURIComponent(id)}/send`, {method:'POST', body:'{}'});
      await A().load();
      alert(result.message || 'Proposta enviada correctament.');
      window.ArcadiModules?.open(location.hash.includes('crm') ? 'crm' : 'groups');
    } catch (error) { alert(error.message || 'No s’ha pogut enviar la proposta.'); }
  }

  async function injectButton() {
    const heading = Array.from(document.querySelectorAll('h3')).find(x => /propostes comercials/i.test(x.textContent || ''));
    const toolbar = heading?.closest('.toolbar');
    if (!toolbar || toolbar.querySelector('[data-commercial-email-settings]')) return;
    const button = document.createElement('button');
    button.type='button'; button.className='btn secondary'; button.dataset.commercialEmailSettings='1';
    button.textContent='Connectar Gmail'; button.onclick=()=>openConfig();
    (toolbar.querySelector('.actions') || toolbar).appendChild(button);
    try {
      const config = await getConfig();
      if (config.configured) { button.textContent='Gmail connectat ✓'; button.title=config.from; }
    } catch {}
  }

  async function resumeConnection() {
    const url = new URL(location.href);
    const result = url.searchParams.get('gmail');
    if (!result) return;
    url.searchParams.delete('gmail');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
    const proposalId = sessionStorage.getItem('arcadi_gmail_pending_proposal') || '';
    sessionStorage.removeItem('arcadi_gmail_pending_proposal');
    if (result !== 'connected') return alert('No s’ha completat la connexió. Torna a prémer “Connectar Gmail” i autoritza l’enviament a Google.');
    if (!A().state) await A().load();
    if (proposalId) return sendProposal(proposalId);
    alert('Gmail connectat. Ja pots enviar les propostes validades.');
  }

  function install(attempt = 0) {
    if (installed) return true;
    if (!window.ArcadiERP || !window.ArcadiCommercial) {
      if (attempt < 40) setTimeout(() => install(attempt + 1), 100);
      return false;
    }
    installed=true;
    window.ArcadiCommercial.openEmailConfig=openConfig;
    window.ArcadiCommercial.sendProposal=sendProposal;
    window.ArcadiCommercial.showSendHistory=showHistory;
    injectButton();
    observer=new MutationObserver(injectButton);
    observer.observe(document.body, {childList:true, subtree:true});
    resumeConnection().catch(error => alert(error.message));
    return true;
  }
  window.ArcadiCommercialEmailSettings={install,openConfig,sendProposal,getConfig};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>install(),{once:true}); else install();
})();
