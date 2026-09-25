'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const TARGET_COMPANY_ID = 'company_grup_trafec';
const SOURCE_COMPANY_ID = 'company_casa_mestres';
const MIGRATION_ID = 'integrate_grup_trafec_kitchen_to_sarriera_v1';

function dataPaths() {
  const configured = String(process.env.DATA_DIR || '').trim();
  const dataDir = configured ? path.resolve(configured) : ROOT;
  return {
    dataDir,
    dataFile: path.join(dataDir, 'data.json'),
    centresDir: path.join(dataDir, 'centres'),
    backupsDir: path.join(dataDir, 'backups')
  };
}

function backupFile(file, backupsDir, label) {
  if (!fs.existsSync(file)) return '';
  fs.mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(backupsDir, `${label}_${stamp}.json`);
  fs.copyFileSync(file, target);
  return target;
}

function atomicWrite(file, value) {
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temporary, file);
}

function migrationApplied(data) {
  return (data.appliedMigrations || []).some(item =>
    (typeof item === 'string' ? item : item?.id) === MIGRATION_ID
  );
}

function findSarrieraCentre(data) {
  return (data.restaurants || []).find(item =>
    item && item.kind !== 'GROUP' && /sarriera/i.test(String(item.name || ''))
  ) || null;
}

function isCopiedKitchenRecord(item) {
  if (!item || typeof item !== 'object') return false;
  if (item.companyId !== TARGET_COMPANY_ID) return false;
  if (item.centreId) return false;
  if (item.scope && item.scope !== 'COMPANY') return false;
  return item.copiedFromCompanyId === SOURCE_COMPANY_ID;
}

function integrateCollection(data, key, centreId) {
  const list = Array.isArray(data[key]) ? data[key] : [];
  const moved = [];
  for (const item of list) {
    if (!isCopiedKitchenRecord(item)) continue;
    item.centreId = centreId;
    item.scope = 'CENTRE';
    item.integratedToCentreId = centreId;
    item.integratedAt = new Date().toISOString();
    moved.push(item);
  }
  return moved;
}

function mergeLocalCollection(local, key, records) {
  local.collections = local.collections && typeof local.collections === 'object' ? local.collections : {};
  const existing = Array.isArray(local.collections[key]) ? local.collections[key] : [];
  const byId = new Map(existing.filter(item => item?.id).map(item => [String(item.id), item]));
  for (const record of records) {
    if (!record?.id) continue;
    byId.set(String(record.id), JSON.parse(JSON.stringify(record)));
  }
  local.collections[key] = [...byId.values()];
}

function applySarrieraKitchenIntegration() {
  const { dataFile, centresDir, backupsDir } = dataPaths();
  if (!fs.existsSync(dataFile)) return { applied: false, reason: 'data_missing' };

  const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  data.appliedMigrations = Array.isArray(data.appliedMigrations) ? data.appliedMigrations : [];
  if (migrationApplied(data)) return { applied: false, reason: 'already_applied' };

  const sarriera = findSarrieraCentre(data);
  if (!sarriera?.id) return { applied: false, reason: 'sarriera_centre_missing' };

  const dishes = integrateCollection(data, 'dishes', sarriera.id);
  const bases = integrateCollection(data, 'bases', sarriera.id);
  if (!dishes.length && !bases.length) return { applied: false, reason: 'no_company_kitchen_records' };

  fs.mkdirSync(centresDir, { recursive: true });
  const centreFile = path.join(centresDir, `${sarriera.id}.json`);
  let local = {
    arcadiCentreDataVersion: 1,
    companyId: TARGET_COMPANY_ID,
    centreId: sarriera.id,
    collections: {}
  };
  if (fs.existsSync(centreFile)) {
    try {
      const current = JSON.parse(fs.readFileSync(centreFile, 'utf8'));
      if (current && typeof current === 'object') local = current;
    } catch {
      // Es farà còpia de seguretat del fitxer local abans de substituir-lo.
    }
  }
  local.arcadiCentreDataVersion = local.arcadiCentreDataVersion || 1;
  local.companyId = TARGET_COMPANY_ID;
  local.centreId = sarriera.id;
  mergeLocalCollection(local, 'dishes', dishes);
  mergeLocalCollection(local, 'bases', bases);

  backupFile(dataFile, backupsDir, 'before_sarriera_kitchen_integration');
  backupFile(centreFile, backupsDir, `before_${sarriera.id}_centre_integration`);

  data.appliedMigrations.push({
    id: MIGRATION_ID,
    appliedAt: new Date().toISOString(),
    companyId: TARGET_COMPANY_ID,
    centreId: sarriera.id,
    dishes: dishes.length,
    bases: bases.length
  });

  atomicWrite(dataFile, data);
  atomicWrite(centreFile, local);

  console.log(`Integració Cuina → ${sarriera.name}: ${dishes.length} plats i ${bases.length} bases.`);
  return { applied: true, centreId: sarriera.id, centreName: sarriera.name, dishes: dishes.length, bases: bases.length };
}

module.exports = { MIGRATION_ID, applySarrieraKitchenIntegration };
