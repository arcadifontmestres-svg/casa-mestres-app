'use strict';

const crypto = require('crypto');

const FUNCTION_CATALOG = Object.freeze([
  { key: 'reservations', label: 'App Reserves / Ocupació', area: 'Front Office', connected: true },
  { key: 'crm', label: 'CRM', area: 'Back Office', connected: true },
  { key: 'commercial', label: 'Comercial / Grups', area: 'Back Office', connected: true },
  { key: 'fitxatges', label: 'App Fitxatges', area: 'RRHH', connected: true },
  { key: 'gestio_cuina', label: 'Gestió cuina', area: 'Back Office', connected: true },
  { key: 'gestio_magatzem', label: 'Gestió magatzem', area: 'Back Office', connected: true },
  { key: 'control_normatiu', label: 'Control normatiu / APPCC', area: 'Back Office', connected: true },
  { key: 'gestio_general', label: 'Gestió general', area: 'Back Office', connected: false },
  { key: 'front_office_tpv', label: 'Front Office / TPV', area: 'Front Office', connected: true }
]);

const FUNCTION_KEYS = Object.freeze(FUNCTION_CATALOG.map(item => item.key));

function text(value) { return String(value ?? '').trim(); }
function code(value) { return text(value).toUpperCase().replace(/\s+/g, '-'); }
function unique(values) { return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))]; }
function emptyFunctions() { return Object.fromEntries(FUNCTION_KEYS.map(key => [key, false])); }
function activationCode() { return String(crypto.randomInt(0, 1000000)).padStart(6, '0'); }

function createGovernService(store) {
  if (!store) throw new Error('Govern necessita un magatzem de dades.');

  store.update(data => {
    for (const center of data.centers || []) {
      if (!center.activationCode) center.activationCode = activationCode();
      if (!center.activationStatus) center.activationStatus = 'NO_VINCULAT';
      if (!center.satellitePath) center.satellitePath = '/centre.html';
    }
  });

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
      center = {
        id: `center_${crypto.randomUUID()}`,
        ...fields,
        activationCode: activationCode(),
        activationStatus: 'NO_VINCULAT',
        satellitePath: '/centre.html',
        createdAt: now,
        updatedAt: now
      };
      data.centers.push(center);
      data.centerPermissions.push({
        centerId: center.id,
        functions: emptyFunctions(),
        updatedAt: now
      });
    });
    return center;
  }

  function regenerateActivationCode(id) {
    let saved;
    store.update(data => {
      const center = data.centers.find(item => item.id === id);
      if (!center) {
        const error = new Error('Centre no trobat.');
        error.status = 404;
        throw error;
      }
      center.activationCode = activationCode();
      center.activationStatus = 'NO_VINCULAT';
      center.activationUpdatedAt = new Date().toISOString();
      saved = { ...center };
    });
    return saved;
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

  function normalizedCentreKey(value) {
    return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  }

  function hashToken(value) {
    return crypto.createHash('sha256').update(String(value || '')).digest('hex');
  }

  function tokenSecret() {
    return String(process.env.CENTER_TOKEN_SECRET || 'arcadi-centre-token-fallback-change-me');
  }

  function signPayload(payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', tokenSecret()).update(body).digest('base64url');
    return body + '.' + signature;
  }

  function readSignedPayload(token) {
    const [body, signature] = String(token || '').split('.');
    if (!body || !signature) return null;
    const expected = crypto.createHmac('sha256', tokenSecret()).update(body).digest('base64url');
    if (!safeTextEqual(expected, signature)) return null;
    try { return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); }
    catch { return null; }
  }

  function safeTextEqual(a, b) {
    const aa = Buffer.from(String(a || ''));
    const bb = Buffer.from(String(b || ''));
    return aa.length === bb.length && aa.length > 0 && crypto.timingSafeEqual(aa, bb);
  }

  function activateCenterDevice(input = {}) {
    const requestedCode = normalizedCentreKey(input.centerCode);
    const requestedActivation = text(input.activationCode);
    if (!requestedCode || !requestedActivation) {
      const error = new Error('Falten el codi del centre o el codi d’activació.');
      error.status = 400;
      throw error;
    }
    let output;
    store.update(data => {
      const center = data.centers.find(item =>
        item.active !== false &&
        (normalizedCentreKey(item.code) === requestedCode || normalizedCentreKey(item.name) === requestedCode)
      );
      if (!center || !safeTextEqual(center.activationCode, requestedActivation)) {
        const error = new Error('Codi de centre o codi d’activació no vàlid.');
        error.status = 403;
        throw error;
      }
      const now = new Date().toISOString();
      const permissions = data.centerPermissions.find(item => item.centerId === center.id)?.functions || {};
      const token = signPayload({
        v: 1,
        center: {
          id: center.id,
          code: center.code,
          name: center.name,
          type: center.type || '',
          company: center.company || ''
        },
        permissions: { ...emptyFunctions(), ...permissions },
        issuedAt: now
      });
      center.activationStatus = 'VINCULAT';
      center.activationUpdatedAt = now;
      output = { token, center: { ...center } };
    });
    return output;
  }

  function centerByDeviceToken(token) {
    if (!token) return null;
    const signed = readSignedPayload(token);
    if (signed?.v === 1 && signed.center?.id) {
      const data = store.read();
      const current = data.centers.find(item => item.id === signed.center.id && item.active !== false);
      const center = current || signed.center;
      const currentPermissions = current
        ? (data.centerPermissions.find(item => item.centerId === current.id)?.functions || null)
        : null;
      const permissions = { ...emptyFunctions(), ...(currentPermissions || signed.permissions || {}) };
      return {
        center,
        permissions,
        catalog: FUNCTION_CATALOG.filter(item => permissions[item.key] === true)
      };
    }

    const tokenHash = hashToken(token);
    const data = store.read();
    const device = (data.centerDevices || []).find(item =>
      item.active !== false && safeTextEqual(item.tokenHash, tokenHash)
    );
    if (!device) return null;
    const center = data.centers.find(item => item.id === device.centerId && item.active !== false);
    if (!center) return null;
    const permissions = data.centerPermissions.find(item => item.centerId === center.id)?.functions || {};
    return {
      center,
      permissions: { ...emptyFunctions(), ...permissions },
      catalog: FUNCTION_CATALOG.filter(item => permissions[item.key] === true)
    };
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
    regenerateActivationCode,
    activateCenterDevice,
    centerByDeviceToken,
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
