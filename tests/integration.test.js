const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'casa-mestres-test-'));
fs.copyFileSync(path.join(root, 'data.json'), path.join(dataDir, 'data.json'));

const port = 37000 + Math.floor(Math.random() * 1000);
const base = `http://127.0.0.1:${port}`;
const credentials = `Basic ${Buffer.from('arcadi:test-password').toString('base64')}`;
const child = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: String(port),
    NO_OPEN: '1',
    NODE_ENV: 'test',
    STRIPE_TEST_MODE: 'mock',
    STRIPE_SECRET_KEY: 'mock_key_used_only_by_tests',
    STRIPE_WEBHOOK_SECRET: 'mock_webhook_secret_used_only_by_tests',
    APP_BASE_URL: base,
    ADMIN_USER: 'arcadi',
    ADMIN_PASSWORD: 'test-password',
    DATA_DIR: dataDir
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
  let data = {};
  try { data = JSON.parse(text); } catch { data = { text }; }
  return { response, data };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const { response } = await request('/api/health');
      if (response.ok) return;
    } catch {}
    await wait(100);
  }
  throw new Error(`El servidor de prova no ha arrencat.\n${logs}`);
}

async function main() {
  await waitForServer();

  const health = await request('/api/health');
  assert.equal(health.response.status, 200);
  assert.equal(health.data.stripeConfigured, true);
  assert.equal(health.data.adminConfigured, true);

  const unauthorized = await request('/api/state');
  assert.equal(unauthorized.response.status, 401);

  const authorized = await request('/api/state', { headers: { Authorization: credentials } });
  assert.equal(authorized.response.status, 200);
  assert.ok(Array.isArray(authorized.data.reservations));

  const config = await request('/api/reservation-config');
  assert.equal(config.response.status, 200);
  assert.ok(config.data.menus.length > 0);
  assert.equal(config.data.config.maxPax, 10);

  const future = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const payload = {
    date: future,
    time: '21:00',
    pax: 2,
    zone: 'Sala principal',
    menuId: config.data.menus[0].id,
    name: 'Prova Automàtica Casa Mestres',
    phone: '600000000',
    email: 'prova@example.com',
    notes: '',
    marketing: false,
    termsAccepted: true
  };

  const tooMany = await request('/api/reservations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, pax: 11, name: 'Grup massa gran' })
  });
  assert.equal(tooMany.response.status, 400);

  const created = await request('/api/reservations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  assert.equal(created.response.status, 200);
  assert.match(created.data.checkoutUrl, /^https:\/\/checkout\.stripe\.test\//);
  assert.equal(created.data.reservation.status, 'Pendent pagament');
  assert.ok(created.data.reservation.manageToken);

  const duplicate = await request('/api/reservations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, pax: 1 })
  });
  assert.equal(duplicate.response.status, 409);

  const sessionId = created.data.reservation.stripeSessionId;
  const confirmed = await request(`/api/stripe/confirm?session_id=${encodeURIComponent(sessionId)}`);
  assert.equal(confirmed.response.status, 200);
  assert.equal(confirmed.data.paid, true);
  assert.equal(confirmed.data.reservation.status, 'Confirmada');
  assert.equal(confirmed.data.reservation.paymentStatus, 'pagat');

  const second = await request('/api/reservations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, name: 'Represa Pagament', email: 'represa@example.com' })
  });
  assert.equal(second.response.status, 200);
  const resumed = await request('/api/reservations/resume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reservationId: second.data.reservation.id, token: second.data.reservation.manageToken })
  });
  assert.equal(resumed.response.status, 200);
  assert.match(resumed.data.checkoutUrl, /^https:\/\/checkout\.stripe\.test\//);

  const resumedSessionId = resumed.data.checkoutUrl.split('/').pop();
  const webhookBody = JSON.stringify({
    type: 'checkout.session.completed',
    data: { object: {
      id: resumedSessionId,
      payment_status: 'paid',
      payment_intent: 'pi_mock_webhook',
      metadata: { reservation_id: second.data.reservation.id }
    } }
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHmac('sha256', 'mock_webhook_secret_used_only_by_tests')
    .update(`${timestamp}.${webhookBody}`)
    .digest('hex');
  const webhook = await request('/api/stripe/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${timestamp},v1=${signature}` },
    body: webhookBody
  });
  assert.equal(webhook.response.status, 200);

  const afterWebhook = await request('/api/state', { headers: { Authorization: credentials } });
  const webhookReservation = afterWebhook.data.reservations.find(item => item.id === second.data.reservation.id);
  assert.equal(webhookReservation.status, 'Confirmada');
  assert.equal(webhookReservation.paymentStatus, 'pagat');

  const status = await request(`/api/reservations/${encodeURIComponent(second.data.reservation.id)}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: credentials },
    body: JSON.stringify({ status: 'Cancel·lada' })
  });
  assert.equal(status.response.status, 200);
  assert.equal(status.data.reservation.status, 'Cancel·lada');

  console.log('OK · salut, protecció Back Office, límit 10, duplicats, Stripe, retorn, webhook i represa');
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
