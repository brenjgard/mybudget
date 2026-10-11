/* eslint-disable @typescript-eslint/no-require-imports -- Regression runner for the real repository facade. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const storage = new Map();
global.localStorage = {getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
const remote = {getUser:async()=>({id:'fixture'}),saveDockItemState:async row=>row};
const originalLoad = Module._load;
Module._load = function(name, parent, main) {
  if (name.endsWith('/supabase-budget-repo') || name === './supabase-budget-repo') return {supabaseBudgetRepo:remote};
  return originalLoad.call(this,name,parent,main);
};
const {budgetRepo} = require('../app/lib/repositories/budget-repo.ts');
const {localBudgetRepo} = require('../app/lib/repositories/local-budget-repo.ts');
const payment={monthKey:'2026-10',weekIndex:1,itemId:'scheduled-card-payment:chase:2026-10-15:fixture',itemKind:'credit_card_payment',behaviorType:'credit_card_payment',status:'cleared',actualAmount:1000};
const fail=async()=>{throw new Error('Synthetic network failure');};
(async()=>{
  remote.getUser=fail;
  await assert.rejects(budgetRepo.saveDockItemState(payment),/Synthetic network failure/);
  assert.equal(localBudgetRepo.getDockItemStates('2026-10').length,0);
  remote.getUser=async()=>({id:'fixture'});
  remote.saveDockItemState=fail;
  await assert.rejects(budgetRepo.saveDockItemState(payment),/Synthetic network failure/);
  assert.equal(localBudgetRepo.getDockItemStates('2026-10').length,0);
  remote.saveDockItemState=async row=>row;
  await budgetRepo.saveDockItemState(payment);
  assert.equal(localBudgetRepo.getDockItemStates('2026-10')[0].status,'cleared');
  remote.getDockItemStates=fail;
  await assert.rejects(budgetRepo.getDockItemStates('2026-10'),/Synthetic network failure/);
  remote.deleteDockItemState=fail;
  await assert.rejects(budgetRepo.deleteDockItemState('2026-10',payment.itemId,payment.itemKind,1),/Synthetic network failure/);
  assert.equal(localBudgetRepo.getDockItemStates('2026-10').length,1);
  console.log('PASS authentication/read/write/delete failures remain visible; failed mutations cannot masquerade as local success.');
})().catch(error=>{console.error(error);process.exitCode=1;});
