/* eslint-disable @typescript-eslint/no-require-imports -- Exercise production forecast and loading code. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
process.env.TZ = 'America/New_York';
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const fetched = [];
const repo = {
  getCheckingAnchor: async () => ({ balance: 5000, updatedAt: '2026-10-25T12:00:00Z' }),
  getEarliestUnresolvedDockMonth: async () => null,
  getMonthlyAmounts: async key => { fetched.push(key); return {}; },
  getSpendLogs: async () => [], getDockItemStates: async () => [], getBuoys: async () => [],
};
const originalLoad = Module._load;
Module._load = function(name, parent, main) {
  if (name === './repositories/budget-repo') return { budgetRepo: repo };
  return originalLoad.call(this, name, parent, main);
};
const { loadHomeCashOutlook } = require('../app/lib/home-cash-outlook.ts');
const { calendarDay } = require('../app/lib/calendar-date.ts');
const { expectedCardBalance } = require('../app/lib/card-payments.ts');
const { buildCashEvents, buildDockForecast, getCalendarWeeksForMonth, getCalendarWeeksForRange,
  weekIndexForDate, budgetedForItemWeek, isoDate, parseDateOnly, cardCycleForDate } = require('../app/lib/harbor-domain.ts');
const { buildProjectedAmounts } = require('../app/lib/schedule.ts');
const { mergeDockEvents } = require('../app/lib/dock-view.ts');
const card = { id: 'card', label: 'Card', currentBalance: 2500, currentBalanceUpdatedAt: '2026-09-30T12:00:00Z', statementClosingDay: 30, paymentDueDay: 28 };
const config = { checkingBalance: 5000, creditCards: [card], categories: [], lineItems: [] };
const item = { id: 'spend', name: 'Spending', category: 'Bills', defaultAmount: 300, paymentMethod: 'card', isIncome: false,
  frequency: 'every-week', planType: 'scheduled_expense', recurrence: { type: 'weekly', daysOfWeek: [5] } };
const build = (settings, month, saved = {}, logs = [], states = []) => {
  const weeks = getCalendarWeeksForMonth(2026, month);
  return buildCashEvents({ settings, month, monthKey: `2026-${String(month + 1).padStart(2, '0')}`, weeks,
    amounts: buildProjectedAmounts(settings, weeks, month, saved), spendLogs: logs, dockStates: states, buoys: [] });
};
let checks = 0;
const test = async (name, fn) => { await fn(); checks++; console.log('PASS ' + name); };
(async () => {
  await test('Older card source month is loaded; refund cannot reintroduce previously omitted debt', async () => {
    const old = await loadHomeCashOutlook(config, new Date(2026, 9, 25));
    assert.ok(fetched.includes('2026-09'));
    assert.equal(old.lowest.balance, 2500);
    const later = await loadHomeCashOutlook(config, new Date(2026, 9, 27));
    assert.equal(later.lowest.balance, old.lowest.balance);
    assert.deepEqual(later.forecast, old.forecast);
    const fresh = await loadHomeCashOutlook({ ...config, creditCards: [{ ...card, currentBalance: 1400, currentBalanceUpdatedAt: '2026-10-27T12:00:00Z' }] }, new Date(2026, 9, 27));
    assert.equal(fresh.lowest.balance, 3600);
    assert.ok(fresh.lowest.balance >= old.lowest.balance);
  });
  await test('Sunday rollover can expose a new low while the overlapping weeks stay identical', () => {
    const event = { id: 'bill', itemId: 'bill', label: 'Bill', amount: 1000, kind: 'checkingPayment', status: 'upcoming', date: new Date(2026, 11, 15) };
    const before = buildDockForecast([event], 1100, getCalendarWeeksForRange(new Date(2026, 9, 24), 8));
    const after = buildDockForecast([event], 1100, getCalendarWeeksForRange(new Date(2026, 9, 26), 8));
    assert.equal(Math.min(...before.map(w => w.lowest)), 1100);
    assert.equal(Math.min(...after.map(w => w.lowest)), 100);
    assert.deepEqual(before.slice(1), after.slice(0, 7));
  });
  await test('Bank balance includes snapshot-day purchases once, consistently with expected balance', () => {
    const snapshot = { ...card, currentBalance: 1000, currentBalanceUpdatedAt: '2026-10-27T12:00:00Z' };
    const logs = [{ id: 'log', rippleId: 'spend', weekIndex: 4, monthKey: '2026-10', paymentMethod: 'card', amount: 200, date: '2026-10-27' }];
    const events = build({ ...config, creditCards: [snapshot] }, 9, {}, logs);
    assert.equal(events.reduce((sum, e) => sum + e.amount, 0), 1000);
    assert.equal(expectedCardBalance(snapshot, logs, []), 1000);
  });
  await test('Snapshot timestamp after UTC midnight stays on the local day and statement cycle', () => {
    const timestamp = '2026-10-28T01:00:00Z';
    assert.equal(calendarDay(timestamp), '2026-10-27');
    assert.equal(isoDate(parseDateOnly(timestamp)), '2026-10-27');
    assert.equal(isoDate(cardCycleForDate({ ...card, statementClosingDay: 27 }, parseDateOnly(timestamp)).cycleEnd), '2026-10-27');
    assert.equal(expectedCardBalance({ ...card, currentBalanceUpdatedAt: timestamp }, [{ paymentMethod: 'card', amount: 100, date: '2026-10-28' }], []), 2600);
  });
  await test('Explicit zero budget and zero Dock adjustment never restore the default amount', () => {
    const noAnchor = { ...card, currentBalance: 0, currentBalanceUpdatedAt: '2026-10-01T12:00:00Z' };
    const one = { ...item, recurrence: { type: 'monthly', daysOfMonth: [15] } };
    const weeks = getCalendarWeeksForMonth(2026, 9);
    const index = weekIndexForDate(weeks, new Date(2026, 9, 15));
    const settings = { ...config, creditCards: [noAnchor], lineItems: [one] };
    assert.equal(build(settings, 9, { spend: { [index]: 0 } }).length, 0);
    assert.equal(build(settings, 9, {}, [], [{ itemId: 'spend', weekIndex: index, status: 'adjusted', actualAmount: 0 }]).length, 0);
    assert.equal(budgetedForItemWeek({ spend: { [index]: 0 } }, { ...one, planType: 'monthly_allowance' }, weeks[index], index, 9, weeks.length, 2026), 0);
    assert.equal(budgetedForItemWeek({ spend: { [index]: 0 } }, { ...one, planType: 'monthly_allowance', waveType: 'oneTime', oneTimeDate: '2026-10-15' }, weeks[index], index, 9, weeks.length, 2026), 0);
  });
  await test('One-time card purchase in a shared month-boundary week forecasts one obligation', () => {
    const settings = { ...config, creditCards: [{ ...card, currentBalance: 0 }], lineItems: [{ ...item, waveType: 'oneTime', oneTimeDate: '2026-11-01' }] };
    const events = mergeDockEvents([ ...build(settings, 9), ...build(settings, 10) ]);
    assert.equal(events.reduce((sum, e) => sum + e.amount, 0), 300);
  });
  await test('Saturday afternoon belongs to its calendar week, including month end', () => {
    const weeks = getCalendarWeeksForMonth(2026, 9);
    assert.equal(weekIndexForDate(weeks, new Date(2026, 9, 31, 16)), weeks.length - 1);
  });
  await test('DST week and year rollover preserve daily income/payment ordering and horizon prefix', () => {
    const settings = { ...config, creditCards: [], lineItems: [{ ...item, paymentMethod: 'checking', isIncome: true, recurrence: { type: 'weekly', daysOfWeek: [0] } }] };
    const events = mergeDockEvents([ ...build(settings, 9), ...build(settings, 10), ...build(settings, 11) ]);
    const start = new Date(2026, 9, 25);
    const short = buildDockForecast(events, 5000, getCalendarWeeksForRange(start, 8));
    const long = buildDockForecast(events, 5000, getCalendarWeeksForRange(start, 12));
    assert.deepEqual(long.slice(0, 8), short);
    assert.equal(short.flatMap(w => w.events).length, 8);
    const january = getCalendarWeeksForMonth(2027, 0);
    assert.equal(isoDate(january[0].start), '2026-12-27');
    assert.equal(weekIndexForDate(january, new Date(2027, 0, 2, 23)), 0);
  });
  console.log(`${checks} forecast/date audit checks passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
