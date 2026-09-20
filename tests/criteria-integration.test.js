'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const modules = fs.readFileSync(path.join(root, 'public', 'js', 'arcadi-modules.js'), 'utf8');
const screen = fs.readFileSync(path.join(root, 'public', 'js', 'criteria-module.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');

for (const collection of ['organizations', 'governanceCriteria', 'corporateStandards', 'governanceTasks', 'communicationReads']) {
  assert.ok(server.includes("'" + collection + "'"), 'Falta la col·lecció ' + collection);
}

for (const endpoint of ["/api/criteria", "/transition"]) {
  assert.ok(server.includes(endpoint), 'Falta endpoint ' + endpoint);
}

assert.ok(server.includes('const governanceCriteria = current.governanceCriteria || []'), 'L’historial de criteris no queda protegit del guardat general');
assert.ok(server.includes("updated.state === 'APROVADA'"), 'Falta conversió en estàndard');
assert.ok(server.includes("updated.state === 'PUBLICADA'"), 'Falta comunicació de publicació');
assert.ok(server.includes("updated.state === 'EN_IMPLANTACIO'"), 'Falten tasques d’implantació');
assert.ok(modules.includes("'criteriaStandards'"), 'El mòdul no és a la navegació');
assert.ok(screen.includes('Criteris i estàndards') || screen.includes('Criteri i estàndard'), 'Falta la pantalla');
assert.ok(index.includes('/js/criteria-module.js'), 'El navegador no carrega el mòdul');

console.log('Integració de criteris: estructura correcta');
