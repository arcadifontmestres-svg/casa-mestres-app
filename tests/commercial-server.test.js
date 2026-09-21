'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { normalizeGoogleAppPassword, createMessage } = require('../commercial-smtp.js');

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
    COMMERCIAL_FROM_EMAIL: '',
    COMMERCIAL_EMAIL_PROVIDER: '',
    GMAIL_SMTP_USER: '',
    GMAIL_APP_PASSWORD: ''
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
  assert.equal(normalizeGoogleAppPassword('abcd efgh ijkl mnop'), 'abcdefghijklmnop');
  const message = createMessage({ user: 'restaurant@gmail.com', fromName: 'Restaurant', to: 'client@example.com', subject: 'Prova', html: '<b>Hola</b>', text: 'Hola' });
  assert.match(message.raw, /multipart\/alternative/);
  assert.match(message.raw, /restaurant@gmail\.com/);

  for (let i = 0; i < 60; i += 1) {
    try { if ((await request('/api/health')).response.ok) break; } catch {}
    await wait(100);
  }

  const emailStatus = await request('/api/commercial-email-status');
  assert.equal(emailStatus.response.status, 200, logs);
  assert.equal(emailStatus.data.configured, false);
  assert.equal(emailStatus.data.provider, 'gmail');
  assert.equal(emailStatus.data.hasAppPassword, false);

  const state = await request('/api/state');
  assert.equal(state.response.status, 200, logs);
  state.data.commercialProposals = [{
    id: 'proposal_test', code: 'PROP-2026-0001', status: 'VALIDADA', clientName: 'Client', clientEmail: 'client@example.com',
    pax: 2, menuName: 'Menú prova', menuSummary: 'Plat 1', pricePerPerson: 50, totalAmount: 100
  }];
  const saved = await request('/api/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state.data) });
  assert.equal(saved.response.status, 200);

  const sendBeforeConfig = await request('/api/commercial-proposals/proposal_test/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(sendBeforeConfig.response.status, 503);
  assert.match(sendBeforeConfig.data.error, /Configurar correu|configurat/i);

  const badGmail = await request('/api/commercial-email-config', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'gmail', appPassword: 'curta', email: 'restaurant@gmail.com' })
  });
  assert.equal(badGmail.response.status, 400);
  assert.match(badGmail.data.error, /16 caràcters/);

  const configured = await request('/api/commercial-email-config', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'gmail', appPassword: 'abcd efgh ijkl mnop', email: 'restaurant@gmail.com', name: 'Restaurant Prova', replyTo: 'direccio@example.com' })
  });
  assert.equal(configured.response.status, 200, logs);
  assert.equal(configured.data.configured, true);
  assert.equal(configured.data.provider, 'gmail');
  assert.equal(configured.data.from, 'restaurant@gmail.com');
  assert.equal(configured.data.hasAppPassword, true);
  assert.equal(configured.data.source, 'stored');
  assert.equal(Object.prototype.hasOwnProperty.call(configured.data, 'appPassword'), false, 'La contrasenya no s’ha de retornar mai al navegador');

  const configPath = path.join(dataDir, 'commercial-email.json');
  assert.ok(fs.existsSync(configPath), 'La configuració s’ha de desar al directori persistent');
  const persisted = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(persisted.provider, 'gmail');
  assert.equal(persisted.appPassword, 'abcdefghijklmnop');
  assert.equal(persisted.email, 'restaurant@gmail.com');

  const statusAfter = await request('/api/commercial-email-status');
  assert.equal(statusAfter.response.status, 200);
  assert.equal(statusAfter.data.configured, true);
  assert.equal(statusAfter.data.appPasswordMasked, '•••• •••• •••• ••••');

  const keepPassword = await request('/api/commercial-email-config', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'gmail', appPassword: '', email: 'restaurant@gmail.com', name: 'Restaurant Prova 2' })
  });
  assert.equal(keepPassword.response.status, 200);
  const persistedAgain = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(persistedAgain.appPassword, 'abcdefghijklmnop', 'Deixar el camp buit ha de conservar la contrasenya actual');

  const invalidResendGmail = await request('/api/commercial-email-config', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'resend', apiKey: 're_test_1234567890', email: 'restaurant@gmail.com' })
  });
  assert.equal(invalidResendGmail.response.status, 400);
  assert.match(invalidResendGmail.data.error, /gmail\.com/i);

  console.log('OK commercial-server.test.js');
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(() => {
  child.kill('SIGTERM');
  fs.rmSync(dataDir, { recursive: true, force: true });
});
