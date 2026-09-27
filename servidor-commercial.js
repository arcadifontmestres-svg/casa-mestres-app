'use strict';

// Compatibilitat amb el Start Command configurat actualment a Render.
// Manté exactament la mateixa seqüència d'arrencada que `npm start` / startup-copy.js.
const { applyStartupCopy } = require('./startup-copy.js');
const { applySarrieraKitchenIntegration } = require('./sarriera-integration-migration.js');
const { scheduleFirstStory } = require('./first-instagram-story.js');

applyStartupCopy();
applySarrieraKitchenIntegration();
require('./commercial-brand.js');
require('./instagram-server.js');
applyStartupCopy();
scheduleFirstStory();
