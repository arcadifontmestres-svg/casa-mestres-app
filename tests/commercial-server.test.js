'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcadi-commercial-test-'));
const port = 39600 + Math.floor(Math.random() * 200);
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['commercial-server.js'], {
  cwd: root,
  env: {
    ...process.env,
    ARCADI_DESKTOP: '1',
    HOST: '127.0.0.1',
    PORT: String(port),
    NO_OPEN: '1',
    DATA_DIR: dataDir,
    RESEND_API_KEY: '',
    COMMERCIAL_FROM_EMAIL: ''
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let logs = '';
child.stdout.on('data', chunk => { logs += chunk; });
child.stderr.on('data', chunk => { logs += chunk; });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function request(pathname, options = {}) {
  const response = await fetch(base + pathname, options);
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { response, data };
}

async function main() {
  for (let i = 0; i < 60; i += 1) {
    try { if ((await request('/api/health')).response.ok) break; } catch {}
    await wait(100);
  }
  const emailStatus = await request('/api/commercial-email-status');
  assert.equal(emailStatus.response.status, 200, logs);
  assert.equal(emailStatus.data.configured, false);

  const state = await request('/api/state');
  assert.equal(state.response.status, 200, logs);
  state.data.commercialProposals = [{
    id: 'proposal_test', code: 'PROP-2026-0001', status: 'VALIDADA', clientName: 'Client', clientEmail: 'client@example.com',
    pax: 2, menuName: 'Menú prova', menuSummary: 'Plat 1', pricePerPerson: 50, totalAmount: 100
  }];
  const saved = await request('/api/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state.data) });
  assert.equal(saved.response.status, 200);

  const send = await request('/api/commercial-proposals/proposal_test/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(send.response.status, 503);
  assert.match(send.data.error, /RESEND_API_KEY/);
  console.log('OK commercial-server.test.js');
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(() => {
  child.kill('SIGTERM');
  fs.rmSync(dataDir, { recursive: true, force: true });
});
