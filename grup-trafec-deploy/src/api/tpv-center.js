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
        receiptFooter: '',
        vatRate: 10
      },
      printer: {
        profile: 'generic_escpos_80',
        mode: 'browser',
        paperWidth: '80',
        printerName: '',
        autoPrint: false,
        usbVendorId: '',
        usbProductId: '',
        bridgeUrl: ''
      },
      kitchenPrinter: {
        profile: 'generic_escpos_80',
        mode: 'browser',
        paperWidth: '80',
        printerName: '',
        autoPrint: true,
        usbVendorId: '',
        usbProductId: '',
        bridgeUrl: ''
      },
      peripherals: {
        cashDrawer: { enabled:false, connection:'printer', device:'' },
        paymentTerminal: { enabled:false, connection:'network', device:'', provider:'' },
        automaticCash: { enabled:false, connection:'network', device:'', provider:'' },
        barcodeScanner: { enabled:false, connection:'usb', device:'', mode:'keyboard' },
        extraDevices: []
      },
      updatedAt: null
    };
  }

  function legacyState(center) {
    const data = store.read();
    return {
      config: data.tpvConfigs.find(x => x.centerId === center.id) || defaultConfig(center),
      orders: (data.tpvOrders || []).filter(x => x.centerId === center.id),
      catalogConfigs: (data.tpvCatalogConfigs || []).filter(x => x.centerId === center.id),
      tickets: [],
      cashSessions: [],
      counters: { ticket: 0 }
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
      image: String(cfg.image || item.image || ''),
      buttonColor: String(cfg.buttonColor || ''),
      kitchenPrint: cfg.kitchenPrint == null ? cfg.sourceType === 'dish' : cfg.kitchenPrint === true,
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
      const s = session(req);
      const centerId = s.center.id;
      const center = s.center;
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
          sort: 0,
          image: item.image || '',
          buttonColor: '',
          kitchenPrint: item.sourceType === 'dish'
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
      const s = session(req);
      const centerId = s.center.id;
      if (String(req.params.centerId || '') !== centerId) return res.status(403).json({ error:'Aquest dispositiu no pot configurar un altre centre.' });
      const center = s.center;
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
            image: String(item.image || '').slice(0,1500000),
            buttonColor: String(item.buttonColor || '').slice(0,32),
            kitchenPrint: item.kitchenPrint == null ? item.sourceType === 'dish' : item.kitchenPrint === true,
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
        const previous = state.config || defaultConfig(s.center);
        const zones = Array.isArray(input.zones) ? input.zones.map(zone => ({
          id: String(zone.id || '').trim().slice(0,80),
          name: String(zone.name || '').trim().slice(0,120),
          tables: Array.isArray(zone.tables) ? zone.tables.map(table => ({
            id: String(table.id || '').trim().slice(0,80),
            name: String(table.name || '').trim().slice(0,120),
            min: Math.max(1, Number(table.min) || 1),
            max: Math.max(1, Number(table.max) || Number(table.min) || 1)
          })).filter(x => x.id && x.name) : []
        })).filter(x => x.id && x.name) : (previous.zones || []);
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
            receiptFooter: String(input.business?.receiptFooter ?? previous.business?.receiptFooter ?? '').slice(0,500),
            vatRate: Math.max(0, Math.min(30, Number(input.business?.vatRate ?? previous.business?.vatRate ?? 10) || 10))
          },
          printer: {
            mode: ['browser','webusb','bridge'].includes(String(input.printer?.mode)) ? String(input.printer.mode) : String(previous.printer?.mode || 'browser'),
            paperWidth: ['58','80'].includes(String(input.printer?.paperWidth)) ? String(input.printer.paperWidth) : String(previous.printer?.paperWidth || '80'),
            printerName: String(input.printer?.printerName ?? previous.printer?.printerName ?? '').slice(0,160),
            autoPrint: input.printer?.autoPrint == null ? previous.printer?.autoPrint === true : input.printer.autoPrint === true,
            usbVendorId: String(input.printer?.usbVendorId ?? previous.printer?.usbVendorId ?? '').slice(0,32),
            usbProductId: String(input.printer?.usbProductId ?? previous.printer?.usbProductId ?? '').slice(0,32),
            bridgeUrl: String(input.printer?.bridgeUrl ?? previous.printer?.bridgeUrl ?? '').slice(0,240)
          },
          kitchenPrinter: {
            mode: ['browser','webusb','bridge'].includes(String(input.kitchenPrinter?.mode)) ? String(input.kitchenPrinter.mode) : String(previous.kitchenPrinter?.mode || 'browser'),
            paperWidth: ['58','80'].includes(String(input.kitchenPrinter?.paperWidth)) ? String(input.kitchenPrinter.paperWidth) : String(previous.kitchenPrinter?.paperWidth || '80'),
            printerName: String(input.kitchenPrinter?.printerName ?? previous.kitchenPrinter?.printerName ?? '').slice(0,160),
            autoPrint: input.kitchenPrinter?.autoPrint == null ? previous.kitchenPrinter?.autoPrint !== false : input.kitchenPrinter.autoPrint !== false,
            usbVendorId: String(input.kitchenPrinter?.usbVendorId ?? previous.kitchenPrinter?.usbVendorId ?? '').slice(0,32),
            usbProductId: String(input.kitchenPrinter?.usbProductId ?? previous.kitchenPrinter?.usbProductId ?? '').slice(0,32),
            bridgeUrl: String(input.kitchenPrinter?.bridgeUrl ?? previous.kitchenPrinter?.bridgeUrl ?? '').slice(0,240)
          },
          peripherals: {
            cashDrawer: {
              enabled: input.peripherals?.cashDrawer?.enabled == null ? previous.peripherals?.cashDrawer?.enabled === true : input.peripherals.cashDrawer.enabled === true,
              connection: String(input.peripherals?.cashDrawer?.connection ?? previous.peripherals?.cashDrawer?.connection ?? 'printer').slice(0,40),
              device: String(input.peripherals?.cashDrawer?.device ?? previous.peripherals?.cashDrawer?.device ?? '').slice(0,160)
            },
            paymentTerminal: {
              enabled: input.peripherals?.paymentTerminal?.enabled == null ? previous.peripherals?.paymentTerminal?.enabled === true : input.peripherals.paymentTerminal.enabled === true,
              connection: String(input.peripherals?.paymentTerminal?.connection ?? previous.peripherals?.paymentTerminal?.connection ?? 'network').slice(0,40),
              device: String(input.peripherals?.paymentTerminal?.device ?? previous.peripherals?.paymentTerminal?.device ?? '').slice(0,160),
              provider: String(input.peripherals?.paymentTerminal?.provider ?? previous.peripherals?.paymentTerminal?.provider ?? '').slice(0,120)
            },
            automaticCash: {
              enabled: input.peripherals?.automaticCash?.enabled == null ? previous.peripherals?.automaticCash?.enabled === true : input.peripherals.automaticCash.enabled === true,
              connection: String(input.peripherals?.automaticCash?.connection ?? previous.peripherals?.automaticCash?.connection ?? 'network').slice(0,40),
              device: String(input.peripherals?.automaticCash?.device ?? previous.peripherals?.automaticCash?.device ?? '').slice(0,160),
              provider: String(input.peripherals?.automaticCash?.provider ?? previous.peripherals?.automaticCash?.provider ?? '').slice(0,120)
            },
            barcodeScanner: {
              enabled: input.peripherals?.barcodeScanner?.enabled == null ? previous.peripherals?.barcodeScanner?.enabled === true : input.peripherals.barcodeScanner.enabled === true,
              connection: String(input.peripherals?.barcodeScanner?.connection ?? previous.peripherals?.barcodeScanner?.connection ?? 'usb').slice(0,40),
              device: String(input.peripherals?.barcodeScanner?.device ?? previous.peripherals?.barcodeScanner?.device ?? '').slice(0,160),
              mode: String(input.peripherals?.barcodeScanner?.mode ?? previous.peripherals?.barcodeScanner?.mode ?? 'keyboard').slice(0,40)
            },
            extraDevices: Array.isArray(input.peripherals?.extraDevices)
              ? input.peripherals.extraDevices.slice(0,30).map(x => ({
                  id: String(x.id || crypto.randomUUID()).slice(0,80),
                  name: String(x.name || '').slice(0,120),
                  type: String(x.type || '').slice(0,80),
                  connection: String(x.connection || '').slice(0,40),
                  device: String(x.device || '').slice(0,160),
                  enabled: x.enabled !== false
                }))
              : (previous.peripherals?.extraDevices || [])
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
          kitchenPrintCount: 0,
          kitchenSentAt: null,
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
        if (input.status != null) {
          order.status = String(input.status);
          if (order.status === 'sent') order.kitchenSentAt = new Date().toISOString();
        }
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

  router.post('/orders/:id/kitchen', async (req, res, next) => {
    try {
      const s = session(req);
      let payload;
      await miniappState.update('tpv', s.center.id, () => legacyState(s.center), state => {
        state.orders = state.orders || [];
        const order = state.orders.find(x => x.id === req.params.id && x.centerId === s.center.id);
        if (!order) {
          const error = new Error('Comanda no trobada.');
          error.status = 404;
          throw error;
        }
        order.kitchenPrintCount = Number(order.kitchenPrintCount || 0) + 1;
        order.kitchenSentAt = new Date().toISOString();
        order.status = 'sent';
        order.updatedAt = order.kitchenSentAt;
        const cfgByKey = new Map((state.catalogConfigs || []).map(x => [x.sourceType + ':' + x.sourceId, x]));
        const kitchenLines = (order.lines || []).filter(line => {
          const cfg = cfgByKey.get(String(line.type || '') + ':' + String(line.itemId || ''));
          return cfg ? (cfg.kitchenPrint == null ? cfg.sourceType === 'dish' : cfg.kitchenPrint === true) : String(line.type || '') === 'dish';
        });
        payload = {
          orderId: order.id,
          tableName: order.tableName,
          pax: order.pax,
          zone: order.zone,
          lines: kitchenLines,
          skippedLines: (order.lines || []).length - kitchenLines.length,
          sentAt: order.kitchenSentAt,
          printNumber: order.kitchenPrintCount
        };
      });
      res.json(payload);
    } catch (error) { next(error); }
  });

  router.get('/backoffice', async (req, res, next) => {
    try {
      const s = session(req);
      const own = await tpvState(s.center);
      const from = String(req.query.from || '').slice(0,10);
      const to = String(req.query.to || '').slice(0,10);
      const day = value => String(value || '').slice(0,10);
      const tickets = (own.tickets || []).filter(t => (!from || day(t.createdAt) >= from) && (!to || day(t.createdAt) <= to));
      const byPayment = {};
      const byDay = {};
      let total = 0;
      for (const t of tickets) {
        const amount = Number(t.total || 0);
        total += amount;
        const method = t.paymentMethod || 'ALTRES';
        byPayment[method] = (byPayment[method] || 0) + amount;
        const d = day(t.createdAt);
        byDay[d] = (byDay[d] || 0) + amount;
      }
      res.json({
        config: own.config || defaultConfig(s.center),
        tickets,
        cashSessions: own.cashSessions || [],
        openCash: (own.cashSessions || []).find(x => !x.closedAt) || null,
        summary: {
          total,
          ticketCount: tickets.length,
          averageTicket: tickets.length ? total / tickets.length : 0,
          byPayment,
          byDay
        }
      });
    } catch (error) { next(error); }
  });

  router.post('/cash/open', async (req, res, next) => {
    try {
      const s = session(req);
      let opened;
      await miniappState.update('tpv', s.center.id, () => legacyState(s.center), state => {
        state.cashSessions = state.cashSessions || [];
        const current = state.cashSessions.find(x => !x.closedAt);
        if (current) { opened = current; return; }
        opened = {
          id: 'cash_' + crypto.randomUUID(),
          centerId: s.center.id,
          openingAmount: Math.max(0, Number(req.body?.openingAmount) || 0),
          openedAt: new Date().toISOString(),
          closedAt: null
        };
        state.cashSessions.push(opened);
      });
      res.status(201).json(opened);
    } catch (error) { next(error); }
  });

  router.post('/cash/close', async (req, res, next) => {
    try {
      const s = session(req);
      let closed;
      await miniappState.update('tpv', s.center.id, () => legacyState(s.center), state => {
        state.cashSessions = state.cashSessions || [];
        state.tickets = state.tickets || [];
        const current = state.cashSessions.find(x => !x.closedAt);
        if (!current) {
          const error = new Error('No hi ha cap caixa oberta.');
          error.status = 400;
          throw error;
        }
        const tickets = state.tickets.filter(t => t.cashSessionId === current.id);
        const totals = {};
        for (const t of tickets) totals[t.paymentMethod || 'ALTRES'] = (totals[t.paymentMethod || 'ALTRES'] || 0) + Number(t.total || 0);
        current.closingAmount = Math.max(0, Number(req.body?.closingAmount) || 0);
        current.closedAt = new Date().toISOString();
        current.totals = totals;
        current.ticketCount = tickets.length;
        current.cashSales = Number(totals.EFECTIU || 0);
        current.expectedCash = Number(current.openingAmount || 0) + current.cashSales;
        current.cashDifference = current.closingAmount - current.expectedCash;
        closed = { ...current };
      });
      res.json(closed);
    } catch (error) { next(error); }
  });

  router.post('/payments', async (req, res, next) => {
    try {
      const s = session(req);
      let result;
      await miniappState.update('tpv', s.center.id, () => legacyState(s.center), state => {
        state.orders = state.orders || [];
        state.tickets = state.tickets || [];
        state.cashSessions = state.cashSessions || [];
        state.counters = state.counters || { ticket: 0 };
        const order = state.orders.find(x => x.id === String(req.body?.orderId || '') && x.centerId === s.center.id);
        if (!order) {
          const error = new Error('Comanda no trobada.');
          error.status = 404;
          throw error;
        }
        if (order.status === 'closed' && order.ticketId) {
          result = state.tickets.find(x => x.id === order.ticketId) || null;
          return;
        }
        const openCash = state.cashSessions.find(x => !x.closedAt) || null;
        if (!openCash) {
          const error = new Error('Cal obrir caixa abans de cobrar.');
          error.status = 409;
          throw error;
        }
        state.counters.ticket = Number(state.counters.ticket || 0) + 1;
        const year = new Date().getFullYear();
        const number = String(state.counters.ticket).padStart(6, '0');
        const total = (order.lines || []).reduce((sum,l)=>sum+(Number(l.qty)||0)*(Number(l.price)||0),0);
        const vatRate = Math.max(0, Number(state.config?.business?.vatRate || 10));
        const baseAmount = total / (1 + vatRate / 100);
        const vatAmount = total - baseAmount;
        const ticket = {
          id: 'ticket_' + crypto.randomUUID(),
          centerId: s.center.id,
          number: year + '-' + number,
          orderId: order.id,
          tableName: order.tableName,
          pax: order.pax,
          lines: order.lines || [],
          total,
          baseAmount,
          vatRate,
          vatAmount,
          business: { ...(state.config?.business || {}) },
          paymentMethod: String(req.body?.paymentMethod || 'EFECTIU').toUpperCase(),
          cashSessionId: openCash?.id || null,
          createdAt: new Date().toISOString()
        };
        state.tickets.push(ticket);
        order.status = 'closed';
        order.closedAt = ticket.createdAt;
        order.ticketId = ticket.id;
        order.paymentMethod = ticket.paymentMethod;
        result = ticket;
      });
      res.status(201).json(result);
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
