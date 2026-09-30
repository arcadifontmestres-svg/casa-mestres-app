'use strict';

const crypto = require('crypto');

const STATUS = Object.freeze({
  PENDING: 'PENDENT',
  CONFIRMED: 'CONFIRMADA',
  CANCELLED: 'CANCEL_LADA'
});

function text(value) { return String(value ?? '').trim(); }
function num(value) { return Number.isFinite(Number(value)) ? Number(value) : 0; }

function nextCode(items, year = new Date().getFullYear()) {
  let max = 0;
  const re = new RegExp(`^RES-${year}-(\\d+)$`);
  for (const item of items || []) {
    const match = text(item.code).match(re);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `RES-${year}-${String(max + 1).padStart(4, '0')}`;
}

function createReservationService(store) {
  if (!store) throw new Error('Reserves necessita un magatzem de dades.');

  function list({ dateFrom = '', dateTo = '', status = '', source = '' } = {}) {
    return store.read().reservations
      .filter(item => !dateFrom || item.date >= dateFrom)
      .filter(item => !dateTo || item.date <= dateTo)
      .filter(item => !status || item.status === status)
      .filter(item => !source || item.source === source)
      .sort((a, b) => `${a.date || ''}T${a.time || ''}`.localeCompare(`${b.date || ''}T${b.time || ''}`));
  }

  function get(id) {
    return store.read().reservations.find(item => item.id === id) || null;
  }

  function findByCommercialProposal(proposalId) {
    return store.read().reservations.find(item => item.commercialProposalId === proposalId) || null;
  }

  function create(input = {}) {
    const date = text(input.date);
    const name = text(input.name);
    if (!date || !name) {
      const error = new Error('La reserva necessita data i nom.');
      error.status = 400;
      throw error;
    }
    const pax = Math.max(1, Math.trunc(num(input.pax) || 1));
    const status = Object.values(STATUS).includes(input.status) ? input.status : STATUS.CONFIRMED;
    const now = new Date().toISOString();
    let reservation;
    store.update(data => {
      if (input.commercialProposalId) {
        const duplicate = data.reservations.find(item => item.commercialProposalId === input.commercialProposalId);
        if (duplicate) {
          reservation = duplicate;
          return;
        }
      }
      reservation = {
        id: `reservation_${crypto.randomUUID()}`,
        code: nextCode(data.reservations),
        date,
        time: text(input.time),
        pax,
        name,
        phone: text(input.phone),
        email: text(input.email),
        zone: text(input.zone),
        menuName: text(input.menuName),
        notes: text(input.notes),
        source: text(input.source) || 'MANUAL',
        status,
        commercialProposalId: text(input.commercialProposalId),
        createdAt: now,
        updatedAt: now
      };
      data.reservations.push(reservation);
    });
    return reservation;
  }

  function update(id, input = {}) {
    let saved;
    store.update(data => {
      const index = data.reservations.findIndex(item => item.id === id);
      if (index < 0) {
        const error = new Error('Reserva no trobada.');
        error.status = 404;
        throw error;
      }
      const current = data.reservations[index];
      const status = input.status == null ? current.status : input.status;
      if (!Object.values(STATUS).includes(status)) {
        const error = new Error('Estat de reserva no vàlid.');
        error.status = 400;
        throw error;
      }
      saved = {
        ...current,
        date: input.date == null ? current.date : text(input.date),
        time: input.time == null ? current.time : text(input.time),
        pax: input.pax == null ? current.pax : Math.max(1, Math.trunc(num(input.pax) || 1)),
        name: input.name == null ? current.name : text(input.name),
        phone: input.phone == null ? current.phone : text(input.phone),
        email: input.email == null ? current.email : text(input.email),
        zone: input.zone == null ? current.zone : text(input.zone),
        menuName: input.menuName == null ? current.menuName : text(input.menuName),
        notes: input.notes == null ? current.notes : text(input.notes),
        status,
        updatedAt: new Date().toISOString()
      };
      if (!saved.date || !saved.name) {
        const error = new Error('La reserva necessita data i nom.');
        error.status = 400;
        throw error;
      }
      data.reservations[index] = saved;
    });
    return saved;
  }

  function occupancy({ dateFrom = '', dateTo = '' } = {}) {
    const reservations = list({ dateFrom, dateTo }).filter(item => item.status !== STATUS.CANCELLED);
    const blocks = store.read().occupancyBlocks
      .filter(item => !dateFrom || item.date >= dateFrom)
      .filter(item => !dateTo || item.date <= dateTo)
      .sort((a, b) => `${a.date || ''}T${a.time || ''}`.localeCompare(`${b.date || ''}T${b.time || ''}`));
    const confirmed = reservations.filter(item => item.status === STATUS.CONFIRMED);
    return {
      reservations,
      blocks,
      totals: {
        reservations: reservations.length,
        confirmed: confirmed.length,
        paxConfirmed: confirmed.reduce((sum, item) => sum + num(item.pax), 0)
      }
    };
  }

  function createBlock(input = {}) {
    const date = text(input.date);
    const reason = text(input.reason);
    if (!date || !reason) {
      const error = new Error('El bloqueig necessita data i motiu.');
      error.status = 400;
      throw error;
    }
    const now = new Date().toISOString();
    const block = {
      id: `occupancy_${crypto.randomUUID()}`,
      date,
      time: text(input.time),
      reason,
      notes: text(input.notes),
      createdAt: now,
      updatedAt: now
    };
    store.update(data => data.occupancyBlocks.push(block));
    return block;
  }

  return { list, get, findByCommercialProposal, create, update, occupancy, createBlock, status: STATUS };
}

module.exports = { createReservationService, STATUS, nextCode };
