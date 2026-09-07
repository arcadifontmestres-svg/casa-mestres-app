const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const data = JSON.parse(read('data.json'));
const catalog = JSON.parse(read('seed/catalog.json'));
const sarriera = JSON.parse(read('seed/sarriera-kitchen-bases.json'));
const packageJson = JSON.parse(read('package.json'));
const index = read('public/index.html');
const modules = read('public/js/arcadi-modules.js');

assert.equal(packageJson.name, 'arcadi-gestio-restaurant');
assert.equal(packageJson.build.productName, 'ARCADI GESTIO RESTAURANT');
assert.equal(packageJson.build.win.artifactName, 'ARCADI_GESTIO_RESTAURANT.exe');
assert.match(index, /arcadi-runtime\.js/);
assert.match(index, /arcadi-modules\.js/);
assert.match(index, /ARCADI GESTIO RESTAURANT/);

for (let phase = 40; phase <= 67; phase += 1) {
  assert.match(modules, new RegExp(`(?:phase:\\s*${phase}|,\\s*${phase},)`), `Falta integrar la fase ${phase}`);
}

assert.ok(data.products.length > 0);
assert.equal(catalog.products.length, 460);
assert.equal(catalog.bases.length, 21);
assert.equal(catalog.dishes.length, 51);
assert.equal(catalog.saleItems.length, 204);
assert.equal(catalog.reservations.length, 2);
assert.equal(sarriera.products.filter(item => item.sourceMigration === 'sarriera_kitchen_bases_2026_09_07_v1').length, 27);
assert.equal(sarriera.bases.length, 9);
assert.equal(sarriera.products.every(item => item.price === 0 && item.stock === 0), true);
assert.ok(sarriera.bases.find(item => item.id === 'base_catalog_11').baseUses.length === 3);
assert.equal(sarriera.bases.find(item => item.id === 'base_catalog_5').yieldPending, true);
assert.match(read('server.js'), /function normalizeArcadiData\(data\)/);

assert.doesNotMatch(modules, /Math\.random\s*\(/, 'Els panells no poden mostrar dades aleatòries');
assert.doesNotMatch(modules, /\/api\/assistant/, 'La IA ha de quedar aparcada');

console.log('OK · fases 40–67, migració segura, Windows i IA aparcada');
