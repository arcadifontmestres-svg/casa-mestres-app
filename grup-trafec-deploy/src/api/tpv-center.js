'use strict';

const express = require('express');
const crypto = require('crypto');

function createTpvCenterRouter(store, govern) {
  const router = express.Router();

  function session(req) {
    const token = String(req.headers['x-center-device-token'] || '');
    const s = govern.centerByDeviceToken(token);
    if (!s) {
      const error = new Error('Dispositiu no vinculat.');
      error.status = 401;
      throw error;
    }
    if (s.permissions?.front_office_tpv !== true) {
      const error = new Error('Aquest centre no té permís de Front Office / TPV.');
      error.status = 403;
      throw error;
    }
    return s;
  }

  function defaultConfig(center) {
    return {
      centerId: center.id,
      zones: [],
      familyOrder: [],
      updatedAt: null
    };
  }

  router.get('/bootstrap', async (req, res, next) => {
    try {
      const s = session(req);
      const data = store.read();
      const config = data.tpvConfigs.find(x => x.centerId === s.center.id) || defaultConfig(s.center);
      const orders = (data.tpvOrders || []).filter(x => x.centerId === s.center.id);
      let catalog = { saleItems: [], dishes: [] };
      try {
        const response = await fetch('https://grup-trafec-operatiu.onrender.com/api/tpv-catalog', {
          headers: {
            'X-Arcadi-Company-Id': 'company_grup_trafec',
            'X-Arcadi-Centre-Id': /sarriera/i.test(String(s.center.name || s.center.code || '')) ? 'restaurant_sarriera' : ''
          }
        });
        if (response.ok) {
          const state = await response.json();
          catalog = {
            saleItems: Array.isArray(state.saleItems) ? state.saleItems : [],
            dishes: Array.isArray(state.dishes) ? state.dishes : []
          };
        }
      } catch {}
      const published = (data.tpvCatalogConfigs || []).filter(x => x.centerId === s.center.id && x.active === true);
      const byKey = new Map(published.map(x => [x.sourceType + ':' + x.sourceId, x]));
      const apply = item => {
        const sourceType = item.type === 'dish' ? 'dish' : 'sale';
        const cfg = byKey.get(sourceType + ':' + item.id);
        if (!cfg) return null;
        return {
          ...item,
          name: cfg.label || item.name,
          family: cfg.family || item.family || 'ALTRES',
          price: Number(cfg.price ?? item.price ?? 0),
          zones: Array.isArray(cfg.zoneIds) ? cfg.zoneIds : [],
          sort: Number(cfg.sort || 0),
          onMenu: true
        };
      };
      catalog = {
        dishes: (catalog.dishes || []).map(apply).filter(Boolean).sort((a,b)=>(a.sort||0)-(b.sort||0)),
        saleItems: (catalog.saleItems || []).map(apply).filter(Boolean).sort((a,b)=>(a.sort||0)-(b.sort||0))
      };
      res.json({ center: s.center, config, orders, ...catalog });
    } catch (error) { next(error); }
  });

  router.get('/admin/catalog', async (req, res, next) => {
    try {
      const centerId = String(req.query.centerId || '');
      const center = govern.getCenter(centerId);
      if (!center) return res.status(404).json({ error: 'Centre no trobat.' });
      const data = store.read();
      let source = { dishes: [], saleItems: [] };
      try {
        const response = await fetch('https://grup-trafec-operatiu.onrender.com/api/tpv-catalog', {
          headers: {
            'X-Arcadi-Company-Id': 'company_grup_trafec',
            'X-Arcadi-Centre-Id': /sarriera/i.test(String(center.name || center.code || '')) ? 'restaurant_sarriera' : ''
          }
        });
        if (response.ok) source = await response.json();
      } catch {}
      const saved = (data.tpvCatalogConfigs || []).filter(x => x.centerId === centerId);
      const configByKey = new Map(saved.map(x => [x.sourceType + ':' + x.sourceId, x]));
      const items = [
        ...(source.dishes || []).map(item => ({ ...item, sourceType:'dish' })),
        ...(source.saleItems || []).map(item => ({ ...item, sourceType:'sale' }))
      ].map(item => ({
        ...item,
        config: configByKey.get(item.sourceType + ':' + item.id) || {
          active: item.onMenu === true,
          label: item.name || '',
          family: item.family || '',
          price: Number(item.price || 0),
          zoneIds: Array.isArray(item.zones) ? item.zones : [],
          sort: 0
        }
      }));
      const tpvConfig = data.tpvConfigs.find(x => x.centerId === centerId) || defaultConfig(center);
      res.json({ center, tpvConfig, items });
    } catch (error) { next(error); }
  });

  router.put('/admin/catalog/:centerId', (req, res, next) => {
    try {
      const centerId = String(req.params.centerId || '');
      if (!govern.getCenter(centerId)) return res.status(404).json({ error:'Centre no trobat.' });
      const input = req.body || {};
      const items = Array.isArray(input.items) ? input.items : [];
      store.update(data => {
        data.tpvCatalogConfigs = (data.tpvCatalogConfigs || []).filter(x => x.centerId !== centerId);
        for (const item of items) {
          if (!item.sourceId || !['dish','sale'].includes(item.sourceType)) continue;
          data.tpvCatalogConfigs.push({
            centerId,
            sourceType: item.sourceType,
            sourceId: String(item.sourceId),
            active: item.active === true,
            label: String(item.label || '').slice(0,200),
            family: String(item.family || '').slice(0,120),
            price: Math.max(0, Number(item.price) || 0),
            zoneIds: Array.isArray(item.zoneIds) ? item.zoneIds.map(String).slice(0,50) : [],
            sort: Number(item.sort || 0),
            updatedAt: new Date().toISOString()
          });
        }
      });
      res.json({ ok:true });
    } catch (error) { next(error); }
  });

  router.put('/config', (req, res, next) => {
    try {
      const s = session(req);
      const input = req.body && typeof req.body === 'object' ? req.body : {};
      let saved;
      store.update(data => {
        const zones = Array.isArray(input.zones) ? input.zones.map(zone => ({
          id: String(zone.id || '').trim().slice(0,80),
          name: String(zone.name || '').trim().slice(0,120),
          tables: Array.isArray(zone.tables) ? zone.tables.map(table => ({
            id: String(table.id || '').trim().slice(0,80),
            name: String(table.name || '').trim().slice(0,120),
            min: Math.max(1, Number(table.min) || 1),
            max: Math.max(1, Number(table.max) || Number(table.min) || 1)
          })).filter(x => x.id && x.name) : []
        })).filter(x => x.id && x.name) : [];
        saved = {
          centerId: s.center.id,
          zones,
          familyOrder: Array.isArray(input.familyOrder) ? input.familyOrder.map(String).slice(0,80) : [],
          updatedAt: new Date().toISOString()
        };
        const i = data.tpvConfigs.findIndex(x => x.centerId === s.center.id);
        if (i < 0) data.tpvConfigs.push(saved);
        else data.tpvConfigs[i] = saved;
      });
      res.json(saved);
    } catch (error) { next(error); }
  });

  router.post('/orders', (req, res, next) => {
    try {
      const s = session(req);
      const input = req.body || {};
      let order;
      store.update(data => {
        order = {
          id: 'ord_' + crypto.randomUUID(),
          centerId: s.center.id,
          zone: String(input.zone || ''),
          tableId: String(input.tableId || ''),
          tableName: String(input.tableName || ''),
          pax: Math.max(1, Number(input.pax) || 1),
          status: 'open',
          lines: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        data.tpvOrders.push(order);
      });
      res.status(201).json(order);
    } catch (error) { next(error); }
  });

  router.put('/orders/:id', (req, res, next) => {
    try {
      const s = session(req);
      let saved;
      store.update(data => {
        const order = data.tpvOrders.find(x => x.id === req.params.id && x.centerId === s.center.id);
        if (!order) {
          const error = new Error('Comanda no trobada.');
          error.status = 404;
          throw error;
        }
        const input = req.body || {};
        if (input.pax != null) order.pax = Math.max(1, Number(input.pax) || 1);
        if (input.status != null) order.status = String(input.status);
        if (Array.isArray(input.lines)) order.lines = input.lines.slice(0,500).map(line => ({
          key: String(line.key || ''),
          type: String(line.type || ''),
          itemId: String(line.itemId || ''),
          name: String(line.name || '').slice(0,200),
          qty: Math.max(0, Number(line.qty) || 0),
          price: Math.max(0, Number(line.price) || 0)
        }));
        if (order.status === 'closed' && !order.closedAt) order.closedAt = new Date().toISOString();
        order.updatedAt = new Date().toISOString();
        saved = { ...order };
      });
      res.json(saved);
    } catch (error) { next(error); }
  });

  return router;
}

module.exports = { createTpvCenterRouter };
