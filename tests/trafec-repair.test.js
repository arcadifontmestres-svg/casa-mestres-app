'use strict';

const assert = require('node:assert/strict');
const { repairTrafecOperationalData, TARGET_COMPANY_ID } = require('../trafec-repair.js');

const data = {
  restaurants: [
    { id: 'restaurant_casa_mestres', organizationId: 'company_casa_mestres', name: 'Casa Mestres' },
    { id: 'restaurant_sarriera', organizationId: TARGET_COMPANY_ID, name: 'Sarriera 1930' }
  ],
  appliedMigrations: [],
  employees: [
    { id: 'emp_source', code: '001', name: 'Origen', active: true },
    {
      id: 'emp_copy', code: '001', name: 'Còpia', active: false,
      companyId: TARGET_COMPANY_ID, scope: 'COMPANY', centreId: '',
      copiedFromCompanyId: 'company_casa_mestres', copiedFromId: 'emp_source',
      deviceTokenHash: 'old-token'
    },
    {
      id: 'emp_sarriera', code: '002', name: 'Sarriera', active: true,
      centreId: 'restaurant_sarriera'
    }
  ],
  schedules: [
    { id: 'sch_sarriera', employeeId: 'emp_sarriera', centreId: 'restaurant_sarriera', date: '2026-10-01' }
  ],
  punches: [
    { id: 'p_sarriera', employeeId: 'emp_sarriera', centreId: 'restaurant_sarriera', type: 'ENTRADA' }
  ]
};

const result = repairTrafecOperationalData(data);
assert.equal(result.applied, true);
assert.equal(data.employees.find(x => x.id === 'emp_copy').active, true);
assert.equal(data.employees.find(x => x.id === 'emp_copy').deviceTokenHash, undefined);
assert.equal(data.employees.find(x => x.id === 'emp_sarriera').companyId, TARGET_COMPANY_ID);
assert.equal(data.employees.find(x => x.id === 'emp_sarriera').scope, 'CENTRE');
assert.equal(data.schedules[0].companyId, TARGET_COMPANY_ID);
assert.equal(data.punches[0].companyId, TARGET_COMPANY_ID);

const second = repairTrafecOperationalData(data);
assert.equal(second.applied, false);

console.log('OK trafec-repair.test.js');
