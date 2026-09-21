(function () {
  'use strict';

  let pendingProposalId = '';
  let installed = false;
  let observer = null;

  function A() { return window.ArcadiERP; }
  function Commercial() { return window.ArcadiCommercial; }
  function esc(value) { return A()?.esc ? A().esc(value) : String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  async function getConfig() {
    return A().api('/api/commercial-email-config');
  }

  async function openConfig(proposalId = '') {
    pendingProposalId = proposalId || pendingProposalId || '';
    let config;
    try {
      config = await getConfig();
    } catch (error) {
      return alert(error.message || 'No s’ha pogut consultar la configuració de correu.');
    }

    const locked = config.source === 'environment';
    const status = config.configured
      ? '<span class="badge ok">ENVIAMENT CONFIGURAT</span>'
      : '<span class="badge warn">PENDENT DE CONFIGURAR</span>';
    const sourceText = locked
      ? '<div class="notice"><b>Configuració del servidor:</b> les credencials estan definides a Render i no es poden modificar des d’aquesta pantalla.</div>'
      : '<div class="notice"><b>Configuració única:</b> introdueix la clau API de Resend i l’email remitent. La clau es desa només al servidor, en un fitxer privat; no es desa dins les dades del restaurant ni es mostra després.</div>';

    A().modal('Configuració · enviament de propostes', `
      <form id="commercialEmailConfigForm" class="arcadiForm">
        <div class="toolbar"><div>${status}</div><div class="muted">Proveïdor: Resend</div></div>
        ${sourceText}
        <div class="arcadiFormGrid">
          <div class="arcadiField"><label>Nom del remitent</label><input name="name" value="${esc(config.name || 'ARCADI GESTIO RESTAURANT')}" ${locked ? 'disabled' : ''}></div>
          <div class="arcadiField"><label>Email remitent</label><input name="email" type="email" value="${esc(config.from || '')}" placeholder="reserves@elteudomini.cat" ${locked ? 'disabled' : ''}></div>
          <div class="arcadiField"><label>Email de resposta</label><input name="replyTo" type="email" value="${esc(config.replyTo || '')}" placeholder="Email on vols rebre la resposta" ${locked ? 'disabled' : ''}></div>
          <div class="arcadiField"><label>Clau API Resend</label><input name="apiKey" type="password" autocomplete="new-password" placeholder="${config.hasApiKey ? esc(config.apiKeyMasked || 'Clau ja guardada') : 're_...'}" ${locked ? 'disabled' : ''}><small>${config.hasApiKey ? `Clau actual: ${esc(config.apiKeyMasked || 'guardada')}. Deixa el camp buit per conservar-la.` : 'Encara no hi ha cap clau guardada.'}</small></div>
          <div class="arcadiField arcadiFieldWide"><label>Email per provar l’enviament</label><input id="commercialEmailTestTo" type="email" placeholder="adreça on vols rebre la prova"></div>
        </div>
        <div class="actions">
          ${locked ? '' : '<button class="btn" type="submit">Guardar configuració</button>'}
          <button class="btn secondary" type="button" id="commercialEmailTestButton">Enviar prova</button>
          <button class="btn secondary" type="button" onclick="ArcadiERP.closeModal()">Tancar</button>
        </div>
      </form>
    `);

    const form = document.getElementById('commercialEmailConfigForm');
    if (!locked) {
      form.onsubmit = async event => {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(form).entries());
        try {
          const result = await A().api('/api/commercial-email-config', {
            method: 'POST',
            body: JSON.stringify({
              name: values.name || '',
              email: values.email || '',
              replyTo: values.replyTo || '',
              apiKey: values.apiKey || ''
            })
          });
          if (!result.configured) return alert('Configuració guardada, però encara falta la clau API o l’email remitent.');
          alert('Correu comercial configurat correctament.');
          A().closeModal();
          const retry = pendingProposalId;
          pendingProposalId = '';
          injectButton();
          if (retry) setTimeout(() => sendProposal(retry), 80);
        } catch (error) {
          alert(error.message || 'No s’ha pogut guardar la configuració.');
        }
      };
    }

    document.getElementById('commercialEmailTestButton').onclick = async () => {
      const to = String(document.getElementById('commercialEmailTestTo').value || '').trim();
      if (!to) return alert('Indica l’email on vols rebre la prova.');
      try {
        const result = await A().api('/api/commercial-email-test', { method: 'POST', body: JSON.stringify({ to }) });
        alert(result.message || 'Email de prova enviat.');
      } catch (error) {
        alert(error.message || 'No s’ha pogut enviar la prova.');
      }
    };
  }

  async function sendProposal(id) {
    const app = A();
    const item = (app.state.commercialProposals || []).find(record => record.id === id);
    if (!item) return;
    if (!['VALIDADA', 'ENVIADA'].includes(String(item.status || ''))) return alert('Direcció ha de validar la proposta abans d’enviar-la.');
    if (!item.clientEmail) return alert('Aquesta proposta no té email de client.');

    let config;
    try { config = await getConfig(); }
    catch (error) { return alert(error.message || 'No s’ha pogut comprovar la configuració del correu.'); }
    if (!config.configured) return openConfig(id);

    if (!confirm(`Enviar ${item.code} a ${item.clientEmail}?`)) return;
    try {
      const result = await app.api(`/api/commercial-proposals/${encodeURIComponent(id)}/send`, { method: 'POST', body: '{}' });
      await app.load();
      alert(result.message || 'Proposta enviada correctament.');
      const modules = window.ArcadiModules;
      if (modules?.open) modules.open(location.hash.includes('crm') ? 'crm' : 'groups');
    } catch (error) {
      const message = String(error.message || 'No s’ha pogut enviar la proposta.');
      if (/configur|resend|remitent/i.test(message)) return openConfig(id);
      alert(message);
    }
  }

  async function injectButton() {
    const commercial = Commercial();
    if (!commercial) return;
    const headings = Array.from(document.querySelectorAll('h3'));
    const heading = headings.find(node => /propostes comercials/i.test(node.textContent || ''));
    if (!heading) return;
    const toolbar = heading.closest('.toolbar');
    if (!toolbar || toolbar.querySelector('[data-commercial-email-settings]')) return;
    const actions = toolbar.querySelector('.actions') || toolbar;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn secondary';
    button.dataset.commercialEmailSettings = '1';
    button.textContent = 'Configurar correu';
    button.onclick = () => openConfig();
    actions.appendChild(button);

    try {
      const config = await getConfig();
      button.textContent = config.configured ? 'Correu configurat ✓' : 'Configurar correu';
      if (config.configured) button.title = `Remitent: ${config.from || ''}`;
    } catch {}
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
    injectButton();
    observer = new MutationObserver(() => injectButton());
    observer.observe(document.body, { childList: true, subtree: true });
    return true;
  }

  window.ArcadiCommercialEmailSettings = { install, openConfig, sendProposal, getConfig };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => install(), { once: true });
  else install();
})();
