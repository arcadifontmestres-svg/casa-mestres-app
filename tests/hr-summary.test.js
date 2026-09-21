'use strict';
const assert = require('node:assert/strict');
const HR = require('../public/js/hr-summary-module.js');

assert.equal(HR.VACATION_MONTHLY_RATE, 2.5);
assert.equal(HR.holidayForDate('2026-08-15', [], 'company_x', 'centre_x').name, 'Assumpció · 15/08');
assert.equal(HR.holidayForDate('2032-12-25', [], 'company_x', 'centre_x').name, 'Nadal · 25/12');
assert.equal(HR.holidayForDate('2026-09-11', [{ id:'h1', companyId:'c1', centreId:'s1', date:'2026-09-11', name:'Diada' }], 'c1', 's1').name, 'Diada');
assert.equal(HR.holidayForDate('2026-09-11', [{ id:'h1', companyId:'c1', centreId:'s2', date:'2026-09-11', name:'Alt centre' }], 'c1', 's1'), null);

const punches = [
  { type:'ENTRADA', dateTime:'2026-09-21T07:00:00.000Z' },
  { type:'PAUSA', dateTime:'2026-09-21T11:00:00.000Z' },
  { type:'TORNAR', dateTime:'2026-09-21T12:00:00.000Z' },
  { type:'SORTIDA', dateTime:'2026-09-21T16:00:00.000Z' }
];
const day = HR.punchDailySummary(punches)['2026-09-21'];
assert.equal(day.worked, true);
assert.equal(day.hours, 8);

assert.equal(HR.vacationAccrualForMonth({ active:true }, 2026, 9), 2.5);
assert.equal(HR.vacationAccrualForMonth({ active:false }, 2026, 9), 0);
assert.equal(HR.vacationAccrualForMonth({ active:false }, 2026, 9, true), 2.5);
assert.equal(HR.vacationBalance(7.5, [
  { type:'GAUDIDES', days:2 },
  { type:'AJUST_POSITIU', days:1 },
  { type:'AJUST_NEGATIU', days:0.5 }
]), 6);

assert.deepEqual(HR.monthRange('2026-02'), { start:'2026-02-01', end:'2026-02-28', year:2026, month:2 });
assert.deepEqual(HR.weekRange('2026-09-21'), { start:'2026-09-21', end:'2026-09-27' });

console.log('OK hr-summary.test.js');
