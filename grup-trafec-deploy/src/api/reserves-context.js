'use strict';

const express = require('express');
const { contextId, assertCenterFunction } = require('./center-access');

function createReservationContextRouter(reservations, links, govern) {
  const router = express.Router();

  router.get('/', (req, res, next) => {
    try {
      const centerId = contextId(req);
      assertCenterFunction(govern, centerId, 'reservations');
      const items = reservations.list({
        dateFrom: req.query.dateFrom || '',
        dateTo: req.query.dateTo || '',
        status: req.query.status || '',
        source: req.query.source || ''
      }).filter(item => links.has('reservation', item.id, centerId));
      res.json({ items, status: reservations.status });
    } catch (error) { next(error); }
  });

  router.post('/', (req, res, next) => {
    try {
      const centerId = contextId(req);
      assertCenterFunction(govern, centerId, 'reservations');
      const item = reservations.create(req.body);
      links.add('reservation', item.id, centerId);
      res.status(201).json(item);
    } catch (error) { next(error); }
  });

  router.put('/:id', (req, res, next) => {
    try {
      const centerId = contextId(req);
      assertCenterFunction(govern, centerId, 'reservations');
      if (centerId && !links.has('reservation', req.params.id, centerId)) return res.status(404).json({ error: 'Reserva no trobada.' });
      const item = reservations.update(req.params.id, req.body);
      links.add('reservation', item.id, centerId);
      res.json(item);
    } catch (error) { next(error); }
  });

  router.get('/ocupacio/resum', (req, res, next) => {
    try {
      const centerId = contextId(req);
      assertCenterFunction(govern, centerId, 'reservations');
      const raw = reservations.occupancy({ dateFrom: req.query.dateFrom || '', dateTo: req.query.dateTo || '' });
      const items = raw.reservations.filter(item => links.has('reservation', item.id, centerId));
      const blocks = raw.blocks.filter(item => links.has('occupancy', item.id, centerId));
      const confirmed = items.filter(item => item.status === reservations.status.CONFIRMED);
      res.json({
        reservations: items,
        blocks,
        totals: {
          reservations: items.length,
          confirmed: confirmed.length,
          paxConfirmed: confirmed.reduce((sum, item) => sum + Number(item.pax || 0), 0)
        }
      });
    } catch (error) { next(error); }
  });

  router.post('/ocupacio/bloquejos', (req, res, next) => {
    try {
      const centerId = contextId(req);
      assertCenterFunction(govern, centerId, 'reservations');
      const item = reservations.createBlock(req.body);
      links.add('occupancy', item.id, centerId);
      res.status(201).json(item);
    } catch (error) { next(error); }
  });

  return router;
}

module.exports = { createReservationContextRouter };
