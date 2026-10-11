/* eslint-disable @typescript-eslint/no-require-imports -- Execute the actual TypeScript domain code. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { statementProgress, expectedCardBalance, allocatedCardBalance } = require('../app/lib/card-payments.ts');
const { buildCashEvents, buildDockProjection, getCalendarWeeksForMonth } = require('../app/lib/harbor-domain.ts');
let checks = 0;
const test = (name, fn) => { fn(); checks++; console.log('PASS ' + name); };
const cards = ['chase', 'mileage'].map(id => ({id, label:id, currentBalance:2500, currentBalanceUpdatedAt:'2026-09-25T12:00:00Z', statementClosingDay:30, paymentDueDay:15}));
const payment = (id, date) => ({monthKey:date.slice(0,7),weekIndex:0,itemId:`scheduled-card-payment:${id}:2026-10-15:payment`,itemKind:'credit_card_payment',behaviorType:'credit_card_payment',status:'upcoming',plannedAmount:1000,actualAmount:1000,pendingUntil:date});
const payments = [payment('chase','2026-09-30'),payment('mileage','2026-10-05')];
const paidPayments = payments.map(row => ({...row,status:'cleared',clearedAt:row.pendingUntil+'T12:00:00Z'}));
const statement = {monthKey:'2026-10',weekIndex:2,itemId:'card-statement:chase:2026-10-15',itemKind:'credit_card_payment',behaviorType:'credit_card_payment',status:'pending',plannedAmount:1000,actualAmount:1000,pendingUntil:'2026-10-15'};
const buildEvents = states => ['2026-09','2026-10'].flatMap(monthKey => {
  const month=Number(monthKey.slice(5))-1;
  return buildCashEvents({settings:{checkingBalance:3900,creditCards:cards,lineItems:[],categories:[]},monthKey,month,weeks:getCalendarWeeksForMonth(2026,month),amounts:{},spendLogs:[],dockStates:states.filter(s=>s.monthKey===monthKey),cardPaymentStates:states,buoys:[]});
});
const low = (states, balance, start) => Math.min(...buildDockProjection(buildEvents(states),balance,new Date(start+'T00:00:00'),new Date('2026-10-31T00:00:00')).map(p=>p.balance));
test('Chase/Mileage: paying $2,000 across month end preserves the real -$1,100 low point', () => {
  assert.equal(low(payments,3900,'2026-09-29'),-1100);
  // The bank checking snapshot is updated after the two payments; card snapshots remain unchanged.
  assert.equal(low(paidPayments,1900,'2026-10-05'),-1100);
  assert.equal(buildEvents(paidPayments).filter(e=>e.status!=='done').reduce((sum,e)=>sum+e.amount,0),3000);
});
test('Dock payment clears Fleet statement even when the statement header was not updated', () => {
  assert.equal(statementProgress(statement,[paidPayments[0]]).isPaid,true);
  assert.equal(statementProgress(statement,[paidPayments[0]]).outstanding,0);
});
test('Partial, scheduled, skipped and undone payments have distinct statement totals', () => {
  const partial={...paidPayments[0],actualAmount:400};
  const future={...payments[0],itemId:payments[0].itemId+'-second',actualAmount:600};
  assert.deepEqual(statementProgress(statement,[partial,future]),{amount:1000,paid:400,scheduled:600,outstanding:600,unscheduled:0,isPaid:false});
  assert.equal(statementProgress({...statement,status:'cleared'},[payments[0]]).isPaid,false);
  assert.equal(statementProgress({...statement,status:'cleared'},[{...payments[0],status:'skipped'}]).isPaid,false);
});
test('Statement header plus payment is one payment, not two', () => {
  const header={...statement,status:'cleared',clearedAt:'2026-10-05T12:00:00Z'};
  assert.equal(expectedCardBalance(cards[0],[],[header,paidPayments[0]]),1500);
  assert.equal(allocatedCardBalance(cards[0],[header,paidPayments[0]],'2026-10-15'),1000);
  assert.equal(buildEvents([header,paidPayments[0]]).filter(e=>e.status==='done').length,1);
});
test('Legacy paid statement without child counts once', () => {
  const header={...statement,status:'cleared',clearedAt:'2026-10-05T12:00:00Z'};
  assert.equal(expectedCardBalance(cards[0],[],[header]),1500);
  assert.equal(buildEvents([header]).filter(e=>e.itemId===header.itemId&&e.status==='done').length,1);
});
test('Fresh bank card snapshot already includes earlier payments', () => {
  const fresh={...cards[0],currentBalance:1500,currentBalanceUpdatedAt:'2026-10-06T12:00:00Z'};
  assert.equal(expectedCardBalance(fresh,[],paidPayments),1500);
  assert.equal(allocatedCardBalance(fresh,paidPayments,'2026-10-15'),0);
});
test('Same-day payments use timestamps and duplicate source records count once', () => {
  const fresh={...cards[0],currentBalanceUpdatedAt:'2026-09-30T10:00:00Z'};
  assert.equal(expectedCardBalance(fresh,[],[paidPayments[0],paidPayments[0]]),1500);
});
test('One card payment never reduces a different card', () => {
  assert.equal(expectedCardBalance(cards[1],[],[paidPayments[0]]),2500);
});
test('Checking off an old payment after updating the bank snapshot does not subtract it again', () => {
  const fresh={...cards[0],currentBalance:1500,currentBalanceUpdatedAt:'2026-10-05T12:00:00Z'};
  const lateCheckoff={...paidPayments[0],clearedAt:'2026-10-11T12:00:00Z'};
  assert.equal(expectedCardBalance(fresh,[],[lateCheckoff]),1500);
  assert.equal(allocatedCardBalance(fresh,[lateCheckoff],'2026-10-15'),0);
});
console.log(`${checks} card-payment regression checks passed.`);
