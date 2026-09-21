const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const server = fs.readFileSync(path.resolve(__dirname, '..', 'server.js'), 'utf8');

assert.match(server, /const activationHash = hashSecret\(String\(input\.activationCode \|\| ''\)\);/);
assert.match(server, /String\(item\.code\) === String\(input\.code\)[\s\S]*item\.deviceActivationHash[\s\S]*safeEqual\(item\.deviceActivationHash, activationHash\)/,
  'L’activació ha de cercar la combinació codi d’empleat + codi d’activació');
assert.doesNotMatch(server, /const employee = \(data\.employees \|\| \[\]\)\.find\(item => String\(item\.code\) === String\(input\.code\) && item\.active !== false\);/,
  'No es pot escollir el primer empleat quan diversos centres comparteixen codi');
assert.match(server, /const centre = \(data\.restaurants \|\| \[\]\)\.find\(item => item\.id === employee\.centreId\) \|\| null;/,
  'La sessió del dispositiu ha de resoldre el centre vinculat');
assert.match(server, /company: company \? \{ id: company\.id, name: company\.name \|\| '' \}/,
  'La sessió ha de retornar la identitat de l’empresa');

const miniapp = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'fitxatges.html'), 'utf8');
assert.match(miniapp, /id="appCompany"/);
assert.match(miniapp, /id="appCentre"/);
assert.match(miniapp, /appCompany\.textContent=companyName/);
assert.match(miniapp, /appCentre\.textContent=centreName/);

console.log('Activació multirestaurant: codis d’empleat repetits resolts amb el codi d’activació');
