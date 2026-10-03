'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStore } = require('../src/dades/store');
const { createGovernService } = require('../src/govern/centres');
const { createCenterLinks } = require('../src/govern/center-links');
const { createCrmService } = require('../src/funcions/crm');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grup-trafec-govern-'));
const file = path.join(dir, 'data.json');

try {
  const store = createStore(file);
  const govern = createGovernService(store);
  const links = createCenterLinks(store);
  const crm = createCrmService(store);

  assert.strictEqual(govern.listCenters().length, 0);
  assert.strictEqual(govern.listEmployees().length, 0);

  const sarriera = govern.createCenter({ code: 'S1930', name: 'Sarriera 1930' });
  const sitges = govern.createCenter({ code: 'SITGES', name: 'Sitges' });

  assert.strictEqual(govern.listCenters().length, 2);
  assert.strictEqual(govern.getPermissions(sarriera.id).functions.crm, false);
  assert.strictEqual(govern.getPermissions(sarriera.id).functions.reservations, false);

  govern.setPermissions(sitges.id, {
    functions: {
      crm: true,
      commercial: false,
      reservations: true,
      gestio_cuina: true
    }
  });
  assert.strictEqual(govern.getPermissions(sitges.id).functions.commercial, false);
  assert.strictEqual(govern.getPermissions(sitges.id).functions.reservations, true);
  assert.strictEqual(govern.getPermissions(sitges.id).functions.gestio_cuina, true);

  const employee = govern.createEmployee({
    name: 'Persona prova',
    role: 'Cuina',
    centerIds: [sarriera.id]
  });
  assert.strictEqual(govern.listEmployees().length, 1);
  assert.deepStrictEqual(employee.centerIds, [sarriera.id]);

  const contactA = crm.create({ name: 'Client Sarriera' });
  const contactB = crm.create({ name: 'Client Sitges' });
  links.add('crm', contactA.id, sarriera.id);
  links.add('crm', contactB.id, sitges.id);

  assert.strictEqual(links.has('crm', contactA.id, sarriera.id), true);
  assert.strictEqual(links.has('crm', contactA.id, sitges.id), false);
  assert.strictEqual(links.has('crm', contactB.id, sitges.id), true);
  assert.strictEqual(links.has('crm', contactA.id, ''), true);

  const reopened = createStore(file);
  const governReloaded = createGovernService(reopened);
  const linksReloaded = createCenterLinks(reopened);

  assert.strictEqual(governReloaded.getCenter(sarriera.id).name, 'Sarriera 1930');
  assert.strictEqual(governReloaded.getPermissions(sitges.id).functions.gestio_cuina, true);
  assert.strictEqual(governReloaded.getEmployee(employee.id).name, 'Persona prova');
  assert.strictEqual(linksReloaded.has('crm', contactA.id, sarriera.id), true);

  console.log('govern-centres.test.js OK');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
