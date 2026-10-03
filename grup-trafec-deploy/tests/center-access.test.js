'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStore } = require('../src/dades/store');
const { createGovernService } = require('../src/govern/centres');
const { assertCenterFunction } = require('../src/api/center-access');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grup-trafec-access-'));
const file = path.join(dir, 'data.json');

try {
  const store = createStore(file);
  const govern = createGovernService(store);
  const center = govern.createCenter({ code: 'TEST', name: 'Centre Test' });

  assert.doesNotThrow(() => assertCenterFunction(govern, '', 'commercial'));
  assert.throws(
    () => assertCenterFunction(govern, center.id, 'crm'),
    error => error && error.status === 403
  );

  govern.setPermissions(center.id, { functions: { crm: true, commercial: false, reservations: true } });
  assert.doesNotThrow(() => assertCenterFunction(govern, center.id, 'crm'));
  assert.throws(
    () => assertCenterFunction(govern, center.id, 'commercial'),
    error => error && error.status === 403
  );

  govern.updateCenter(center.id, { active: false });
  assert.throws(
    () => assertCenterFunction(govern, center.id, 'crm'),
    error => error && error.status === 404
  );

  console.log('center-access.test.js OK');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
