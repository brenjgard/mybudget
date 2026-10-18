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
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');const file=url.pathname.startsWith('/_next/static/')?path.join(root,'.next/static',url.pathname.slice(14)):['/dock','/budget','/settings','/home','/fleet','/setup'].includes(url.pathname)?path.join(root,'.next/server/app',url.pathname.slice(1)+(url.searchParams.has('_rsc')?'.rsc':'.html')):path.join(root,'public',url.pathname);try{const body=fs.readFileSync(file);res.setHeader('Content-Type',({'.rsc':'text/x-component','.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');res.end(body);}catch{res.statusCode=404;res.end();}});
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
 if(url.pathname.includes('/auth/')) { data=read('user',fixtureUser); if(method==='PUT') {data={...data,user_metadata:{...data.user_metadata,...JSON.parse(options.body).data}};write('user',data);} }
 else if(table==='budget_settings'){data=read('anchor',null);if(method!=='GET'){data={...data,...JSON.parse(options.body)};write('anchor',data);}}
 else if(['payment_accounts','categories','line_items'].includes(table)) {
   data=read(table,[]);
   if(method==='POST') {let rows=JSON.parse(options.body);if(!Array.isArray(rows))rows=[rows];for(const row of rows){const key=table==='payment_accounts'?'account_key':table==='categories'?'name':'id';const old=data.find(r=>r[key]===row[key]);data=data.filter(r=>r[key]!==row[key]);data.push({...old,...row,id:old?.id||row.id||crypto.randomUUID()});}write(table,data);}
   if(method==='DELETE'){const ids=(url.searchParams.get('id')||'').slice(3,-1).split(',');data=data.filter(r=>!ids.includes(r.id));write(table,data);}
 }
 return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
};`});
const visible="e=>e.checkVisibility()";
const click=async(label)=>{const result=await evaluate(`(()=>{const e=[...document.querySelectorAll('button')].filter(${visible}).find(e=>e.getAttribute('aria-label')===${JSON.stringify(label)}||e.textContent.trim()===${JSON.stringify(label)});if(!e)return false;e.click();return true;})()`);assert.ok(result,'button '+label);await pause(250);};
const set=async(selector,value)=>{await evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.checkVisibility());Object.getOwnPropertyDescriptor(e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await pause(150);};
const navigate=async route=>{await send('Page.navigate',{url:`http://127.0.0.1:${webport}${route}`});for(let i=0;i<40;i++){await pause(150);if(await evaluate("document.querySelector('h1')?.textContent === '"+(route.startsWith('/budget')?'Budget':route.startsWith('/home')?'Home':route.startsWith('/fleet')?'Fleet':route.startsWith('/settings')?'Settings':'Dock')+"' && !document.body.innerText.includes('Updating forecast')"))break;}await pause(300);};
const screenshot=async name=>{const out=path.join(work,name+'.png');fs.writeFileSync(out,Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));console.log('SCREENSHOT '+out);};

const viewport=async(width,mobile=false)=>{await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile});await pause(150);};
const waitFor=async expression=>{for(let i=0;i<100;i++){if(await evaluate("Boolean(" + expression + ")"))return;await pause(100);}throw Error('Timed out: '+expression);};

await viewport(390,true);await navigate('/setup');await waitFor("document.querySelector('h1')?.textContent==='Welcome to Harbor'");
assert.equal(await evaluate("document.querySelector('nav')"),null);
await screenshot('onboarding-welcome-mobile');await click("Let's get started");
await set('input[type=number]','0');await click('Continue');await waitFor("document.querySelector('h1')?.textContent==='Add your income'");
await send('Page.reload',{ignoreCache:true});await waitFor("document.querySelector('h1')?.textContent==='Add your income'");
await click('Skip for now');await click('Skip for now');await click('Skip for now');
assert.ok((await evaluate('document.body.innerText')).includes('Checking account added'));
await click('Go to Home');await waitFor("document.querySelector('h1')?.textContent==='Home' && document.getElementById('finish-setup')");
assert.equal(await evaluate("JSON.parse(localStorage.getItem('fixture:anchor')).checking_balance"),0);
await click('Dismiss');await send('Page.reload',{ignoreCache:true});await waitFor("document.querySelector('[data-home-low]')");assert.equal(await evaluate("document.getElementById('finish-setup')"),null);
await navigate('/setup');await waitFor("document.querySelector('h1')?.textContent==='Home'");
console.log('PASS checking-only setup, optional skips, zero balance, resume, Home completion, dismissal and completed-user bypass.');
await evaluate("localStorage.clear()");await navigate('/setup');await waitFor("document.querySelector('h1')?.textContent==='Welcome to Harbor'");await click("Let's get started");
await set('input:not([type=number])','Household checking');await set('input[type=number]','3639');await evaluate("localStorage.setItem('fixture:fail','1')");await click('Continue');await waitFor("document.querySelector('[role=alert]')");assert.equal(await evaluate("document.querySelector('h1').textContent"),'Add your checking account');await click('Continue');await waitFor("document.querySelector('h1')?.textContent==='Add your income'");
const addRecurring=async(name,amount,income)=>{await click(income?'+ Add another income source':'+ Add another bill');await set('form input:not([type])',name);await set('form input[type=number]',amount);await set('form input[type=date]','2026-10-23');await click(income?'Save income':'Save bill');await waitFor("!document.querySelector('form')");};
await addRecurring('Paycheck','4500',true);await addRecurring('Second income','200',true);await click('Continue');
await addRecurring('Mortgage','1950',false);await addRecurring('Electric','140',false);await screenshot('onboarding-bills-mobile');await click('Continue');
for(const [name,amount] of [['First card','700'],['Second card','800']]){await click('+ Add another card');await set('form input:not([type])',name);await set('form input[type=number]',amount);await click('Save card');await waitFor("!document.querySelector('form')");}
for(const width of [320,390,768,1440]){await viewport(width,width<768);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'Setup overflow '+width);}
await screenshot('onboarding-cards-desktop');await send('Page.reload',{ignoreCache:true});await waitFor("document.querySelector('h1')?.textContent==='Add your credit cards'");
assert.equal(await evaluate("JSON.parse(localStorage.getItem('fixture:payment_accounts')).filter(r=>r.kind==='credit').length"),2);
assert.equal(await evaluate("JSON.parse(localStorage.getItem('fixture:line_items')).length"),4);
await click('Continue');await click('Go to Home');await waitFor("document.querySelector('[data-home-low]')");assert.ok((await evaluate('document.body.innerText')).includes('$3,639.00'));
await navigate('/budget');await evaluate("[...document.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')?.startsWith('Expand Oct 18-Oct 24')).click()");await waitFor("document.body.innerText.includes('Mortgage')");await navigate('/fleet');await waitFor("document.body.innerText.includes('First card')");
// A legacy account has financial records but no onboarding metadata.
await evaluate("localStorage.removeItem('fixture:user')");await navigate('/setup');await waitFor("document.querySelector('h1')?.textContent==='Home'");
assert.equal(errors.length,0,'browser exceptions: '+errors.join(', '));
console.log('PASS save failure/retry, multiple income/bills/cards, optional statement dates, persisted identities, Budget/Fleet data, existing-user bypass and responsive layout.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{ws?.close();chrome?.kill();server.close();});
