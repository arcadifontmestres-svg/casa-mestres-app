'use strict';

const crypto = require('crypto');

const SEGMENTS = new Set(['Nou', 'Habitual', 'Empresa', 'Grup', 'VIP']);

function text(value) {
  return String(value ?? '').trim();
}

function cleanInput(input = {}) {
  const name = text(input.name);
  if (!name) {
    const error = new Error('El nom del contacte és obligatori.');
    error.status = 400;
    throw error;
  }

  const segment = text(input.segment) || 'Nou';
  if (!SEGMENTS.has(segment)) {
    const error = new Error('Segment CRM no vàlid.');
    error.status = 400;
    throw error;
  }

  return {
    name,
    phone: text(input.phone),
    email: text(input.email),
    segment,
    preferences: text(input.preferences),
    notes: text(input.notes),
    active: input.active !== false
  };
}

function createCrmService(store) {
  if (!store) throw new Error('CRM necessita un magatzem de dades.');

  function list({ includeInactive = false, q = '' } = {}) {
    const needle = text(q).toLocaleLowerCase('ca');
    return store.read().crmContacts
      .filter(item => includeInactive || item.active !== false)
      .filter(item => {
        if (!needle) return true;
        return [item.name, item.phone, item.email, item.segment, item.preferences, item.notes]
          .some(value => text(value).toLocaleLowerCase('ca').includes(needle));
      })
      .sort((a, b) => text(a.name).localeCompare(text(b.name), 'ca'));
  }

  function get(id) {
    return store.read().crmContacts.find(item => item.id === id) || null;
  }

  function create(input) {
    const now = new Date().toISOString();
    const fields = cleanInput(input);
    const contact = {
      id: `crm_${crypto.randomUUID()}`,
      ...fields,
      createdAt: now,
      updatedAt: now
    };
    store.update(data => {
      data.crmContacts.push(contact);
    });
    return contact;
  }

  function update(id, input) {
    let saved = null;
    store.update(data => {
      const index = data.crmContacts.findIndex(item => item.id === id);
      if (index < 0) {
        const error = new Error('Contacte CRM no trobat.');
        error.status = 404;
        throw error;
      }
      const current = data.crmContacts[index];
      const fields = cleanInput({ ...current, ...input });
      saved = {
        ...current,
        ...fields,
        id: current.id,
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString()
      };
      data.crmContacts[index] = saved;
    });
    return saved;
  }

  return { list, get, create, update, segments: [...SEGMENTS] };
}

module.exports = { createCrmService, SEGMENTS };
