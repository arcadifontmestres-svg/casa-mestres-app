'use strict';

function contextId(req) {
  return String(req.query.centerId || '').trim();
}

function assertCenterFunction(govern, centerId, functionKey) {
  if (!centerId) return null;

  const center = govern.getCenter(centerId);
  if (!center || center.active === false) {
    const error = new Error('Centre no disponible.');
    error.status = 404;
    throw error;
  }

  const permissions = govern.getPermissions(centerId).functions || {};
  if (permissions[functionKey] === false) {
    const error = new Error('Funció no habilitada per aquest centre.');
    error.status = 403;
    throw error;
  }

  return center;
}

module.exports = { contextId, assertCenterFunction };
