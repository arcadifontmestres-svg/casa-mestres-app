'use strict';

const express = require('express');

function createReservationRouter(reservations) {
  const router = express.Router();

  router.get('/', (req, res, next) => {
    try {
      res.json({
        items: reservations.list({
          dateFrom: req.query.dateFrom || '',
          dateTo: req.query.dateTo || '',
          status: req.query.status || '',
          source: req.query.source || ''
        }),
        status: reservations.status
      });
    } catch (error) { next(error); }
  });

  router.post('/', (req, res, next) => {
    try { res.status(201).json(reservations.create(req.body)); }
    catch (error) { next(error); }
  });

  router.put('/:id', (req, res, next) => {
    try { res.json(reservations.update(req.params.id, req.body)); }
    catch (error) { next(error); }
  });

  router.get('/ocupacio/resum', (req, res, next) => {
    try { res.json(reservations.occupancy({ dateFrom: req.query.dateFrom || '', dateTo: req.query.dateTo || '' })); }
    catch (error) { next(error); }
  });

  router.post('/ocupacio/bloquejos', (req, res, next) => {
    try { res.status(201).json(reservations.createBlock(req.body)); }
    catch (error) { next(error); }
  });

  return router;
}

module.exports = { createReservationRouter };
