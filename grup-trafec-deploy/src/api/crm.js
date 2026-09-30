'use strict';

const express = require('express');

function createCrmRouter(crm) {
  const router = express.Router();

  router.get('/contacts', (req, res, next) => {
    try {
      res.json({
        items: crm.list({
          includeInactive: req.query.includeInactive === '1',
          q: req.query.q || ''
        }),
        segments: crm.segments
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/contacts/:id', (req, res, next) => {
    try {
      const contact = crm.get(req.params.id);
      if (!contact) return res.status(404).json({ error: 'Contacte CRM no trobat.' });
      res.json(contact);
    } catch (error) {
      next(error);
    }
  });

  router.post('/contacts', (req, res, next) => {
    try {
      res.status(201).json(crm.create(req.body));
    } catch (error) {
      next(error);
    }
  });

  router.put('/contacts/:id', (req, res, next) => {
    try {
      res.json(crm.update(req.params.id, req.body));
    } catch (error) {
      next(error);
    }
  });

  router.patch('/contacts/:id', (req, res, next) => {
    try {
      res.json(crm.update(req.params.id, req.body));
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createCrmRouter };
