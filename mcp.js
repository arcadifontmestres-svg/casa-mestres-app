'use strict';

let sdkPromise;

function loadSdk() {
  if (!sdkPromise) {
    sdkPromise = Promise.all([
      import('@modelcontextprotocol/sdk/server/mcp.js'),
      import('@modelcontextprotocol/sdk/server/streamableHttp.js'),
      import('zod')
    ]).then(([mcp, transport, zod]) => ({
      McpServer: mcp.McpServer,
      StreamableHTTPServerTransport: transport.StreamableHTTPServerTransport,
      z: zod.z
    }));
  }
  return sdkPromise;
}

async function createArcadiMcpServer(getStatus) {
  const { McpServer, z } = await loadSdk();
  const server = new McpServer({
    name: 'arcadi-gestio-restaurant',
    version: '0.1.0'
  }, {
    instructions: 'Connector privat d’ARCADI GESTIO RESTAURANT. Aquesta primera versió només comprova la connexió i no retorna dades operatives.'
  });

  server.registerTool(
    'get_system_status',
    {
      title: 'Comprovar connexió amb ARCADI',
      description: 'Comprova que ChatGPT pot comunicar-se amb el servidor d’ARCADI GESTIO RESTAURANT. No consulta ni modifica dades del restaurant.',
      inputSchema: {},
      outputSchema: {
        ok: z.boolean(),
        app: z.string(),
        connectorVersion: z.string(),
        serverTime: z.string()
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false
      },
      securitySchemes: [{ type: 'noauth' }]
    },
    async () => {
      const status = getStatus();
      return {
        content: [{
          type: 'text',
          text: status.ok
            ? 'Connexió correcta amb ARCADI GESTIO RESTAURANT.'
            : 'ARCADI GESTIO RESTAURANT no està disponible.'
        }],
        structuredContent: status
      };
    }
  );

  return server;
}

async function handleMcpRequest(req, res, getStatus) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, authorization, mcp-session-id, mcp-protocol-version',
      'Access-Control-Expose-Headers': 'Mcp-Session-Id'
    });
    res.end();
    return;
  }

  if (!['POST', 'GET', 'DELETE'].includes(req.method || '')) {
    res.writeHead(405, { Allow: 'POST, GET, DELETE, OPTIONS' });
    res.end('Method Not Allowed');
    return;
  }

  const { StreamableHTTPServerTransport } = await loadSdk();
  const mcpServer = await createArcadiMcpServer(getStatus);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
  res.on('close', () => {
    transport.close();
    mcpServer.close();
  });

  try {
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error('Error MCP:', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Error intern del connector MCP' }));
    }
  }
}

module.exports = { handleMcpRequest };
