'use strict';

const crypto = require('crypto');

const FUNCTION_CATALOG = Object.freeze([
  { key: 'reservations', label: 'App Reserves / Ocupació', area: 'Front Office', connected: true },
  { key: 'crm', label: 'CRM', area: 'Back Office', connected: true },
  { key: 'commercial', label: 'Comercial / Grups', area: 'Back Office', connected: true },
  { key: 'fitxatges', label: 'App Fitxatges', area: 'RRHH', connected: false },
  { key: 'gestio_cuina', label: 'Gestió cuina', area: 'Back Office', connected: false },
  { key: 'gestio_magatzem', label: 'Gestió magatzem', area: 'Back Office', connected: false },
  { key: 'control_normatiu', label: 'Control normatiu / APPCC', area: 'Back Office', connected: false },
  { key: 'gestio_general', label: 'Gestió general', area: 'Back Office', connected: false },
  { key: 'front_office_tpv', label: 'Front Office / TPV', area: 'Front Office', connected: false }
]);

const FUNCTION_KEYS = Object.freeze(FUNCTION_CATALOG.map(item => item.key));

function text(value) { return String(value ?? '').trim(); }
function code(value) { return text(value).toUpperCase().replace(/\s+/g, '-'); }
function unique(values) { return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))]; }
function emptyFunctions() { return Object.fromEntries(FUNCTION_KEYS.map(key => [key, false])); }

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
      data.centerPermissions.push({
        centerId: center.id,
        functions: emptyFunctions(),
        updatedAt: now
      });
    });
    return center;
  }

  function updateCenter(id, input = {}) {
    let saved;
    store.update(data => {
      const index = data.centers.findIndex(item => item.id === id);
      if (index < 0) {
        const error = new Error('Centre no trobat.');
        error.status = 404;
        throw error;
      }
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
    if (!center) {
      const error = new Error('Centre no trobat.');
      error.status = 404;
      throw error;
    }
    const found = store.read().centerPermissions.find(item => item.centerId === centerId);
    return {
      centerId,
      functions: { ...emptyFunctions(), ...(found?.functions || {}) },
      updatedAt: found?.updatedAt || null
    };
  }

  function setPermissions(centerId, input = {}) {
    if (!getCenter(centerId)) {
      const error = new Error('Centre no trobat.');
      error.status = 404;
      throw error;
    }
    const requested = input.functions && typeof input.functions === 'object' ? input.functions : input;
    const functions = emptyFunctions();
    for (const key of FUNCTION_KEYS) functions[key] = requested[key] === true;
    const now = new Date().toISOString();
    let saved;
    store.update(data => {
      const index = data.centerPermissions.findIndex(item => item.centerId === centerId);
      saved = { centerId, functions, updatedAt: now };
      if (index < 0) data.centerPermissions.push(saved);
      else data.centerPermissions[index] = saved;
    });
    return saved;
  }

  function listEmployees({ includeInactive = false } = {}) {
    return store.read().employees
      .filter(item => includeInactive || item.active !== false)
      .sort((a, b) => text(a.name).localeCompare(text(b.name), 'ca'));
  }

  function getEmployee(id) {
    return store.read().employees.find(item => item.id === id) || null;
  }

  function validateCenterIds(data, centerIds) {
    const ids = unique(centerIds);
    const known = new Set(data.centers.map(item => item.id));
    if (ids.some(id => !known.has(id))) {
      const error = new Error('Hi ha centres assignats que no existeixen.');
      error.status = 400;
      throw error;
    }
    return ids;
  }

  function cleanEmployee(input = {}, current = {}, data) {
    const name = text(input.name ?? current.name);
    if (!name) {
      const error = new Error('L’empleat necessita nom.');
      error.status = 400;
      throw error;
    }
    return {
      name,
      role: text(input.role ?? current.role),
      phone: text(input.phone ?? current.phone),
      email: text(input.email ?? current.email),
      centerIds: validateCenterIds(data, input.centerIds ?? current.centerIds ?? []),
      active: input.active == null ? current.active !== false : input.active !== false
    };
  }

  function createEmployee(input = {}) {
    const now = new Date().toISOString();
    let employee;
    store.update(data => {
      const fields = cleanEmployee(input, {}, data);
      employee = { id: `employee_${crypto.randomUUID()}`, ...fields, createdAt: now, updatedAt: now };
      data.employees.push(employee);
    });
    return employee;
  }

  function updateEmployee(id, input = {}) {
    let saved;
    store.update(data => {
      const index = data.employees.findIndex(item => item.id === id);
      if (index < 0) {
        const error = new Error('Empleat no trobat.');
        error.status = 404;
        throw error;
      }
      const current = data.employees[index];
      const fields = cleanEmployee(input, current, data);
      saved = { ...current, ...fields, updatedAt: new Date().toISOString() };
      data.employees[index] = saved;
    });
    return saved;
  }

  return {
    listCenters,
    getCenter,
    createCenter,
    updateCenter,
    getPermissions,
    setPermissions,
    listEmployees,
    getEmployee,
    createEmployee,
    updateEmployee,
    functionKeys: FUNCTION_KEYS,
    functionCatalog: FUNCTION_CATALOG
  };
}

module.exports = { createGovernService, FUNCTION_KEYS, FUNCTION_CATALOG };
