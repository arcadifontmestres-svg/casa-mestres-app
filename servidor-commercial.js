'use strict';

// Compatibilitat amb el Start Command configurat actualment a Render.
// Manté exactament la mateixa seqüència d'arrencada que `npm start` / startup-copy.js.
const { applyStartupCopy } = require('./startup-copy.js');
const { applySarrieraKitchenIntegration } = require('./sarriera-integration-migration.js');
const { scheduleFirstStory } = require('./first-instagram-story.js');
const { scheduleRadioVilafrancaInstagram } = require('./radio-instagram-publish.js');

applyStartupCopy();
applySarrieraKitchenIntegration();
require('./commercial-brand.js');
require('./botons-server.js');
applyStartupCopy();
scheduleFirstStory();
scheduleRadioVilafrancaInstagram();
