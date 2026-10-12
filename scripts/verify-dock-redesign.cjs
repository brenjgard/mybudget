/* eslint-disable @typescript-eslint/no-require-imports -- Exercise production TypeScript without a duplicate engine. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,filename);
const {buildCashEvents,buildDockForecast,getCalendarWeeksForMonth,getCalendarWeeksForRange,isoDate} = require('../app/lib/harbor-domain.ts');
const {mergeDockEvents,weekProjection} = require('../app/lib/dock-view.ts');
const {buildProjectedAmounts} = require('../app/lib/schedule.ts');
const {localBudgetRepo:repo} = require('../app/lib/repositories/local-budget-repo.ts');
const store=new Map(); global.localStorage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)};
let checks=0; const test=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
const item={id:'bill',name:'Bill',category:'Bills',defaultAmount:200,paymentMethod:'checking',isIncome:false,frequency:'every-week',planType:'scheduled_expense'};
const settings={checkingBalance:1000,creditCards:[],categories:['Bills'],lineItems:[item,{...item,id:'pay',name:'Pay',isIncome:true,defaultAmount:500}]};
const buoy={id:'savings',name:'Savings',current:0,goal:1000,autoSave:150,autoSaveDay:14};
const build=(states=[],config=settings,month=9)=>{const weeks=getCalendarWeeksForMonth(2026,month);return buildCashEvents({settings:config,weeks,month,monthKey:`2026-${String(month+1).padStart(2,'0')}`,amounts:buildProjectedAmounts(config,weeks,month,{}),spendLogs:[],dockStates:states,cardPaymentStates:states,buoys:[buoy]});};
const stateFor=(event,changes={})=>({monthKey:event.sourceMonthKey,weekIndex:event.weekIndex,itemId:event.itemId,itemKind:event.itemKind,behaviorType:event.kind==='income'?'income':'fixed_bill',status:'adjusted',plannedAmount:event.amount,actualAmount:event.amount,pendingUntil:isoDate(event.date),...changes});
test('Move and reduce a savings transfer: destination changes, next recurring month remains intact, reload persists',()=>{
 const original=build().find(e=>e.kind==='transfer'); const state=stateFor(original,{actualAmount:90,pendingUntil:'2026-10-25'});repo.saveDockItemState(state);
 const moved=build(repo.getDockItemStates('2026-10')).find(e=>e.kind==='transfer'); assert.equal(isoDate(moved.date),'2026-10-25');assert.equal(moved.amount,90);assert.equal(moved.weekIndex,original.weekIndex);
 const weeks=getCalendarWeeksForRange(new Date(2026,9,10),4);const forecast=buildDockForecast([moved],1000,weeks);assert.equal(forecast.reduce((sum,w)=>sum+w.outflows,0),90);assert.equal(forecast.find(w=>w.events.length).ending,910);
 const next=build([],settings,10).find(e=>e.kind==='transfer');assert.equal(next.amount,150);assert.equal(isoDate(next.date),'2026-11-14');
});
test('Income amount and date edits preserve source identity and other paychecks',()=>{
 const original=build().find(e=>e.kind==='income');const state=stateFor(original,{actualAmount:725,pendingUntil:'2026-11-03'});const events=build([state]);const moved=events.find(e=>e.itemId===original.itemId&&e.weekIndex===original.weekIndex);assert.equal(moved.amount,725);assert.equal(isoDate(moved.date),'2026-11-03');assert.equal(moved.sourceMonthKey,'2026-10');assert.ok(events.some(e=>e.kind==='income'&&e.weekIndex!==original.weekIndex&&e.amount===500));
});
test('Skip one recurring bill, then restore without changing future occurrences',()=>{
 const original=build().find(e=>e.itemId==='bill');const state=stateFor(original,{status:'skipped',actualAmount:0});assert.equal(build([state]).filter(e=>e.itemId==='bill').length,build().filter(e=>e.itemId==='bill').length-1);assert.equal(build([{...state,status:'upcoming',actualAmount:200}]).filter(e=>e.itemId==='bill').length,build().filter(e=>e.itemId==='bill').length);
});
test('Paid bill leaves forecast and remains in history',()=>{
 const original=build().find(e=>e.itemId==='bill');const events=build([stateFor(original,{status:'cleared',clearedAt:'2026-10-11T12:00:00Z'})]);assert.equal(events.find(e=>e.itemId==='bill'&&e.weekIndex===original.weekIndex).status,'done');const forecast=buildDockForecast(events,1000,getCalendarWeeksForMonth(2026,9));assert.ok(!forecast.flatMap(w=>w.events).some(e=>e.status==='done'));
});
test('Intra-week negative low remains visible despite positive ending; running balances agree',()=>{
 const base=build().find(e=>e.itemId==='bill');const events=[{...base,id:'out',date:new Date(2026,9,12),amount:1400},{...base,id:'in',kind:'income',date:new Date(2026,9,15),amount:2200}];const week=buildDockForecast(events,1000,getCalendarWeeksForRange(new Date(2026,9,11),1))[0];assert.equal(week.lowest,-400);assert.equal(week.ending,1800);assert.deepEqual(weekProjection(week).filter(p=>p.event).map(p=>p.balance),[-400,1800]);
});
test('Changing horizon retains preceding cash flow rather than resetting checking at future windows',()=>{
 const events=build();const short=buildDockForecast(events,1000,getCalendarWeeksForRange(new Date(2026,9,1),4));for(const count of [8,12]){const long=buildDockForecast(events,1000,getCalendarWeeksForRange(new Date(2026,9,1),count));assert.deepEqual(long.slice(0,4),short);assert.equal(long[4].starting,short[3].ending);}
});
test('Projected card fragments aggregate once before amount/date override, skip or paid state',()=>{
 const id='projected-card-payment:card:2026-11-15';const base={...build()[0],id,itemId:id,itemKind:'credit_card_payment',kind:'cardPayment',date:new Date(2026,10,15),sourceMonthKey:'2026-10',amount:350};const fragments=[base,{...base,sourceMonthKey:'2026-11',amount:250}];assert.equal(mergeDockEvents(fragments)[0].amount,600);
 const state=stateFor(base,{actualAmount:480,pendingUntil:'2026-11-18'});const merged=mergeDockEvents(fragments,[state]);assert.equal(merged.length,1);assert.equal(merged[0].amount,480);assert.equal(isoDate(merged[0].date),'2026-11-18');assert.equal(mergeDockEvents(fragments,[{...state,status:'skipped'}]).length,0);assert.equal(mergeDockEvents(fragments,[{...state,status:'cleared'}])[0].status,'done');
});
test('Two distinct source occurrences moved to same date are not discarded as duplicates',()=>{
 const original=build().find(e=>e.itemId==='bill');const first={...original,date:new Date(2026,10,3),state:stateFor(original,{pendingUntil:'2026-11-03'})};const second={...first,id:'other',weekIndex:first.weekIndex+1,state:{...first.state,weekIndex:first.weekIndex+1}};assert.equal(mergeDockEvents([first,second]).length,2);
});
test('Actual spending for a moved allowance replaces its source plan once after reload',()=>{
 const allowance={...item,id:'allowance',planType:'weekly_allowance',rippleType:'flexible',includeInCashForecast:true};
 const config={...settings,lineItems:[allowance]};const source=build([],config).find(event=>event.itemId==='allowance');
 const state=stateFor(source,{pendingUntil:'2026-10-23'});repo.saveDockItemState(state);
 repo.saveSpendLog({id:'moved-actual',monthKey:source.sourceMonthKey,weekIndex:source.weekIndex,rippleId:source.itemId,amount:35,paymentMethod:'checking',date:'2026-10-23',createdAt:'2026-10-23T12:00:00Z'});
 const weeks=getCalendarWeeksForMonth(2026,9);const events=buildCashEvents({settings:config,weeks,month:9,monthKey:'2026-10',amounts:buildProjectedAmounts(config,weeks,9,{}),spendLogs:repo.getSpendLogs('2026-10'),dockStates:repo.getDockItemStates('2026-10'),buoys:[]});
 const occurrence=events.filter(event=>event.itemId===source.itemId&&event.weekIndex===source.weekIndex);assert.equal(occurrence.length,1);assert.equal(occurrence[0].status,'done');assert.equal(occurrence[0].amount,35);assert.equal(isoDate(occurrence[0].date),'2026-10-23');assert.ok(events.some(event=>event.itemId==='allowance'&&event.weekIndex!==source.weekIndex&&event.status==='upcoming'));
});
console.log(`${checks} Dock redesign regression checks passed.`);

