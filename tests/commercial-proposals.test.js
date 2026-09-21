'use strict';

const assert = require('node:assert/strict');
const Commercial = require('../public/js/commercial-proposals-module.js');
const Email = require('../commercial-email.js');

assert.equal(Commercial.menuPrice({ reservationPrice: 52 }), 52);
assert.equal(Commercial.menuPrice({ price: '48,50 €' }), 48.5);
assert.equal(Commercial.proposalTotal(30, 42.5), 1275);
assert.equal(Commercial.proposalCode([{ code: 'PROP-2026-0001' }, { code: 'PROP-2026-0004' }], 2026), 'PROP-2026-0005');
assert.equal(Commercial.isMenu({ type: 'Menú' }), true);
assert.equal(Commercial.isMenu({ type: 'Factura' }), false);

const summary = Commercial.menuSummary({
  title: 'Menú empresa',
  sections: [{ title: 'Entrants', items: [{ name: 'Amanida' }, { name: 'Croquetes' }] }],
  notes: 'Begudes incloses'
});
assert.match(summary, /Menú empresa/);
assert.match(summary, /Amanida/);
assert.match(summary, /Begudes incloses/);

const proposal = {
  code: 'PROP-2026-0007',
  clientName: 'Empresa Exemple',
  eventName: 'Sopar equip',
  eventDate: '2026-10-15',
  pax: 25,
  menuName: 'Menú empresa',
  menuSummary: summary,
  pricePerPerson: 50,
  totalAmount: 1250,
  validUntil: '2026-10-01'
};
const html = Email.proposalHtml(proposal, { name: 'Sarriera 1930', phone: '930000000' });
const text = Email.proposalText(proposal, { name: 'Sarriera 1930' });
assert.match(html, /PROP-2026-0007/);
assert.match(html, /1\.250,00 €|1250,00 €/);
assert.match(text, /Empresa Exemple/);
assert.match(text, /Menú empresa/);

console.log('OK commercial-proposals.test.js');
