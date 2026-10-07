'use strict';

const express = require('express');
const path = require('path');
const { createStore } = require('./dades/store');
const { createMiniappState } = require('./dades/miniapp-state');
const { createCrmService } = require('./funcions/crm');
const { createReservationService } = require('./funcions/reserves');
const { createCommercialService } = require('./funcions/comercial');
const { createGovernService } = require('./govern/centres');
const { createCenterLinks } = require('./govern/center-links');
const { createGovernRouter } = require('./api/govern');
const { createCrmContextRouter } = require('./api/crm-context');
const { createCommercialContextRouter } = require('./api/comercial-context');
const { createReservationContextRouter } = require('./api/reserves-context');
const { createTpvCenterRouter } = require('./api/tpv-center');
const { createReservesCenterRouter } = require('./api/reserves-center');
const { createFitxatgesCenterRouter } = require('./api/fitxatges-center');
const { createMiniappsCenterRouter } = require('./api/miniapps-center');
const { createReservesPublicRouter } = require('./api/reserves-public');

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, '..', 'public');

const store = createStore();
const miniappState = createMiniappState({ legacyStore: store });
const crm = createCrmService(store);
const reservations = createReservationService(store);
const commercial = createCommercialService(store, crm, reservations);
const govern = createGovernService(store);
const links = createCenterLinks(store);

app.use(express.json({ limit: '2mb' }));
app.use(express.static(publicDir));

app.get('/api/health', async (_req, res) => {
  const persistent = await miniappState.probe().catch(() => false);
  res.json({ ok: true, app: 'DIRECCIÓ', version: '0.9.0', miniappsPersistent: persistent });
});

app.use('/api/govern', createGovernRouter(govern));
app.use('/api/crm', createCrmContextRouter(crm, links, govern));
app.use('/api/comercial', createCommercialContextRouter(commercial, links, govern));
app.use('/api/reserves', createReservationContextRouter(reservations, links, govern));
app.use('/api/tpv-center', createTpvCenterRouter(store, govern, miniappState));
app.use('/api/reserves-center', createReservesCenterRouter(store, govern, links, miniappState));
app.use('/api/fitxatges-center', createFitxatgesCenterRouter(govern, miniappState));
app.use('/api/miniapps-center', createMiniappsCenterRouter(govern, miniappState));
app.use('/api/reserves-public', createReservesPublicRouter(govern, miniappState));

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status || 500).json({ error: error.message || 'Error intern.' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`DIRECCIÓ activa al port ${PORT}`);
    miniappState.probe()
      .then(ok => console.log('MINIAPPS PERSISTÈNCIA:', ok ? 'OK' : 'NO DISPONIBLE'))
      .catch(error => console.error('MINIAPPS PERSISTÈNCIA:', error.message));
  });
}

module.exports = { app, store, miniappState, crm, reservations, commercial, govern, links };
