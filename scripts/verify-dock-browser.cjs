/* eslint-disable @typescript-eslint/no-require-imports -- Production-browser regression harness uses Node built-ins and isolated fixtures. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),{spawn}=require('node:child_process'),assert=require('node:assert/strict');
const root=process.cwd(),work=fs.mkdtempSync(path.join(os.tmpdir(),'harbor-dock-')),port=9335,webport=4335;
const publicUrl=fs.readFileSync('.env.local','utf8').match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\r\n"']+)/m)[1];
const host=new URL(publicUrl).host;
const uid='00000000-0000-4000-8000-000000000099';
const exp=Math.floor(Date.now()/1000)+7200;
const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:uid,exp,role:'authenticated'})).toString('base64url')+'.test';
const session={access_token:token,refresh_token:'test-refresh',expires_at:exp,expires_in:7200,token_type:'bearer',user:{id:uid,email:'fixture@example.test',aud:'authenticated',role:'authenticated'}};
const cookie=`sb-${host.split('.')[0]}-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString('base64url')};path=/`;
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');const file=url.pathname.startsWith('/_next/static/')?path.join(root,'.next/static',url.pathname.slice(14)):['/dock','/budget','/settings','/home','/fleet'].includes(url.pathname)?path.join(root,'.next/server/app',url.pathname.slice(1)+'.html'):path.join(root,'public',url.pathname);try{const body=fs.readFileSync(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');res.end(body);}catch{res.statusCode=404;res.end();}});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let chrome,ws;
(async()=>{await new Promise(r=>server.listen(webport,'127.0.0.1',r));chrome=spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${port}`,`--user-data-dir=${path.join(work,'profile')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
let tabs;for(let i=0;i<40;i++){try{tabs=await(await fetch(`http://127.0.0.1:${port}/json`)).json();break;}catch{await pause(200);}}if(!tabs)throw Error('Chrome unavailable');
ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let seq=0;const pending=new Map();const errors=[];ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){const pair=pending.get(m.id);if(pair){pending.delete(m.id);if(m.error) pair.reject(m.error); else pair.resolve(m.result);}}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result.value;
await send('Page.enable');await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument',{source:`document.cookie=${JSON.stringify(cookie)};
const fixtureUser=${JSON.stringify(session.user)};
const NativeDate=Date;window.Date=class extends NativeDate { constructor(...args){super(...(args.length?args:['2026-10-11T16:00:00Z']));} static now(){return new NativeDate('2026-10-11T16:00:00Z').getTime();} };
const originalFetch=window.fetch.bind(window);
window.fetch=async(input,options={})=>{
 const url=new URL(typeof input==='string'?input:input.url,location.origin);if(url.host!==${JSON.stringify(host)})return originalFetch(input,options);
 let data=[];const method=options.method||'GET';const table=url.pathname.split('/').pop();
 if(method==='POST'&&localStorage.getItem('fixture:fail')){localStorage.removeItem('fixture:fail');return new Response(JSON.stringify({message:'Test save failure'}),{status:400,headers:{'Content-Type':'application/json'}});}
 const read=(key,fallback)=>JSON.parse(localStorage.getItem('fixture:'+key)||JSON.stringify(fallback));const write=(key,value)=>localStorage.setItem('fixture:'+key,JSON.stringify(value));
 if(method==='POST'&&table==='budget_settings'&&localStorage.getItem('fixture:failAnchor')){localStorage.removeItem('fixture:failAnchor');return new Response(JSON.stringify({message:'Test anchor failure'}),{status:400,headers:{'Content-Type':'application/json'}});}
 if(url.pathname.includes('/auth/')) data=fixtureUser;
 else if(table==='budget_settings'){data=read('anchor',{checking_balance:1000,updated_at:${JSON.stringify(process.argv.includes('--reconcile-only') ? '2026-08-03T12:00:00Z' : '2026-10-11T12:00:00Z')}});if(method!=='GET'){data={...data,...JSON.parse(options.body)};write('anchor',data);}}
 else if(table==='payment_accounts'){data=[{id:'checking',account_key:'checking',kind:'checking',label:'Checking'},...(localStorage.getItem('fixture:cards')?[{id:'test-card',account_key:'test-card',kind:'credit',label:'Test Card',current_balance:774,current_balance_updated_at:'2026-10-11T12:00:00Z',statement_closing_day:20,payment_due_day:15}]:[])];data=data.map(row=>({...row,...read('card:'+row.account_key,{})}));if(method==='PATCH'){if(localStorage.getItem('fixture:failCard')){localStorage.removeItem('fixture:failCard');return new Response(JSON.stringify({message:'Card check-in failed'}),{status:400,headers:{'Content-Type':'application/json'}});}const key=url.searchParams.get('account_key').slice(3);data=JSON.parse(options.body);write('card:'+key,data);}}
 else if(table==='categories')data=[{id:'bills',name:'Bills'},{id:'00000000-0000-4000-8000-000000000101',name:'Food'},{id:'income',name:'Income'}];
 else if(table==='line_items')data=[{id:'bill',category_id:'bills',payment_account_id:'checking',name:'Car Insurance',default_amount:1400,is_income:false,frequency:'every-week',plan_type:'scheduled_expense',ripple_type:'fixed',recurrence:{type:'weekly',daysOfWeek:[1]}},{id:'00000000-0000-4000-8000-000000000101',category_id:'00000000-0000-4000-8000-000000000101',payment_account_id:'checking',name:'Groceries',default_amount:100,is_income:false,frequency:'every-week',plan_type:'weekly_allowance',ripple_type:'flexible',include_in_cash_forecast:true},{id:'pay',category_id:'income',payment_account_id:'checking',name:'Paycheck',default_amount:2200,is_income:true,frequency:'every-week',recurrence:{type:'weekly',daysOfWeek:[4]}}];
 else if(table==='buoys')data=[{id:'savings',name:'Savings',current:0,goal:1000,auto_save:150,auto_save_day:14}];
 else if(table==='spend_logs'){let logs=read('logs',[]);if(method==='POST'){data={...JSON.parse(options.body),id:crypto.randomUUID(),created_at:new Date().toISOString()};logs.push(data);write('logs',logs);}else data=logs.filter(s=>s.month_key===url.searchParams.get('month_key')?.slice(3));}
 else if(table==='dock_item_states'){let states=read('states',[]);if(method==='POST'){const row=JSON.parse(options.body);const saved={...row,id:row.id||crypto.randomUUID(),created_at:new Date().toISOString()};states=states.filter(s=>!(s.item_id===row.item_id&&s.month_key===row.month_key&&s.week_index===row.week_index));states.push(saved);write('states',states);data=saved;}else if(url.searchParams.get('select')==='month_key')data=states.filter(s=>['upcoming','pending','adjusted'].includes(s.status)).sort((a,b)=>a.month_key.localeCompare(b.month_key)).slice(0,1);else data=states.filter(s=>!url.searchParams.has('month_key')||s.month_key===url.searchParams.get('month_key').slice(3));}
 return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
};`});
const visible="e=>e.checkVisibility()";
const click=async(label)=>{const result=await evaluate(`(()=>{const e=[...document.querySelectorAll('button')].filter(${visible}).find(e=>e.getAttribute('aria-label')===${JSON.stringify(label)}||e.textContent.trim()===${JSON.stringify(label)});if(!e)return false;e.click();return true;})()`);assert.ok(result,'button '+label);await pause(250);};
const set=async(selector,value)=>{await evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.checkVisibility());Object.getOwnPropertyDescriptor(e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await pause(150);};
const navigate=async route=>{await send('Page.navigate',{url:`http://127.0.0.1:${webport}${route}`});for(let i=0;i<40;i++){await pause(150);if(await evaluate("document.querySelector('h1')?.textContent === '"+(route.startsWith('/budget')?'Budget':route.startsWith('/home')?'Home':route.startsWith('/fleet')?'Fleet':route.startsWith('/settings')?'Settings':'Dock')+"' && !document.body.innerText.includes('Updating forecast')"))break;}await pause(300);};
const screenshot=async name=>{const out=path.join(work,name+'.png');fs.writeFileSync(out,Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));console.log('SCREENSHOT '+out);};

const viewport=async(width,mobile=false)=>{await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile});await pause(150);};
const check=async selector=>{assert.ok(await evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.checkVisibility());if(!e)return false;e.click();return true;})()`),selector);await pause(150);};
const states=()=>evaluate("JSON.parse(localStorage.getItem('fixture:states')||'[]')");
const waitFor=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await pause(100);}throw Error('Timed out: '+expression);};
if(process.argv.includes('--cash-event-only')){
 await viewport(390,true);await navigate('/dock');
 const projected=()=>evaluate("[...document.querySelectorAll('div')].find(e=>!e.children.length && e.textContent==='Projected End').parentElement.nextElementSibling.textContent");
 const money=value=>Number(value.replace(/[$,]/g,''));
 const low=()=>evaluate("[...document.querySelectorAll('div')].find(e=>!e.children.length && e.textContent==='Lowest Point').parentElement.nextElementSibling.textContent");
 const before=money(await projected());
 assert.equal(money(await low()),-650,'fixture begins with an October 14 low of -650');
 await click('+ Add Cash Event');await set('input[aria-label="Transaction description"]','New 330 payment');await set('dialog[open] input[type=number]','330');await set('input[aria-label="Transaction date"]','2026-10-13');await click('Add Event');
 await waitFor("!document.querySelector('dialog[open]')");
 assert.equal(money(await projected()),before-330,'330 payment changes projected ending immediately');
 assert.equal(money(await low()),-980,'330 before payday creates a new lower point');
 await check('button[aria-expanded="false"]');await click('More actions for New 330 payment');await click('Edit amount or move date');await set('input[aria-label="Occurrence amount"]','400');await click('Save occurrence');
 assert.equal(money(await projected()),before-400,'editing 330 to 400 updates ending');
 assert.equal(money(await low()),-1050,'editing the payment at the minimum updates the low by 70');
 await click('More actions for New 330 payment');await click('Edit amount or move date');await set('input[aria-label="Occurrence date"]','2026-10-20');await click('Save occurrence');
 assert.equal(money(await projected()),before-400,'moving 400 to next week preserves its single impact');
 assert.equal(money(await low()),-650,'moving payment after the existing low restores that low while ending remains reduced');
 await click('+ Add Cash Event');await set('input[aria-label="Transaction description"]','New 900 payment');await set('dialog[open] input[type=number]','900');await set('input[aria-label="Transaction date"]','2026-10-30');await click('Add Event');
 await waitFor("!document.querySelector('dialog[open]')");
 assert.equal(money(await projected()),before-1300,'October 30 payment adds to the 330 payment');
 assert.equal(money(await low()),-650,'later expense does not change an earlier low when subsequent balances stay higher');
 await navigate('/dock');assert.equal(money(await projected()),before-1300,'both payments survive reload');
 assert.equal(errors.length,0,'browser exceptions');
 console.log('PASS cash-event additions and moves update projected ending; lowest point changes only when a new minimum occurs; reload preserves balances.');return;
}
if(process.argv.includes('--reconcile-only')){
 await viewport(390,true);await navigate('/dock');
 assert.ok((await evaluate('document.body.innerText')).includes('Oct 11-Oct 17'));
 await click('Update Checking');await set('input[type=number]','1800');await click('Save');
 await waitFor('document.querySelector("dialog[open]")?.innerText.includes("Manage one by one") && !document.body.innerText.includes("Updating forecast")');
 assert.ok((await states()).some(s=>s.month_key==='2026-08'&&s.status!=='skipped'));
 await screenshot('checking-reconciliation-mobile');
 await evaluate("[...document.querySelectorAll('dialog[open] button')].find(e=>e.textContent.startsWith('Keep unresolved')).click()");
 await navigate('/dock');assert.ok((await evaluate('document.body.innerText')).includes('earlier transactions need review'));
 await click('Review earlier transactions');await click('Manage one by one');assert.equal(await evaluate('document.querySelector("#past-occurrence-review").open'),true);
 await click('More actions for Car Insurance');await click('Skip this occurrence');assert.ok((await states()).some(s=>s.item_id==='bill'&&s.status==='skipped'));
 await click('Review earlier transactions');await evaluate("localStorage.setItem('fixture:fail','1')");await evaluate("[...document.querySelectorAll('dialog[open] button')].find(e=>e.textContent.startsWith('Skip all')).click()");
 await waitFor('document.querySelector("dialog[open]")?.innerText.includes("could not be skipped")');
 await evaluate("[...document.querySelectorAll('dialog[open] button')].find(e=>e.textContent.startsWith('Skip all')).click()");await waitFor('!document.querySelector("dialog[open]")');
 await navigate('/dock');assert.equal((await evaluate('document.body.innerText')).includes('earlier transactions need review'),false);
 const before=await evaluate("JSON.parse(localStorage.getItem('fixture:anchor')).checking_balance");await click('Update Checking');await set('input[type=number]','1900');await evaluate("localStorage.setItem('fixture:failAnchor','1')");await click('Save');await pause(400);assert.equal(await evaluate("JSON.parse(localStorage.getItem('fixture:anchor')).checking_balance"),before);
 await navigate('/home');assert.equal(await evaluate('document.querySelector(".harbor-bottom-nav").querySelectorAll("a").length'),5);assert.ok((await evaluate('document.body.innerText')).includes("This week's budget"));await screenshot('home-mobile');
 await navigate('/settings');assert.ok((await evaluate('document.body.innerText')).includes('Accounts'));await screenshot('settings-mobile');await evaluate("[...document.querySelectorAll('button')].find(e=>e.querySelector('h2')?.textContent==='Accounts').click()");await pause(150);await click('Close actions');
 await evaluate("localStorage.setItem('fixture:cards','1');const rows=JSON.parse(localStorage.getItem('fixture:states')||'[]');rows.push({item_id:'card-statement:test-card:2026-10-15',item_kind:'credit_card_payment',month_key:'2026-10',week_index:1,status:'upcoming',actual_amount:300,pending_until:'2026-10-15'},{item_id:'scheduled-card-payment:test-card:2026-10-15:paid',item_kind:'credit_card_payment',month_key:'2026-10',week_index:1,status:'cleared',actual_amount:100,pending_until:'2026-10-10',cleared_at:'2026-10-10T12:00:00Z'},{item_id:'scheduled-card-payment:test-card:2026-10-15:next',item_kind:'credit_card_payment',month_key:'2026-10',week_index:1,status:'upcoming',actual_amount:200,pending_until:'2026-10-15'});localStorage.setItem('fixture:states',JSON.stringify(rows))");await navigate('/home');await waitFor("document.querySelector('[aria-labelledby=home-card-obligations]')?.innerText.includes('Payment scheduled')");
 await evaluate("document.querySelector('[aria-labelledby=home-card-obligations]').scrollIntoView({block:'start'})");await screenshot('home-card-obligations-mobile');
 await viewport(1440);await screenshot('home-card-obligations-desktop');assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'desktop obligations overflow');await viewport(390,true);assert.equal(await evaluate("document.querySelector('[aria-labelledby=home-card-obligations] details')"),null);
 for(const width of [320,768,1024]){await viewport(width,width<768);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'card obligations overflow '+width);}await viewport(390,true);
 assert.ok((await evaluate("document.querySelector('[aria-labelledby=home-card-obligations]').innerText")).includes('Payment scheduled'));
 assert.ok((await evaluate("document.querySelector('[data-summary=still-to-pay]').innerText")).includes('$0.00'));
 assert.ok((await evaluate("document.querySelector('[data-summary=scheduled]').innerText")).includes('$200.00'));
 const statementRows=JSON.stringify((await states()).filter(row=>row.item_id.includes('test-card')));
 const checkingBefore=await evaluate("localStorage.getItem('fixture:anchor')");
 await click('Check in balances');await check('dialog[open] button.bg-slate-50');await set('dialog[open] input[type=number]','700');await evaluate("localStorage.setItem('fixture:failCard','1')");await click('Save check-in');
 await waitFor("document.querySelector('dialog[open] [role=alert]')?.innerText.includes('The balance could not be saved')");
 assert.equal(await evaluate("localStorage.getItem('fixture:card:test-card')"),null);
 await click('Save check-in');await waitFor("!document.querySelector('dialog[open]')");
 await navigate('/home');await waitFor("document.querySelector('[aria-labelledby=home-card-obligations]')?.innerText.includes('Payment scheduled')");await click('Check in balances');assert.ok((await evaluate("document.querySelector('dialog[open]').innerText")).includes('$700.00'));await click('Close actions');
 assert.equal(JSON.stringify((await states()).filter(row=>row.item_id.includes('test-card'))),statementRows,'check-in leaves statement/payment history intact');
 assert.equal(await evaluate("localStorage.getItem('fixture:anchor')"),checkingBefore,'check-in leaves checking anchor intact');
 await navigate('/fleet?card=test-card');assert.ok(await evaluate("Boolean(document.querySelector('button[aria-expanded=true]'))"));assert.ok((await evaluate('document.body.innerText')).includes('Update Balance'));

 await navigate('/dock');assert.equal((await evaluate('document.body.innerText')).includes('Card Obligations'),false);
 await navigate('/fleet');assert.ok((await evaluate('document.body.innerText')).includes('Credit cards'));assert.ok((await evaluate('document.body.innerText')).includes('$700.00'));await screenshot('fleet-mobile');await check('button[aria-expanded="false"]');assert.ok((await evaluate('document.body.innerText')).includes('Update Balance'));await evaluate("localStorage.removeItem('fixture:cards')");
 await navigate('/budget');await click('Groceries');assert.ok((await evaluate('document.querySelector("dialog[open]").innerText')).includes('Spending in this month'));await screenshot('budget-item-detail-mobile');await click('Close actions');
 for(const route of ['/home','/budget','/dock','/fleet','/settings']){await viewport(320,true);await navigate(route);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'overflow '+route);assert.equal(await evaluate('document.querySelector(".harbor-bottom-nav a[aria-current=page]")?.getAttribute("href")'),route);}
 assert.equal(errors.length,0,'browser exceptions');console.log('PASS August anchor opens current week; backlog survives update/reload; individual skip, partial bulk failure/retry, same-day preservation, anchor failure, Home and five-tab mobile navigation.');return;
}
await viewport(1440);await navigate('/dock');
assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'desktop overflow');
assert.equal(await evaluate('document.querySelector("table").checkVisibility()'),true);
assert.ok((await evaluate('document.body.innerText')).includes('Below zero this week'));
assert.equal(await evaluate('document.querySelector("aside[aria-label=\\\"Desktop navigation\\\"]").checkVisibility()'),true);
await screenshot('dock-desktop-full');
await evaluate('document.querySelector("svg[aria-label^=\\\"Projected balance starts\\\"]").scrollIntoView({block:"center"})');await screenshot('dock-desktop-chart');if(process.argv.includes('--chart-only'))return;await evaluate('window.scrollTo(0,0)');
await click('Edit amount for Car Insurance');await set('input[aria-label="Occurrence amount"]','1250');await click('Save occurrence');assert.ok((await states()).some(s=>s.item_id==='bill'&&s.actual_amount===1250));
await click('Move Car Insurance');await set('input[aria-label="New occurrence date"]','2026-10-13');await click('Save occurrence');assert.ok((await states()).some(s=>s.item_id==='bill'&&s.pending_until==='2026-10-13'));
await check('input[aria-label^="Select Groceries on"]');await check('input[aria-label^="Select Savings transfer on"]');await click('Move');await set('input[aria-label="New occurrence date"]','2026-10-16');await click('Save occurrence');assert.equal((await states()).filter(s=>s.pending_until==='2026-10-16').length,2);
await check('input[aria-label^="Select Car Insurance on"]');await click('Skip');assert.ok((await states()).some(s=>s.item_id==='bill'&&s.status==='skipped'));
await click('+ Add transaction to this week');assert.equal(await evaluate('document.querySelector("input[aria-label=\\\"Transaction date\\\"]").value'),'2026-10-11');await set('input[aria-label="Transaction description"]','Fixture one-time payment');await set('dialog[open] input[type=number]','25');await click('Add Event');assert.ok((await states()).some(s=>s.note==='Fixture one-time payment'&&s.actual_amount===25));
await click('Mark Received');assert.ok((await states()).some(s=>s.item_id==='pay'&&s.status==='cleared'));
await click('Log Spend');await set('input[aria-label="Spend amount"]','35');await click('Save spending');assert.ok(await evaluate("JSON.parse(localStorage.getItem('fixture:logs')).some(s=>s.ripple_id==='00000000-0000-4000-8000-000000000101'&&s.amount===35)"));assert.ok((await evaluate('document.querySelector("table").innerText')).includes('Spent'));
await click('Edit amount for Fixture one-time payment');await set('input[aria-label="Occurrence amount"]','30');await evaluate("localStorage.setItem('fixture:fail','1')");await click('Save occurrence');assert.equal(await evaluate('document.querySelector("input[aria-label=\\\"Occurrence amount\\\"]").value'),'30');assert.ok((await states()).some(s=>s.note==='Fixture one-time payment'&&s.actual_amount===25));await click('Save occurrence');assert.ok((await states()).some(s=>s.note==='Fixture one-time payment'&&s.actual_amount===30));
await navigate('/dock');assert.ok((await evaluate('document.querySelector("table").innerText')).includes('Fixture one-time payment'));assert.ok((await evaluate('document.querySelector("table").innerText')).includes('Spent'));
await click('Edit checking');await set('input[type=number]','1200');assert.ok((await evaluate('document.body.innerText')).includes('$1,000.00'));await click('Save');await waitFor("JSON.parse(localStorage.getItem('fixture:anchor') || '{}').checking_balance === 1200");assert.equal(await evaluate("JSON.parse(localStorage.getItem('fixture:anchor')).checking_balance"),1200);await pause(300);await evaluate("[...document.querySelectorAll('dialog[open] button')].find(e=>e.textContent.startsWith('Keep unresolved'))?.click()");
for(const count of [4,12,8]){await set('select[aria-label="Forecast horizon"]',String(count));await pause(300);assert.equal(await evaluate('document.querySelectorAll("button[aria-pressed]").length'),count);}
await click('Next weeks');assert.ok((await evaluate('document.body.innerText')).includes('Oct 18'));await click('Previous weeks');
await viewport(1024);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'1024 overflow');await screenshot('dock-desktop-1024');
await viewport(390,true);await navigate('/dock');assert.equal(await evaluate('document.querySelector("table").checkVisibility()'),false);assert.equal(await evaluate('document.querySelector(".harbor-bottom-nav").checkVisibility()'),true);assert.equal(await evaluate(`[...document.querySelectorAll('button[aria-expanded="true"]')].filter(${visible}).length`),0);await screenshot('dock-mobile-collapsed');
await check('button[aria-expanded="false"]');await screenshot('dock-mobile-expanded');await click('More actions for Savings transfer');await click('Edit amount or move date');await set('input[aria-label="Occurrence amount"]','90');await set('input[aria-label="Occurrence date"]','2026-10-21');await click('Save occurrence');assert.ok((await states()).some(s=>s.item_id==='transfer:savings'&&s.actual_amount===90&&s.pending_until==='2026-10-21'));
await click('+ Add transaction to this week');assert.equal(await evaluate('document.querySelector("input[aria-label=\\\"Transaction date\\\"]").value'),'2026-10-11');await click('Close actions');
for(const width of [320,390]){await viewport(width,true);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'Dock overflow at '+width);}
await navigate('/budget');await click('Add to Budget');await screenshot('budget-mobile-menu');await click('Close actions');await click('More actions for Groceries');assert.ok(await evaluate('document.querySelector("dialog[open]").innerText.includes("Edit this occurrence")'));await click('Close actions');
for(const width of [320,390]){await viewport(width,true);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'Budget overflow at '+width);}
assert.equal(errors.length,0,'browser exceptions: '+errors.join(', '));console.log('PASS desktop sidebar/table/row actions/bulk move/skip/add/paid/spend/failure/reload/horizons; mobile cards/actions/navigation; no live writes.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{ws?.close();chrome?.kill();server.close();});
