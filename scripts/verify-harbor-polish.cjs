/* eslint-disable @typescript-eslint/no-require-imports -- Node regression runner loads TypeScript through a transpile hook. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
// Run the existing TypeScript domain/repositories without a second test dependency.
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
};
const { budgetActions } = require('../app/lib/budget-actions.ts');
const { buildCurrentForwardBudgetSummary, buildCashEvents, getCalendarWeeksForMonth } = require('../app/lib/harbor-domain.ts');
const { localBudgetRepo: repo } = require('../app/lib/repositories/local-budget-repo.ts');
const store = new Map();
global.localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: (key) => store.delete(key) };
let checks = 0;
function test(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
const item = { id: 'allowance', name: 'Groceries', category: 'Food', defaultAmount: 100, paymentMethod: 'checking', isIncome: false, frequency: 'every-week', planType: 'weekly_allowance', rippleType: 'flexible', includeInCashForecast: true };
const settings = { checkingBalance: 1000, creditCards: [{ id: 'card', label: 'Test Card', statementClosingDay: 21, paymentDueDay: 15 }], categories: ['Food'], lineItems: [item] };
const weeks = getCalendarWeeksForMonth(2026, 8);
const amounts = { allowance: Object.fromEntries(weeks.map((_, i) => [i,100])) };
const state = { monthKey: '2026-09', weekIndex: 2, itemId: item.id, itemKind: 'ripple', behaviorType: 'flexible_spend', status: 'skipped', plannedAmount: 100, actualAmount: 0, pendingUntil: '2026-09-15' };
const summary = (states = [], logs = []) => buildCurrentForwardBudgetSummary({ settings, weeks, year: 2026, month: 8, amounts, dockStates: states, spendLogs: logs, today: new Date(2026,8,15) });
const events = (states = [], logs = [], config = settings) => buildCashEvents({ settings: config, weeks, month: 8, monthKey: '2026-09', amounts, dockStates: states, spendLogs: logs, buoys: [] });
for (const planType of ['weekly_allowance','monthly_allowance','scheduled_expense']) {
 for (const paymentMethod of ['checking','card']) {
  test(`${planType}/${paymentMethod}: category and source independent actions`, () => {
   const planned = { ...item, planType, paymentMethod };
   const expected = budgetActions(planned, undefined, 0);
   assert.equal(expected.edit,true); assert.equal(expected.skip,true); assert.equal(expected.spend,true);
   assert.deepEqual(budgetActions({ ...planned, category: 'Other', name: 'Manual', waveType: 'oneTime' }, undefined,0), expected);
   assert.equal(budgetActions(planned,state,0).restore,true);
   assert.equal(budgetActions(planned,state,0).spend,false);
   assert.equal(budgetActions(planned,undefined,25).skip,false);
   assert.equal(budgetActions(planned,{...state,status:'cleared'},100).skip,false);
  });
 }
}
test('Explicit allowances remain Budget items in any category', () => {
 const { getItemBehavior } = require('../app/lib/ripple-type.ts');
 for (const category of ['Credit Cards', 'Food', 'Other']) {
  assert.equal(getItemBehavior({...item,category}), 'flexible_spend');
 }
});
test('Skip affects this week and summary, retains future weeks and recurring definition', () => {
 repo.saveSettings(settings); repo.saveDockItemState(state);
 const loaded = repo.getDockItemStates('2026-09');
 assert.equal(summary(loaded).thisWeek.budgeted,0);
 assert.equal(summary(loaded).monthPosition.plannedSpending,summary().monthPosition.plannedSpending-100);
 assert.equal(events(loaded).filter(e=>e.weekIndex===2).length,0);
 assert.ok(events(loaded).some(e=>e.weekIndex===3));
 assert.deepEqual(repo.loadSettings().lineItems,[item]);
 assert.deepEqual(repo.getDockItemStates('2026-10'),[]);
});
test('Restore replaces occurrence without duplicates and survives repository reload', () => {
 repo.saveDockItemState({...state,status:'upcoming',actualAmount:undefined});
 const loaded = repo.getDockItemStates('2026-09');
 assert.equal(loaded.length,1); assert.equal(summary(loaded).thisWeek.budgeted,100);
 assert.ok(events(loaded).some(e=>e.weekIndex===2));
});
test('Amount edit including zero is reflected in Budget and Dock', () => {
 for (const amount of [65,0]) {
  repo.saveDockItemState({...state,status:'adjusted',actualAmount:amount});
  const loaded = repo.getDockItemStates('2026-09');
  assert.equal(summary(loaded).thisWeek.budgeted,amount);
  assert.equal(events(loaded).filter(e=>e.weekIndex===2).reduce((s,e)=>s+e.amount,0),amount);
 }
});
test('Done is recorded once in summary and cash event', () => {
 const done = {...state,status:'cleared',actualAmount:100,clearedAt:'2026-09-15T12:00:00Z'};
 repo.saveDockItemState(done);
 assert.equal(summary(repo.getDockItemStates('2026-09')).thisWeek.spent,100);
 assert.equal(events([done]).find(e=>e.weekIndex===2).status,'done');
});
const log = { id:'spend', monthKey:'2026-09',weekIndex:2,rippleId:'allowance',amount:35,paymentMethod:'checking',date:'2026-09-15',createdAt:'2026-09-15T12:00:00Z' };
test('Spend persists, feeds Budget and Dock, and can be deleted', () => {
 repo.saveSpendLog(log);
 const logs=repo.getSpendLogs('2026-09');
 assert.equal(summary([],logs).thisWeek.spent,35);
 assert.equal(events([],logs).filter(e=>e.weekIndex===2).reduce((s,e)=>s+e.amount,0),35);
 repo.deleteSpendLog('2026-09','spend'); assert.equal(repo.getSpendLogs('2026-09').length,0);
});
test('Card spending produces future payment without immediate checking spend', () => {
 const cardSettings={...settings,lineItems:[{...item,paymentMethod:'card'}]};
 const result=events([], [{...log,paymentMethod:'card'}], cardSettings);
 assert.ok(result.some(e=>e.kind==='cardPayment'));
 assert.equal(result.some(e=>e.kind==='checkingPayment'),false);
});
test('Card balances, statements and payment updates persist on fresh reads', () => {
 repo.saveSettings({...settings,creditCards:[{...settings.creditCards[0],currentBalance:450,currentBalanceUpdatedAt:'2026-09-15'}]});
 assert.equal(repo.loadSettings().creditCards[0].currentBalance,450);
 const statement={...state,itemId:'card-statement:card:2026-10-15',itemKind:'credit_card_payment',behaviorType:'credit_card_payment',status:'upcoming',plannedAmount:200,actualAmount:200,pendingUntil:'2026-10-15'};
 repo.saveDockItemState(statement);
 repo.saveDockItemState({...statement,actualAmount:225});
 const payment={...statement,itemId:'scheduled-card-payment:card:2026-10-15:test',actualAmount:225,status:'cleared',clearedAt:'2026-10-15T12:00:00Z'};
 repo.saveDockItemState(payment);
 const loaded=repo.getDockItemStates('2026-09');
 assert.equal(loaded.find(s=>s.itemId===statement.itemId).actualAmount,225);
 assert.equal(loaded.find(s=>s.itemId===payment.itemId).status,'cleared');
});
test('Six-week calendar retains last-week occurrence state', () => {
 const sixWeeks=getCalendarWeeksForMonth(2026,7); assert.equal(sixWeeks.length,6);
 repo.saveDockItemState({...state,monthKey:'2026-08',weekIndex:5});
 assert.equal(repo.getDockItemStates('2026-08')[0].weekIndex,5);
});
for (const result of require('../app/lib/forecast-scenarios.ts').runPhase5ForecastScenarios()) {
 test(`Existing forecast: ${result.name}`,()=>assert.equal(result.passed,true,JSON.stringify(result)));
}
console.log(`${checks} regression checks passed.`);
