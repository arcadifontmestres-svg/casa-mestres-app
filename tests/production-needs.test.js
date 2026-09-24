const fs=require('fs');
const assert=require('assert');
const app=fs.readFileSync('public/app.js','utf8');
const moduleCode=fs.readFileSync('public/js/production-needs-module.js','utf8');
const server=fs.readFileSync('server.js','utf8');
const index=fs.readFileSync('public/index.html','utf8');

assert.match(app,/\['','productions','Produccions'\]/);
assert.match(app,/\['','needs','Necessitats i autorització'\]/);
assert.match(app,/productionPlans/);
assert.match(app,/operationalNeeds/);
assert.match(moduleCode,/status:'PROPOSTA'/);
assert.match(moduleCode,/status:'PENDENT_DIRECCIO'/);
assert.match(moduleCode,/AUTORITZADA/);
assert.match(moduleCode,/REBUTJADA/);
assert.match(moduleCode,/no modifica estoc ni crea cap compra/i);
assert.match(server,/'productionPlans', 'operationalNeeds'/);
assert.match(index,/production-needs-module\.js/);
console.log('Flux de produccions i necessitats: OK');
