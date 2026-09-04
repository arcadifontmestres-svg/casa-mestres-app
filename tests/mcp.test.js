const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcadi-mcp-test-'));
const port = 39000 + Math.floor(Math.random() * 500);
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: String(port),
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

async function main() {
  await waitForServer();
  const [{ Client }, { StreamableHTTPClientTransport }] = await Promise.all([
    import('@modelcontextprotocol/sdk/client/index.js'),
    import('@modelcontextprotocol/sdk/client/streamableHttp.js')
  ]);
  const client = new Client({ name: 'arcadi-local-test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`));

  await client.connect(transport);
  const listed = await client.listTools();
  const tool = listed.tools.find(item => item.name === 'get_system_status');
  assert.ok(tool, 'El connector ha d’exposar get_system_status');
  assert.equal(tool.annotations.readOnlyHint, true);

  const called = await client.callTool({ name: 'get_system_status', arguments: {} });
  assert.equal(called.structuredContent.ok, true);
  assert.equal(called.structuredContent.app, 'ARCADI GESTIO RESTAURANT');
  assert.match(called.content[0].text, /Connexió correcta/);
  await client.close();
  console.log('OK · MCP inicialitza, publica eines i respon sense exposar dades');
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
