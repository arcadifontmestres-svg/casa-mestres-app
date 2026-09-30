'use strict';

const express = require('express');

function createCommercialRouter(commercial) {
  const router = express.Router();

  router.get('/proposals', (req, res, next) => {
    try {
      res.json({
        items: commercial.list({ status: req.query.status || '', clientId: req.query.clientId || '' }),
        status: commercial.status
      });
    } catch (error) { next(error); }
  });

  router.get('/proposals/:id', (req, res, next) => {
    try {
      const item = commercial.get(req.params.id);
      if (!item) return res.status(404).json({ error: 'Proposta comercial no trobada.' });
      res.json(item);
    } catch (error) { next(error); }
  });

  router.post('/proposals', (req, res, next) => {
    try { res.status(201).json(commercial.create(req.body)); }
    catch (error) { next(error); }
  });

  router.put('/proposals/:id', (req, res, next) => {
    try { res.json(commercial.update(req.params.id, req.body)); }
    catch (error) { next(error); }
  });

  router.patch('/proposals/:id/status', (req, res, next) => {
    try { res.json(commercial.setStatus(req.params.id, req.body.status)); }
    catch (error) { next(error); }
  });

  return router;
}

module.exports = { createCommercialRouter };
