'use strict';
/**
 * mcp.js — Model Context Protocol handler per a ARCADI Gestió
 * Gestiona les peticions MCP de l'aplicació.
 */

/**
 * Gestiona una petició MCP entrant.
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {object} data - Dades globals de l'aplicació
 * @param {Function} saveData - Funció per desar les dades
 */
function handleMcpRequest(req, res, data, saveData) {
  // Recollir el body de la petició
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    let parsed = {};
    try {
      parsed = body ? JSON.parse(body) : {};
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'JSON invàlid' }));
      return;
    }

    const method = String(parsed.method || '');

    // ── Mètodes suportats ──────────────────────────────────────────────────
    switch (method) {

      case 'ping':
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ result: 'pong', timestamp: new Date().toISOString() }));
        break;

      case 'getSchema':
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          result: {
            schema:  data.schema  || 'ARCADI_GESTIO_RESTAURANT_V1',
            version: data.version || '1.0.0',
            updatedAt: data.updatedAt || null
          }
        }));
        break;

      case 'getRestaurants':
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ result: data.restaurants || [] }));
        break;

      case 'getCompany':
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ result: data.company || {} }));
        break;

      default:
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: `Mètode MCP desconegut: "${method}"` }));
    }
  });
}

module.exports = { handleMcpRequest };