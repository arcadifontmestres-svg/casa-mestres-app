'use strict';

const express = require('express');
const crypto = require('crypto');

function createReservesCenterRouter(store, govern, links, miniappState) {
  const router = express.Router();

  function session(req) {
    const token = String(req.headers['x-center-device-token'] || '');
    const s = govern.centerByDeviceToken(token);
    if (!s) {
      const error = new Error('Dispositiu no vinculat.');
      error.status = 401;
      throw error;
    }
    if (s.permissions?.reservations !== true) {
      const error = new Error('Aquest centre no té permís de Reserves.');
      error.status = 403;
      throw error;
    }
    return s;
  }

  function legacyState(center) {
    const data = store.read();
    return {
      config: {
        centerId: center.id,
        maxPax: 10,
        groupPhone: '',
        cancellationPolicy: '',
        currency: 'EUR',
        stripe: { enabled: false, mode: 'disabled' },
        updatedAt: null
      },
      reservations: (data.reservations || []).filter(x => links.has('reservation', x.id, center.id)),
      occupancyBlocks: (data.occupancyBlocks || []).filter(x => links.has('occupancy', x.id, center.id)),
      offers: []
    };
  }

  async function own(center) {
    return miniappState.read('reserves', center.id, () => legacyState(center));
  }

  function nextCode(items) {
    const year = new Date().getFullYear();
    let max = 0;
    const re = new RegExp('^RES-' + year + '-(\\d+)$');
    for (const item of items || []) {
      const m = String(item.code || '').match(re);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return 'RES-' + year + '-' + String(max + 1).padStart(4, '0');
  }

  router.get('/bootstrap', async (req, res, next) => {
    try {
      const s = session(req);
      const state = await own(s.center);
      const tpv = await miniappState.read('tpv', s.center.id, () => ({ config: { zones: [] } }));
      res.json({
        center: s.center,
        config: state.config || {},
        reservations: state.reservations || [],
        occupancyBlocks: state.occupancyBlocks || [],
        offers: state.offers || [],
        layout: { zones: tpv.config?.zones || [] },
        persistent: miniappState.hasPersistentBackend()
      });
    } catch (error) { next(error); }
  });

  router.post('/reservations', async (req, res, next) => {
    try {
      const s = session(req);
      const input = req.body || {};
      if (!String(input.date || '').trim() || !String(input.name || '').trim()) {
        return res.status(400).json({ error: 'La reserva necessita data i nom.' });
      }
      let item;
      await miniappState.update('reserves', s.center.id, () => legacyState(s.center), state => {
        state.reservations = state.reservations || [];
        const now = new Date().toISOString();
        item = {
          id: 'reservation_' + crypto.randomUUID(),
          code: nextCode(state.reservations),
          centerId: s.center.id,
          date: String(input.date || '').trim(),
          time: String(input.time || '').trim(),
          pax: Math.max(1, Number(input.pax) || 1),
          name: String(input.name || '').trim(),
          phone: String(input.phone || '').trim(),
          email: String(input.email || '').trim(),
          zoneId: String(input.zoneId || '').trim(),
          tableId: String(input.tableId || '').trim(),
          offerId: String(input.offerId || '').trim(),
          notes: String(input.notes || '').trim(),
          source: String(input.source || 'MANUAL'),
          status: String(input.status || 'CONFIRMADA'),
          paymentStatus: String(input.paymentStatus || 'NO_REQUERIT'),
          stripePaymentIntentId: String(input.stripePaymentIntentId || ''),
          createdAt: now,
          updatedAt: now
        };
        state.reservations.push(item);
      });
      res.status(201).json(item);
    } catch (error) { next(error); }
  });

  router.put('/reservations/:id', async (req, res, next) => {
    try {
      const s = session(req);
      let saved;
      await miniappState.update('reserves', s.center.id, () => legacyState(s.center), state => {
        state.reservations = state.reservations || [];
        const item = state.reservations.find(x => x.id === req.params.id);
        if (!item) {
          const error = new Error('Reserva no trobada.');
          error.status = 404;
          throw error;
        }
        const input = req.body || {};
        for (const key of ['date','time','name','phone','email','zoneId','tableId','offerId','notes','status','paymentStatus','stripePaymentIntentId']) {
          if (input[key] != null) item[key] = String(input[key]);
        }
        if (input.pax != null) item.pax = Math.max(1, Number(input.pax) || 1);
        item.updatedAt = new Date().toISOString();
        saved = { ...item };
      });
      res.json(saved);
    } catch (error) { next(error); }
  });

  router.put('/config', async (req, res, next) => {
    try {
      const s = session(req);
      let saved;
      await miniappState.update('reserves', s.center.id, () => legacyState(s.center), state => {
        const current = state.config || {};
        const input = req.body || {};
        saved = {
          ...current,
          centerId: s.center.id,
          maxPax: Math.max(1, Number(input.maxPax ?? current.maxPax ?? 10) || 10),
          groupPhone: String(input.groupPhone ?? current.groupPhone ?? '').slice(0,80),
          cancellationPolicy: String(input.cancellationPolicy ?? current.cancellationPolicy ?? '').slice(0,2000),
          currency: String(input.currency ?? current.currency ?? 'EUR').toUpperCase().slice(0,3),
          stripe: {
            enabled: input.stripe?.enabled === true,
            mode: ['disabled','test','live'].includes(String(input.stripe?.mode)) ? String(input.stripe.mode) : String(current.stripe?.mode || 'disabled')
          },
          updatedAt: new Date().toISOString()
        };
        state.config = saved;
      });
      res.json(saved);
    } catch (error) { next(error); }
  });

  router.put('/offers', async (req, res, next) => {
    try {
      const s = session(req);
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      await miniappState.update('reserves', s.center.id, () => legacyState(s.center), state => {
        state.offers = items.slice(0,300).map(x => ({
          id: String(x.id || crypto.randomUUID()),
          type: String(x.type || 'MENU'),
          name: String(x.name || '').slice(0,200),
          description: String(x.description || '').slice(0,1000),
          price: Math.max(0, Number(x.price) || 0),
          depositType: ['fixed','percent'].includes(String(x.depositType)) ? String(x.depositType) : 'fixed',
          depositValue: Math.max(0, Number(x.depositValue) || 0),
          active: x.active !== false,
          updatedAt: new Date().toISOString()
        }));
      });
      res.json({ ok:true });
    } catch (error) { next(error); }
  });

  return router;
}

module.exports = { createReservesCenterRouter };
