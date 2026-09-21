'use strict';

const fs = require('fs');
const path = require('path');
const { copyCasaMestresToGrupTrafec } = require('./company-copy.js');

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
  const result = copyCasaMestresToGrupTrafec(data);
  if (!result.applied) return result;
  backupData(dataFile, backupsDir);
  const temporary = `${dataFile}.copy.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(temporary, dataFile);
  console.log(`Còpia Casa Mestres → Grup Tràfec completada: ${result.total} registres.`);
  return result;
}

if (require.main === module) {
  applyStartupCopy();
  require('./commercial-brand.js');
  require('./commercial-server.js');
  applyStartupCopy();
}

module.exports = { applyStartupCopy, dataPaths };
