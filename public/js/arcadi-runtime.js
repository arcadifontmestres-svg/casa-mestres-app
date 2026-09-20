(function () {
  'use strict';

  const byId = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const money = value => `${num(value).toFixed(2).replace('.', ',')} €`;
  const date = value => value ? new Date(value).toLocaleDateString('ca-ES') : '—';
  const uid = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  async function api(path, options = {}) {
    const response = await fetch(path, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    const text = await response.text();
    let payload;
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = { error: text }; }
    if (!response.ok) throw new Error(payload.error || `Error ${response.status}`);
    return payload;
  }

  const Arcadi = {
    state: null,
    active: '',
    esc,
    num,
    money,
    date,
    uid,
    api,
    async load() {
      this.state = await api('/api/state');
      return this.state;
    },
    async save(message = 'GUARDAT') {
      if (!this.state) throw new Error('No hi ha dades carregades');
      const status = byId('saveStatus');
      if (status) {
        status.textContent = 'GUARDANT...';
        status.className = 'badge warn';
      }
      const result = await api('/api/state', { method: 'POST', body: JSON.stringify(this.state) });
      if (result.state) this.state = result.state;
      if (status) {
        status.textContent = message;
        status.className = 'badge ok';
      }
      return this.state;
    },
    collection(name) {
      if (!this.state) return [];
      if (!Array.isArray(this.state[name])) this.state[name] = [];
      return this.state[name];
    },
    page(title, subtitle, html) {
      if (byId('title')) byId('title').textContent = title;
      if (byId('subtitle')) byId('subtitle').textContent = subtitle;
      if (byId('view')) byId('view').innerHTML = html;
      document.querySelectorAll('#nav button').forEach(button => {
        button.classList.toggle('active', button.dataset.arcadiKey === this.active);
      });
    },
    loading(title = 'ARCADI GESTIO') {
      this.page(title, 'Carregant les dades del restaurant', '<div class="panel arcadiLoading">Carregant…</div>');
    },
    error(error) {
      this.page('No s’ha pogut obrir', 'Les dades no s’han modificat', `<div class="errBox">${esc(error.message || error)}</div>`);
    },
    modal(title, body) {
      const modal = document.querySelector('.modal');
      if (modal) modal.classList.remove('posModal');
      byId('modalTitle').textContent = title;
      byId('modalBody').innerHTML = body;
      byId('modalBg').classList.add('open');
    },
    closeModal() {
      byId('modalBg')?.classList.remove('open');
    },
    field(field, value = '') {
      const required = field.required ? 'required' : '';
      const min = field.min == null ? '' : `min="${esc(field.min)}"`;
      const step = field.step == null ? '' : `step="${esc(field.step)}"`;
      if (field.type === 'textarea') {
        return `<div class="arcadiField arcadiFieldWide"><label>${esc(field.label)}</label><textarea name="${esc(field.key)}" ${required}>${esc(value)}</textarea></div>`;
      }
      if (field.type === 'select') {
        const sourceOptions = typeof field.options === 'function' ? field.options(this.state) : (field.options || []);
        const options = sourceOptions.map(option => {
          const item = typeof option === 'string' ? { value: option, label: option } : option;
          return `<option value="${esc(item.value)}" ${String(item.value) === String(value) ? 'selected' : ''}>${esc(item.label)}</option>`;
        }).join('');
        return `<div class="arcadiField"><label>${esc(field.label)}</label><select name="${esc(field.key)}" ${required}>${options}</select></div>`;
      }
      return `<div class="arcadiField"><label>${esc(field.label)}</label><input name="${esc(field.key)}" type="${esc(field.type || 'text')}" value="${esc(value)}" ${required} ${min} ${step}></div>`;
    },
    openRecordForm(definition, id = '') {
      const records = this.collection(definition.collection);
      const record = records.find(item => item.id === id) || {};
      const fields = definition.fields.map(field => this.field(field, record[field.key] ?? field.default ?? '')).join('');
      this.modal(id ? `Editar · ${definition.singular}` : `Nou · ${definition.singular}`, `
        <form id="arcadiRecordForm" class="arcadiForm">
          <div class="arcadiFormGrid">${fields}</div>
          <div class="actions"><button class="btn" type="submit">Guardar</button><button class="btn secondary" type="button" id="arcadiCancel">Cancel·lar</button></div>
        </form>`);
      byId('arcadiCancel').onclick = () => this.closeModal();
      byId('arcadiRecordForm').onsubmit = async event => {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(event.currentTarget).entries());
        const next = this.contextRecord
          ? this.contextRecord({ ...record, id: record.id || uid(definition.collection), updatedAt: new Date().toISOString() })
          : { ...record, id: record.id || uid(definition.collection), updatedAt: new Date().toISOString() };
        for (const field of definition.fields) {
          next[field.key] = field.type === 'number' ? num(values[field.key]) : String(values[field.key] ?? '').trim();
        }
        if (!record.id) {
          next.createdAt = next.updatedAt;
          records.push(next);
        } else {
          Object.assign(record, next);
        }
        await this.save();
        this.closeModal();
        window.ArcadiModules.open(definition.key);
      };
    },
    async removeRecord(definition, id) {
      if (!confirm(`Eliminar aquest registre de ${definition.label.toLowerCase()}?`)) return;
      this.state[definition.collection] = this.collection(definition.collection).filter(item => item.id !== id);
      await this.save();
      window.ArcadiModules.open(definition.key);
    },
    download(name, content, type = 'application/json') {
      const blob = new Blob([content], { type });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    },
    goCore(key) {
      if (typeof window.show === 'function') window.show(key);
    }
  };

  window.ArcadiERP = Arcadi;
})();
