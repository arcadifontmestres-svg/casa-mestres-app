'use strict';

// Compatibilitat amb el Start Command configurat actualment a Render.
// Manté exactament la mateixa seqüència d'arrencada que `npm start` / startup-copy.js.
const { applyStartupCopy } = require('./startup-copy.js');

applyStartupCopy();
require('./commercial-brand.js');
require('./commercial-server.js');
applyStartupCopy();
