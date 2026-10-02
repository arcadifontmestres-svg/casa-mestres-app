'use strict';

const crypto = require('crypto');

const FUNCTION_KEYS = Object.freeze(['crm', 'commercial', 'reservations']);

function text(value) { return String(value ?? '').trim(); }
function code(value) { return text(value).toUpperCase().replace(/\s+/g, '-'); }

function createGovernService(store) {
  if (!store) throw new Error('Govern necessita un magatzem de dades.');

  function listCenters({ includeInactive = false } = {}) {
    return store.read().centers
      .filter(item => includeInactive || item.active !== false)
      .sort((a, b) => text(a.name).localeCompare(text(b.name), 'ca'));
  }

  function getCenter(id) {
    return store.read().centers.find(item => item.id === id) || null;
  }

  function cleanCenter(input = {}, current = {}) {
    const name = text(input.name ?? current.name);
    const centerCode = code(input.code ?? current.code);
    if (!name || !centerCode) {
      const error = new Error('El centre necessita codi i nom.');
      error.status = 400;
      throw error;
    }
    return {
      code: centerCode,
      name,
      type: text(input.type ?? current.type),
      company: text(input.company ?? current.company),
      active: input.active == null ? current.active !== false : input.active !== false
    };
  }

  function assertUniqueCode(data, centerCode, ignoreId = '') {
    const duplicate = data.centers.find(item => item.id !== ignoreId && text(item.code).toUpperCase() === centerCode.toUpperCase());
    if (duplicate) {
      const error = new Error('Ja existeix un centre amb aquest codi.');
      error.status = 409;
      throw error;
    }
  }

  function createCenter(input = {}) {
    const fields = cleanCenter(input);
    const now = new Date().toISOString();
    let center;
    store.update(data => {
      assertUniqueCode(data, fields.code);
      center = { id: `center_${crypto.randomUUID()}`, ...fields, createdAt: now, updatedAt: now };
      data.centers.push(center);
      data.centerPermissions.push({ centerId: center.id, functions: { crm: true, commercial: true, reservations: true }, updatedAt: now });
    });
    return center;
  }

  function updateCenter(id, input = {}) {
    let saved;
    store.update(data => {
      const index = data.centers.findIndex(item => item.id === id);
      if (index < 0) { const error = new Error('Centre no trobat.'); error.status = 404; throw error; }
      const current = data.centers[index];
      const fields = cleanCenter(input, current);
      assertUniqueCode(data, fields.code, id);
      saved = { ...current, ...fields, updatedAt: new Date().toISOString() };
      data.centers[index] = saved;
    });
    return saved;
  }

  function getPermissions(centerId) {
    const center = getCenter(centerId);
    if (!center) { const error = new Error('Centre no trobat.'); error.status = 404; throw error; }
    const found = store.read().centerPermissions.find(item => item.centerId === centerId);
    return found || { centerId, functions: { crm: true, commercial: true, reservations: true } };
  }

  function setPermissions(centerId, input = {}) {
    if (!getCenter(centerId)) { const error = new Error('Centre no trobat.'); error.status = 404; throw error; }
    const requested = input.functions && typeof input.functions === 'object' ? input.functions : input;
    const functions = {};
    for (const key of FUNCTION_KEYS) functions[key] = requested[key] !== false;
    const now = new Date().toISOString();
    let saved;
    store.update(data => {
      const index = data.centerPermissions.findIndex(item => item.centerId === centerId);
      saved = { centerId, functions, updatedAt: now };
      if (index < 0) data.centerPermissions.push(saved); else data.centerPermissions[index] = saved;
    });
    return saved;
  }

  return { listCenters, getCenter, createCenter, updateCenter, getPermissions, setPermissions, functionKeys: FUNCTION_KEYS };
}

module.exports = { createGovernService, FUNCTION_KEYS };
