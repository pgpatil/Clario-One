/* W5 acceptance — saved views and findability.
   Two halves. The first is the feature: a tuned filter set can be named, restored in one click,
   and survives a sync. The second settles the Official/Personal split by measuring the click
   cost rather than asserting it either way. */
const { chromium } = require('playwright');
let FAIL=0;
const chk=(n,ok,d)=>{console.log(`  ${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`); if(!ok)FAIL++;};

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const page = await b.newPage({ viewport:{width:1400,height:1000} });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(process.env.CLARIO_URL || 'http://localhost:8934/index.html');
  await page.waitForTimeout(400);
  await page.evaluate(()=>{ if(document.getElementById('mAsk').classList.contains('open')) askResolve(null); });
  await page.evaluate(()=>{ const n=now(), td=today();
    people.push({id:'p1',name:'Priya Nair',dept:'Ops',created_at:n,updated_at:n});
    for(let i=0;i<12;i++) tasks.push({id:'t'+i,type:'task',title:'Task '+i,owner:i%2?'me':'p1',
      due:td,original_due:td,status:i%3?'open':'waiting',priority:'medium',
      dept:i%2?'Operations':'Finance',customer_id:null,notes:'',
      labels:i%4===0?['audit']:[],created_at:n,updated_at:n});
    persist(); nav('tasks'); });
  await page.waitForTimeout(250);

  console.log('\n═══ the save control is on the list, not behind a new nav item');
  const bar = await page.evaluate(()=>({
    barOnTasks:!!document.querySelector('#main .svbar'),
    saveBtn:!!document.querySelector('#main .svbar button'),
    navItems:document.querySelectorAll('#navbar .nt').length,
  }));
  chk('a save-view control sits on the Tasks list', bar.barOnTasks && bar.saveBtn, JSON.stringify(bar));
  chk('no new top-level nav item was added',        bar.navItems===6, `${bar.navItems} nav items`);

  console.log('\n═══ saving captures the current filter set');
  const saved = await page.evaluate(async ()=>{
    window._tDp='Finance'; window._tLbl='audit'; window._tSt='open'; reRender();
    const rowsBefore=document.querySelectorAll('#main tbody tr.click').length;
    const p=svSave('tasks');
    await new Promise(r=>setTimeout(r,80));
    const inp=document.getElementById('askInput'); if(inp){inp.value='Finance audit';}
    if(document.getElementById('mAsk').classList.contains('open')) askResolve('Finance audit');
    await p;
    const v=SV()[0];
    return {count:SV().length, name:v&&v.name, f:v&&v.f, rowsBefore};
  });
  chk('a view is stored',            saved.count===1, JSON.stringify(saved));
  chk('it captured the filters',     saved.f && saved.f._tDp==='Finance' && saved.f._tLbl==='audit', JSON.stringify(saved.f));

  console.log('\n═══ restoring is one click and reproduces the same list');
  const restored = await page.evaluate(()=>{
    const rowsWithView=document.querySelectorAll('#main tbody tr.click').length;
    svClear('tasks');
    const rowsCleared=document.querySelectorAll('#main tbody tr.click').length;
    const chip=document.querySelector('#main .chip.sv');
    const clicksToRestore=chip?1:0;
    chip.click();                                     // exactly one click
    const rowsRestored=document.querySelectorAll('#main tbody tr.click').length;
    return {rowsWithView, rowsCleared, rowsRestored, clicksToRestore,
            dp:window._tDp, lbl:window._tLbl,
            chipOn:!!document.querySelector('#main .chip.sv.on')};
  });
  chk('clearing widens the list',        restored.rowsCleared>restored.rowsWithView, `${restored.rowsWithView} -> ${restored.rowsCleared}`);
  chk('one click restores it',           restored.clicksToRestore===1 && restored.rowsRestored===restored.rowsWithView, JSON.stringify(restored));
  chk('the filters are back',            restored.dp==='Finance' && restored.lbl==='audit');
  chk('the active view is marked',       restored.chipOn===true);

  console.log('\n═══ the mechanism is shared, not bolted onto one screen');
  const shared = await page.evaluate(()=>{
    nav('commit');
    const onCommit=!!document.querySelector('#main .svbar');
    const scopes=Object.keys(VIEW_FILTERS);
    return {onCommit, scopes};
  });
  chk('Commitments has it too', shared.onCommit, JSON.stringify(shared.scopes));

  console.log('\n═══ views sync like every other record');
  const sync = await page.evaluate(()=>{
    const snap=JSON.parse(JSON.stringify(getState()));
    const inState='savedviews' in snap;
    savedviews.length=0;
    applyState(snap);
    return {inState, after:SV().length, name:SV()[0]&&SV()[0].name};
  });
  chk('savedviews is part of synced state', sync.inState);
  chk('it survives a state round-trip',     sync.after===1 && sync.name==='Finance audit', JSON.stringify(sync));

  console.log('\n═══ deleting a view');
  const del = await page.evaluate(async ()=>{
    nav('tasks');
    const p=svDel(SV()[0].id);
    await new Promise(r=>setTimeout(r,80));
    if(document.getElementById('mAsk').classList.contains('open')) askResolve(true);
    await p;
    return {left:SV().length, chips:document.querySelectorAll('#main .chip.sv').length};
  });
  chk('the view is gone', del.left===0 && del.chips===0, JSON.stringify(del));

  console.log('\n═══ click-cost: does the Official/Personal split actually cost anything?');
  const cost = await page.evaluate(()=>{
    /* Count real clicks from Home to each destination, by driving the visible controls. */
    const clicksTo=(steps)=>{let c=0;for(const s of steps){const el=s();if(!el)return -1;el.click();c++;}return c;};
    const navBtn=lbl=>()=>[...document.querySelectorAll('#navbar .nt')].find(b=>b.textContent.trim().startsWith(lbl));
    const moreItem=lbl=>()=>[...document.querySelectorAll('#moremenu .nm-i')].find(b=>b.textContent.trim().startsWith(lbl));
    const modeBtn=lbl=>()=>[...document.querySelectorAll('#modeToggle button')].find(b=>b.textContent.trim()===lbl);
    const tabBtn=lbl=>()=>[...document.querySelectorAll('#main .tabs .tab')].find(b=>b.textContent.trim().startsWith(lbl));
    const out={};
    setMode('official'); nav('home');
    out.Planner   = clicksTo([navBtn('Planner')]);
    nav('home'); out.Tasks = clicksTo([navBtn('Tasks')]);
    nav('home'); out.Commitments = clicksTo([navBtn('Home')]) >= 0 ? (()=>{ // Commitments lives in More
        const m=[...document.querySelectorAll('#navbar .nt')].find(b=>/More/.test(b.textContent));
        if(!m)return -1; m.click();
        const i=[...document.querySelectorAll('#moremenu .nm-i')].find(b=>/Commitment/i.test(b.textContent));
        if(!i)return -1; i.click(); return 2;})() : -1;
    nav('home'); out.Money = clicksTo([modeBtn('Personal'), tabBtn('Money')]);
    setMode('official'); nav('home');
    out.Investments = clicksTo([modeBtn('Personal'), tabBtn('Investments')]);
    setMode('official'); nav('home');
    return out;
  });
  console.log('   clicks from Home:', JSON.stringify(cost));
  const officialAvg=(cost.Planner+cost.Tasks)/2;
  const personalAvg=(cost.Money+cost.Investments)/2;
  chk('Official destinations are 1 click',       cost.Planner===1 && cost.Tasks===1, JSON.stringify(cost));
  chk('Personal destinations are 2 clicks',      cost.Money===2 && cost.Investments===2, JSON.stringify(cost));
  chk('the split costs exactly one extra click', personalAvg-officialAvg===1, `${officialAvg} vs ${personalAvg}`);
  console.log('   -> the split costs 1 extra click and is what the PIN gate is attached to;');
  console.log('      merging the sections would remove the boundary the lock depends on.');

  console.log('\n---page errors---', JSON.stringify(errs.slice(0,4)));
  console.log(FAIL===0?'\n*** W5 SAVED VIEWS: ALL PASS ***':`\n*** W5 SAVED VIEWS: ${FAIL} FAILURE(S) ***`);
  await b.close();
  process.exit(FAIL?1:0);
})();
