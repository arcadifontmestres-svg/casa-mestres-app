'use strict';

const express = require('express');
const { contextId, assertCenterFunction } = require('./center-access');

function createCrmContextRouter(crm, links, govern) {
  const router = express.Router();

  router.get('/contacts', (req, res, next) => {
    try {
      const centerId = contextId(req);
      assertCenterFunction(govern, centerId, 'crm');
      const items = crm.list({ includeInactive: req.query.includeInactive === '1', q: req.query.q || '' })
        .filter(item => links.has('crm', item.id, centerId));
      res.json({ items, segments: crm.segments });
    } catch (error) { next(error); }
  });

  router.get('/contacts/:id', (req, res, next) => {
    try {
      const centerId = contextId(req);
      assertCenterFunction(govern, centerId, 'crm');
      const item = crm.get(req.params.id);
      if (!item || !links.has('crm', item.id, centerId)) return res.status(404).json({ error: 'Contacte CRM no trobat.' });
      res.json(item);
    } catch (error) { next(error); }
  });

  router.post('/contacts', (req, res, next) => {
    try {
      const centerId = contextId(req);
      assertCenterFunction(govern, centerId, 'crm');
      const item = crm.create(req.body);
      links.add('crm', item.id, centerId);
      res.status(201).json(item);
    } catch (error) { next(error); }
  });

  function update(req, res, next) {
    try {
      const centerId = contextId(req);
      assertCenterFunction(govern, centerId, 'crm');
      if (centerId && !links.has('crm', req.params.id, centerId)) return res.status(404).json({ error: 'Contacte CRM no trobat.' });
      const item = crm.update(req.params.id, req.body);
      links.add('crm', item.id, centerId);
      res.json(item);
    } catch (error) { next(error); }
  }

  router.put('/contacts/:id', update);
  router.patch('/contacts/:id', update);
  return router;
}

module.exports = { createCrmContextRouter };
