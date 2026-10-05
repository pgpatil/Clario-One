/* W13 acceptance — multiple companies in Official, each with its own data set.
   The property that matters is isolation: nothing typed in one company may show up in another,
   not on screen, not in a count, and not after a sync merge from a device that is looking at a
   different company (or running an older version that knows nothing about companies). */
const { chromium } = require('playwright');
let FAIL=0;
const chk=(n,ok,d)=>{console.log(`  ${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`); if(!ok)FAIL++;};
const URL_=process.env.CLARIO_URL || 'http://localhost:8934/index.html';

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport:{width:1300,height:950} });
  const page = await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  const dismiss=()=>page.evaluate(()=>{ if(document.getElementById('mAsk').classList.contains('open')) askResolve(null); });
  await page.goto(URL_); await page.waitForTimeout(400); await dismiss();

  console.log('\n═══ existing data migrates into one company');
  const mig = await page.evaluate(()=>{
    const n=now(), td=today();
    // a state exactly as the previous version saved it: no companies, no co
    const legacy={version:'8.0.0',updatedAt:n,companyName:'Acme Foods',depts:['Ops','Sales'],products:['Spices'],regions:['South'],
      acctGroups:['Tata'],workWeek:{off:[0,6],satRule:'none'},locationsList:['Kochi'],taskLabels:[],myProfile:{name:'Test User'},
      tasks:[{id:'a1',title:'Acme task',type:'task',owner:'me',due:td,status:'open',created_at:n,updated_at:n},
             {id:'p1',scope:'personal',title:'Pay rent',type:'task',owner:'me',due:td,status:'open',created_at:n,updated_at:n},
             {id:'p1s',scope:'personal',parent_id:'p1',title:'Transfer',type:'task',owner:'me',due:td,status:'open',created_at:n,updated_at:n}],
      customers:[{id:'c1',name:'Kochi Mart',created_at:n,updated_at:n}],people:[{id:'pp1',name:'Priya',created_at:n,updated_at:n}],
      locations:[{id:'l1',date:td,city:'Kochi',created_at:n,updated_at:n}],
      fintx:[{id:'f1',amount:500,date:td,created_at:n,updated_at:n}]};
    try{localStorage.removeItem('cx_company');}catch(e){}
    activeCo='home';applyState(legacy);persist();
    return {companies:COMP().map(c=>({id:c.id,name:c.name})),active:activeCo,tasks:T().map(t=>t.title),
            personal:TP().map(t=>t.title),accts:CU().length,depts:[...depts],ww:workWeek.off};
  });
  chk('one company, fixed id "home", named from the old company name', mig.companies.length===1&&mig.companies[0].id==='home'&&mig.companies[0].name==='Acme Foods', JSON.stringify(mig.companies));
  chk('official data is in it', mig.tasks.includes('Acme task')&&mig.accts===1, JSON.stringify(mig.tasks));
  chk('personal data untouched', JSON.stringify(mig.personal)===JSON.stringify(['Pay rent']));
  chk('company lists carried over', JSON.stringify(mig.depts)==='["Ops","Sales"]'&&JSON.stringify(mig.ww)==='[0,6]');

  console.log('\n═══ add a second company and switch from Settings');
  await page.evaluate(()=>{setMode('official');nav('settings');});
  await page.waitForTimeout(100);
  await page.fill('#coNewInp','Beta Traders');
  await page.click('#coCard button:has-text("+ Add")');
  await page.waitForTimeout(120);
  const prompt = await page.evaluate(()=>({open:document.getElementById('mAsk').classList.contains('open'),
    msg:document.getElementById('askMsg').textContent}));
  chk('adding asks whether to switch', prompt.open&&/Beta Traders/.test(prompt.msg), prompt.msg.slice(0,60));
  await page.evaluate(()=>askResolve(true)); await page.waitForTimeout(150);
  const sw = await page.evaluate(()=>({active:coLabel(activeCo),tasks:T().length,accts:CU().length,people:P().length,
    personal:TP().map(t=>t.title),sub:tasks.filter(t=>t.parent_id==='p1').length,depts:[...depts],ww:workWeek.off,
    locs:LOC().length,fin:fintx.filter(x=>!x.deleted).length,chip:getComputedStyle(document.getElementById('ghCo')).display!=='none'?document.getElementById('ghCo').textContent:null,
    rows:[...document.querySelectorAll('#coCard .co-row')].map(r=>r.querySelector('b').textContent)}));
  chk('now in Beta Traders', sw.active==='Beta Traders');
  chk('Beta starts empty: no tasks, accounts or people', sw.tasks===0&&sw.accts===0&&sw.people===0, JSON.stringify(sw));
  chk('personal tasks and their subtasks are still there', sw.personal.includes('Pay rent')&&sw.sub===1);
  chk('personal money still there', sw.fin===1);
  chk('day locations are shared', sw.locs===1);
  chk('Beta gets default lists, not Acme\'s', !sw.depts.includes('Ops')&&sw.depts.length>0&&JSON.stringify(sw.ww)==='[0]', JSON.stringify(sw.depts));
  chk('header shows the active company', sw.chip==='Beta Traders', String(sw.chip));
  chk('Settings lists both', JSON.stringify(sw.rows)===JSON.stringify(['Acme Foods','Beta Traders']), JSON.stringify(sw.rows));

  console.log('\n═══ data typed in one company stays in it');
  const iso = await page.evaluate(()=>{
    const n=now(), td=today();
    tasks.push({id:'b1',title:'Beta task',type:'task',owner:'me',due:td,status:'open',created_at:n,updated_at:n});
    customers.push({id:'c2',name:'Beta Client',created_at:n,updated_at:n});
    depts.push('Logistics');persist();
    const betaId=activeCo;
    switchCompany('home');
    const inA={tasks:T().map(t=>t.title),accts:CU().map(c=>c.name),depts:[...depts]};
    nav('tasks');const rowsA=document.getElementById('main').textContent;
    const s1=globalSearch?officialSearch('Beta'):null;
    switchCompany(betaId);
    const inB={tasks:T().map(t=>t.title),accts:CU().map(c=>c.name),depts:[...depts]};
    return {inA,inB,leakA:/Beta task/.test(rowsA),searchHits:Array.isArray(s1)?s1.length:(s1&&s1.length)||0,view};
  });
  chk('Acme does not see Beta\'s task or account', !iso.inA.tasks.includes('Beta task')&&!iso.inA.accts.includes('Beta Client'), JSON.stringify(iso.inA));
  chk('Acme does not see Beta\'s department', !iso.inA.depts.includes('Logistics'));
  chk('Acme\'s task list does not render it', !iso.leakA);
  chk('search in Acme does not find Beta records', iso.searchHits===0, `${iso.searchHits} hits`);
  chk('Beta keeps its own records', iso.inB.tasks.includes('Beta task')&&iso.inB.accts.includes('Beta Client')&&iso.inB.depts.includes('Logistics'));
  chk('switching away from a record view lands on Home', iso.view==='home', iso.view);

  console.log('\n═══ saved state: home at the top level, others under co');
  const st = await page.evaluate(()=>{
    const s=JSON.parse(JSON.stringify(getState()));const bid=COMP().find(c=>c.id!=='home').id;
    return {topTasks:s.tasks.map(t=>t.title).sort(),topAccts:s.customers.map(c=>c.name),
      coTasks:(s.co[bid]&&s.co[bid].tasks||[]).map(t=>t.title),coHasPersonal:(s.co[bid].tasks||[]).some(t=>t.scope==='personal'),
      topDepts:s.depts,coDepts:s.co[bid].depts,companies:s.companies.length,companyName:s.companyName};
  });
  chk('top level = personal + Acme, as an older version expects', JSON.stringify(st.topTasks)===JSON.stringify(['Acme task','Pay rent','Transfer'].sort()), JSON.stringify(st.topTasks));
  chk('top-level accounts are Acme\'s', JSON.stringify(st.topAccts)==='["Kochi Mart"]');
  chk('Beta saved under co', JSON.stringify(st.coTasks)==='["Beta task"]', JSON.stringify(st.coTasks));
  chk('no personal row is copied into a company', !st.coHasPersonal);
  chk('lists saved per company', !st.topDepts.includes('Logistics')&&st.coDepts.includes('Logistics'));
  chk('legacy companyName is the home company', st.companyName==='Acme Foods');

  console.log('\n═══ sync merges never cross companies');
  const mr = await page.evaluate(()=>{
    const n=new Date(Date.now()+5000).toISOString(), td=today(), bid=activeCo;   // currently in Beta
    // 1. an OLDER version on a phone pushes: no companies, no co, its official data is Acme's
    mergeRemote({tasks:[{id:'old1',title:'From old phone',type:'task',owner:'me',due:td,status:'open',created_at:n,updated_at:n}],
                 customers:[{id:'oc',name:'Old phone client',created_at:n,updated_at:n}],depts:['Exports']});
    const inBeta1=T().map(t=>t.title), bDepts=[...depts];
    // 2. a new-version device that is looking at Acme adds to Beta
    const s=JSON.parse(JSON.stringify(getState()));
    s.co[bid].tasks.push({id:'b2',title:'Beta from laptop',type:'task',owner:'me',due:td,status:'open',created_at:n,updated_at:n});
    s.tasks.push({id:'a2',title:'Acme from laptop',type:'task',owner:'me',due:td,status:'open',created_at:n,updated_at:n});
    s.tasks.push({id:'p2',scope:'personal',title:'Personal from laptop',type:'task',owner:'me',due:td,status:'open',created_at:n,updated_at:n});
    mergeRemote(s);
    const inBeta2=T().map(t=>t.title), personal=TP().map(t=>t.title);
    switchCompany('home');
    const inAcme=T().map(t=>t.title), aAccts=CU().map(c=>c.name), aDepts=[...depts];
    switchCompany(bid);
    return {inBeta1,bDepts,inBeta2,personal,inAcme,aAccts,aDepts};
  });
  chk('an old version\'s push lands in the home company only', !mr.inBeta1.includes('From old phone')&&mr.inAcme.includes('From old phone'), JSON.stringify(mr.inBeta1));
  chk('...including its lists', !mr.bDepts.includes('Exports')&&mr.aDepts.includes('Exports'));
  chk('...and its accounts', mr.aAccts.includes('Old phone client'));
  chk('a Beta edit from another device lands in Beta', mr.inBeta2.includes('Beta from laptop'));
  chk('an Acme edit from that device lands in Acme, not Beta', mr.inAcme.includes('Acme from laptop')&&!mr.inBeta2.includes('Acme from laptop'));
  chk('a personal edit from that device is visible in either company', mr.personal.includes('Personal from laptop'));

  console.log('\n═══ survives a reload, and remembers the active company');
  await page.reload(); await page.waitForTimeout(500); await dismiss();
  const rl = await page.evaluate(()=>({active:coLabel(activeCo),tasks:T().map(t=>t.title).sort(),n:COMP().length}));
  chk('still in Beta after reload', rl.active==='Beta Traders', rl.active);
  chk('Beta data intact after reload', JSON.stringify(rl.tasks)===JSON.stringify(['Beta from laptop','Beta task']), JSON.stringify(rl.tasks));

  console.log('\n═══ rename and remove');
  const rr = await page.evaluate(async ()=>{
    const bid=activeCo, out={};
    // cannot remove the active company or the home company
    await deleteCompany(bid); out.activeStill=COMP().some(c=>c.id===bid);
    await deleteCompany('home'); out.homeStill=COMP().some(c=>c.id==='home');
    // rename the home company through the modal
    let p=renameCompany('home');await new Promise(r=>setTimeout(r,40));
    document.getElementById('askInput').value='Acme Foods Pvt Ltd';askResolve('Acme Foods Pvt Ltd');await p;
    out.renamed=coName('home');
    switchCompany('home');out.label=companyName;
    // a mistyped confirmation removes nothing
    p=deleteCompany(bid);await new Promise(r=>setTimeout(r,40));askResolve('Beta');await p;
    out.afterTypo=COMP().some(c=>c.id===bid);
    p=deleteCompany(bid);await new Promise(r=>setTimeout(r,40));askResolve('beta traders');await p;
    out.afterOk=COMP().some(c=>c.id===bid);
    out.chipHidden=getComputedStyle(document.getElementById('ghCo')).display==='none';
    out.tombstone=!!companies.find(c=>c.id===bid&&c.deleted);
    return out;});
  chk('the active company cannot be removed', rr.activeStill);
  chk('the home company cannot be removed', rr.homeStill);
  chk('rename saves', rr.renamed==='Acme Foods Pvt Ltd', rr.renamed);
  chk('meeting summaries use the active company name', rr.label==='Acme Foods Pvt Ltd');
  chk('a mistyped confirmation removes nothing', rr.afterTypo);
  chk('typing the name removes it', !rr.afterOk);
  chk('removal is a synced tombstone, not a local splice', rr.tombstone);
  chk('header label hides with one company left', rr.chipHidden);

  console.log('\n═══ Personal mode hides the company label; phone width');
  await page.evaluate(()=>{const n=now();companies.push({id:'c3',name:'Gamma',created_at:n,updated_at:n});_coStore.c3=coEmpty();persist();renderNav();});
  const pm = await page.evaluate(()=>{const on=getComputedStyle(document.getElementById('ghCo')).display!=='none';
    setMode('personal');const off=getComputedStyle(document.getElementById('ghCo')).display==='none';setMode('official');return {on,off};});
  chk('label shows in Official with 2+ companies', pm.on);
  chk('label hidden in Personal', pm.off);
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>nav('settings')); await page.waitForTimeout(150);
  const ph = await page.evaluate(()=>({sw:document.documentElement.scrollWidth,
    gh:document.getElementById('gh').scrollWidth<=document.getElementById('gh').clientWidth+1}));
  chk('no horizontal scroll at 390px', ph.sw<=390, `scrollWidth=${ph.sw}`);
  chk('header still fits at 390px', ph.gh);

  // leave a clean single-company state for whatever runs next
  await page.evaluate(()=>{try{localStorage.clear();}catch(e){}});
  console.log('\n---page errors---', JSON.stringify(errs.slice(0,4)));
  if(errs.length){FAIL++;console.log('  FAIL  page threw');}
  console.log(FAIL===0?'\n*** W13 COMPANIES: ALL PASS ***':`\n*** W13 COMPANIES: ${FAIL} FAILURE(S) ***`);
  await b.close();
  process.exit(FAIL?1:0);
})();
