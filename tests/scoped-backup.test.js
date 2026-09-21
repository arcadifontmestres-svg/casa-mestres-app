const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const server = fs.readFileSync(path.resolve(__dirname, '..', 'server.js'), 'utf8');
const app = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'app.js'), 'utf8');

assert.match(server, /kind: 'ARCADI_SCOPED_BACKUP'/);
assert.match(server, /function buildScopedBackup\(data, scope, companyId, centreId = ''\)/);
assert.match(server, /function restoreScopedBackup\(data, backup\)/);
assert.match(server, /current\.filter\(item => !recordMatchesScope\(item, companyId, centreId\)\)/);
assert.match(server, /scope === 'centre' \? centreId : ''/);
assert.match(app, /ARCADI_CATALOG_TRANSFER/);
assert.match(app, /item\.stock=0/);
assert.match(app, /item\.companyId=target\.companyId/);
assert.match(app, /item\.scope='COMPANY'/);
assert.match(app, /item\.onMenu=false;item\.zones=\[\]/);

console.log('Còpies independents i transferència de catàleg: estructura verificada');
