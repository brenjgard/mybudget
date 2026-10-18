/* eslint-disable @typescript-eslint/no-require-imports -- Exercise the production summary. */
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,filename);
const {homeCardSummary}=require('../app/lib/home-card-summary.ts');
const card={id:'card',label:'Card'};
const forecast={card,amount:500,dueDate:new Date(2026,10,15)};
const statement={itemId:'card-statement:card:2026-10-15',itemKind:'credit_card_payment',status:'upcoming',actualAmount:1000,pendingUntil:'2026-10-15'};
const payment=(id,amount,status)=>({itemId:'scheduled-card-payment:card:2026-10-15:'+id,itemKind:'credit_card_payment',actualAmount:amount,status,pendingUntil:'2026-10-15'});
let result=homeCardSummary([forecast],[statement,payment('paid',200,'cleared'),payment('scheduled',600,'upcoming')]);
assert.equal(result.stillToPay,200);assert.equal(result.scheduled,600);assert.equal(result.next.amount,800);
assert.equal(result.rows.find(row=>row.status==='Projected next cycle').amount,500);
result=homeCardSummary([forecast],[statement,payment('paid',200,'cleared'),payment('scheduled',900,'upcoming')]);
assert.equal(result.stillToPay,0);assert.equal(result.scheduled,800);
result=homeCardSummary([forecast],[statement,payment('paid',1000,'cleared'),payment('skipped',500,'skipped')]);
assert.equal(result.stillToPay,0);assert.equal(result.scheduled,0);assert.ok(result.rows.some(row=>row.status==='Paid'));
result=homeCardSummary([{...forecast,dueDate:new Date(2026,9,15)}],[statement]);
assert.equal(result.rows.length,1);assert.equal(result.stillToPay,1000);
result=homeCardSummary([forecast],[{...statement,status:'skipped'}]);
assert.equal(result.rows.length,1);assert.equal(result.rows[0].status,'Projected next cycle');
result=homeCardSummary([forecast],[{...statement,status:'cleared'}]);
assert.ok(result.rows.some(row=>row.status==='Paid'));assert.equal(result.stillToPay,0);
console.log('PASS partial/full scheduling partitions unpaid dollars, over-scheduling caps coverage, paid/skipped/legacy records, next due and same-cycle estimate suppression.');

result=homeCardSummary([forecast],[statement,{...payment('early',300,'upcoming'),pendingUntil:'2026-10-12'},payment('later',500,'upcoming')]);
assert.equal(result.next.date,'2026-10-12');assert.equal(result.next.amount,300);assert.equal(result.paymentCount,2);
console.log('PASS next scheduled payment uses its actual payment date, not the statement due date.');
