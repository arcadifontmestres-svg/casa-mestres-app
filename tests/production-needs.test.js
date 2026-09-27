const fs=require('fs');
const assert=require('assert');
const app=fs.readFileSync('public/app.js','utf8');
const moduleCode=fs.readFileSync('public/js/production-needs-module.js','utf8');
const server=fs.readFileSync('server.js','utf8');
const index=fs.readFileSync('public/index.html','utf8');

// Comprova el comportament/enllaç real del menú de Cuina, no una etiqueta literal fràgil.
const kitchenEntry=app.match(/\['CUINA','([^']+)','([^']+)'\]/);
assert.ok(kitchenEntry,'Falta l’entrada CUINA al menú principal');
assert.equal(kitchenEntry[1],'kitchen','CUINA ha d’obrir la vista integrada de cuina');
assert.match(kitchenEntry[2],/^Cuina\b/,'L’etiqueta visible de CUINA ha de continuar identificant Cuina');
assert.match(app,/kitchen:\(\)=>window\.ProductionNeeds\?\.renderKitchen\?\.\(\)/,'La vista kitchen ha de delegar al mòdul ProductionNeeds');
assert.match(moduleCode,/function renderKitchen\(\)/,'ProductionNeeds ha d’exposar la pantalla integrada de Cuina');

assert.match(moduleCode,/productForecasts/,'La previsió de productes ha de viure al mòdul ProductionNeeds');
assert.doesNotMatch(app,/\['','productions','Produccions'\]/);
assert.doesNotMatch(app,/\['','needs','Necessitats i autorització'\]/);
assert.match(moduleCode,/Plats, bases o tots/);
assert.match(moduleCode,/Programar i generar dependències/);
assert.match(moduleCode,/controlNormatiu\.records\.produccio/);
assert.match(moduleCode,/traceabilityRecords/);
assert.match(moduleCode,/status:'PREVISIO'/);
assert.match(moduleCode,/Tancar previsió \/ Generar proposta de compra/);
assert.match(moduleCode,/Pendent autorització Direcció/);
assert.match(moduleCode,/compra a proveïdor o traspàs entre centres/);
assert.match(moduleCode,/No s’ha confirmat cap compra ni modificat l’estoc/);
assert.match(server,/'productionRecords', 'productForecasts'/);
assert.match(index,/production-needs-module\.js/);
console.log('Flux complet de cuina, producció i previsió: OK');
