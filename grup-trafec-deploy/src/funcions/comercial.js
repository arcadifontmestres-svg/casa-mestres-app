'use strict';

const crypto = require('crypto');

const STATUS = Object.freeze({
  DRAFT: 'ESBORRANY',
  REVIEW: 'PENDENT_VALIDACIO',
  VALIDATED: 'VALIDADA',
  SENT: 'ENVIADA',
  ACCEPTED: 'ACCEPTADA',
  REJECTED: 'REBUTJADA',
  CANCELLED: 'CANCEL_LADA'
});

const ALLOWED_STATUS = new Set(Object.values(STATUS));

function text(value) { return String(value ?? '').trim(); }
function num(value) { return Number.isFinite(Number(value)) ? Number(value) : 0; }
function total(pax, pricePerPerson) { return Math.round(num(pax) * num(pricePerPerson) * 100) / 100; }

function nextCode(items, year = new Date().getFullYear()) {
  let max = 0;
  const re = new RegExp(`^PROP-${year}-(\\d+)$`);
  for (const item of items || []) {
    const match = text(item.code).match(re);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `PROP-${year}-${String(max + 1).padStart(4, '0')}`;
}

function createCommercialService(store, crm, reservations = null) {
  if (!store || !crm) throw new Error('Comercial necessita dades i CRM.');

  function list({ status = '', clientId = '' } = {}) {
    return store.read().commercialProposals
      .filter(item => !status || item.status === status)
      .filter(item => !clientId || item.clientId === clientId)
      .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
  }

  function get(id) {
    return store.read().commercialProposals.find(item => item.id === id) || null;
  }

  function ensureClient(input) {
    if (input.clientId) {
      const found = crm.get(input.clientId);
      if (!found) {
        const error = new Error('Client CRM no trobat.');
        error.status = 400;
        throw error;
      }
      return found;
    }
    const name = text(input.clientName);
    if (!name) {
      const error = new Error('Cal seleccionar o crear un client.');
      error.status = 400;
      throw error;
    }
    const phone = text(input.clientPhone);
    const email = text(input.clientEmail);
    const existing = crm.list({ includeInactive: true }).find(item =>
      (email && text(item.email).toLowerCase() === email.toLowerCase()) ||
      (phone && text(item.phone).replace(/\D/g, '') === phone.replace(/\D/g, '')) ||
      text(item.name).toLowerCase() === name.toLowerCase()
    );
    return existing || crm.create({ name, phone, email, segment: 'Grup', notes: 'Creat des d’una proposta comercial.' });
  }

  function create(input = {}) {
    const client = ensureClient(input);
    const pax = Math.max(1, Math.trunc(num(input.pax) || 1));
    const pricePerPerson = Math.max(0, num(input.pricePerPerson));
    const eventDate = text(input.eventDate);
    if (!eventDate) {
      const error = new Error('La data del servei és obligatòria.');
      error.status = 400;
      throw error;
    }
    const now = new Date().toISOString();
    let proposal;
    store.update(data => {
      proposal = {
        id: `proposal_${crypto.randomUUID()}`,
        code: nextCode(data.commercialProposals),
        clientId: client.id,
        clientName: client.name,
        clientPhone: client.phone || '',
        clientEmail: client.email || '',
        eventDate,
        eventTime: text(input.eventTime),
        pax,
        menuName: text(input.menuName),
        pricePerPerson,
        totalAmount: total(pax, pricePerPerson),
        notes: text(input.notes),
        status: STATUS.DRAFT,
        createdAt: now,
        updatedAt: now,
        statusHistory: [{ status: STATUS.DRAFT, at: now }]
      };
      data.commercialProposals.push(proposal);
    });
    return proposal;
  }

  function update(id, input = {}) {
    let saved;
    store.update(data => {
      const index = data.commercialProposals.findIndex(item => item.id === id);
      if (index < 0) {
        const error = new Error('Proposta comercial no trobada.');
        error.status = 404;
        throw error;
      }
      const current = data.commercialProposals[index];
      if (![STATUS.DRAFT, STATUS.REVIEW, STATUS.VALIDATED].includes(current.status)) {
        const error = new Error('Aquesta proposta ja no es pot editar.');
        error.status = 409;
        throw error;
      }
      const client = input.clientId && input.clientId !== current.clientId ? ensureClient(input) : crm.get(current.clientId);
      const pax = input.pax == null ? current.pax : Math.max(1, Math.trunc(num(input.pax) || 1));
      const pricePerPerson = input.pricePerPerson == null ? current.pricePerPerson : Math.max(0, num(input.pricePerPerson));
      saved = {
        ...current,
        clientId: client?.id || current.clientId,
        clientName: client?.name || current.clientName,
        clientPhone: client?.phone || current.clientPhone || '',
        clientEmail: client?.email || current.clientEmail || '',
        eventDate: input.eventDate == null ? current.eventDate : text(input.eventDate),
        eventTime: input.eventTime == null ? current.eventTime : text(input.eventTime),
        pax,
        menuName: input.menuName == null ? current.menuName : text(input.menuName),
        pricePerPerson,
        totalAmount: total(pax, pricePerPerson),
        notes: input.notes == null ? current.notes : text(input.notes),
        updatedAt: new Date().toISOString()
      };
      if (!saved.eventDate) {
        const error = new Error('La data del servei és obligatòria.');
        error.status = 400;
        throw error;
      }
      data.commercialProposals[index] = saved;
    });
    return saved;
  }

  function setStatus(id, status) {
    if (!ALLOWED_STATUS.has(status)) {
      const error = new Error('Estat comercial no vàlid.');
      error.status = 400;
      throw error;
    }
    const allowed = {
      [STATUS.DRAFT]: [STATUS.REVIEW, STATUS.CANCELLED],
      [STATUS.REVIEW]: [STATUS.DRAFT, STATUS.VALIDATED, STATUS.REJECTED, STATUS.CANCELLED],
      [STATUS.VALIDATED]: [STATUS.SENT, STATUS.CANCELLED],
      [STATUS.SENT]: [STATUS.ACCEPTED, STATUS.REJECTED, STATUS.CANCELLED],
      [STATUS.ACCEPTED]: [],
      [STATUS.REJECTED]: [],
      [STATUS.CANCELLED]: []
    };
    let saved;
    store.update(data => {
      const index = data.commercialProposals.findIndex(item => item.id === id);
      if (index < 0) {
        const error = new Error('Proposta comercial no trobada.');
        error.status = 404;
        throw error;
      }
      const current = data.commercialProposals[index];
      if (current.status !== status && !allowed[current.status]?.includes(status)) {
        const error = new Error(`Canvi d’estat no permès: ${current.status} → ${status}.`);
        error.status = 409;
        throw error;
      }
      const now = new Date().toISOString();
      saved = { ...current, status, updatedAt: now, statusHistory: [...(current.statusHistory || []), { status, at: now }] };
      data.commercialProposals[index] = saved;
    });

    if (status === STATUS.ACCEPTED && reservations) {
      const reservation = reservations.create({
        date: saved.eventDate,
        time: saved.eventTime,
        pax: saved.pax,
        name: saved.clientName,
        phone: saved.clientPhone,
        email: saved.clientEmail,
        menuName: saved.menuName,
        notes: saved.notes,
        source: 'COMERCIAL',
        status: reservations.status.CONFIRMED,
        commercialProposalId: saved.id
      });
      store.update(data => {
        const index = data.commercialProposals.findIndex(item => item.id === saved.id);
        if (index >= 0) data.commercialProposals[index].reservationId = reservation.id;
      });
      saved = get(saved.id);
    }
    return saved;
  }

  return { list, get, create, update, setStatus, status: STATUS };
}

module.exports = { createCommercialService, STATUS, nextCode };
