'use strict';

const express = require('express');
const path = require('path');
const { createStore } = require('./dades/store');
const { createCrmService } = require('./funcions/crm');
const { createReservationService } = require('./funcions/reserves');
const { createCommercialService } = require('./funcions/comercial');
const { createGovernService } = require('./govern/centres');
const { createCenterLinks } = require('./govern/center-links');
const { createGovernRouter } = require('./api/govern');
const { createCrmContextRouter } = require('./api/crm-context');
const { createCommercialContextRouter } = require('./api/comercial-context');
const { createReservationContextRouter } = require('./api/reserves-context');

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, '..', 'public');

const store = createStore();
const crm = createCrmService(store);
const reservations = createReservationService(store);
const commercial = createCommercialService(store, crm, reservations);
const govern = createGovernService(store);
const links = createCenterLinks(store);

app.use(express.json({ limit: '2mb' }));
app.use(express.static(publicDir));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: 'GRUP TRÀFEC', version: '0.8.0' });
});

app.use('/api/govern', createGovernRouter(govern));
app.use('/api/crm', createCrmContextRouter(crm, links, govern));
app.use('/api/comercial', createCommercialContextRouter(commercial, links, govern));
app.use('/api/reserves', createReservationContextRouter(reservations, links, govern));

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status || 500).json({ error: error.message || 'Error intern.' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`GRUP TRÀFEC actiu al port ${PORT}`);
  });
}

module.exports = { app, store, crm, reservations, commercial, govern, links };
