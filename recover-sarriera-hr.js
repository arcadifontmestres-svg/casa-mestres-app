'use strict';

const fs = require('fs');
const path = require('path');

const TARGET_COMPANY_ID = 'company_grup_trafec';

function safeJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function employeeSnapshot(item, centreId) {
  return {
    id: String(item.id || ''),
    code: String(item.code || ''),
    name: String(item.name || item.fullName || ''),
    level: String(item.level || ''),
    role: String(item.role || item.roleBase || ''),
    roleBase: String(item.roleBase || item.role || ''),
    phone: String(item.phone || ''),
    active: true,
    tasks: String(item.tasks || ''),
    responsibilities: String(item.responsibilities || ''),
    notes: String(item.notes || ''),
    companyId: TARGET_COMPANY_ID,
    centreId,
    scope: 'CENTRE',
    recoveredAt: new Date().toISOString()
  };
}

function employeesFromPunches(punches, centreId) {
  const byEmployee = new Map();
  for (const punch of punches) {
    if (!punch) continue;
    const id = String(punch.employeeId || '').trim();
    const name = String(punch.employeeName || '').trim();
    if (!id || !name || byEmployee.has(id)) continue;
    byEmployee.set(id, {
      id,
      code: String(punch.employeeCode || punch.code || '').trim(),
      name,
      level: '',
      role: '',
      roleBase: '',
      phone: '',
      active: true,
      tasks: '',
      responsibilities: '',
      notes: 'Recuperat automàticament dels registres de fitxatge conservats.',
      companyId: TARGET_COMPANY_ID,
      centreId,
      scope: 'CENTRE',
      recoveredAt: new Date().toISOString()
    });
  }

  let sequence = 1;
  for (const employee of byEmployee.values()) {
    if (!employee.code) {
      employee.code = String(sequence).padStart(3, '0');
      sequence += 1;
    }
  }
  return [...byEmployee.values()];
}

function recoverSarrieraHr({ dataDir, dataFile, backupsDir }) {
  const root = safeJson(dataFile);
  if (!root) return { applied: false, reason: 'data_unreadable' };

  const sarriera = (root.restaurants || []).find(item => item && item.id && item.kind !== 'GROUP' && String(item.name || '').toUpperCase().includes('SARRIERA'));
  if (!sarriera) return { applied: false, reason: 'sarriera_missing' };
  const centreId = String(sarriera.id);
  const centreFile = path.join(dataDir, 'centres', `${centreId}.json`);
  const centre = safeJson(centreFile) || { arcadiCentreDataVersion: 1, companyId: TARGET_COMPANY_ID, centreId, collections: {} };
  centre.collections = centre.collections && typeof centre.collections === 'object' ? centre.collections : {};
  centre.collections.employees = Array.isArray(centre.collections.employees) ? centre.collections.employees : [];
  centre.collections.schedules = Array.isArray(centre.collections.schedules) ? centre.collections.schedules : [];
  centre.collections.punches = Array.isArray(centre.collections.punches) ? centre.collections.punches : [];

  if (centre.collections.employees.some(item => item && item.active !== false)) {
    return {
      applied: false,
      reason: 'employees_already_present',
      centreId,
      employees: centre.collections.employees.length,
      schedules: centre.collections.schedules.length,
      punches: centre.collections.punches.length
    };
  }

  const punchIds = new Set(centre.collections.punches.map(item => String(item?.employeeId || '')).filter(Boolean));
  const punchNames = new Set(centre.collections.punches.map(item => String(item?.employeeName || '').trim().toLocaleLowerCase('ca')).filter(Boolean));
  const files = fs.existsSync(backupsDir)
    ? fs.readdirSync(backupsDir)
        .filter(name => name.endsWith('.json'))
        .map(name => path.join(backupsDir, name))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    : [];

  let sourceFile = '';
  let recoverySource = 'backup';
  let recoveredEmployees = [];
  let recoveredSchedules = [];

  for (const file of files) {
    const backup = safeJson(file);
    if (!backup) continue;
    const candidates = Array.isArray(backup.employees) ? backup.employees : [];
    if (!candidates.length) continue;

    let matches = candidates.filter(item => punchIds.has(String(item?.id || '')));
    if (!matches.length && punchNames.size) {
      matches = candidates.filter(item => punchNames.has(String(item?.name || item?.fullName || '').trim().toLocaleLowerCase('ca')));
    }
    if (!matches.length) continue;

    recoveredEmployees = matches.map(item => employeeSnapshot(item, centreId));
    const recoveredIds = new Set(recoveredEmployees.map(item => item.id));
    recoveredSchedules = (Array.isArray(backup.schedules) ? backup.schedules : [])
      .filter(item => recoveredIds.has(String(item?.employeeId || '')))
      .map(item => ({ ...item, companyId: TARGET_COMPANY_ID, centreId, scope: 'CENTRE' }));
    sourceFile = path.basename(file);
    break;
  }

  if (!recoveredEmployees.length) {
    recoveredEmployees = employeesFromPunches(centre.collections.punches, centreId);
    recoverySource = 'punches';
  }

  if (!recoveredEmployees.length) {
    return {
      applied: false,
      reason: 'no_employee_source',
      centreId,
      backupFiles: files.length,
      punchEmployeeIds: punchIds.size,
      punchEmployeeNames: punchNames.size,
      punches: centre.collections.punches.length
    };
  }

  const existingIds = new Set(centre.collections.employees.map(item => String(item?.id || '')));
  for (const employee of recoveredEmployees) {
    if (!existingIds.has(employee.id)) centre.collections.employees.push(employee);
  }
  if (!centre.collections.schedules.length && recoveredSchedules.length) {
    centre.collections.schedules.push(...recoveredSchedules);
  }

  fs.mkdirSync(path.dirname(centreFile), { recursive: true });
  fs.mkdirSync(backupsDir, { recursive: true });
  if (fs.existsSync(centreFile)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(centreFile, path.join(backupsDir, `before_hr_recovery_${centreId}_${stamp}.json`));
  }
  const temp = `${centreFile}.hr.tmp`;
  fs.writeFileSync(temp, JSON.stringify(centre, null, 2), 'utf8');
  fs.renameSync(temp, centreFile);

  return {
    applied: true,
    centreId,
    recoverySource,
    sourceFile,
    employeesRecovered: recoveredEmployees.length,
    schedulesRecovered: recoveredSchedules.length,
    punchesPreserved: centre.collections.punches.length
  };
}

module.exports = { recoverSarrieraHr };
