(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.ArcadiHR = api;
    const boot = () => api.install();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const TIME_ZONE = 'Europe/Madrid';
  const LEGACY_COMPANY = 'company_casa_mestres';
  const LEGACY_CENTRE = 'restaurant_casa_mestres';
  const VACATION_MONTHLY_RATE = 2.5;
  const BASE_RECURRING_HOLIDAYS = Object.freeze([
    { monthDay: '08-15', name: 'Assumpció · 15/08', source: 'BASE' },
    { monthDay: '12-25', name: 'Nadal · 25/12', source: 'BASE' }
  ]);
  const ui = {
    mode: 'month',
    month: new Date().toISOString().slice(0, 7),
    weekStart: mondayISO(new Date())
  };

  function pad(value) { return String(value).padStart(2, '0'); }
  function isoDateUTC(date) { return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`; }
  function parseISODate(iso) {
    const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  }
  function addDays(iso, days) {
    const date = parseISODate(iso);
    if (!date) return iso;
    date.setUTCDate(date.getUTCDate() + Number(days || 0));
    return isoDateUTC(date);
  }
  function mondayISO(value) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = (utc.getUTCDay() + 6) % 7;
    utc.setUTCDate(utc.getUTCDate() - day);
    return isoDateUTC(utc);
  }
  function monthRange(month) {
    const match = String(month || '').match(/^(\d{4})-(\d{2})$/);
    if (!match) return monthRange(new Date().toISOString().slice(0, 7));
    const year = Number(match[1]);
    const mon = Number(match[2]);
    const last = new Date(Date.UTC(year, mon, 0)).getUTCDate();
    return { start: `${year}-${pad(mon)}-01`, end: `${year}-${pad(mon)}-${pad(last)}`, year, month: mon };
  }
  function weekRange(start) { return { start, end: addDays(start, 6) }; }
  function localDateISO(value, timeZone = TIME_ZONE) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}`;
  }
  function round(value, decimals = 2) {
    const factor = 10 ** decimals;
    return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
  }
  function inRange(date, start, end) { return date >= start && date <= end; }
  function dateOverlapDays(startA, endA, startB, endB) {
    const start = [startA, startB].sort().pop();
    const end = [endA, endB].sort()[0];
    const a = parseISODate(start), b = parseISODate(end);
    if (!a || !b || a > b) return 0;
    return Math.floor((b - a) / 86400000) + 1;
  }
  function employeeStart(employee) {
    return String(employee.contractStart || employee.startDate || employee.hireDate || employee.employmentStart || '').slice(0, 10);
  }
  function employeeEnd(employee) {
    return String(employee.contractEnd || employee.endDate || employee.terminationDate || employee.employmentEnd || '').slice(0, 10);
  }
  function vacationAccrualForMonth(employee, year, month, hadActivity = false) {
    const first = `${year}-${pad(month)}-01`;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const last = `${year}-${pad(month)}-${pad(lastDay)}`;
    const start = employeeStart(employee);
    const end = employeeEnd(employee);
    if (!start && !end) {
      if (employee.active === false && !hadActivity) return 0;
      return VACATION_MONTHLY_RATE;
    }
    const activeStart = start && start > first ? start : first;
    const activeEnd = end && end < last ? end : last;
    const days = dateOverlapDays(activeStart, activeEnd, first, last);
    if (!days) return 0;
    return round(VACATION_MONTHLY_RATE * days / lastDay, 4);
  }
  function punchDailySummary(punches, timeZone = TIME_ZONE) {
    const byDay = new Map();
    const sorted = [...(punches || [])].filter(item => item && item.dateTime).sort((a, b) => String(a.dateTime).localeCompare(String(b.dateTime)));
    for (const punch of sorted) {
      const day = localDateISO(punch.dateTime, timeZone);
      if (!day) continue;
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(punch);
    }
    const result = {};
    for (const [day, events] of byDay.entries()) {
      let openAt = null;
      let milliseconds = 0;
      let worked = false;
      for (const event of events) {
        const type = String(event.type || '').toUpperCase();
        const at = new Date(event.dateTime).getTime();
        if (!Number.isFinite(at)) continue;
        if (type === 'ENTRADA' || type === 'TORNAR') {
          worked = true;
          if (openAt === null) openAt = at;
        } else if ((type === 'PAUSA' || type === 'SORTIDA') && openAt !== null) {
          if (at >= openAt && at - openAt <= 24 * 3600000) milliseconds += at - openAt;
          openAt = null;
        }
      }
      result[day] = { worked, hours: round(milliseconds / 3600000, 2), events };
    }
    return result;
  }
  function sameScope(record, companyId, centreId) {
    const company = record.companyId || LEGACY_COMPANY;
    const centre = record.centreId || (company === LEGACY_COMPANY ? LEGACY_CENTRE : '');
    return (!companyId || company === companyId) && (!centreId || centre === centreId);
  }
  function holidayForDate(date, calendars, companyId, centreId) {
    const monthDay = String(date).slice(5);
    const custom = (calendars || []).filter(item => item && item.active !== false && sameScope(item, companyId, centreId)).find(item => {
      if (item.date) return item.date === date;
      return item.monthDay === monthDay;
    });
    if (custom) return { name: custom.name || 'Festiu', source: 'CALENDARI', id: custom.id || '' };
    const base = BASE_RECURRING_HOLIDAYS.find(item => item.monthDay === monthDay);
    return base ? { ...base } : null;
  }
  function settlementStatus(settlements, employeeId, date, centreId) {
    const found = (settlements || []).find(item => item.employeeId === employeeId && item.date === date && (!centreId || !item.centreId || item.centreId === centreId));
    return found?.status || 'PENDENT';
  }
  function vacationBalance(accrued, movements) {
    let balance = Number(accrued || 0);
    for (const item of movements || []) {
      const days = Math.abs(Number(item.days || 0));
      if (item.type === 'GAUDIDES') balance -= days;
      else if (item.type === 'AJUST_POSITIU') balance += days;
      else if (item.type === 'AJUST_NEGATIU') balance -= days;
    }
    return round(balance, 2);
  }

  function currentA() { return typeof window !== 'undefined' ? window.ArcadiERP : null; }
  function companyOf(employee) { return employee.companyId || LEGACY_COMPANY; }
  function centreOf(employee) { return employee.centreId || (companyOf(employee) === LEGACY_COMPANY ? LEGACY_CENTRE : ''); }
  function centreName(A, centreId) { return (A.state.restaurants || []).find(item => item.id === centreId)?.name || centreId || 'Sense centre'; }
  function employeesInContext(A) {
    const companyId = A.context?.companyId || '';
    const centreId = A.context?.centreId || '';
    return (A.state.employees || []).filter(employee => {
      if (companyId && companyOf(employee) !== companyId) return false;
      if (centreId && centreOf(employee) !== centreId) return false;
      return true;
    }).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ca'));
  }
  function punchesForEmployee(A, employee) {
    const centreId = centreOf(employee);
    return (A.state.punches || []).filter(punch => {
      if (!sameScope(punch, companyOf(employee), centreId)) return false;
      if (punch.employeeId) return punch.employeeId === employee.id;
      if (punch.employeeCode && employee.code) return String(punch.employeeCode) === String(employee.code);
      return String(punch.employeeName || '').trim().toLowerCase() === String(employee.name || '').trim().toLowerCase();
    });
  }
  function movementsForEmployee(A, employee, start, end) {
    return (A.state.vacationMovements || []).filter(item => item.employeeId === employee.id && sameScope(item, companyOf(employee), centreOf(employee)) && inRange(item.date || '', start, end));
  }
  function activityInMonth(punches, year, month) {
    const range = monthRange(`${year}-${pad(month)}`);
    return punches.some(item => {
      const day = localDateISO(item.dateTime);
      return inRange(day, range.start, range.end);
    });
  }
  function accruedYTD(A, employee, selectedYear, selectedMonth, punches) {
    let total = 0;
    for (let month = 1; month <= selectedMonth; month += 1) {
      total += vacationAccrualForMonth(employee, selectedYear, month, activityInMonth(punches, selectedYear, month));
    }
    return round(total, 2);
  }
  function workedHolidayRows(A, employee, start, end) {
    const punches = punchesForEmployee(A, employee).filter(item => {
      const day = localDateISO(item.dateTime);
      return inRange(day, start, end);
    });
    const daily = punchDailySummary(punches);
    const calendars = A.state.labourCalendars || [];
    const rows = [];
    for (const [date, info] of Object.entries(daily).sort(([a], [b]) => a.localeCompare(b))) {
      if (!info.worked) continue;
      const holiday = holidayForDate(date, calendars, companyOf(employee), centreOf(employee));
      if (!holiday) continue;
      rows.push({
        employee,
        date,
        name: holiday.name,
        hours: info.hours,
        status: settlementStatus(A.state.holidaySettlements || [], employee.id, date, centreOf(employee))
      });
    }
    return rows;
  }
  function summaryForEmployee(A, employee, start, end, monthMeta = null) {
    const allPunches = punchesForEmployee(A, employee);
    const periodPunches = allPunches.filter(item => inRange(localDateISO(item.dateTime), start, end));
    const daily = punchDailySummary(periodPunches);
    const daysWorked = Object.values(daily).filter(item => item.worked).length;
    const hours = round(Object.values(daily).reduce((sum, item) => sum + Number(item.hours || 0), 0), 2);
    const holidays = workedHolidayRows(A, employee, start, end);
    const statusCounts = { PENDENT: 0, COMPENSAT: 0, PAGAT: 0 };
    holidays.forEach(item => { statusCounts[item.status] = (statusCounts[item.status] || 0) + 1; });
    const result = {
      employee,
      centreId: centreOf(employee),
      centreName: centreName(A, centreOf(employee)),
      daysWorked,
      hours,
      holidays,
      holidayWorked: holidays.length,
      pending: statusCounts.PENDENT || 0,
      compensated: statusCounts.COMPENSAT || 0,
      paid: statusCounts.PAGAT || 0,
      vacationGenerated: 0,
      vacationUsed: 0,
      vacationBalance: 0,
      holidayPendingBalance: 0
    };
    if (monthMeta) {
      const monthStart = `${monthMeta.year}-${pad(monthMeta.month)}-01`;
      const monthEnd = monthRange(`${monthMeta.year}-${pad(monthMeta.month)}`).end;
      result.vacationGenerated = round(vacationAccrualForMonth(employee, monthMeta.year, monthMeta.month, activityInMonth(allPunches, monthMeta.year, monthMeta.month)), 2);
      const ytdStart = `${monthMeta.year}-01-01`;
      const ytdEnd = monthEnd;
      const ytdAccrued = accruedYTD(A, employee, monthMeta.year, monthMeta.month, allPunches);
      const ytdMovements = movementsForEmployee(A, employee, ytdStart, ytdEnd);
      result.vacationUsed = round(movementsForEmployee(A, employee, monthStart, monthEnd).filter(item => item.type === 'GAUDIDES').reduce((sum, item) => sum + Math.abs(Number(item.days || 0)), 0), 2);
      result.vacationBalance = vacationBalance(ytdAccrued, ytdMovements);
      result.holidayPendingBalance = workedHolidayRows(A, employee, ytdStart, ytdEnd).filter(item => item.status === 'PENDENT').length;
    }
    return result;
  }

  function stat(value, label) {
    return `<div class="hrStat"><strong>${value}</strong><span>${label}</span></div>`;
  }
  function statusBadge(status) {
    const cls = status === 'PAGAT' ? 'ok' : status === 'COMPENSAT' ? 'info' : 'warn';
    return `<span class="badge ${cls}">${status}</span>`;
  }
  function selectedRange() {
    return ui.mode === 'week' ? weekRange(ui.weekStart) : monthRange(ui.month);
  }
  function periodLabel() {
    if (ui.mode === 'week') return `Setmana ${ui.weekStart} → ${addDays(ui.weekStart, 6)}`;
    const range = monthRange(ui.month);
    return new Intl.DateTimeFormat('ca-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(parseISODate(range.start));
  }
  function renderControls() {
    if (ui.mode === 'week') {
      return `<div class="hrControls"><button class="btn ${ui.mode === 'week' ? '' : 'secondary'}" onclick="ArcadiHR.setMode('week')">Resum setmanal</button><button class="btn secondary" onclick="ArcadiHR.setMode('month')">Resum mensual</button><button class="btn secondary" onclick="ArcadiHR.shiftWeek(-7)">←</button><input type="date" value="${ui.weekStart}" onchange="ArcadiHR.setWeek(this.value)"><button class="btn secondary" onclick="ArcadiHR.shiftWeek(7)">→</button><button class="btn secondary" onclick="ArcadiHR.printCurrent()">Imprimir</button></div>`;
    }
    return `<div class="hrControls"><button class="btn secondary" onclick="ArcadiHR.setMode('week')">Resum setmanal</button><button class="btn" onclick="ArcadiHR.setMode('month')">Resum mensual</button><button class="btn secondary" onclick="ArcadiHR.shiftMonth(-1)">←</button><input type="month" value="${ui.month}" onchange="ArcadiHR.setMonth(this.value)"><button class="btn secondary" onclick="ArcadiHR.shiftMonth(1)">→</button><button class="btn secondary" onclick="ArcadiHR.printCurrent()">Imprimir</button></div>`;
  }
  function renderSummaryTable(A, summaries) {
    if (ui.mode === 'week') {
      return `<div class="tableWrap"><table><thead><tr><th>Empleat</th><th>Centre</th><th>Dies treballats</th><th>Hores</th><th>Festius treballats</th><th>Pendents</th></tr></thead><tbody>${summaries.map(row => `<tr><td><b>${A.esc(row.employee.name || row.employee.code || '')}</b></td><td>${A.esc(row.centreName)}</td><td>${row.daysWorked}</td><td>${row.hours.toFixed(2)} h</td><td>${row.holidayWorked}</td><td>${row.pending}</td></tr>`).join('') || '<tr><td colspan="6">Sense empleats en aquest context.</td></tr>'}</tbody></table></div>`;
    }
    return `<div class="tableWrap"><table><thead><tr><th>Empleat</th><th>Centre</th><th>Dies treballats</th><th>Hores</th><th>Festius mes</th><th>Compensats</th><th>Pagats</th><th>Saldo festius pendent</th><th>Vacances generades</th><th>Vacances gaudides</th><th>Saldo vacances any</th><th></th></tr></thead><tbody>${summaries.map(row => `<tr><td><b>${A.esc(row.employee.name || row.employee.code || '')}</b></td><td>${A.esc(row.centreName)}</td><td>${row.daysWorked}</td><td>${row.hours.toFixed(2)} h</td><td>${row.holidayWorked}</td><td>${row.compensated}</td><td>${row.paid}</td><td><b>${row.holidayPendingBalance}</b></td><td>${row.vacationGenerated.toFixed(2)} d</td><td>${row.vacationUsed.toFixed(2)} d</td><td><b>${row.vacationBalance.toFixed(2)} d</b></td><td><button class="btn small secondary" onclick="ArcadiHR.openVacation('${A.esc(row.employee.id)}')">Moviment vacances</button></td></tr>`).join('') || '<tr><td colspan="12">Sense empleats en aquest context.</td></tr>'}</tbody></table></div>`;
  }
  function renderHolidayDetails(A, summaries) {
    const rows = summaries.flatMap(summary => summary.holidays.map(item => ({ ...item, centreName: summary.centreName })));
    return `<div class="panel"><h3>Festius treballats · ${A.esc(periodLabel())}</h3><p class="muted">Cada festiu treballat queda pendent fins que Direcció el marca com a compensat o pagat.</p><div class="tableWrap"><table><thead><tr><th>Data</th><th>Festiu</th><th>Empleat</th><th>Centre</th><th>Hores</th><th>Estat</th><th>Liquidació</th></tr></thead><tbody>${rows.map(item => `<tr><td>${A.esc(item.date)}</td><td>${A.esc(item.name)}</td><td>${A.esc(item.employee.name || '')}</td><td>${A.esc(item.centreName)}</td><td>${Number(item.hours || 0).toFixed(2)} h</td><td>${statusBadge(item.status)}</td><td><button class="btn small secondary" onclick="ArcadiHR.setHolidayStatus('${A.esc(item.employee.id)}','${A.esc(item.date)}','PENDENT')">Pendent</button> <button class="btn small secondary" onclick="ArcadiHR.setHolidayStatus('${A.esc(item.employee.id)}','${A.esc(item.date)}','COMPENSAT')">Compensat</button> <button class="btn small" onclick="ArcadiHR.setHolidayStatus('${A.esc(item.employee.id)}','${A.esc(item.date)}','PAGAT')">Pagat</button></td></tr>`).join('') || '<tr><td colspan="7">No hi ha festius treballats en aquest període.</td></tr>'}</tbody></table></div></div>`;
  }
  function renderCalendar(A) {
    const centreId = A.context?.centreId || '';
    if (!centreId) return `<div class="panel"><h3>Calendari laboral</h3><div class="notice">Selecciona un centre de treball al selector superior per editar els seus festius autonòmics i locals. El 15/08 i el 25/12 es reconeixen automàticament cada any.</div></div>`;
    const year = ui.mode === 'month' ? monthRange(ui.month).year : Number(ui.weekStart.slice(0, 4));
    const companyId = A.context.companyId || LEGACY_COMPANY;
    const custom = (A.state.labourCalendars || []).filter(item => sameScope(item, companyId, centreId) && item.active !== false && (!item.date || item.date.startsWith(`${year}-`)));
    const baseRows = BASE_RECURRING_HOLIDAYS.map(item => `<tr><td>cada any · ${item.monthDay.slice(3)}/${item.monthDay.slice(0, 2)}</td><td>${A.esc(item.name)}</td><td><span class="badge ok">FIXE</span></td><td></td></tr>`).join('');
    const customRows = custom.map(item => `<tr><td>${item.date ? A.esc(item.date) : `cada any · ${A.esc(item.monthDay.slice(3))}/${A.esc(item.monthDay.slice(0, 2))}`}</td><td>${A.esc(item.name || 'Festiu')}</td><td><span class="badge">CALENDARI</span></td><td><button class="btn small bad" onclick="ArcadiHR.removeHoliday('${A.esc(item.id)}')">Eliminar</button></td></tr>`).join('');
    return `<div class="panel"><div class="toolbar"><h3>Calendari laboral · ${year}</h3><button class="btn" onclick="ArcadiHR.openHoliday()">+ Afegir festiu</button></div><p class="muted">Els festius del centre es creuen automàticament amb els fitxatges. 15/08 i 25/12 són recurrents del sistema; afegeix aquí els autonòmics, locals o dates especials de cada any.</p><div class="tableWrap"><table><thead><tr><th>Data</th><th>Nom</th><th>Origen</th><th></th></tr></thead><tbody>${baseRows}${customRows || ''}</tbody></table></div></div>`;
  }
  function renderVacationMovements(A) {
    if (ui.mode !== 'month') return '';
    const range = monthRange(ui.month);
    const employees = new Map(employeesInContext(A).map(item => [item.id, item]));
    const rows = (A.state.vacationMovements || []).filter(item => inRange(item.date || '', range.start, range.end) && employees.has(item.employeeId)).sort((a, b) => String(b.date).localeCompare(String(a.date))).map(item => {
      const employee = employees.get(item.employeeId);
      return `<tr><td>${A.esc(item.date)}</td><td>${A.esc(employee?.name || item.employeeName || '')}</td><td>${A.esc(item.type)}</td><td>${Number(item.days || 0).toFixed(2)} d</td><td>${A.esc(item.note || '')}</td><td><button class="btn small bad" onclick="ArcadiHR.removeVacation('${A.esc(item.id)}')">Eliminar</button></td></tr>`;
    }).join('');
    return `<div class="panel"><h3>Moviments de vacances · ${A.esc(periodLabel())}</h3><div class="tableWrap"><table><thead><tr><th>Data</th><th>Empleat</th><th>Tipus</th><th>Dies</th><th>Nota</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="6">Sense moviments aquest mes.</td></tr>'}</tbody></table></div></div>`;
  }
  function render() {
    const A = currentA();
    if (!A?.state) return '<div class="panel">Carregant RRHH…</div>';
    const range = selectedRange();
    const employees = employeesInContext(A);
    const monthMeta = ui.mode === 'month' ? monthRange(ui.month) : null;
    const summaries = employees.map(employee => summaryForEmployee(A, employee, range.start, range.end, monthMeta));
    const totals = summaries.reduce((acc, row) => {
      acc.days += row.daysWorked; acc.hours += row.hours; acc.holidays += row.holidayWorked; acc.pending += row.pending;
      return acc;
    }, { days: 0, hours: 0, holidays: 0, pending: 0 });
    return `<div id="hrSummaryPrint"><div class="panel"><div class="toolbar"><div><h3>Resum laboral · ${A.esc(periodLabel())}</h3><p class="muted">Càlcul automàtic per empleat i centre a partir dels fitxatges reals.</p></div>${renderControls()}</div><div class="hrStats">${stat(totals.days, 'Dies treballats')}${stat(totals.hours.toFixed(2) + ' h', 'Hores registrades')}${stat(totals.holidays, 'Festius treballats')}${stat(totals.pending, 'Festius pendents del període')}</div>${renderSummaryTable(A, summaries)}</div>${renderHolidayDetails(A, summaries)}${renderCalendar(A)}${renderVacationMovements(A)}</div>`;
  }

  async function reopen(message) {
    const A = currentA();
    await A.save(message || 'RRHH GUARDAT');
    return window.ArcadiModules.open('hrSummary');
  }
  function employeeById(A, id) { return (A.state.employees || []).find(item => item.id === id); }
  async function setHolidayStatus(employeeId, date, status) {
    const A = currentA();
    const employee = employeeById(A, employeeId);
    if (!employee) return;
    A.state.holidaySettlements = A.state.holidaySettlements || [];
    let record = A.state.holidaySettlements.find(item => item.employeeId === employeeId && item.date === date && sameScope(item, companyOf(employee), centreOf(employee)));
    if (!record) {
      record = {
        id: A.uid('holidaySettlement'), employeeId, employeeName: employee.name || '', date,
        companyId: companyOf(employee), centreId: centreOf(employee), scope: 'CENTRE', createdAt: new Date().toISOString()
      };
      A.state.holidaySettlements.push(record);
    }
    record.status = status;
    record.updatedAt = new Date().toISOString();
    await reopen('FESTIU ACTUALITZAT');
  }
  function openHoliday() {
    const A = currentA();
    const centreId = A.context?.centreId || '';
    if (!centreId) return alert('Selecciona primer un centre de treball.');
    const year = ui.mode === 'month' ? monthRange(ui.month).year : Number(ui.weekStart.slice(0, 4));
    A.modal('Nou festiu del calendari laboral', `<form id="hrHolidayForm" class="arcadiForm"><div class="arcadiFormGrid"><div class="arcadiField"><label>Data</label><input name="date" type="date" value="${year}-01-01" required></div><div class="arcadiField"><label>Nom del festiu</label><input name="name" required></div><div class="arcadiField"><label>Repetició</label><select name="recurring"><option value="NO">Només aquesta data</option><option value="SI">Cada any</option></select></div></div><div class="actions"><button class="btn" type="submit">Guardar festiu</button><button class="btn secondary" type="button" onclick="ArcadiERP.closeModal()">Cancel·lar</button></div></form>`);
    document.getElementById('hrHolidayForm').onsubmit = async event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      A.state.labourCalendars = A.state.labourCalendars || [];
      const record = {
        id: A.uid('labourHoliday'), name: String(values.name || '').trim(),
        companyId: A.context.companyId || LEGACY_COMPANY, centreId, scope: 'CENTRE', active: true,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      };
      if (values.recurring === 'SI') record.monthDay = String(values.date).slice(5);
      else record.date = String(values.date);
      A.state.labourCalendars.push(record);
      A.closeModal();
      await reopen('CALENDARI GUARDAT');
    };
  }
  async function removeHoliday(id) {
    if (!confirm('Eliminar aquest festiu del calendari del centre?')) return;
    const A = currentA();
    A.state.labourCalendars = (A.state.labourCalendars || []).filter(item => item.id !== id);
    await reopen('CALENDARI GUARDAT');
  }
  function openVacation(employeeId) {
    const A = currentA();
    const employee = employeeById(A, employeeId);
    if (!employee) return;
    const range = monthRange(ui.month);
    const today = new Date().toISOString().slice(0, 10);
    const date = inRange(today, range.start, range.end) ? today : range.end;
    A.modal(`Moviment de vacances · ${employee.name || employee.code || ''}`, `<form id="hrVacationForm" class="arcadiForm"><div class="arcadiFormGrid"><div class="arcadiField"><label>Data</label><input name="date" type="date" value="${date}" required></div><div class="arcadiField"><label>Tipus</label><select name="type"><option value="GAUDIDES">Vacances gaudides</option><option value="AJUST_POSITIU">Ajust positiu / saldo anterior</option><option value="AJUST_NEGATIU">Ajust negatiu</option></select></div><div class="arcadiField"><label>Dies</label><input name="days" type="number" min="0.01" step="0.01" value="1" required></div><div class="arcadiField arcadiFieldWide"><label>Nota</label><textarea name="note"></textarea></div></div><div class="actions"><button class="btn" type="submit">Guardar moviment</button><button class="btn secondary" type="button" onclick="ArcadiERP.closeModal()">Cancel·lar</button></div></form>`);
    document.getElementById('hrVacationForm').onsubmit = async event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      const days = Number(values.days || 0);
      if (!(days > 0)) return alert('Indica un nombre de dies superior a zero.');
      A.state.vacationMovements = A.state.vacationMovements || [];
      A.state.vacationMovements.push({
        id: A.uid('vacationMovement'), employeeId: employee.id, employeeName: employee.name || '', date: String(values.date),
        type: String(values.type), days, note: String(values.note || '').trim(), companyId: companyOf(employee), centreId: centreOf(employee), scope: 'CENTRE',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
      A.closeModal();
      await reopen('VACANCES ACTUALITZADES');
    };
  }
  async function removeVacation(id) {
    if (!confirm('Eliminar aquest moviment de vacances?')) return;
    const A = currentA();
    A.state.vacationMovements = (A.state.vacationMovements || []).filter(item => item.id !== id);
    await reopen('VACANCES ACTUALITZADES');
  }
  function setMode(mode) {
    ui.mode = mode === 'week' ? 'week' : 'month';
    window.ArcadiModules.open('hrSummary');
  }
  function setMonth(value) { if (/^\d{4}-\d{2}$/.test(value)) ui.month = value; window.ArcadiModules.open('hrSummary'); }
  function shiftMonth(delta) {
    const [year, month] = ui.month.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1 + Number(delta || 0), 1));
    ui.month = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
    window.ArcadiModules.open('hrSummary');
  }
  function setWeek(value) { if (/^\d{4}-\d{2}-\d{2}$/.test(value)) ui.weekStart = mondayISO(`${value}T12:00:00`); window.ArcadiModules.open('hrSummary'); }
  function shiftWeek(days) { ui.weekStart = addDays(ui.weekStart, days); window.ArcadiModules.open('hrSummary'); }
  function printCurrent() {
    const source = document.getElementById('hrSummaryPrint');
    const target = document.getElementById('printArea');
    if (!source || !target) return window.print();
    target.innerHTML = `<div class="draftDoc"><h1>Resum laboral i vacances</h1><p>${periodLabel()}</p>${source.innerHTML}</div>`;
    window.print();
  }
  function injectStyle() {
    if (document.getElementById('arcadiHrSummaryStyle')) return;
    const style = document.createElement('style');
    style.id = 'arcadiHrSummaryStyle';
    style.textContent = `.hrControls{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.hrControls input{max-width:170px}.hrStats{display:grid;grid-template-columns:repeat(4,minmax(130px,1fr));gap:10px;margin:14px 0}.hrStat{border:1px solid #d9cbb9;border-radius:10px;padding:12px;background:#fffaf2}.hrStat strong{display:block;font-size:1.45rem}.hrStat span{font-size:.82rem;color:#6b625a}.badge.info{background:#e9f2fb;color:#254c70}@media(max-width:900px){.hrStats{grid-template-columns:1fr 1fr}}@media(max-width:560px){.hrStats{grid-template-columns:1fr}.hrControls input{max-width:none;width:100%}}`;
    document.head.appendChild(style);
  }
  function injectNavigation() {
    const nav = document.getElementById('nav');
    if (!nav || nav.querySelector('[data-arcadi-key="hrSummary"]')) return;
    const button = document.createElement('button');
    button.dataset.arcadiKey = 'hrSummary';
    button.textContent = 'Resum laboral / vacances';
    button.onclick = () => window.ArcadiModules.open('hrSummary');
    const directionGroup = Array.from(nav.children).find(node => node.classList?.contains('group') && node.textContent.trim() === 'DIRECCIÓ');
    if (directionGroup) nav.insertBefore(button, directionGroup);
    else nav.appendChild(button);
  }
  function install(attempt = 0) {
    if (typeof window === 'undefined') return false;
    const A = window.ArcadiERP;
    const modules = window.ArcadiModules;
    if (!A || !modules?.definitions) {
      if (attempt < 20) setTimeout(() => install(attempt + 1), 100);
      return false;
    }
    if (!modules.definitions.hrSummary) {
      modules.definitions.hrSummary = {
        key: 'hrSummary', phase: 56, section: 'operations', label: 'Resum laboral i vacances',
        description: 'Dies i hores treballades, festius, compensacions i vacances per empleat i centre de treball.',
        renderer: render
      };
    }
    injectStyle();
    const nav = document.getElementById('nav');
    if (nav && !nav.__arcadiHrObserver) {
      const observer = new MutationObserver(injectNavigation);
      observer.observe(nav, { childList: true });
      nav.__arcadiHrObserver = observer;
    }
    injectNavigation();
    if (location.hash === '#arcadi-hrSummary') setTimeout(() => modules.open('hrSummary'), 0);
    return true;
  }

  return {
    TIME_ZONE,
    VACATION_MONTHLY_RATE,
    BASE_RECURRING_HOLIDAYS,
    addDays,
    mondayISO,
    monthRange,
    weekRange,
    localDateISO,
    vacationAccrualForMonth,
    punchDailySummary,
    holidayForDate,
    settlementStatus,
    vacationBalance,
    install,
    render,
    setMode,
    setMonth,
    shiftMonth,
    setWeek,
    shiftWeek,
    setHolidayStatus,
    openHoliday,
    removeHoliday,
    openVacation,
    removeVacation,
    printCurrent
  };
});
