'use strict';

const SOURCE_COMPANY_ID = 'company_casa_mestres';
const TARGET_COMPANY_ID = 'company_grup_trafec';

function restoreTrafecHr(data) {
  const employees = Array.isArray(data.employees) ? data.employees : [];
  const schedules = Array.isArray(data.schedules) ? data.schedules : [];
  const punches = Array.isArray(data.punches) ? data.punches : [];
  const centres = Array.isArray(data.restaurants) ? data.restaurants : [];
  const sarriera = centres.find(item => item && item.id && item.kind !== 'GROUP' && String(item.name || '').toUpperCase().includes('SARRIERA'));
  const sarrieraId = sarriera ? String(sarriera.id) : '';
  if (sarriera) sarriera.organizationId = TARGET_COMPANY_ID;

  const target = employees.filter(item => item && item.companyId === TARGET_COMPANY_ID);
  const copied = target.filter(item => item.copiedFromCompanyId === SOURCE_COMPANY_ID);
  const byId = new Map(target.filter(item => item.id).map(item => [String(item.id), item]));
  const bySourceId = new Map(copied.filter(item => item.copiedFromId).map(item => [String(item.copiedFromId), item]));
  const referenced = new Set([...schedules, ...punches].filter(Boolean).map(item => String(item.employeeId || '')).filter(Boolean));

  let reactivated = 0;
  let assigned = 0;
  let relinked = 0;

  for (const employee of copied) {
    const operational = copied.length === 1 || referenced.has(String(employee.id || '')) || referenced.has(String(employee.copiedFromId || ''));
    if (!operational) continue;
    if (employee.active === false) {
      employee.active = true;
      reactivated += 1;
    }
    if (sarrieraId && !employee.centreId) {
      employee.centreId = sarrieraId;
      employee.scope = 'CENTRE';
      assigned += 1;
    }
  }

  for (const item of [...schedules, ...punches]) {
    if (!item || !item.employeeId) continue;
    let employee = byId.get(String(item.employeeId));
    if (!employee) {
      employee = bySourceId.get(String(item.employeeId));
      if (employee && employee.id) {
        item.employeeId = employee.id;
        relinked += 1;
      }
    }
    if (!employee) continue;
    if (item.companyId !== TARGET_COMPANY_ID) {
      item.companyId = TARGET_COMPANY_ID;
      relinked += 1;
    }
    if (sarrieraId && !item.centreId) {
      item.centreId = employee.centreId || sarrieraId;
      item.scope = 'CENTRE';
      relinked += 1;
    }
  }

  return {
    applied: reactivated + assigned + relinked > 0,
    sarrieraCentreId: sarrieraId,
    targetEmployees: target.length,
    copiedEmployees: copied.length,
    activeTargetEmployees: target.filter(item => item.active !== false).length,
    reactivated,
    assigned,
    relinked,
    punches: punches.length,
    schedules: schedules.length
  };
}

module.exports = { restoreTrafecHr };
