'use strict';

const crypto = require('crypto');

const SOURCE_COMPANY_ID = 'company_casa_mestres';
const SOURCE_CENTRE_ID = 'restaurant_casa_mestres';
const TARGET_COMPANY_ID = 'company_grup_trafec';
const MIGRATION_ID = 'copy_casa_mestres_to_grup_trafec_v1';
const EXCLUDED_COLLECTIONS = new Set(['organizations', 'restaurants', 'appliedMigrations']);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function deterministicId(collection, sourceId) {
  const digest = crypto.createHash('sha1').update(`${collection}:${sourceId}`).digest('hex').slice(0, 18);
  return `trafec_copy_${digest}`;
}

function sourceRecord(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  const companyId = item.companyId || SOURCE_COMPANY_ID;
  return companyId === SOURCE_COMPANY_ID;
}

function sourceIdentity(collection, item, index) {
  return String(item.id || item.code || item.name || `${collection}_${index}`);
}

function buildIdMap(data, collections) {
  const counts = new Map();
  const candidates = [];
  for (const collection of collections) {
    const records = Array.isArray(data[collection]) ? data[collection] : [];
    records.forEach((item, index) => {
      if (!sourceRecord(item) || !item.id) return;
      const sourceId = String(item.id);
      counts.set(sourceId, (counts.get(sourceId) || 0) + 1);
      candidates.push({ collection, sourceId, targetId: deterministicId(collection, sourceIdentity(collection, item, index)) });
    });
  }
  const map = new Map();
  for (const candidate of candidates) {
    if (counts.get(candidate.sourceId) === 1) map.set(candidate.sourceId, candidate.targetId);
  }
  return map;
}

function remapValue(value, idMap, key = '') {
  if (Array.isArray(value)) {
    if (key === 'centreIds' || key === 'optionalCentreIds') return [];
    return value.map(item => remapValue(item, idMap));
  }
  if (value && typeof value === 'object') {
    const output = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      if (childKey === 'companyId' || childKey === 'organizationId') {
        output[childKey] = childValue === SOURCE_COMPANY_ID || !childValue ? TARGET_COMPANY_ID : childValue;
        continue;
      }
      if (childKey === 'centreId') {
        output[childKey] = childValue === SOURCE_CENTRE_ID || !childValue ? '' : childValue;
        continue;
      }
      if (childKey === 'centreIds' || childKey === 'optionalCentreIds') {
        output[childKey] = [];
        continue;
      }
      if (childKey === 'scope') {
        output[childKey] = 'COMPANY';
        continue;
      }
      output[childKey] = remapValue(childValue, idMap, childKey);
    }
    return output;
  }
  if (typeof value === 'string') {
    if (value === SOURCE_COMPANY_ID) return TARGET_COMPANY_ID;
    if (value === SOURCE_CENTRE_ID) return '';
    return idMap.get(value) || value;
  }
  return value;
}

function sanitizeClone(collection, item) {
  if (collection === 'employees') {
    item.active = false;
    delete item.deviceTokenHash;
    delete item.deviceActivatedAt;
    delete item.deviceActivationHash;
    delete item.deviceActivationExpiresAt;
    delete item.deviceActivationCreatedAt;
    delete item.schedulePin;
  }
  if (collection === 'reservations') {
    delete item.manageToken;
    delete item.stripeSessionId;
    delete item.stripePaymentIntent;
  }
  if (collection === 'permissionAudit') {
    item.actor = item.actor || 'Còpia Casa Mestres';
  }
  return item;
}

function cloneCollectionRecord(collection, source, index, idMap) {
  const sourceKey = sourceIdentity(collection, source, index);
  const clone = remapValue(cloneJson(source), idMap);
  clone.id = deterministicId(collection, sourceKey);
  clone.companyId = TARGET_COMPANY_ID;
  clone.centreId = '';
  clone.scope = 'COMPANY';
  clone.copiedFromCompanyId = SOURCE_COMPANY_ID;
  clone.copiedFromCentreId = source.centreId || SOURCE_CENTRE_ID;
  clone.copiedFromId = source.id || '';
  clone.copiedAt = new Date().toISOString();
  return sanitizeClone(collection, clone);
}

function cloneControlNormatiu(data, idMap) {
  const records = data.controlNormatiu?.records;
  if (!records || typeof records !== 'object') return { copied: 0 };
  let copied = 0;
  for (const [recordType, list] of Object.entries(records)) {
    if (!Array.isArray(list)) continue;
    const existing = new Set(list.filter(item => item?.companyId === TARGET_COMPANY_ID && item?.copiedFromCompanyId === SOURCE_COMPANY_ID)
      .map(item => String(item.copiedFromId || '')));
    const additions = [];
    list.forEach((item, index) => {
      if (!sourceRecord(item)) return;
      const sourceKey = sourceIdentity(`control_${recordType}`, item, index);
      if (existing.has(String(item.id || sourceKey))) return;
      const clone = remapValue(cloneJson(item), idMap);
      clone.id = deterministicId(`control_${recordType}`, sourceKey);
      clone.companyId = TARGET_COMPANY_ID;
      clone.centreId = '';
      clone.scope = 'COMPANY';
      clone.copiedFromCompanyId = SOURCE_COMPANY_ID;
      clone.copiedFromCentreId = item.centreId || SOURCE_CENTRE_ID;
      clone.copiedFromId = item.id || sourceKey;
      clone.copiedAt = new Date().toISOString();
      additions.push(clone);
      copied += 1;
    });
    list.push(...additions);
  }
  return { copied };
}

function copyCasaMestresToGrupTrafec(data) {
  if (!data || typeof data !== 'object') throw new Error('Dades no vàlides');
  data.appliedMigrations = Array.isArray(data.appliedMigrations) ? data.appliedMigrations : [];
  const alreadyApplied = data.appliedMigrations.some(item => (typeof item === 'string' ? item : item?.id) === MIGRATION_ID);
  if (alreadyApplied) return { applied: false, reason: 'already_applied', copiedByCollection: {}, controlRecords: 0, total: 0 };

  if (!(data.organizations || []).some(item => item.id === TARGET_COMPANY_ID)) {
    data.organizations = Array.isArray(data.organizations) ? data.organizations : [];
    data.organizations.push({
      id: TARGET_COMPANY_ID,
      name: 'Grup Tràfec',
      status: 'Activa',
      notes: 'Empresa corporativa creada per ARCADI GESTIO',
      createdAt: new Date().toISOString()
    });
  }

  const collections = Object.keys(data).filter(key => Array.isArray(data[key]) && !EXCLUDED_COLLECTIONS.has(key));
  const idMap = buildIdMap(data, collections);
  const copiedByCollection = {};
  let total = 0;

  for (const collection of collections) {
    const records = data[collection];
    const existingSourceIds = new Set(records
      .filter(item => item?.companyId === TARGET_COMPANY_ID && item?.copiedFromCompanyId === SOURCE_COMPANY_ID)
      .map(item => String(item.copiedFromId || '')));
    const additions = [];
    records.forEach((item, index) => {
      if (!sourceRecord(item)) return;
      const sourceKey = sourceIdentity(collection, item, index);
      const copyMarker = String(item.id || sourceKey);
      if (existingSourceIds.has(copyMarker)) return;
      additions.push(cloneCollectionRecord(collection, item, index, idMap));
    });
    if (additions.length) {
      records.push(...additions);
      copiedByCollection[collection] = additions.length;
      total += additions.length;
    }
  }

  const control = cloneControlNormatiu(data, idMap);
  total += control.copied;

  data.appliedMigrations.push({
    id: MIGRATION_ID,
    appliedAt: new Date().toISOString(),
    sourceCompanyId: SOURCE_COMPANY_ID,
    sourceCentreId: SOURCE_CENTRE_ID,
    targetCompanyId: TARGET_COMPANY_ID,
    copiedByCollection,
    controlRecords: control.copied,
    total
  });

  return { applied: true, copiedByCollection, controlRecords: control.copied, total };
}

module.exports = {
  SOURCE_COMPANY_ID,
  SOURCE_CENTRE_ID,
  TARGET_COMPANY_ID,
  MIGRATION_ID,
  deterministicId,
  sourceRecord,
  copyCasaMestresToGrupTrafec
};
