const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcadi-mcp-test-'));
const port = 39000 + Math.floor(Math.random() * 500);
const base = `http://127.0.0.1:${port}`;
const resource = `${base}/mcp`;
const redirectUri = `${base}/oauth-test-callback`;
const child = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: String(port),
    APP_BASE_URL: base,
    NO_OPEN: '1',
    DATA_DIR: dataDir,
    ADMIN_USER: 'arcadi',
    ADMIN_PASSWORD: 'test-password'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let logs = '';
child.stdout.on('data', chunk => { logs += chunk; });
child.stderr.on('data', chunk => { logs += chunk; });

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch {}
    await wait(100);
  }
  throw new Error(`El servidor MCP de prova no ha arrencat.\n${logs}`);
}

async function formPost(url, values, options = {}) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(values),
    ...options
  });
}

async function registerOAuthClient() {
  const response = await fetch(`${base}/oauth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'ChatGPT test',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: 'arcadi.read arcadi.write'
    })
  });
  assert.equal(response.status, 201);
  return response.json();
}

async function authorize(clientId) {
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const url = new URL(`${base}/oauth/authorize`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', 'arcadi.read arcadi.write');
  url.searchParams.set('state', 'state-test-123');
  url.searchParams.set('resource', resource);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');

  const page = await fetch(url);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Connectar amb ChatGPT/);
  const requestToken = html.match(/name="request" value="([^"]+)"/)?.[1];
  assert.ok(requestToken, 'El formulari OAuth ha de contenir la petició signada');

  const denied = await formPost(`${base}/oauth/authorize`, {
    request: requestToken,
    decision: 'allow',
    username: 'arcadi',
    password: 'incorrecta'
  });
  assert.equal(denied.status, 401);
  assert.match(await denied.text(), /incorrectes/);

  const accepted = await formPost(`${base}/oauth/authorize`, {
    request: requestToken,
    decision: 'allow',
    username: 'arcadi',
    password: 'test-password'
  }, { redirect: 'manual' });
  assert.equal(accepted.status, 302);
  const callback = new URL(accepted.headers.get('location'));
  assert.equal(callback.origin + callback.pathname, redirectUri);
  assert.equal(callback.searchParams.get('state'), 'state-test-123');
  assert.equal(callback.searchParams.get('iss'), base);
  const code = callback.searchParams.get('code');
  assert.ok(code);
  return { code, verifier };
}

async function exchangeCode(clientId, code, verifier) {
  const response = await formPost(`${base}/oauth/token`, {
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri,
    resource
  });
  assert.equal(response.status, 200);
  const tokens = await response.json();
  assert.equal(tokens.token_type, 'Bearer');
  assert.equal(tokens.expires_in, 3600);
  assert.match(tokens.scope, /arcadi\.read/);
  assert.ok(tokens.access_token);
  assert.ok(tokens.refresh_token);
  return tokens;
}

async function main() {
  await waitForServer();

  const resourceMetadata = await fetch(`${base}/.well-known/oauth-protected-resource`).then(response => response.json());
  assert.equal(resourceMetadata.resource, resource);
  assert.deepEqual(resourceMetadata.authorization_servers, [base]);
  assert.ok(resourceMetadata.scopes_supported.includes('arcadi.write'));

  const authMetadata = await fetch(`${base}/.well-known/oauth-authorization-server`).then(response => response.json());
  assert.equal(authMetadata.issuer, base);
  assert.deepEqual(authMetadata.code_challenge_methods_supported, ['S256']);
  assert.equal(authMetadata.token_endpoint_auth_methods_supported[0], 'none');

  const clientInfo = await registerOAuthClient();
  const { code, verifier } = await authorize(clientInfo.client_id);
  const tokens = await exchangeCode(clientInfo.client_id, code, verifier);

  const replay = await formPost(`${base}/oauth/token`, {
    grant_type: 'authorization_code',
    client_id: clientInfo.client_id,
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri,
    resource
  });
  assert.equal(replay.status, 400);
  assert.equal((await replay.json()).error, 'invalid_grant');

  const refresh = await formPost(`${base}/oauth/token`, {
    grant_type: 'refresh_token',
    client_id: clientInfo.client_id,
    refresh_token: tokens.refresh_token,
    resource
  });
  assert.equal(refresh.status, 200);
  assert.ok((await refresh.json()).access_token);

  const [{ Client }, { StreamableHTTPClientTransport }] = await Promise.all([
    import('@modelcontextprotocol/sdk/client/index.js'),
    import('@modelcontextprotocol/sdk/client/streamableHttp.js')
  ]);

  const anonymousClient = new Client({ name: 'arcadi-anonymous-test', version: '1.0.0' });
  const anonymousTransport = new StreamableHTTPClientTransport(new URL(resource));
  await anonymousClient.connect(anonymousTransport);
  const listed = await anonymousClient.listTools();
  assert.deepEqual(
    listed.tools.map(item => item.name).sort(),
    ['create_purchase_order', 'get_daily_status', 'get_system_status', 'list_kitchen_bases', 'list_products', 'list_purchases', 'list_reservations', 'record_daily_entry', 'update_daily_entry', 'update_purchase_order', 'upsert_kitchen_base', 'upsert_product'].sort()
  );
  const statusTool = listed.tools.find(item => item.name === 'get_system_status');
  const writeTool = listed.tools.find(item => item.name === 'record_daily_entry');
  assert.equal(statusTool.annotations.readOnlyHint, true);
  assert.equal(writeTool.annotations.readOnlyHint, false);
  assert.deepEqual(writeTool._meta.securitySchemes, [{ type: 'oauth2', scopes: ['arcadi.write'] }]);

  const status = await anonymousClient.callTool({ name: 'get_system_status', arguments: {} });
  assert.equal(status.structuredContent.ok, true);
  assert.equal(status.structuredContent.connectorVersion, '0.5.1');
  const blocked = await anonymousClient.callTool({ name: 'get_daily_status', arguments: { date: '2026-09-05' } });
  assert.equal(blocked.isError, true);
  assert.ok(blocked._meta['mcp/www_authenticate'][0].includes('error="insufficient_scope"'));
  await anonymousClient.close();

  const authorizedClient = new Client({ name: 'arcadi-authorized-test', version: '1.0.0' });
  const authorizedTransport = new StreamableHTTPClientTransport(new URL(resource), {
    requestInit: { headers: { Authorization: `Bearer ${tokens.access_token}` } }
  });
  await authorizedClient.connect(authorizedTransport);

  const products = await authorizedClient.callTool({
    name: 'list_products',
    arguments: { query: 'Pastanaga' }
  });
  assert.equal(products.structuredContent.count, 1);
  assert.equal(products.structuredContent.items[0].price, 0);
  assert.equal(products.structuredContent.items[0].stock, 0);

  const purchaseInput = {
    requestId: 'test-compra-20260908-001',
    date: '2026-09-08',
    supplier: 'Proveïdor de prova',
    responsible: 'Arcadi',
    lines: [{ productId: products.structuredContent.items[0].id, requested: '5 kg', observations: 'Per al servei' }]
  };
  const createdPurchase = await authorizedClient.callTool({ name: 'create_purchase_order', arguments: purchaseInput });
  assert.equal(createdPurchase.structuredContent.created, true);
  assert.match(createdPurchase.structuredContent.purchaseOrder.code, /^GS-COMP-20260908-001$/);
  assert.equal(createdPurchase.structuredContent.purchaseOrder.status, 'Preparada');
  assert.equal(createdPurchase.structuredContent.purchaseOrder.lineItems[0].product, 'Pastanaga');
  assert.equal(createdPurchase.structuredContent.goodsReceipt.code, 'GS-REC-20260908-001');
  assert.equal(createdPurchase.structuredContent.goodsReceipt.status, 'Pendent de recepció');
  assert.equal(createdPurchase.structuredContent.goodsReceipt.lineItems[0].product, 'Pastanaga');
  assert.equal(createdPurchase.structuredContent.goodsReceipt.lineItems[0].ok, false);
  assert.equal(createdPurchase.structuredContent.traceabilityRecords.length, 1);
  assert.equal(createdPurchase.structuredContent.traceabilityRecords[0].code, 'GS-TRAC-20260908-001');
  assert.equal(createdPurchase.structuredContent.traceabilityRecords[0].status, 'Pendent de recepció');
  assert.equal(createdPurchase.structuredContent.appccReceipt.gs_comp, 'GS-COMP-20260908-001');
  assert.equal(createdPurchase.structuredContent.appccReceipt.gs_rec, 'GS-REC-20260908-001');
  assert.equal(createdPurchase.structuredContent.appccReceipt.gs_trac, 'GS-TRAC-20260908-001');
  assert.equal(createdPurchase.structuredContent.appccReceipt.estat, 'Pendent de recepció');
  assert.equal(createdPurchase.structuredContent.appccReceipt.validacio, 'Pendent');
  const repeatedPurchase = await authorizedClient.callTool({ name: 'create_purchase_order', arguments: purchaseInput });
  assert.equal(repeatedPurchase.structuredContent.created, false);
  assert.equal(repeatedPurchase.structuredContent.purchaseOrder.id, createdPurchase.structuredContent.purchaseOrder.id);
  assert.equal(repeatedPurchase.structuredContent.goodsReceipt.id, createdPurchase.structuredContent.goodsReceipt.id);
  assert.equal(repeatedPurchase.structuredContent.traceabilityRecords.length, 1);
  assert.equal(repeatedPurchase.structuredContent.appccReceipt.id, createdPurchase.structuredContent.appccReceipt.id);

  const updatedPurchase = await authorizedClient.callTool({
    name: 'update_purchase_order',
    arguments: {
      requestId: 'test-compra-20260908-actualitza-001',
      id: createdPurchase.structuredContent.purchaseOrder.id,
      status: 'Enviada'
    }
  });
  assert.equal(updatedPurchase.structuredContent.updated, true);
  assert.equal(updatedPurchase.structuredContent.purchaseOrder.status, 'Enviada');
  const listedPurchases = await authorizedClient.callTool({
    name: 'list_purchases', arguments: { date_from: '2026-09-08', date_to: '2026-09-08' }
  });
  assert.equal(listedPurchases.structuredContent.purchaseOrders.length, 1);
  assert.equal(listedPurchases.structuredContent.purchaseOrders[0].status, 'Enviada');
  assert.equal(listedPurchases.structuredContent.goodsReceipts.length, 1);
  assert.equal(listedPurchases.structuredContent.goodsReceipts[0].traceabilityCode, 'GS-TRAC-20260908-001');

  const kitchenBases = await authorizedClient.callTool({
    name: 'list_kitchen_bases',
    arguments: { sourceFile: '37357.jpg' }
  });
  assert.equal(kitchenBases.structuredContent.count, 1);
  assert.equal(kitchenBases.structuredContent.items[0].name, 'Beixamel');
  assert.equal(kitchenBases.structuredContent.items[0].baseUses[0].name, 'Roux blanc');

  const createdProduct = await authorizedClient.callTool({
    name: 'upsert_product',
    arguments: {
      requestId: 'test-producte-20260907-001',
      name: 'Producte prova sense preu',
      family: 'Altres',
      unit: 'kg'
    }
  });
  assert.equal(createdProduct.structuredContent.created, true);
  assert.equal(createdProduct.structuredContent.product.price, 0);
  assert.equal(createdProduct.structuredContent.product.pricePending, true);
  const repeatedProduct = await authorizedClient.callTool({
    name: 'upsert_product',
    arguments: {
      requestId: 'test-producte-20260907-001',
      name: 'Producte prova sense preu',
      family: 'Altres',
      unit: 'kg'
    }
  });
  assert.equal(repeatedProduct.structuredContent.created, false);
  assert.equal(repeatedProduct.structuredContent.updated, false);

  const reservations = await authorizedClient.callTool({
    name: 'list_reservations',
    arguments: { date_from: '2026-08-01', date_to: '2026-08-31' }
  });
  assert.equal(reservations.structuredContent.count, 2);
  assert.equal('manageToken' in reservations.structuredContent.items[0], false);
  assert.equal('stripeSessionId' in reservations.structuredContent.items[0], false);

  const input = {
    requestId: 'test-opening-20260905-001',
    date: '2026-09-05',
    type: 'opening',
    description: 'Obertura de Sarriera comprovada',
    status: 'Completat',
    actualTime: '07:45'
  };
  const created = await authorizedClient.callTool({ name: 'record_daily_entry', arguments: input });
  assert.equal(created.structuredContent.created, true);
  assert.equal(created.structuredContent.entry.actualTime, '07:45');
  const repeated = await authorizedClient.callTool({ name: 'record_daily_entry', arguments: input });
  assert.equal(repeated.structuredContent.created, false);
  assert.equal(repeated.structuredContent.entry.id, created.structuredContent.entry.id);

  const daily = await authorizedClient.callTool({ name: 'get_daily_status', arguments: { date: '2026-09-05' } });
  assert.equal(daily.structuredContent.totals.dailyOperations, 1);
  assert.equal(daily.structuredContent.dailyOperations[0].description, 'Obertura de Sarriera comprovada');

  const updated = await authorizedClient.callTool({
    name: 'update_daily_entry',
    arguments: {
      requestId: 'test-closing-20260905-001',
      id: created.structuredContent.entry.id,
      status: 'Completat',
      closingNotes: 'Comprovació final correcta'
    }
  });
  assert.equal(updated.structuredContent.updated, true);
  assert.equal(updated.structuredContent.entry.closingNotes, 'Comprovació final correcta');

  await authorizedClient.close();
  console.log('OK · OAuth 2.1 + PKCE, eines privades i escriptura idempotent verificats');
}

main()
  .catch(error => {
    console.error(error.stack || error);
    console.error(logs);
    process.exitCode = 1;
  })
  .finally(() => {
    child.kill('SIGTERM');
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
