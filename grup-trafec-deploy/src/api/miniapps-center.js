'use strict';

const express = require('express');
const crypto = require('crypto');

function createMiniappsCenterRouter(govern, miniappState) {
  const router = express.Router();
  const definitions = {
    cuina: {
      permission: 'gestio_cuina',
      collections: ['recipes','productions','needs'],
      empty: center => ({ centerId:center.id, recipes:[], productions:[], needs:[], updatedAt:null })
    },
    appcc: {
      permission: 'control_normatiu',
      collections: ['receptions','productions','cleaning','incidents'],
      empty: center => ({ centerId:center.id, receptions:[], productions:[], cleaning:[], incidents:[], updatedAt:null })
    }
  };

  function getSession(req, app) {
    const def = definitions[app];
    if (!def) {
      const error = new Error('Miniapp no disponible.');
      error.status = 404;
      throw error;
    }
    const token = String(req.headers['x-center-device-token'] || '');
    const s = govern.centerByDeviceToken(token);
    if (!s) {
      const error = new Error('Dispositiu no vinculat.');
      error.status = 401;
      throw error;
    }
    if (s.permissions?.[def.permission] !== true) {
      const error = new Error('Aquest centre no té permís per aquesta miniapp.');
      error.status = 403;
      throw error;
    }
    return { s, def };
  }

  function cleanInput(input) {
    return {
      name: String(input?.name || '').slice(0,200),
      date: String(input?.date || '').slice(0,30),
      status: String(input?.status || '').slice(0,80),
      quantity: Number(input?.quantity || 0),
      unit: String(input?.unit || '').slice(0,40),
      notes: String(input?.notes || '').slice(0,1000),
      lot: String(input?.lot || '').slice(0,120),
      temperature: input?.temperature == null ? null : Number(input.temperature)
    };
  }

  router.get('/:app/bootstrap', async (req, res, next) => {
    try {
      const app = String(req.params.app || '');
      const { s, def } = getSession(req, app);
      const state = await miniappState.read(app, s.center.id, () => def.empty(s.center));
      res.json({ center:s.center, state, persistent:miniappState.hasPersistentBackend() });
    } catch (error) { next(error); }
  });

  router.post('/:app/:collection', async (req, res, next) => {
    try {
      const app = String(req.params.app || '');
      const collection = String(req.params.collection || '');
      const { s, def } = getSession(req, app);
      if (!def.collections.includes(collection)) return res.status(404).json({ error:'Col·lecció no disponible.' });
      let item;
      await miniappState.update(app, s.center.id, () => def.empty(s.center), state => {
        if (!Array.isArray(state[collection])) state[collection] = [];
        const now = new Date().toISOString();
        item = {
          id: collection + '_' + crypto.randomUUID(),
          centerId: s.center.id,
          ...cleanInput(req.body),
          createdAt: now,
          updatedAt: now
        };
        state[collection].push(item);
        state.updatedAt = now;
      });
      res.status(201).json(item);
    } catch (error) { next(error); }
  });

  router.put('/:app/:collection/:id', async (req, res, next) => {
    try {
      const app = String(req.params.app || '');
      const collection = String(req.params.collection || '');
      const { s, def } = getSession(req, app);
      if (!def.collections.includes(collection)) return res.status(404).json({ error:'Col·lecció no disponible.' });
      let saved;
      await miniappState.update(app, s.center.id, () => def.empty(s.center), state => {
        if (!Array.isArray(state[collection])) state[collection] = [];
        const index = state[collection].findIndex(item => item.id === req.params.id);
        if (index < 0) {
          const error = new Error('Registre no trobat.');
          error.status = 404;
          throw error;
        }
        const now = new Date().toISOString();
        saved = { ...state[collection][index], ...cleanInput(req.body), updatedAt:now };
        state[collection][index] = saved;
        state.updatedAt = now;
      });
      res.json(saved);
    } catch (error) { next(error); }
  });

  return router;
}

module.exports = { createMiniappsCenterRouter };
