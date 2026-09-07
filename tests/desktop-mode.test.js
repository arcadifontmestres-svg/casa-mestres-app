const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcadi-desktop-test-'));
const port = 39000 + Math.floor(Math.random() * 500);
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: {
    ...process.env,
    ARCADI_DESKTOP: '1',
    HOST: '127.0.0.1',
    PORT: String(port),
    NO_OPEN: '1',
    DATA_DIR: dataDir
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let logs = '';
child.stdout.on('data', chunk => { logs += chunk; });
child.stderr.on('data', chunk => { logs += chunk; });
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function request(pathname, options = {}) {
  const response = await fetch(base + pathname, options);
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { response, data };
}

async function main() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await request('/api/health')).response.ok) break;
    } catch {}
    await wait(100);
  }

  const health = await request('/api/health');
  assert.equal(health.response.status, 200, logs);
  assert.equal(health.data.app, 'ARCADI GESTIO RESTAURANT');
  assert.equal(health.data.adminConfigured, true);

  const state = await request('/api/state');
  assert.equal(state.response.status, 200);
  assert.equal(state.data.products.length, 487);
  assert.equal(state.data.arcadiSchema, 'ARCADI_GESTIO_RESTAURANT_V1');
  assert.ok(Array.isArray(state.data.purchaseOrders));
  assert.ok(state.data.restaurants.some(item => item.id === 'restaurant_casa_mestres'));
  assert.ok(state.data.miniApps.some(item => item.id === 'miniapp_reserves'));
  assert.ok(fs.existsSync(path.join(dataDir, 'data.json')), 'Windows ha de crear el seu data.json extern');

  state.data.maintenanceRecords.push({ id: 'maintenance_desktop_test', title: 'Prova Windows', status: 'Pendent' });
  const saved = await request('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state.data)
  });
  assert.equal(saved.response.status, 200);
  assert.ok(saved.data.state.maintenanceRecords.some(item => item.id === 'maintenance_desktop_test'));
  assert.ok(fs.readdirSync(path.join(dataDir, 'backups')).some(name => name.endsWith('.json')));

  console.log('OK · mode Windows, dades externes, guardat i còpia automàtica');
}

main()
  .catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
  })
  .finally(() => {
    child.kill('SIGTERM');
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
