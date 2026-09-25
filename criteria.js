'use strict';
/**
 * criteria.js — Gestió de criteris de governança per a ARCADI Gestió
 * Implementa la creació, actualització i transició d'estat dels criteris.
 */

const crypto = require('crypto');

/**
 * Genera un ID únic per a un criteri.
 * @returns {string}
 */
function generateId() {
  return `crit_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Retorna la data i hora actual en format ISO 8601.
 * @returns {string}
 */
function now() {
  return new Date().toISOString();
}

/**
 * Estats vàlids d'un criteri.
 */
const VALID_STATES = [
  'Esborrany',
  'En revisió',
  'Aprovat',
  'Actiu',
  'Suspès',
  'Arxivat'
];

/**
 * Transicions d'estat permeses.
 * Clau: estat actual → Valors: estats als quals es pot transitar.
 */
const ALLOWED_TRANSITIONS = {
  'Esborrany':   ['En revisió', 'Arxivat'],
  'En revisió':  ['Aprovat', 'Esborrany', 'Arxivat'],
  'Aprovat':     ['Actiu', 'En revisió', 'Arxivat'],
  'Actiu':       ['Suspès', 'Arxivat'],
  'Suspès':      ['Actiu', 'Arxivat'],
  'Arxivat':     []
};

/**
 * Crea un nou criteri de governança.
 * @param {object} data - Dades globals de l'aplicació
 * @param {object} body - Cos de la petició amb els camps del criteri
 * @returns {{ ok: boolean, criterion?: object, error?: string }}
 */
function createCriterion(data, body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'El cos de la petició és invàlid' };
  }

  const title = String(body.title || '').trim();
  if (!title) {
    return { ok: false, error: 'El camp "title" és obligatori' };
  }

  const criterion = {
    id:           generateId(),
    title,
    description:  String(body.description  || '').trim(),
    category:     String(body.category     || 'General').trim(),
    restaurantId: String(body.restaurantId || '').trim(),
    organizationId: String(body.organizationId || '').trim(),
    status:       'Esborrany',
    priority:     String(body.priority     || 'Normal').trim(),
    assignedTo:   String(body.assignedTo   || '').trim(),
    dueDate:      body.dueDate ? String(body.dueDate) : null,
    tags:         Array.isArray(body.tags) ? body.tags.map(String) : [],
    notes:        String(body.notes        || '').trim(),
    createdAt:    now(),
    updatedAt:    now(),
    history: [
      {
        action:    'Creat',
        status:    'Esborrany',
        timestamp: now(),
        notes:     'Criteri creat inicialment'
      }
    ]
  };

  if (!Array.isArray(data.governanceCriteria)) data.governanceCriteria = [];
  data.governanceCriteria.push(criterion);

  return { ok: true, criterion };
}

/**
 * Actualitza un criteri existent.
 * @param {object} data - Dades globals de l'aplicació
 * @param {string} id - ID del criteri a actualitzar
 * @param {object} body - Camps a actualitzar
 * @returns {{ ok: boolean, criterion?: object, error?: string }}
 */
function updateCriterion(data, id, body) {
  if (!id) return { ok: false, error: 'Cal especificar l\'ID del criteri' };
  if (!body || typeof body !== 'object') return { ok: false, error: 'El cos de la petició és invàlid' };

  if (!Array.isArray(data.governanceCriteria)) data.governanceCriteria = [];

  const index = data.governanceCriteria.findIndex(c => c.id === id);
  if (index < 0) return { ok: false, error: `Criteri no trobat: "${id}"` };

  const criterion = data.governanceCriteria[index];

  // Camps actualitzables (no es pot canviar l'estat aquí — usar transitionCriterion)
  const updatable = ['title', 'description', 'category', 'restaurantId', 'organizationId',
                     'priority', 'assignedTo', 'dueDate', 'notes'];

  for (const field of updatable) {
    if (body[field] !== undefined) {
      criterion[field] = field === 'tags'
        ? (Array.isArray(body[field]) ? body[field].map(String) : criterion.tags)
        : (body[field] === null ? null : String(body[field]).trim());
    }
  }

  if (body.tags !== undefined && Array.isArray(body.tags)) {
    criterion.tags = body.tags.map(String);
  }

  criterion.updatedAt = now();

  if (!Array.isArray(criterion.history)) criterion.history = [];
  criterion.history.push({
    action:    'Actualitzat',
    status:    criterion.status,
    timestamp: now(),
    notes:     String(body.notes || 'Actualització de camps')
  });

  data.governanceCriteria[index] = criterion;
  return { ok: true, criterion };
}

/**
 * Transiciona un criteri a un nou estat.
 * @param {object} data - Dades globals de l'aplicació
 * @param {string} id - ID del criteri
 * @param {object} body - { newStatus: string, notes?: string }
 * @returns {{ ok: boolean, criterion?: object, error?: string }}
 */
function transitionCriterion(data, id, body) {
  if (!id) return { ok: false, error: 'Cal especificar l\'ID del criteri' };
  if (!body || typeof body !== 'object') return { ok: false, error: 'El cos de la petició és invàlid' };

  const newStatus = String(body.newStatus || '').trim();
  if (!newStatus) return { ok: false, error: 'Cal especificar "newStatus"' };
  if (!VALID_STATES.includes(newStatus)) {
    return { ok: false, error: `Estat invàlid: "${newStatus}". Estats vàlids: ${VALID_STATES.join(', ')}` };
  }

  if (!Array.isArray(data.governanceCriteria)) data.governanceCriteria = [];

  const index = data.governanceCriteria.findIndex(c => c.id === id);
  if (index < 0) return { ok: false, error: `Criteri no trobat: "${id}"` };

  const criterion = data.governanceCriteria[index];
  const currentStatus = criterion.status || 'Esborrany';

  // Verificar que la transició és permesa
  const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(newStatus)) {
    return {
      ok: false,
      error: `Transició no permesa: "${currentStatus}" → "${newStatus}". ` +
             `Transicions permeses des de "${currentStatus}": ${allowed.join(', ') || 'cap'}`
    };
  }

  const previousStatus = criterion.status;
  criterion.status    = newStatus;
  criterion.updatedAt = now();

  if (!Array.isArray(criterion.history)) criterion.history = [];
  criterion.history.push({
    action:         'Transició d\'estat',
    previousStatus,
    status:         newStatus,
    timestamp:      now(),
    notes:          String(body.notes || `Transició de "${previousStatus}" a "${newStatus}"`)
  });

  data.governanceCriteria[index] = criterion;
  return { ok: true, criterion };
}

module.exports = {
  createCriterion,
  updateCriterion,
  transitionCriterion,
  VALID_STATES,
  ALLOWED_TRANSITIONS
};