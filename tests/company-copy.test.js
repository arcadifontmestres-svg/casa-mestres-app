'use strict';

const assert = require('node:assert/strict');
const {
  TARGET_COMPANY_ID,
  MIGRATION_ID,
  copyCasaMestresToGrupTrafec
} = require('../company-copy.js');

const data = {
  organizations: [
    { id: 'company_casa_mestres', name: 'Casa Mestres', status: 'Activa' },
    { id: 'company_grup_trafec', name: 'Grup Tràfec', status: 'Activa' }
  ],
  restaurants: [
    { id: 'restaurant_casa_mestres', organizationId: 'company_casa_mestres', name: 'Casa Mestres' },
    { id: 'restaurant_sarriera', organizationId: 'company_grup_trafec', name: 'Sarriera 1930' }
  ],
  appliedMigrations: [],
  suppliers: [
    { id: 'sup_1', name: 'Proveïdor Casa Mestres' },
    { id: 'sup_group_existing', companyId: 'company_grup_trafec', name: 'Proveïdor Tràfec existent' }
  ],
  products: [
    { id: 'prod_1', name: 'Vedella', supplierId: 'sup_1' }
  ],
  bases: [
    { id: 'base_1', name: 'Fons', ingredients: [{ productId: 'prod_1', qty: 1, unit: 'kg' }] }
  ],
  employees: [
    { id: 'emp_1', code: '001', name: 'Empleat Casa Mestres', active: true, deviceTokenHash: 'secret', deviceActivationHash: 'activation' }
  ],
  schedules: [
    { id: 'sch_1', employeeId: 'emp_1', date: '2026-09-21', start: '09:00', end: '17:00' }
  ],
  reservations: [
    { id: 'res_1', name: 'Client', manageToken: 'token', stripeSessionId: 'stripe_session', stripePaymentIntent: 'stripe_pi' }
  ],
  controlNormatiu: {
    empresa: { name: 'Casa Mestres' },
    records: {
      recepcio: [{ id: 'ctrl_1', supplierId: 'sup_1', result: 'Conforme' }]
    }
  }
};

const result = copyCasaMestresToGrupTrafec(data);
assert.equal(result.applied, true);
assert.ok(result.total >= 7);
assert.ok(data.appliedMigrations.some(item => item.id === MIGRATION_ID));

const copiedSupplier = data.suppliers.find(item => item.companyId === TARGET_COMPANY_ID && item.copiedFromId === 'sup_1');
const copiedProduct = data.products.find(item => item.companyId === TARGET_COMPANY_ID && item.copiedFromId === 'prod_1');
const copiedBase = data.bases.find(item => item.companyId === TARGET_COMPANY_ID && item.copiedFromId === 'base_1');
const copiedEmployee = data.employees.find(item => item.companyId === TARGET_COMPANY_ID && item.copiedFromId === 'emp_1');
const copiedSchedule = data.schedules.find(item => item.companyId === TARGET_COMPANY_ID && item.copiedFromId === 'sch_1');
const copiedReservation = data.reservations.find(item => item.companyId === TARGET_COMPANY_ID && item.copiedFromId === 'res_1');
const copiedControl = data.controlNormatiu.records.recepcio.find(item => item.companyId === TARGET_COMPANY_ID && item.copiedFromId === 'ctrl_1');

assert.ok(copiedSupplier);
assert.ok(copiedProduct);
assert.ok(copiedBase);
assert.ok(copiedEmployee);
assert.ok(copiedSchedule);
assert.ok(copiedReservation);
assert.ok(copiedControl);
assert.equal(copiedProduct.supplierId, copiedSupplier.id);
assert.equal(copiedBase.ingredients[0].productId, copiedProduct.id);
assert.equal(copiedSchedule.employeeId, copiedEmployee.id);
assert.equal(copiedEmployee.active, false);
assert.equal(copiedEmployee.deviceTokenHash, undefined);
assert.equal(copiedEmployee.deviceActivationHash, undefined);
assert.equal(copiedReservation.manageToken, undefined);
assert.equal(copiedReservation.stripeSessionId, undefined);
assert.equal(copiedReservation.stripePaymentIntent, undefined);
assert.equal(copiedControl.supplierId, copiedSupplier.id);
assert.equal(data.suppliers.filter(item => item.id === 'sup_group_existing').length, 1);

const countsBefore = {
  suppliers: data.suppliers.length,
  products: data.products.length,
  bases: data.bases.length,
  employees: data.employees.length,
  schedules: data.schedules.length,
  reservations: data.reservations.length,
  controls: data.controlNormatiu.records.recepcio.length
};
const second = copyCasaMestresToGrupTrafec(data);
assert.equal(second.applied, false);
assert.equal(second.reason, 'already_applied');
assert.deepEqual(countsBefore, {
  suppliers: data.suppliers.length,
  products: data.products.length,
  bases: data.bases.length,
  employees: data.employees.length,
  schedules: data.schedules.length,
  reservations: data.reservations.length,
  controls: data.controlNormatiu.records.recepcio.length
});

console.log('OK company-copy.test.js');
