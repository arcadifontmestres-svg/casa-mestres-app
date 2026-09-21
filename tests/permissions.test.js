const fs = require('fs');
const assert = require('assert');

const app = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
const server = fs.readFileSync(require.resolve('../server.js'), 'utf8');

assert.match(app, /\['DIRECCIÓ','permissions','Matriu de permisos'\]/,
  'Falta Direcció → Matriu de permisos al menú');
assert.match(app, /const PERMISSION_LEVELS=\['C1','C2','C3','S1','S2','S3','Runner'\]/,
  'Falten nivells professionals');
assert.match(app, /const PERMISSION_ACTIONS=\['Consultar','Crear','Editar','Eliminar','Imprimir'\]/,
  'Falten accions de la matriu');
assert.match(app, /permissionAudit\.push\(/,
  'Falta historial de canvis de permisos');
assert.match(server, /'permissions', 'permissionAudit'/,
  'El servidor no normalitza permisos i historial');
assert.match(server, /if \(pathname === '\/api\/state' && req\.method === 'GET'\) \{\s*if \(!requireAdmin\(req, res\)\) return;/,
  'La lectura del Back Office no està protegida');
assert.match(server, /if \(pathname === '\/api\/state' && \['POST', 'PUT'\]\.includes\(req\.method\)\) \{\s*if \(!requireAdmin\(req, res\)\) return;/,
  'L\'escriptura del Back Office no està protegida');
assert.match(server, /const ADMIN_STATIC = new Set\(\['\/', '\/index\.html', '\/app\.js'/,
  'La pantalla principal no està reservada al Back Office');

console.log('Matriu de permisos: estructura, historial i protecció de Direcció verificats');
