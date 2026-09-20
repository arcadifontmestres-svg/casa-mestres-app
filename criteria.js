'use strict';

const crypto = require('crypto');

const CRITERION_STATES = [
  'DETECTADA',
  'EN_ESTUDI',
  'EN_PROVA',
  'PENDENT_APROVACIO',
  'APROVADA',
  'PUBLICADA',
  'EN_IMPLANTACIO',
  'IMPLANTADA',
  'REBUTJADA',
  'SUBSTITUIDA'
];

const TRANSITIONS = {
  DETECTADA: ['EN_ESTUDI', 'REBUTJADA'],
  EN_ESTUDI: ['EN_PROVA', 'PENDENT_APROVACIO', 'REBUTJADA'],
  EN_PROVA: ['EN_ESTUDI', 'PENDENT_APROVACIO', 'REBUTJADA'],
  PENDENT_APROVACIO: ['EN_ESTUDI', 'APROVADA', 'REBUTJADA'],
  APROVADA: ['PUBLICADA', 'SUBSTITUIDA'],
  PUBLICADA: ['EN_IMPLANTACIO', 'SUBSTITUIDA'],
  EN_IMPLANTACIO: ['IMPLANTADA', 'PUBLICADA', 'SUBSTITUIDA'],
  IMPLANTADA: ['SUBSTITUIDA'],
  REBUTJADA: ['EN_ESTUDI'],
  SUBSTITUIDA: []
};

function cleanList(value) {
  return Array.isArray(value) ? [...new Set(value.map(item => String(item || '').trim()).filter(Boolean))] : [];
}

function snapshot(criterion) {
  const { history, ...current } = criterion;
  return JSON.parse(JSON.stringify(current));
}

function historyEntry(action, actor, details = {}) {
  return {
    id: 'criterion_event_' + crypto.randomUUID(),
    action,
    actor: String(actor || 'direccio'),
    at: new Date().toISOString(),
    details: JSON.parse(JSON.stringify(details || {}))
  };
}

function createCriterion(input, actor = 'direccio') {
  const title = String(input.title || '').trim();
  const problem = String(input.problem || '').trim();
  if (!title) throw Object.assign(new Error('El criteri necessita un títol'), { statusCode: 400 });
  if (!problem) throw Object.assign(new Error('El criteri necessita descriure el problema'), { statusCode: 400 });

  const now = new Date().toISOString();
  const criterion = {
    id: 'criterion_' + crypto.randomUUID(),
    companyId: String(input.companyId || '').trim(),
    area: String(input.area || 'Operacions').trim(),
    title,
    problem,
    proposal: String(input.proposal || '').trim(),
    priority: String(input.priority || 'MITJANA').toUpperCase(),
    state: 'DETECTADA',
    version: 1,
    ownerId: String(input.ownerId || '').trim(),
    reviewerIds: cleanList(input.reviewerIds),
    centreIds: cleanList(input.centreIds),
    optionalCentreIds: cleanList(input.optionalCentreIds),
    exceptions: Array.isArray(input.exceptions) ? input.exceptions : [],
    evidence: Array.isArray(input.evidence) ? input.evidence : [],
    dueDate: String(input.dueDate || '').trim(),
    nextStep: String(input.nextStep || '').trim(),
    targetType: String(input.targetType || '').trim(),
    targetId: String(input.targetId || '').trim(),
    effectiveAt: '',
    publishedAt: '',
    createdAt: now,
    updatedAt: now,
    history: []
  };
  criterion.history.push(historyEntry('CREADA', actor, { snapshot: snapshot(criterion) }));
  return criterion;
}

function updateCriterion(criterion, input, actor = 'direccio') {
  const protectedFields = new Set(['id', 'state', 'version', 'history', 'createdAt', 'publishedAt']);
  const allowedFields = [
    'companyId', 'area', 'title', 'problem', 'proposal', 'priority', 'ownerId',
    'reviewerIds', 'centreIds', 'optionalCentreIds', 'exceptions', 'evidence',
    'dueDate', 'nextStep', 'targetType', 'targetId', 'effectiveAt'
  ];
  const before = snapshot(criterion);
  for (const field of allowedFields) {
    if (!(field in input) || protectedFields.has(field)) continue;
    if (['reviewerIds', 'centreIds', 'optionalCentreIds'].includes(field)) criterion[field] = cleanList(input[field]);
    else if (['exceptions', 'evidence'].includes(field)) criterion[field] = Array.isArray(input[field]) ? input[field] : criterion[field];
    else criterion[field] = String(input[field] ?? '').trim();
  }
  if (!criterion.title || !criterion.problem) throw Object.assign(new Error('Títol i problema són obligatoris'), { statusCode: 400 });
  criterion.version = Number(criterion.version || 1) + 1;
  criterion.updatedAt = new Date().toISOString();
  criterion.history.push(historyEntry('ACTUALITZADA', actor, { before, after: snapshot(criterion) }));
  return criterion;
}

function transitionCriterion(criterion, nextState, actor = 'direccio', note = '') {
  const current = String(criterion.state || 'DETECTADA').toUpperCase();
  const wanted = String(nextState || '').toUpperCase();
  if (!CRITERION_STATES.includes(wanted)) throw Object.assign(new Error('Estat de criteri no vàlid'), { statusCode: 400 });
  if (!(TRANSITIONS[current] || []).includes(wanted)) {
    throw Object.assign(new Error(`No es pot passar de ${current} a ${wanted}`), { statusCode: 409 });
  }
  if (wanted === 'APROVADA' && !String(criterion.proposal || '').trim()) {
    throw Object.assign(new Error('No es pot aprovar un criteri sense proposta tècnica'), { statusCode: 400 });
  }
  const previous = current;
  criterion.state = wanted;
  criterion.version = Number(criterion.version || 1) + 1;
  criterion.updatedAt = new Date().toISOString();
  if (wanted === 'APROVADA' && !criterion.effectiveAt) criterion.effectiveAt = criterion.updatedAt;
  if (wanted === 'PUBLICADA') criterion.publishedAt = criterion.updatedAt;
  criterion.history.push(historyEntry('CANVI_ESTAT', actor, { from: previous, to: wanted, note: String(note || '').trim() }));
  return criterion;
}

module.exports = {
  CRITERION_STATES,
  TRANSITIONS,
  createCriterion,
  updateCriterion,
  transitionCriterion
};
