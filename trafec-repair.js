'use strict';

const SOURCE_COMPANY_ID = 'company_casa_mestres';
const TARGET_COMPANY_ID = 'company_grup_trafec';
const REPAIR_ID = 'repair_trafec_operational_scope_v1';

const TRAFEC_NAME_TOKENS = [
  'SARRIERA', 'TRÀFEC', 'TRAFEC', 'ARBOÇ', 'ARBOC', 'LA GRANADA',
  'SITGES', 'HOSPITALET', 'PISCINA', 'CAN CARTRÓ', 'CAN CARTRO'
];

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function groupCentreIds(data) {
  const ids = new Set();
  for (const centre of data.restaurants || []) {
    if (!isObject(centre) || !centre.id || centre.kind === 'GROUP') continue;
    const name = String(centre.name || '').toUpperCase();
    if (centre.organizationId === TARGET_COMPANY_ID || TRAFEC_NAME_TOKENS.some(token => name.includes(token))) {
      ids.add(String(centre.id));
      if (!centre.organizationId) centre.organizationId = TARGET_COMPANY_ID;
    }
  }
  return ids;
}

function repairTrafecOperationalData(data) {
  if (!isObject(data)) throw new Error('Dades no vàlides');
  data.appliedMigrations = Array.isArray(data.appliedMigrations) ? data.appliedMigrations : [];

  const centres = groupCentreIds(data);
  let movedToTrafec = 0;
  let reactivatedEmployees = 0;
  let linkedOperationalRecords = 0;

  const excluded = new Set(['organizations', 'restaurants', 'appliedMigrations']);
  for (const [collection, records] of Object.entries(data)) {
    if (excluded.has(collection) || !Array.isArray(records)) continue;
    for (const item of records) {
      if (!isObject(item)) continue;
      const centreId = String(item.centreId || '');
      if (!centreId || !centres.has(centreId)) continue;
      if (!item.companyId || item.companyId === SOURCE_COMPANY_ID) {
        item.companyId = TARGET_COMPANY_ID;
        if (!item.scope || item.scope === 'COMPANY') item.scope = 'CENTRE';
        movedToTrafec += 1;
      }
    }
  }

  const employees = Array.isArray(data.employees) ? data.employees : [];
  const sourceEmployees = new Map(
    employees
      .filter(item => isObject(item) && (item.companyId || SOURCE_COMPANY_ID) === SOURCE_COMPANY_ID && item.id)
      .map(item => [String(item.id), item])
  );

  for (const employee of employees) {
    if (!isObject(employee) || employee.companyId !== TARGET_COMPANY_ID) continue;

    if (employee.copiedFromCompanyId === SOURCE_COMPANY_ID) {
      const source = sourceEmployees.get(String(employee.copiedFromId || ''));
      const shouldBeActive = source ? source.active !== false : true;
      if (employee.active !== shouldBeActive) {
        employee.active = shouldBeActive;
        reactivatedEmployees += 1;
      }

      if (!employee.centreId && source?.centreId && centres.has(String(source.centreId))) {
        employee.centreId = String(source.centreId);
        employee.scope = 'CENTRE';
      }
    }

    // Mai reutilitzem una vinculació antiga de mòbil en una còpia/migració.
    if (employee.copiedFromCompanyId === SOURCE_COMPANY_ID) {
      delete employee.deviceTokenHash;
      delete employee.deviceActivatedAt;
      delete employee.deviceActivationHash;
      delete employee.deviceActivationExpiresAt;
      delete employee.deviceActivationCreatedAt;
      delete employee.schedulePin;
    }
  }

  const targetEmployees = new Map(
    employees
      .filter(item => isObject(item) && item.companyId === TARGET_COMPANY_ID && item.id)
      .map(item => [String(item.id), item])
  );

  for (const collection of ['schedules', 'punches']) {
    const records = Array.isArray(data[collection]) ? data[collection] : [];
    for (const item of records) {
      if (!isObject(item) || item.companyId !== TARGET_COMPANY_ID || item.centreId) continue;
      const employee = targetEmployees.get(String(item.employeeId || ''));
      if (!employee?.centreId) continue;
      item.centreId = employee.centreId;
      item.scope = 'CENTRE';
      linkedOperationalRecords += 1;
    }
  }

  const changed = movedToTrafec + reactivatedEmployees + linkedOperationalRecords > 0;
  const marker = data.appliedMigrations.find(item => isObject(item) && item.id === REPAIR_ID);
  if (changed) {
    const details = {
      id: REPAIR_ID,
      appliedAt: new Date().toISOString(),
      movedToTrafec,
      reactivatedEmployees,
      linkedOperationalRecords
    };
    if (marker) Object.assign(marker, details);
    else data.appliedMigrations.push(details);
  }

  return {
    applied: changed,
    movedToTrafec,
    reactivatedEmployees,
    linkedOperationalRecords,
    groupCentreIds: [...centres]
  };
}

module.exports = {
  SOURCE_COMPANY_ID,
  TARGET_COMPANY_ID,
  REPAIR_ID,
  repairTrafecOperationalData
};
