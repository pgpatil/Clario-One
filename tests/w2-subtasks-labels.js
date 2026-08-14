/* W2 acceptance — subtasks and labels.
   The riskiest property here is containment: subtasks are ordinary task records, so the whole
   point is that they never leak into a list, a count, a KPI or a dashboard as orphan rows.
   Most of these checks exist to prove that, not to prove the happy path. */
const { chromium } = require('playwright');
let FAIL=0;
const chk=(n,ok,d)=>{console.log(`  ${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`); if(!ok)FAIL++;};

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const page = await b.newPage({ viewport:{width:1300,height:950} });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(process.env.CLARIO_URL || 'http://localhost:8934/index.html');
  await page.waitForTimeout(400);
  await page.evaluate(()=>{ if(document.getElementById('mAsk').classList.contains('open')) askResolve(null); });

  console.log('\n═══ subtasks: creation, rollup, completion');
  const core = await page.evaluate(()=>{
    tasks.length=0; const n=now(), td=today();
    tasks.push({id:'P1',type:'task',title:'Ship the release',owner:'me',due:td,original_due:td,
      status:'open',priority:'high',dept:'Ops',customer_id:null,notes:'',created_at:n,updated_at:n});
    ['Write notes','Tag the build','Announce'].forEach(t=>{
      g('__tmp')||0; });
    // use the real CRUD path, not hand-built records
    const inp=document.createElement('input'); inp.id='__subinp'; document.body.appendChild(inp);
    ['Write notes','Tag the build','Announce'].forEach(t=>{ inp.value=t; subAdd('P1','__subinp'); });
    const kids=SUB('P1');
    const before=subStats('P1');
    subToggle(kids[0].id);
    const after=subStats('P1');
    return {count:kids.length, titles:kids.map(k=>k.title), before, after,
            chip:subChip('P1').replace(/<[^>]+>/g,'').trim(),
            parentStillOpen:tasks.find(t=>t.id==='P1').status==='open'};
  });
  chk('three subtasks created via subAdd', core.count===3, JSON.stringify(core.titles));
  chk('rollup counts them', core.before.n===3 && core.before.done===0, JSON.stringify(core.before));
  chk('completing one updates the rollup', core.after.done===1, JSON.stringify(core.after));
  chk('rollup chip renders', /1\/3/.test(core.chip), core.chip);
  chk('completing a subtask does not auto-complete the parent', core.parentStillOpen);

  console.log('\n═══ containment: subtasks never appear as their own rows');
  const contain = await page.evaluate(()=>{
    const inList = T().filter(t=>t.parent_id).length;
    const inPersonal = TP().filter(t=>t.parent_id).length;
    nav('tasks');
    const rows=[...document.querySelectorAll('#main tbody tr')].map(r=>r.textContent);
    const leaked=rows.filter(r=>/Write notes|Tag the build|Announce/.test(r)).length;
    const parentShown=rows.filter(r=>/Ship the release/.test(r)).length;
    return {inList, inPersonal, rowCount:rows.length, leaked, parentShown};
  });
  chk('T() excludes subtasks',           contain.inList===0);
  chk('TP() excludes subtasks',          contain.inPersonal===0);
  chk('no subtask row in the Tasks list',contain.leaked===0, `${contain.rowCount} rows rendered`);
  chk('the parent is still listed',      contain.parentShown===1);

  console.log('\n═══ containment: counts and KPIs agree with the visible rows');
  const counts = await page.evaluate(()=>{
    const td=today();
    nav('home');
    const homeRows=[...document.querySelectorAll('#main .row')].map(r=>r.textContent);
    const leakedHome=homeRows.filter(r=>/Write notes|Tag the build|Announce/.test(r)).length;
    nav('dash');
    const kpis=[...document.querySelectorAll('#main .kpi')].map(k=>({
      label:k.querySelector('.kl')?.textContent.trim(), value:k.querySelector('.kv')?.textContent.trim()}));
    // "Overdue" must not count subtasks, or the number stops matching its own drill-down
    return {leakedHome, kpis, openTop:T().filter(t=>t.status!=='done').length};
  });
  chk('no subtask row on Home', counts.leakedHome===0);
  chk('open top-level count is 1, not 4', counts.openTop===1, `openTop=${counts.openTop}`);

  console.log('\n═══ deleting a parent takes its subtasks with it');
  const del = await page.evaluate(async ()=>{
    openTask('P1');
    const p=delTask();
    await new Promise(r=>setTimeout(r,80));
    if(document.getElementById('mAsk').classList.contains('open')) askResolve(true);
    await p;
    return {orphans:tasks.filter(t=>t.parent_id==='P1'&&!t.deleted).length,
            parentGone:!!tasks.find(t=>t.id==='P1').deleted};
  });
  chk('parent soft-deleted', del.parentGone);
  chk('no orphaned subtasks left', del.orphans===0, `orphans=${del.orphans}`);

  console.log('\n═══ labels: save, render, filter');
  const lbl = await page.evaluate(()=>{
    tasks.length=0; taskLabels.length=0; const n=now(), td=today();
    const mk=(id,title,labels)=>tasks.push({id,type:'task',title,owner:'me',due:td,original_due:td,
      status:'open',priority:'medium',dept:'',customer_id:null,notes:'',labels,created_at:n,updated_at:n});
    mk('A','Quarterly filing',['finance','urgent']);
    mk('B','Vendor call',['finance']);
    mk('C','Fix the printer',[]);
    persist();
    const all=LABELS();
    window._tLbl='finance'; nav('tasks');
    // the sortable header lives inside tbody here, so count data rows only
    const filtered=[...document.querySelectorAll('#main tbody tr.click')].map(r=>r.textContent.trim()).filter(Boolean);
    window._tLbl=''; renderView();
    const pills=labelPills(tasks.find(t=>t.id==='A')).replace(/<[^>]+>/g,'|');
    return {all, filteredCount:filtered.length,
            hasA:filtered.some(r=>/Quarterly filing/.test(r)),
            hasB:filtered.some(r=>/Vendor call/.test(r)),
            hasC:filtered.some(r=>/Fix the printer/.test(r)), pills};
  });
  chk('LABELS() collects labels in use', JSON.stringify(lbl.all)===JSON.stringify(['finance','urgent']), JSON.stringify(lbl.all));
  chk('filtering by #finance keeps the two', lbl.hasA && lbl.hasB, `${lbl.filteredCount} rows`);
  chk('filtering by #finance excludes the third', !lbl.hasC);
  chk('label pills render on the row', /finance/.test(lbl.pills) && /urgent/.test(lbl.pills), lbl.pills);

  console.log('\n═══ labels round-trip through the task modal');
  const trip = await page.evaluate(()=>{
    tasks.length=0; taskLabels.length=0;
    openTask();
    document.getElementById('tTitle').value='Labelled task';
    document.getElementById('tDue').value='2026-08-20';
    const i=document.getElementById('tLabelInp');
    i.value='billing'; addTaskLabel();
    i.value='#q3';     addTaskLabel();       // leading # should be stripped
    saveTask();
    const t=tasks.find(x=>x.title==='Labelled task');
    const saved=t?t.labels:null;
    openTask(t.id);
    const reloaded=[..._editLabels];
    try{closeM();}catch(e){}
    return {saved, reloaded, master:[...taskLabels]};
  });
  chk('labels saved on the record', JSON.stringify(trip.saved)===JSON.stringify(['billing','q3']), JSON.stringify(trip.saved));
  chk('leading # stripped', (trip.saved||[]).includes('q3'));
  chk('labels reload into the editor', JSON.stringify(trip.reloaded)===JSON.stringify(['billing','q3']), JSON.stringify(trip.reloaded));
  chk('master list learns new labels', trip.master.includes('billing') && trip.master.includes('q3'), JSON.stringify(trip.master));

  console.log('\n═══ labels survive a sync round-trip');
  const sync = await page.evaluate(()=>{
    const snapshot=JSON.parse(JSON.stringify(getState()));
    taskLabels.length=0; tasks.length=0;
    applyState(snapshot);
    const t=tasks.find(x=>x.title==='Labelled task');
    return {labels:t?t.labels:null, master:[...taskLabels]};
  });
  chk('labels survive getState/applyState', JSON.stringify(sync.labels)===JSON.stringify(['billing','q3']), JSON.stringify(sync.labels));
  chk('master list is part of synced state', sync.master.length===2, JSON.stringify(sync.master));

  console.log('\n---page errors---', JSON.stringify(errs.slice(0,4)));
  console.log(FAIL===0?'\n*** W2 SUBTASKS+LABELS: ALL PASS ***':`\n*** W2 SUBTASKS+LABELS: ${FAIL} FAILURE(S) ***`);
  await b.close();
  process.exit(FAIL?1:0);
})();
