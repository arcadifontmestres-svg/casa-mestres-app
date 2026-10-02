'use strict';

const express = require('express');
const { contextId, assertCenterFunction } = require('./center-access');

function createCommercialContextRouter(commercial, links, govern) {
  const router = express.Router();

  router.get('/proposals', (req, res, next) => {
    try {
      const centerId = contextId(req);
      assertCenterFunction(govern, centerId, 'commercial');
      const items = commercial.list({ status: req.query.status || '', clientId: req.query.clientId || '' })
        .filter(item => links.has('commercial', item.id, centerId));
      res.json({ items, status: commercial.status });
    } catch (error) { next(error); }
  });

  router.get('/proposals/:id', (req, res, next) => {
    try {
      const centerId = contextId(req);
      assertCenterFunction(govern, centerId, 'commercial');
      const item = commercial.get(req.params.id);
      if (!item || !links.has('commercial', item.id, centerId)) return res.status(404).json({ error: 'Proposta comercial no trobada.' });
      res.json(item);
    } catch (error) { next(error); }
  });

  router.post('/proposals', (req, res, next) => {
    try {
      const centerId = contextId(req);
      assertCenterFunction(govern, centerId, 'commercial');
      const item = commercial.create(req.body);
      links.add('commercial', item.id, centerId);
      if (item.clientId) links.add('crm', item.clientId, centerId);
      res.status(201).json(item);
    } catch (error) { next(error); }
  });

  router.put('/proposals/:id', (req, res, next) => {
    try {
      const centerId = contextId(req);
      assertCenterFunction(govern, centerId, 'commercial');
      if (centerId && !links.has('commercial', req.params.id, centerId)) return res.status(404).json({ error: 'Proposta comercial no trobada.' });
      const item = commercial.update(req.params.id, req.body);
      links.add('commercial', item.id, centerId);
      if (item.clientId) links.add('crm', item.clientId, centerId);
      res.json(item);
    } catch (error) { next(error); }
  });

  router.patch('/proposals/:id/status', (req, res, next) => {
    try {
      const centerId = contextId(req);
      assertCenterFunction(govern, centerId, 'commercial');
      if (centerId && !links.has('commercial', req.params.id, centerId)) return res.status(404).json({ error: 'Proposta comercial no trobada.' });
      const item = commercial.setStatus(req.params.id, req.body.status);
      links.add('commercial', item.id, centerId);
      if (item.reservationId) links.add('reservation', item.reservationId, centerId);
      res.json(item);
    } catch (error) { next(error); }
  });

  return router;
}

module.exports = { createCommercialContextRouter };
