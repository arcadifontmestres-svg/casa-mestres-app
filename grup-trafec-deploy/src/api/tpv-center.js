'use strict';

const express = require('express');
const crypto = require('crypto');

function createTpvCenterRouter(store, govern, miniappState) {
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
      business: {
        name: center.name || '',
        taxId: '',
        address: '',
        phone: '',
        logo: '',
        receiptFooter: ''
      },
      printer: {
        paperWidth: '80',
        printerName: '',
        autoPrint: false
      },
      updatedAt: null
    };
  }

  function legacyState(center) {
    const data = store.read();
    return {
      config: data.tpvConfigs.find(x => x.centerId === center.id) || defaultConfig(center),
      orders: (data.tpvOrders || []).filter(x => x.centerId === center.id),
      catalogConfigs: (data.tpvCatalogConfigs || []).filter(x => x.centerId === center.id)
    };
  }

  async function tpvState(center) {
    return miniappState.read('tpv', center.id, () => legacyState(center));
  }

  async function operationalCatalog(center) {
    let source = { dishes: [], saleItems: [], products: [] };
    try {
      const response = await fetch('https://grup-trafec-operatiu.onrender.com/api/tpv-catalog', {
        headers: {
          'X-Arcadi-Company-Id': 'company_grup_trafec',
          'X-Arcadi-Centre-Id': /sarriera/i.test(String(center.name || center.code || '')) ? 'restaurant_sarriera' : ''
        }
      });
      if (response.ok) source = await response.json();
    } catch {}
    return {
      dishes: Array.isArray(source.dishes) ? source.dishes : [],
      saleItems: Array.isArray(source.saleItems) ? source.saleItems : [],
      products: Array.isArray(source.products) ? source.products : []
    };
  }

  function applyPublication(item, cfg) {
    if (!cfg || cfg.active !== true) return null;
    return {
      ...item,
      name: cfg.label || item.name,
      family: cfg.family || item.family || 'ALTRES',
      price: Number(cfg.price ?? item.price ?? 0),
      zones: Array.isArray(cfg.zoneIds) ? cfg.zoneIds : [],
      sort: Number(cfg.sort || 0),
      onMenu: true
    };
  }

  router.get('/bootstrap', async (req, res, next) => {
    try {
      const s = session(req);
      const own = await tpvState(s.center);
      const source = await operationalCatalog(s.center);
      const published = Array.isArray(own.catalogConfigs) ? own.catalogConfigs.filter(x => x.active === true) : [];
      const byKey = new Map(published.map(x => [x.sourceType + ':' + x.sourceId, x]));
      const map = (items, sourceType) => (items || [])
        .map(item => applyPublication(item, byKey.get(sourceType + ':' + item.id)))
        .filter(Boolean)
        .sort((a,b)=>(a.sort||0)-(b.sort||0));
      res.json({
        center: s.center,
        config: own.config || defaultConfig(s.center),
        orders: own.orders || [],
        dishes: map(source.dishes, 'dish'),
        saleItems: map(source.saleItems, 'sale'),
        products: map(source.products, 'product'),
        persistent: miniappState.hasPersistentBackend()
      });
    } catch (error) { next(error); }
  });

  router.get('/admin/catalog', async (req, res, next) => {
    try {
      const centerId = String(req.query.centerId || '');
      const center = govern.getCenter(centerId);
      if (!center) return res.status(404).json({ error: 'Centre no trobat.' });
      const own = await tpvState(center);
      const source = await operationalCatalog(center);
      const saved = Array.isArray(own.catalogConfigs) ? own.catalogConfigs : [];
      const configByKey = new Map(saved.map(x => [x.sourceType + ':' + x.sourceId, x]));
      const items = [
        ...(source.dishes || []).map(item => ({ ...item, sourceType:'dish' })),
        ...(source.saleItems || []).map(item => ({ ...item, sourceType:'sale' })),
        ...(source.products || []).map(item => ({ ...item, sourceType:'product' }))
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
      res.json({
        center,
        tpvConfig: own.config || defaultConfig(center),
        items,
        persistent: miniappState.hasPersistentBackend()
      });
    } catch (error) { next(error); }
  });

  router.put('/admin/catalog/:centerId', async (req, res, next) => {
    try {
      const centerId = String(req.params.centerId || '');
      const center = govern.getCenter(centerId);
      if (!center) return res.status(404).json({ error:'Centre no trobat.' });
      const input = req.body || {};
      const items = Array.isArray(input.items) ? input.items : [];
      await miniappState.update('tpv', centerId, () => legacyState(center), state => {
        state.catalogConfigs = [];
        for (const item of items) {
          if (!item.sourceId || !['dish','sale','product'].includes(item.sourceType)) continue;
          state.catalogConfigs.push({
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

  router.put('/config', async (req, res, next) => {
    try {
      const s = session(req);
      const input = req.body && typeof req.body === 'object' ? req.body : {};
      let saved;
      await miniappState.update('tpv', s.center.id, () => legacyState(s.center), state => {
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
        const previous = state.config || defaultConfig(s.center);
        saved = {
          centerId: s.center.id,
          zones,
          familyOrder: Array.isArray(input.familyOrder) ? input.familyOrder.map(String).slice(0,80) : (previous.familyOrder || []),
          business: {
            name: String(input.business?.name ?? previous.business?.name ?? s.center.name ?? '').slice(0,160),
            taxId: String(input.business?.taxId ?? previous.business?.taxId ?? '').slice(0,80),
            address: String(input.business?.address ?? previous.business?.address ?? '').slice(0,240),
            phone: String(input.business?.phone ?? previous.business?.phone ?? '').slice(0,80),
            logo: String(input.business?.logo ?? previous.business?.logo ?? '').slice(0,1500000),
            receiptFooter: String(input.business?.receiptFooter ?? previous.business?.receiptFooter ?? '').slice(0,500)
          },
          printer: {
            paperWidth: ['58','80'].includes(String(input.printer?.paperWidth)) ? String(input.printer.paperWidth) : String(previous.printer?.paperWidth || '80'),
            printerName: String(input.printer?.printerName ?? previous.printer?.printerName ?? '').slice(0,160),
            autoPrint: input.printer?.autoPrint === true
          },
          updatedAt: new Date().toISOString()
        };
        state.config = saved;
        if (!Array.isArray(state.orders)) state.orders = [];
        if (!Array.isArray(state.catalogConfigs)) state.catalogConfigs = [];
      });
      res.json(saved);
    } catch (error) { next(error); }
  });

  router.post('/orders', async (req, res, next) => {
    try {
      const s = session(req);
      const input = req.body || {};
      let order;
      await miniappState.update('tpv', s.center.id, () => legacyState(s.center), state => {
        if (!Array.isArray(state.orders)) state.orders = [];
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
        state.orders.push(order);
      });
      res.status(201).json(order);
    } catch (error) { next(error); }
  });

  router.put('/orders/:id', async (req, res, next) => {
    try {
      const s = session(req);
      let saved;
      await miniappState.update('tpv', s.center.id, () => legacyState(s.center), state => {
        if (!Array.isArray(state.orders)) state.orders = [];
        const order = state.orders.find(x => x.id === req.params.id && x.centerId === s.center.id);
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
          price: Math.max(0, Number(line.price) || 0),
          notes: String(line.notes || '').slice(0,300)
        }));
        if (order.status === 'closed' && !order.closedAt) order.closedAt = new Date().toISOString();
        order.updatedAt = new Date().toISOString();
        saved = { ...order };
      });
      res.json(saved);
    } catch (error) { next(error); }
  });

  router.get('/shared-layout', async (req, res, next) => {
    try {
      const s = session(req);
      const own = await tpvState(s.center);
      res.json({
        centerId: s.center.id,
        zones: own.config?.zones || [],
        updatedAt: own.config?.updatedAt || null
      });
    } catch (error) { next(error); }
  });

  return router;
}

module.exports = { createTpvCenterRouter };
