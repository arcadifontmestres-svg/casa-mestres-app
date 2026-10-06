'use strict';

const SOURCE_COMPANY_ID = 'company_casa_mestres';
const SOURCE_CENTRE_ID = 'restaurant_casa_mestres';
const COLLECTIONS = ['suppliers', 'products', 'bases', 'dishes'];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function norm(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function recordKey(collection, item) {
  if (!item || typeof item !== 'object') return '';
  if (collection === 'products' && item.code) return `code:${norm(item.code)}`;
  if (item.name) return `name:${norm(item.name)}`;
  return '';
}

function deepRemap(value, idMap) {
  if (Array.isArray(value)) return value.map(item => deepRemap(item, idMap));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value)) out[key] = deepRemap(child, idMap);
    return out;
  }
  if (typeof value === 'string') return idMap.get(value) || value;
  return value;
}

function restoreSeedMasterCatalog(data, seed) {
  if (!data || typeof data !== 'object') throw new Error('Dades no vàlides');
  if (!seed || typeof seed !== 'object') throw new Error('Catàleg inicial no vàlid');

  const idMap = new Map();
  const restoredByCollection = {};
  let total = 0;

  for (const collection of COLLECTIONS) {
    data[collection] = Array.isArray(data[collection]) ? data[collection] : [];
    const target = data[collection];
    const source = Array.isArray(seed[collection]) ? seed[collection] : [];
    const byId = new Map(target.filter(x => x?.id).map(x => [String(x.id), x]));
    const byKey = new Map(target.map(x => [recordKey(collection, x), x]).filter(([key]) => key));
    let restored = 0;

    for (const original of source) {
      if (!original || typeof original !== 'object') continue;
      const sourceId = String(original.id || '');
      const key = recordKey(collection, original);
      const existing = (sourceId && byId.get(sourceId)) || (key && byKey.get(key));

      if (existing) {
        if (sourceId && existing.id) idMap.set(sourceId, String(existing.id));
        continue;
      }

      const item = deepRemap(clone(original), idMap);
      item.companyId = SOURCE_COMPANY_ID;
      item.centreId = SOURCE_CENTRE_ID;
      item.scope = 'CENTRE';
      item.restoredFromSeed = true;
      item.restoredAt = new Date().toISOString();

      target.push(item);
      if (sourceId && item.id) idMap.set(sourceId, String(item.id));
      if (item.id) byId.set(String(item.id), item);
      const itemKey = recordKey(collection, item);
      if (itemKey) byKey.set(itemKey, item);
      restored += 1;
    }

    restoredByCollection[collection] = restored;
    total += restored;
  }

  return { applied: total > 0, restoredByCollection, total };
}

module.exports = {
  SOURCE_COMPANY_ID,
  SOURCE_CENTRE_ID,
  COLLECTIONS,
  restoreSeedMasterCatalog
};
