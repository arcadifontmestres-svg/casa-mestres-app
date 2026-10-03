'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_DATA = Object.freeze({
  centers: [],
  centerPermissions: [],
  employees: [],
  recordAssignments: [],
  crmContacts: [],
  commercialProposals: [],
  reservations: [],
  occupancyBlocks: []
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureShape(data) {
  const out = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  if (!Array.isArray(out.centers)) out.centers = [];
  if (!Array.isArray(out.centerPermissions)) out.centerPermissions = [];
  if (!Array.isArray(out.employees)) out.employees = [];
  if (!Array.isArray(out.recordAssignments)) out.recordAssignments = [];
  if (!Array.isArray(out.crmContacts)) out.crmContacts = [];
  if (!Array.isArray(out.commercialProposals)) out.commercialProposals = [];
  if (!Array.isArray(out.reservations)) out.reservations = [];
  if (!Array.isArray(out.occupancyBlocks)) out.occupancyBlocks = [];
  return out;
}

function createStore(filePath = process.env.DATA_FILE || path.join(__dirname, 'data.json')) {
  const resolved = path.resolve(filePath);

  function ensureFile() {
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    if (!fs.existsSync(resolved)) {
      fs.writeFileSync(resolved, JSON.stringify(clone(DEFAULT_DATA), null, 2), 'utf8');
    }
  }

  function read() {
    ensureFile();
    const raw = fs.readFileSync(resolved, 'utf8').trim();
    return ensureShape(raw ? JSON.parse(raw) : clone(DEFAULT_DATA));
  }

  function write(data) {
    ensureFile();
    const clean = ensureShape(data);
    const temp = `${resolved}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(clean, null, 2), 'utf8');
    fs.renameSync(temp, resolved);
    return clean;
  }

  function update(mutator) {
    const data = read();
    const result = mutator(data);
    write(data);
    return result;
  }

  return { filePath: resolved, read, write, update };
}

module.exports = { createStore, ensureShape };
