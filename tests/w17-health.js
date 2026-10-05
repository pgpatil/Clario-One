/* W17 — health, robustness and privacy guards from the October health check.
   Each section pins a defect that was found and fixed, so it cannot quietly come back:
   a modal that threw on open, names with an apostrophe breaking buttons, hostile text, records
   with missing fields crashing a view, dates shifting by a day in some timezones, connections to
   outside sites, and a "wipe this device" that also emptied the synced copy. */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
let FAIL=0;
const chk=(n,ok,d)=>{console.log(`  ${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`); if(!ok)FAIL++;};
const URL_=process.env.CLARIO_URL || 'http://localhost:8934/index.html';
const ROOT=path.join(__dirname,'..');

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const fresh = async (opts={}) => { const ctx=await b.newContext({viewport:{width:1300,height:950},...opts}); const page=await ctx.newPage();
    const errs=[]; page.on('pageerror',e=>errs.push(e.message));
    await page.goto(URL_); await page.waitForTimeout(400);
    await page.evaluate(()=>{ if(document.getElementById('mAsk').classList.contains('open')) askResolve(null); });
    return {ctx,page,errs}; };

  console.log('\n═══ every edit window opens, new and existing');
  { const {ctx,page,errs}=await fresh();
    const r = await page.evaluate(()=>{const n=now(),td=today(),S=o=>Object.assign({created_at:n,updated_at:n},o);
      acctGroups.push('Tata');
      people.push(S({id:'p1',name:'Priya'}));customers.push(S({id:'c1',name:'Tata Steel',group:'Tata'}));
      contacts.push(S({id:'co1',customer_id:'c1',name:'Ravi'}));deals.push(S({id:'d1',name:'Q3',customer_id:'c1',stage:'Proposal',value:1}));
      meetings.push(S({id:'m1',title:'Review',date:td}));decisions.push(S({id:'dc1',what:'Switch',date:td}));
      opps.push(S({id:'o1',title:'Fix',impact:3,effort:2,status:'open'}));tasks.push(S({id:'t1',type:'task',title:'T',owner:'me',due:td,status:'open'}));
      tasks.push(S({id:'pt1',scope:'personal',type:'task',title:'P',owner:'me',due:td,status:'open'}));
      family.push(S({id:'f1',name:'Aarav'}));birthdays.push(S({id:'b1',name:'Aarav',date:'1990-01-01'}));
      fincats.push(S({id:'fc1',name:'Rent',group:'expense'}));fincard.push(S({id:'cc1',name:'Card'}));
      invhold.push(S({id:'h1',name:'Fund',kind:'Mutual fund'}));loans.push(S({id:'l1',name:'Home'}));ious.push(S({id:'i1',dir:'lent',person:'R',principal:1,date:td}));
      const calls=[['openTask',null],['openTask','t1'],['openCust',null],['openCust','c1'],['openContact',null],['openContact','co1'],
        ['openDeal',null],['openDeal','d1'],['openMeeting',null],['openMeeting','m1'],['openPerson',null],['openPerson','p1'],
        ['openDecision',null],['openDecision','dc1'],['openOpp',null],['openOpp','o1'],['openPersonalTask',null],['openPersonalTask','pt1'],
        ['openFamily',null],['openFamily','f1'],['openBday',null],['openBday','b1'],['openFinCat',null],['openFinCat','fc1'],
        ['openFinCard',null],['openFinCard','cc1'],['openInvHold',null],['openInvHold','h1'],['openLoan',null],['openLoan','l1'],
        ['openIou',null],['openIou','i1'],['openMyProfile',undefined],['openTrip',undefined]];
      const bad=[];let opened=0;
      for(const [fn,arg] of calls){try{window[fn](arg===null?undefined:arg);opened++;
          if(fn==='openCust'&&arg==='c1'&&document.getElementById('cGroup').value!=='Tata')bad.push('openCust: group not filled');}
        catch(e){bad.push(fn+'('+(arg||'')+'): '+e.message);}
        try{closeM();}catch(e){}document.querySelectorAll('.ovl.open').forEach(o=>o.classList.remove('open'));}
      return {opened,total:calls.length,bad};});
    chk(`all ${r.total} windows open without an error`, r.bad.length===0, r.bad.join(' | ')||`${r.opened} opened`);
    chk('editing an account shows its group (was a crash)', !r.bad.some(x=>/openCust/.test(x)));
    chk('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
    await ctx.close(); }

  console.log('\n═══ apostrophes and hostile text in names');
  { const {ctx,page,errs}=await fresh();
    const r = await page.evaluate(async()=>{
      const P=`O'Brien <img src=x onerror="window.__y=(window.__y||0)+1"> "q" &#39;);window.__x=1;//`;
      const n=now(),td=today(),S=o=>Object.assign({created_at:n,updated_at:n},o);
      depts.push(P);acctGroups.push(P);regions.push(P);taskLabels.push(P);locationsList.push(P);
      people.push(S({id:'p1',name:P,role:P,dept:P}));customers.push(S({id:'c1',name:P,city:P,group:P,kam_id:'p1'}));
      contacts.push(S({id:'co1',customer_id:'c1',name:P}));deals.push(S({id:'d1',name:P,customer_id:'c1',stage:'Proposal',value:1}));
      tasks.push(S({id:'t1',type:'task',title:P,owner:'p1',due:td,status:'open',dept:P,customer_id:'c1',labels:[P]}));
      ious.push(S({id:'i1',dir:'lent',person:P,principal:1,date:td}));invhold.push(S({id:'h1',name:P,kind:P}));
      // handler text is collected here and compiled in Node: the page's security policy forbids new Function()
      const handlers=new Set();
      const scan=l=>document.querySelectorAll('*').forEach(el=>{for(const a of el.attributes){if(/^on/.test(a.name))handlers.add(l+'\u0001'+a.value);}});
      for(const v of ['home','commit','accounts','pipeline','dash','settings','tasks','people','contacts']){nav(v);await new Promise(r=>setTimeout(r,50));scan(v);}
      nav('accounts','c1');scan('account');nav('group',P);scan('group');nav('planner');plTab='month';renderView();scan('month');
      setMode('personal');personalTab='money';finView='iou';renderView();scan('iou');personalTab='invest';invView='holdings';renderView();scan('holdings');setMode('official');
      // the buttons that used to break: they must now carry the exact name
      nav('accounts','c1');const link=[...document.querySelectorAll('#main [onclick*="nav(\'group\'"]')][0];
      if(link)link.click();await new Promise(r=>setTimeout(r,60));
      const groupOk=view==='group'&&viewArg===P;
      nav('home');const chip=[...document.querySelectorAll('#main [onclick*="deptFilter("]')][0];let deptOk=null;
      if(chip){const orig=window.deptFilter;let got=null;window.deptFilter=d=>{got=d;};chip.click();window.deptFilter=orig;deptOk=got===P;}
      await new Promise(r=>setTimeout(r,300));
      return {y:window.__y||0,x:window.__x||0,handlers:[...handlers],groupOk,deptOk};});
    const strip=t=>t.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g,'""');
    r.broken=[];r.escaped=[];
    for(const h of r.handlers){const [l,code]=h.split('\u0001');
      try{new Function('event',code);}catch(e){r.broken.push(l+': '+code.slice(0,60));continue;}
      if(/__x/.test(strip(code)))r.escaped.push(l+': '+code.slice(0,60));}
    chk(`${r.handlers.length} click handlers checked`, r.handlers.length>50);
    chk('hostile HTML in names never runs', r.y===0);
    chk('no click handler is broken by an apostrophe', r.broken.length===0, r.broken.slice(0,3).join(' | '));
    chk('no text escapes its quotes into code', r.escaped.length===0&&r.x===0, r.escaped.slice(0,3).join(' | '));
    chk('the account → group link carries the exact name', r.groupOk);
    chk('a department chip passes the exact name', r.deptOk!==false, String(r.deptOk));
    chk('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
    await ctx.close(); }

  console.log('\n═══ records with missing fields do not crash any view');
  { const {ctx,page,errs}=await fresh();
    const r = await page.evaluate(async()=>{
      TABLES.forEach(t=>{window[t].push({id:t+'_bare'});window[t].push({id:t+'_nulls',name:null,title:null,date:null,due:null,status:null,
        customer_id:'nope',deal_id:'nope',hold_id:'nope',iou_id:'nope',cat_id:'nope',person_id:'nope',owner:null,month:null,value:null,amount:null});});
      const fails=[];const go=async(l,f)=>{try{f();}catch(e){fails.push(l+': '+e.message);}await new Promise(r=>setTimeout(r,40));};
      for(const v of ['home','planner','commit','people','accounts','pipeline','decide','dash','review','settings','contacts','tasks','meetings'])await go(v,()=>nav(v));
      for(const t of ['day','week','month'])await go('planner '+t,()=>{nav('planner');plTab=t;renderView();});
      await go('search',()=>officialSearch('a'));
      setMode('personal');
      for(const t of ['tasks','money','invest','birthdays'])await go(t,()=>{personalTab=t;renderView();});
      for(const f of ['month','commit','loans','cast','iou'])await go('money '+f,()=>{personalTab='money';finView=f;renderView();});
      for(const i of ['overview','holdings','pf','analysis'])await go('invest '+i,()=>{personalTab='invest';invView=i;renderView();});
      await go('personal search',()=>personalSearch('a'));
      setMode('official');return fails;});
    chk('every view renders with bare and null-field records', r.length===0, r.slice(0,3).join(' | '));
    chk('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
    await ctx.close(); }

  console.log('\n═══ dates are right in every timezone');
  for (const tz of ['Asia/Kolkata','Pacific/Auckland','Pacific/Kiritimati','America/Los_Angeles','Pacific/Pago_Pago']) {
    const {ctx,page}=await fresh({timezoneId:tz});
    const r=await page.evaluate(()=>({add:addDays('2026-01-10',1),back:addDays('2026-03-01',-1),mon:mondayOf('2026-01-14'),
      next:ymAdd('2026-01',1),prev:invPrevMonth('2026-03'),eom:planPeriodRange('month','2026-10-05')[1],eomFeb:planPeriodRange('month','2028-02-10')[1]}));
    const ok=r.add==='2026-01-11'&&r.back==='2026-02-28'&&r.mon==='2026-01-12'&&r.next==='2026-02'&&r.prev==='2026-02'&&r.eom==='2026-10-31'&&r.eomFeb==='2028-02-29';
    chk(`${tz}: next day, Monday, month steps, month end`, ok, ok?'':JSON.stringify(r));
    await ctx.close(); }
  { const {ctx,page}=await fresh({timezoneId:'America/New_York'});
    const r=await page.evaluate(()=>({gap:(new Date('2026-03-08T12:00')-new Date('2026-03-07T12:00'))/36e5,
      rounds:/Math\.round/.test(ageDays.toString())}));
    chk('a 23-hour DST day still counts as one day', r.gap===23&&r.rounds, JSON.stringify(r));
    await ctx.close(); }

  console.log('\n═══ privacy: nothing leaves except to Microsoft');
  { const ctx=await b.newContext(); const page=await ctx.newPage(); const ext=[];
    page.on('request',q=>{const u=new URL(q.url());if(/^https?:/.test(u.protocol)&&!/^(localhost|127\.0\.0\.1)$/.test(u.hostname))ext.push(u.host);});
    await page.goto(URL_); await page.waitForTimeout(400);
    await page.evaluate(()=>{ if(document.getElementById('mAsk').classList.contains('open')) askResolve(null); });
    await page.evaluate(async()=>{for(const v of ['home','planner','accounts','pipeline','dash','settings','help']){nav(v);await new Promise(r=>setTimeout(r,60));}
      setMode('personal');for(const t of ['money','invest']){personalTab=t;renderView();await new Promise(r=>setTimeout(r,60));}setMode('official');});
    const normal=ext.length;
    const r=await page.evaluate(async()=>{const meta=document.querySelector('meta[http-equiv="Content-Security-Policy"]');const csp=meta?meta.content:'';
      let f='SENT';try{await fetch('https://example.com/x');}catch(e){f='blocked';}
      const img=await new Promise(res=>{const i=new Image();i.onload=()=>res('LOADED');i.onerror=()=>res('blocked');i.src='https://example.com/p.gif';});
      await new Promise(r=>setTimeout(r,200));
      return {csp,f,img,ref:(document.querySelector('meta[name="referrer"]')||{}).content,toast:(document.getElementById('toast')||{}).textContent||''};});
    chk('no outside requests in normal use', normal===0, ext.join(', '));
    chk('a security policy is in place', /connect-src 'self' https:\/\/\*\.microsoft\.com/.test(r.csp)&&/object-src 'none'/.test(r.csp)&&/form-action 'none'/.test(r.csp));
    chk('it allows Microsoft sign-in and OneDrive download hosts', ['microsoftonline.com','live.com','1drv.com','sharepoint.com','microsoftpersonalcontent.com'].every(h=>r.csp.includes(h)));
    chk('a fetch to any other site is blocked', r.f==='blocked');
    chk('an image beacon to any other site is blocked', r.img==='blocked');
    chk('a blocked connection is announced, not silent', /Blocked a connection/.test(r.toast), r.toast.slice(0,60));
    chk('links do not send a referrer', r.ref==='no-referrer');
    await ctx.close(); }
  { const sw=fs.readFileSync(path.join(ROOT,'sw.js'),'utf8');
    chk('offline cache ignores other sites (never stores Graph responses)', /origin!==self\.location\.origin\)return/.test(sw));
    const shell=(sw.match(/SHELL=\[([^\]]*)\]/)||[,''])[1].match(/'\.\/([^']+)'/g)||[];
    const missing=shell.map(x=>x.slice(3,-1)).filter(f=>!fs.existsSync(path.join(ROOT,f)));
    const html0=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
    const build=(html0.match(/APP_BUILD=(\d+)/)||[])[1], swv=(sw.match(/clario-v(\d+)/)||[])[1];
    chk('the build shown in Settings matches the offline cache version', build&&build===swv, `APP_BUILD=${build}, sw=${swv}`);
    chk('the app checks for updates whenever it comes back to the screen', /visibilitychange[^;]*reg\.update\(\)/.test(html0)&&/id="updbar"/.test(html0));
    chk('every precached file exists', shell.length>=7&&missing.length===0, missing.join(', ')); }

  console.log('\n═══ wiping this device never touches the synced copy');
  { const ctx=await b.newContext(); const page=await ctx.newPage(); const writes=[];
    await page.exposeFunction('T_write',n=>{writes.push(n);});
    await page.goto(URL_); await page.waitForTimeout(400);
    await page.evaluate(()=>{ if(document.getElementById('mAsk').classList.contains('open')) askResolve(null); });
    await page.evaluate(async()=>{const n=now();tasks.push({id:'k1',title:'Keep',type:'task',owner:'me',due:today(),status:'open',created_at:n,updated_at:n});
      const files={'db.json':JSON.stringify(getState())};
      _fsDir={name:'mock',removeEntry:async()=>{},getFileHandle:async(nm,o)=>{if(!(nm in files)){if(o&&o.create)files[nm]='';else{const e=new Error('nf');e.name='NotFoundError';throw e;}}
        return{getFile:async()=>({text:async()=>files[nm],lastModified:1}),createWritable:async()=>({write:async()=>{},close:async()=>{window.T_write(nm);}})};}};
      localStorage.setItem('cx_pin',JSON.stringify({salt:'x',hash:'y'}));
      const p=wipeAll();await new Promise(r=>setTimeout(r,60));askResolve('WIPE');});
    await page.waitForTimeout(1500);
    await page.evaluate(()=>{ if(document.getElementById('mAsk').classList.contains('open')) askResolve(null); });
    const after=await page.evaluate(async()=>({tasks:tasks.filter(t=>!t.deleted).length,pin:!!localStorage.getItem('cx_pin'),
      idb:await new Promise(res=>{const r=indexedDB.open('cx_fs',1);r.onupgradeneeded=()=>r.result.createObjectStore('h');r.onsuccess=()=>{const q=r.result.transaction('h').objectStore('h').getAllKeys();q.onsuccess=()=>res(q.result.length);};})}));
    chk('nothing was written to the synced file', writes.length===0, writes.join(', '));
    chk('this device is empty afterwards: data, PIN, stored keys', after.tasks===0&&!after.pin&&after.idb===0, JSON.stringify(after));
    await ctx.close(); }

  console.log('\n═══ code hygiene');
  { const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
    const js=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).sort((a,c)=>c.length-a.length)[0];
    const names=[...js.matchAll(/(?:^|[;\s}])(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]);
    const dup=[...new Set(names.filter((x,i)=>names.indexOf(x)!==i))];
    chk('no function is declared twice (a later copy silently wins)', dup.length===0, dup.join(', '));
    chk('dates are never formatted through UTC', !/d\.toISOString\(\)\.slice\(0,(7|10)\)/.test(js));
    const files=[path.join(ROOT,'index.html'),...fs.readdirSync(__dirname).filter(f=>f.endsWith('.js')).map(f=>path.join(__dirname,f))];
    const emails=files.flatMap(f=>(fs.readFileSync(f,'utf8').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)||[])
      .filter(e=>!/@example\.com$/i.test(e)&&!/\.(png|js|woff2)$/i.test(e)).map(e=>path.basename(f)+': '+e));
    chk('no real-looking email addresses in the app or tests (public repo)', emails.length===0, emails.slice(0,3).join(', ')); }

  console.log(FAIL===0?'\n*** W17 HEALTH & PRIVACY: ALL PASS ***':`\n*** W17 HEALTH & PRIVACY: ${FAIL} FAILURE(S) ***`);
  await b.close();
  process.exit(FAIL?1:0);
})();
