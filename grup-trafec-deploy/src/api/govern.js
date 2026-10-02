'use strict';

const express = require('express');

function createGovernRouter(govern) {
  const router = express.Router();

  router.get('/centres', (req, res, next) => {
    try {
      const items = govern.listCenters({ includeInactive: req.query.includeInactive === '1' })
        .map(item => ({ ...item, permissions: govern.getPermissions(item.id).functions }));
      res.json({ items, functions: govern.functionKeys });
    } catch (error) { next(error); }
  });

  router.get('/centres/:id', (req, res, next) => {
    try {
      const item = govern.getCenter(req.params.id);
      if (!item) return res.status(404).json({ error: 'Centre no trobat.' });
      res.json({ ...item, permissions: govern.getPermissions(item.id).functions });
    } catch (error) { next(error); }
  });

  router.post('/centres', (req, res, next) => {
    try { res.status(201).json(govern.createCenter(req.body)); }
    catch (error) { next(error); }
  });

  router.put('/centres/:id', (req, res, next) => {
    try { res.json(govern.updateCenter(req.params.id, req.body)); }
    catch (error) { next(error); }
  });

  router.get('/centres/:id/permisos', (req, res, next) => {
    try { res.json(govern.getPermissions(req.params.id)); }
    catch (error) { next(error); }
  });

  router.put('/centres/:id/permisos', (req, res, next) => {
    try { res.json(govern.setPermissions(req.params.id, req.body)); }
    catch (error) { next(error); }
  });

  return router;
}

module.exports = { createGovernRouter };
