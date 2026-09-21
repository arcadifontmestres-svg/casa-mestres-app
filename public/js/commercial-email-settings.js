(function () {
  'use strict';

  let pendingProposalId = '';
  let installed = false;
  let observer = null;

  function A() { return window.ArcadiERP; }
  function Commercial() { return window.ArcadiCommercial; }
  function esc(value) { return A()?.esc ? A().esc(value) : String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  async function getConfig() { return A().api('/api/commercial-email-config'); }

  async function openConfig(proposalId = '') {
    pendingProposalId = proposalId || pendingProposalId || '';
    let config;
    try { config = await getConfig(); }
    catch (error) { return alert(error.message || 'No s’ha pogut consultar la configuració de correu.'); }

    const locked = config.source === 'environment';
    const status = config.configured ? '<span class="badge ok">ENVIAMENT CONFIGURAT</span>' : '<span class="badge warn">PENDENT DE CONFIGURAR</span>';
    const sourceText = locked
      ? '<div class="notice"><b>Configuració del servidor:</b> les credencials de Gmail estan definides al servidor i no es poden modificar des d’aquesta pantalla.</div>'
      : '<div class="notice"><b>Una sola configuració:</b> enviarem les propostes directament des del teu Gmail. Només cal l’email i una <b>contrasenya d’aplicació de Google</b> de 16 caràcters. No hi posis la contrasenya normal del compte.</div>';

    A().modal('Configuració · enviament de propostes', `
      <form id="commercialEmailConfigForm" class="arcadiForm">
        <div class="toolbar"><div>${status}</div><div class="muted">Enviament: Gmail</div></div>
        ${sourceText}
        <input type="hidden" name="provider" value="gmail">
        <div class="arcadiFormGrid">
          <div class="arcadiField"><label>Nom del remitent</label><input name="name" value="${esc(config.name || 'ARCADI GESTIO RESTAURANT')}" ${locked ? 'disabled' : ''}></div>
          <div class="arcadiField"><label>Compte Gmail</label><input name="email" type="email" value="${esc(config.from || '')}" placeholder="arcadi.fontmestres@gmail.com" ${locked ? 'disabled' : ''}></div>
          <div class="arcadiField"><label>Email de resposta</label><input name="replyTo" type="email" value="${esc(config.replyTo || config.from || '')}" placeholder="arcadi.fontmestres@gmail.com" ${locked ? 'disabled' : ''}></div>
          <div class="arcadiField arcadiFieldWide"><label>Contrasenya d’aplicació de Google</label><input name="appPassword" type="password" autocomplete="new-password" placeholder="${config.hasAppPassword ? '•••• •••• •••• ••••' : '16 caràcters'}" ${locked ? 'disabled' : ''}><small>${config.hasAppPassword ? 'Ja està guardada. Deixa el camp buit per conservar-la.' : 'És la clau de 16 caràcters que genera Google a Seguretat → Verificació en dos passos → Contrasenyes d’aplicació. Els espais són opcionals.'}</small></div>
          <div class="arcadiField arcadiFieldWide"><label>Email per provar l’enviament</label><input id="commercialEmailTestTo" type="email" value="${esc(config.from || '')}" placeholder="adreça on vols rebre la prova"></div>
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
            body: JSON.stringify({ provider: 'gmail', name: values.name || '', email: values.email || '', replyTo: values.replyTo || '', appPassword: values.appPassword || '' })
          });
          if (!result.configured) return alert('Falta el compte Gmail o la contrasenya d’aplicació de Google.');
          alert('Gmail configurat correctament. Ara prem “Enviar prova”.');
          injectButton();
        } catch (error) { alert(error.message || 'No s’ha pogut guardar la configuració.'); }
      };
    }

    document.getElementById('commercialEmailTestButton').onclick = async () => {
      const to = String(document.getElementById('commercialEmailTestTo').value || '').trim();
      if (!to) return alert('Indica l’email on vols rebre la prova.');
      try {
        const result = await A().api('/api/commercial-email-test', { method: 'POST', body: JSON.stringify({ to }) });
        alert(result.message || 'Email de prova enviat.');
        if (pendingProposalId && confirm('La prova ha funcionat. Vols enviar ara la proposta validada?')) {
          const retry = pendingProposalId;
          pendingProposalId = '';
          A().closeModal();
          setTimeout(() => sendProposal(retry), 80);
        }
      } catch (error) { alert(error.message || 'No s’ha pogut enviar la prova.'); }
    };
  }

  async function sendProposal(id) {
    const app = A();
    const item = (app.state.commercialProposals || []).find(record => record.id === id);
    if (!item) return;
    if (!['VALIDADA','ENVIADA'].includes(String(item.status || ''))) return alert('Direcció ha de validar la proposta abans d’enviar-la.');
    if (!item.clientEmail) return alert('Aquesta proposta no té email de client.');
    let config;
    try { config = await getConfig(); }
    catch (error) { return alert(error.message || 'No s’ha pogut comprovar la configuració del correu.'); }
    if (!config.configured) return openConfig(id);
    if (!confirm(`Enviar ${item.code} a ${item.clientEmail}?`)) return;
    try {
      const result = await app.api(`/api/commercial-proposals/${encodeURIComponent(id)}/send`, { method:'POST', body:'{}' });
      await app.load();
      alert(result.message || 'Proposta enviada correctament.');
      const modules = window.ArcadiModules;
      if (modules?.open) modules.open(location.hash.includes('crm') ? 'crm' : 'groups');
    } catch (error) {
      const message = String(error.message || 'No s’ha pogut enviar la proposta.');
      if (/configur|gmail|remitent|aplicaci[oó]/i.test(message)) return openConfig(id);
      alert(message);
    }
  }

  async function injectButton() {
    const commercial = Commercial(); if (!commercial) return;
    const heading = Array.from(document.querySelectorAll('h3')).find(node => /propostes comercials/i.test(node.textContent || ''));
    if (!heading) return;
    const toolbar = heading.closest('.toolbar'); if (!toolbar || toolbar.querySelector('[data-commercial-email-settings]')) return;
    const actions = toolbar.querySelector('.actions') || toolbar;
    const button = document.createElement('button');
    button.type='button'; button.className='btn secondary'; button.dataset.commercialEmailSettings='1'; button.textContent='Configurar Gmail'; button.onclick=()=>openConfig();
    actions.appendChild(button);
    try { const config=await getConfig(); button.textContent=config.configured ? 'Gmail configurat ✓' : 'Configurar Gmail'; if(config.configured) button.title=`Remitent: ${config.from||''}`; } catch {}
  }

  function install(attempt=0){
    if(installed)return true;
    if(!window.ArcadiERP||!window.ArcadiCommercial){if(attempt<40)setTimeout(()=>install(attempt+1),100);return false;}
    installed=true;
    window.ArcadiCommercial.openEmailConfig=openConfig;
    window.ArcadiCommercial.sendProposal=sendProposal;
    injectButton();
    observer=new MutationObserver(()=>injectButton());
    observer.observe(document.body,{childList:true,subtree:true});
    return true;
  }

  window.ArcadiCommercialEmailSettings={install,openConfig,sendProposal,getConfig};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>install(),{once:true}); else install();
})();
