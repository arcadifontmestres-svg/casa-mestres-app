'use strict';

const express = require('express');

function createGovernRouter(govern) {
  const router = express.Router();

  router.get('/catalog', (_req, res) => {
    res.json({ items: govern.functionCatalog });
  });

  router.get('/centres', (req, res, next) => {
    try {
      const items = govern.listCenters({ includeInactive: req.query.includeInactive === '1' })
        .map(item => ({ ...item, permissions: govern.getPermissions(item.id).functions }));
      res.json({ items, functions: govern.functionKeys, catalog: govern.functionCatalog });
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

  router.post('/centres/:id/regenerar-activacio', (req, res, next) => {
    try { res.json(govern.regenerateActivationCode(req.params.id)); }
    catch (error) { next(error); }
  });

  router.put('/centres/:id/permisos', (req, res, next) => {
    try { res.json(govern.setPermissions(req.params.id, req.body)); }
    catch (error) { next(error); }
  });

  router.post('/activate-center', (req, res, next) => {
    try { res.json(govern.activateCenterDevice(req.body || {})); }
    catch (error) { next(error); }
  });

  router.get('/center-session', (req, res) => {
    const token = String(req.headers['x-center-device-token'] || '');
    const session = govern.centerByDeviceToken(token);
    if (!session) return res.status(401).json({ error: 'Dispositiu no vinculat.' });
    res.json(session);
  });

  router.get('/center-module/:key', (req, res) => {
    const token = String(req.headers['x-center-device-token'] || '');
    const session = govern.centerByDeviceToken(token);
    if (!session) return res.status(401).json({ error: 'Dispositiu no vinculat.' });
    const key = String(req.params.key || '');
    if (session.permissions?.[key] !== true) return res.status(403).json({ error: 'Aquest centre no té permís per aquest mòdul.' });
    const module = govern.functionCatalog.find(item => item.key === key);
    if (!module || module.connected === false) return res.status(404).json({ error: 'Mòdul no disponible.' });
    res.json({ ok: true, center: session.center, module });
  });

  router.get('/employees', (req, res) => {
    res.json({ items: govern.listEmployees({ includeInactive: req.query.includeInactive === '1' }) });
  });

  router.get('/employees/:id', (req, res) => {
    const item = govern.getEmployee(req.params.id);
    if (!item) return res.status(404).json({ error: 'Empleat no trobat.' });
    res.json(item);
  });

  router.post('/employees', (req, res, next) => {
    try { res.status(201).json(govern.createEmployee(req.body)); }
    catch (error) { next(error); }
  });

  router.put('/employees/:id', (req, res, next) => {
    try { res.json(govern.updateEmployee(req.params.id, req.body)); }
    catch (error) { next(error); }
  });

  return router;
}

module.exports = { createGovernRouter };
