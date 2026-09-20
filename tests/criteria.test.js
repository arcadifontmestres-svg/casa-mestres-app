'use strict';

const assert = require('assert');
const {
  createCriterion,
  updateCriterion,
  transitionCriterion
} = require('../criteria.js');

const criterion = createCriterion({
  companyId: 'company_trafec',
  title: 'Unificar el rendiment del fumet',
  problem: 'Els centres obtenen rendiments incompatibles.',
  centreIds: ['sarriera', 'sitges'],
  priority: 'ALTA',
  nextStep: 'Comparar tres produccions reals.'
}, 'arcadi');

assert.equal(criterion.state, 'DETECTADA');
assert.equal(criterion.version, 1);
assert.equal(criterion.history.length, 1);

transitionCriterion(criterion, 'EN_ESTUDI', 'arcadi');
transitionCriterion(criterion, 'EN_PROVA', 'arcadi');

assert.throws(
  () => transitionCriterion(criterion, 'APROVADA', 'joan-ramon'),
  /No es pot passar/
);

transitionCriterion(criterion, 'PENDENT_APROVACIO', 'arcadi');
assert.throws(
  () => transitionCriterion(criterion, 'APROVADA', 'joan-ramon'),
  /sense proposta tècnica/
);

updateCriterion(criterion, {
  proposal: 'Rendiment corporatiu de 12 litres amb tolerància del 5%.',
  evidence: [{ type: 'production', centreId: 'sarriera', result: 11.8 }]
}, 'arcadi');

transitionCriterion(criterion, 'APROVADA', 'joan-ramon');
transitionCriterion(criterion, 'PUBLICADA', 'joan-ramon');
transitionCriterion(criterion, 'EN_IMPLANTACIO', 'responsable-sarriera');
transitionCriterion(criterion, 'IMPLANTADA', 'joan-ramon');

assert.equal(criterion.state, 'IMPLANTADA');
assert.ok(criterion.version >= 8);
assert.ok(criterion.publishedAt);
assert.ok(criterion.history.every(item => item.id && item.at && item.actor));
assert.equal(criterion.history.filter(item => item.action === 'CANVI_ESTAT').length, 7);

console.log('Criteris i estàndards: proves superades');
