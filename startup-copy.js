'use strict';

const fs = require('fs');
const path = require('path');
const { copyCasaMestresToGrupTrafec } = require('./company-copy.js');
const { syncCasaMestresMasterCatalog } = require('./catalog-master-sync.js');

const ROOT = __dirname;

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

  const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const initial = copyCasaMestresToGrupTrafec(data);
  const catalog = syncCasaMestresMasterCatalog(data);
  const changed = Boolean(initial.applied || catalog.applied);

  if (!changed) return { applied: false, reason: initial.reason || 'catalog_up_to_date', initial, catalog };

  backupData(dataFile, backupsDir);
  const temporary = `${dataFile}.copy.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(temporary, dataFile);

  console.log(`Còpia/sincronització Casa Mestres → Grup Tràfec: inicial ${initial.total || 0}, catàleg ${catalog.total || 0}.`);
  return { applied: true, initial, catalog, total: (initial.total || 0) + (catalog.total || 0) };
}

if (require.main === module) {
  applyStartupCopy();
  require('./commercial-brand.js');
  require('./instagram-server.js');
  applyStartupCopy();
}

module.exports = { applyStartupCopy, dataPaths };
