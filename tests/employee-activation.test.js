const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const server = fs.readFileSync(path.resolve(__dirname, '..', 'server.js'), 'utf8');

assert.match(server, /const activationHash = hashSecret\(String\(input\.activationCode \|\| ''\)\);/);
assert.match(server, /String\(item\.code\) === String\(input\.code\)[\s\S]*item\.deviceActivationHash[\s\S]*safeEqual\(item\.deviceActivationHash, activationHash\)/,
  'L’activació ha de cercar la combinació codi d’empleat + codi d’activació');
assert.doesNotMatch(server, /const employee = \(data\.employees \|\| \[\]\)\.find\(item => String\(item\.code\) === String\(input\.code\) && item\.active !== false\);/,
  'No es pot escollir el primer empleat quan diversos centres comparteixen codi');

console.log('Activació multirestaurant: codis d’empleat repetits resolts amb el codi d’activació');
