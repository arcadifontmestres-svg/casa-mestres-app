const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const data = JSON.parse(read('data.json'));
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

assert.equal(data.products.length, 460);
assert.equal(data.bases.length, 21);
assert.equal(data.dishes.length, 51);
assert.equal(data.saleItems.length, 204);
assert.equal(data.reservations.length, 2);
assert.match(read('server.js'), /function normalizeArcadiData\(data\)/);

assert.doesNotMatch(modules, /Math\.random\s*\(/, 'Els panells no poden mostrar dades aleatòries');
assert.doesNotMatch(modules, /\/api\/assistant/, 'La IA ha de quedar aparcada');

console.log('OK · fases 40–67, migració segura, Windows i IA aparcada');
