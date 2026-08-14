/* Navigation regression: walk every view in both modes and assert the app throws nothing.
   CLAUDE.md requires this to be green before anything ships. Run via tests/run.sh. */
const { chromium } = require('playwright');
const BASE = process.env.CLARIO_URL || 'http://localhost:8934/index.html';

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const page = await b.newPage({ viewport:{width:1280,height:900} });
  const errs=[];
  page.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  page.on('console',m=>{const t=m.text();
    if(m.type()==='error' && !/ERR_TUNNEL|ERR_CONNECTION|favicon|manifest/.test(t)) errs.push('CONSOLE '+t);});

  await page.goto(BASE); await page.waitForTimeout(500);
  await page.evaluate(()=>{ if(document.getElementById('mAsk').classList.contains('open')) askResolve(null); });

  // seed a little of everything so views render with content, not just empty states
  await page.evaluate(()=>{
    const n=now(), td=today();
    people.push({id:'p1',name:'Priya Nair',role:'Ops',dept:'Ops',created_at:n,updated_at:n});
    customers.push({id:'c1',name:'Kochi Mart',city:'Kochi',region:'South',kam_id:'p1',created_at:n,updated_at:n});
    contacts.push({id:'co1',customer_id:'c1',name:'Rakesh',role:'Buyer',created_at:n,updated_at:n});
    deals.push({id:'d1',name:'Q3 supply',customer_id:'c1',stage:'Proposal',value:250000,created_at:n,updated_at:n});
    meetings.push({id:'m1',title:'Review call',date:td,attendees:['p1'],created_at:n,updated_at:n});
    decisions.push({id:'dc1',what:'Switch supplier',why:'cost',date:td,created_at:n,updated_at:n});
    for(let i=0;i<25;i++) tasks.push({id:'t'+i,type:i%5?'task':'call',title:'Task '+i,owner:i%3?'me':'p1',
      due:td,original_due:td,when:i%5?null:td+'T10:00',estimate_min:30,priority:'medium',
      status:i%4?'open':'waiting',dept:'Ops',customer_id:'c1',notes:'',created_at:n,updated_at:n});
    for(let i=0;i<6;i++) tasks.push({id:'pt'+i,scope:'personal',type:'task',title:'Personal '+i,owner:'me',
      due:td,status:'open',notes:'',created_at:n,updated_at:n});
    birthdays.push({id:'b1',name:'Aarav',date:'1990-09-14',created_at:n,updated_at:n});
    family.push({id:'f1',name:'Aarav',created_at:n,updated_at:n});
    persist();
  });

  const VIEWS = ['home','planner','commit','people','accounts','pipeline','decide','dash','review',
                 'settings','contacts','tasks','meetings','help'];
  for (const v of VIEWS) {
    await page.evaluate(v=>nav(v), v); await page.waitForTimeout(120);
    const ok = await page.evaluate(()=>!!document.getElementById('main').innerHTML.trim().length);
    if(!ok) errs.push('EMPTY VIEW '+v);
  }
  // detail views
  for (const [v,arg] of [['task','t1'],['meeting','m1'],['deal','d1'],['contact','co1'],
                         ['people','p1'],['accounts','c1']]) {
    await page.evaluate(([v,a])=>nav(v,a), [v,arg]); await page.waitForTimeout(120);
  }
  // planner sub-tabs
  for (const t of ['day','week','month','meet']) {
    await page.evaluate(t=>{nav('planner');plTab=t;renderView();}, t); await page.waitForTimeout(120);
  }
  // personal mode + every tab and sub-view
  await page.evaluate(()=>setMode('personal')); await page.waitForTimeout(150);
  for (const t of ['tasks','money','invest','birthdays']) {
    await page.evaluate(t=>{personalTab=t;renderView();}, t); await page.waitForTimeout(150);
  }
  for (const fv of ['month','commit','loans','cast']) {
    await page.evaluate(fv=>{personalTab='money';finView=fv;renderView();}, fv); await page.waitForTimeout(150);
  }
  for (const iv of ['overview','holdings','pf']) {
    await page.evaluate(iv=>{personalTab='invest';invView=iv;renderView();}, iv); await page.waitForTimeout(150);
  }
  await page.evaluate(()=>{finView='month';setMode('official');nav('home');}); await page.waitForTimeout(200);

  // back/forward history
  await page.evaluate(()=>{nav('tasks');nav('people');}); await page.waitForTimeout(150);
  await page.goBack(); await page.waitForTimeout(200);
  await page.goForward(); await page.waitForTimeout(200);

  console.log('ERRORS:', JSON.stringify(errs, null, errs.length?1:0));
  console.log('DONE, error count:', errs.length);
  await b.close();
  process.exit(errs.length?1:0);
})();
