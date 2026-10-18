/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,filename);
const {needsOnboarding,parseOnboarding,remainingSetup}=require('../app/lib/onboarding-state.ts');
const {recurringSetupItem}=require('../app/lib/setup-records.ts');
const {lineItemOccurrenceDatesForWeek}=require('../app/lib/schedule.ts');
const settings={checkingBalance:0,creditCards:[],categories:[],lineItems:[]};
assert.equal(needsOnboarding(null,null),true);
assert.equal(needsOnboarding(settings,null),false);
assert.equal(needsOnboarding(settings,{version:1,step:2,complete:false}),true);
assert.equal(needsOnboarding(settings,{version:1,step:5,complete:true}),false);
assert.equal(parseOnboarding({version:1,step:9,complete:false}),null);
const draft={id:'stable-id',name:'Pay',amount:'200',frequency:'weekly',date:'2026-10-23',paymentMethod:'checking'};
for(const frequency of ['weekly','biweekly','monthly','quarterly','annual']){
 const item=recurringSetupItem({...draft,frequency},true);
 const before=lineItemOccurrenceDatesForWeek(item,0,new Date(2026,8,1),new Date(2026,8,30),8);
 const after=lineItemOccurrenceDatesForWeek(item,0,new Date(2026,9,18),new Date(2026,9,24),9);
 assert.equal(before.length,0,frequency+' starts on next expected date');assert.equal(after.length,1,frequency+' first occurrence');assert.equal(item.id,'stable-id');
}
assert.throws(()=>recurringSetupItem({...draft,amount:''},true));
assert.throws(()=>recurringSetupItem({...draft,amount:'-1'},true));
const tasks=remainingSetup(settings);assert.equal(tasks.length,3);assert.ok(tasks.every(t=>t.href!=='/setup'));
assert.equal(remainingSetup({...settings,lineItems:[recurringSetupItem(draft,true),recurringSetupItem({...draft,id:'bill'},false),{id:'allowance',planType:'weekly_allowance'}]}).length,0);
console.log('PASS new/legacy/resuming user gates, completion, next expected dates across five frequencies, stable IDs, validation and progressive setup destinations.');
