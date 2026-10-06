'use strict';

const fs = require('fs');
const path = require('path');
const { copyCasaMestresToGrupTrafec } = require('./company-copy.js');
const { syncCasaMestresMasterCatalog } = require('./catalog-master-sync.js');
const { repairTrafecOperationalData } = require('./trafec-repair.js');
const { restoreSeedMasterCatalog } = require('./restore-master-catalog.js');

const ROOT = __dirname;
const CATALOG_SEED = path.join(ROOT, 'seed', 'catalog.json');

function dataPaths() {
  const configured = String(process.env.DATA_DIR || '').trim();
  const dataDir = configured ? path.resolve(configured) : ROOT;
  return {
    dataDir,
    dataFile: path.join(dataDir, 'data.json'),
    backupsDir: path.join(dataDir, 'backups')
  };
}

function backupData(dataFile, backupsDir) {
  if (!fs.existsSync(dataFile)) return;
  fs.mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(dataFile, path.join(backupsDir, `before_casa_to_trafec_${stamp}.json`));
}

function applyStartupCopy() {
  const { dataFile, backupsDir } = dataPaths();
  if (!fs.existsSync(dataFile)) return { applied: false, reason: 'data_missing' };

  const raw = fs.readFileSync(dataFile, 'utf8').trim();
  if (!raw) return { applied: false, reason: 'data_empty' };
  const data = JSON.parse(raw);
  const seed = fs.existsSync(CATALOG_SEED)
    ? JSON.parse(fs.readFileSync(CATALOG_SEED, 'utf8'))
    : {};
  const restore = restoreSeedMasterCatalog(data, seed);
  const initial = copyCasaMestresToGrupTrafec(data);
  const catalog = syncCasaMestresMasterCatalog(data);
  const repair = repairTrafecOperationalData(data);
  const changed = Boolean(restore.applied || initial.applied || catalog.applied || repair.applied);

  if (!changed) {
    return {
      applied: false,
      reason: initial.reason || 'catalog_up_to_date',
      restore,
      initial,
      catalog,
      repair
    };
  }

  backupData(dataFile, backupsDir);
  const temporary = `${dataFile}.copy.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(temporary, dataFile);

  console.log(
    `Còpia/sincronització Casa Mestres → Grup Tràfec: recuperats ${restore.total || 0}, inicial ${initial.total || 0}, ` +
    `catàleg ${catalog.total || 0}, reassignats ${repair.movedToTrafec || 0}, ` +
    `empleats reactivats ${repair.reactivatedEmployees || 0}, registres RRHH vinculats ${repair.linkedOperationalRecords || 0}.`
  );

  return {
    applied: true,
    restore,
    initial,
    catalog,
    repair,
    total: (restore.total || 0) + (initial.total || 0) + (catalog.total || 0) +
      (repair.movedToTrafec || 0) + (repair.reactivatedEmployees || 0) +
      (repair.linkedOperationalRecords || 0)
  };
}

if (require.main === module) {
  applyStartupCopy();
  require('./commercial-brand.js');
  require('./instagram-server.js');
  applyStartupCopy();
}

module.exports = { applyStartupCopy, dataPaths };
