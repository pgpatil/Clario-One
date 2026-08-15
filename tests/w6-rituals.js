/* W6 acceptance — guided rituals.
   The stated bar for this row was "matched step-for-step against Sunsama's documented daily
   shutdown and Friday weekly review, with each step either present or a stated reason for
   omitting it". So the coverage table below is the test, not decoration: each documented step
   maps to a step key that must exist, or is listed as a deliberate omission with its reason. */
const { chromium } = require('playwright');
let FAIL=0;
const chk=(n,ok,d)=>{console.log(`  ${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`); if(!ok)FAIL++;};

// Sunsama's documented flows -> the Clario step that covers each
const SHUTDOWN_COVERAGE = [
  ['review what you completed today', 'wins'],
  ['handle unfinished work',          'open'],
  ['preview tomorrow',                'next'],
  ['reflect on the day',              'note'],
];
const REVIEW_COVERAGE = [
  ['what you achieved',        'done'],
  ['what took the most effort','time'],
  ['plan next week',           'plan'],
];
// documented steps deliberately not built, and why
const OMITTED = [
  ['per-task time tracking', 'Clario records estimates, not tracked time; the effort view says so rather than implying a timesheet'],
];

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const page = await b.newPage({ viewport:{width:1300,height:1000} });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(process.env.CLARIO_URL || 'http://localhost:8934/index.html');
  await page.waitForTimeout(400);
  await page.evaluate(()=>{ if(document.getElementById('mAsk').classList.contains('open')) askResolve(null); });
  await page.evaluate(()=>{ const n=now(), td=today(), y=addDays(td,-3);
    tasks.length=0;meetings.length=0;plans.length=0;journals.length=0;
    const mk=(id,title,o)=>tasks.push(Object.assign({id,type:'task',title,owner:'me',due:td,original_due:td,
      status:'open',priority:'medium',dept:'Operations',customer_id:null,notes:'',estimate_min:60,
      created_at:n,updated_at:n},o||{}));
    mk('D1','Shipped the pricing note',{status:'done',completed_at:td+'T11:00:00Z'});
    mk('D2','Closed the vendor loop',  {status:'done',completed_at:td+'T15:00:00Z',dept:'Finance'});
    mk('O1','Draft the board pack');
    mk('O2','Chase the auditor',{due:y,original_due:y});
    mk('O3','Review capex model');
    meetings.push({id:'M1',title:'Ops sync',date:td,time:'09:00',duration:60,attendee_ids:[],created_at:n,updated_at:n});
    persist(); plTab='day'; plAnchor=td; nav('planner'); });
  await page.waitForTimeout(250);

  console.log('\n═══ coverage against the documented shutdown flow');
  const shutSteps = await page.evaluate(()=>ritStepsFor('shutdown').map(s=>s.k));
  SHUTDOWN_COVERAGE.forEach(([doc,key])=>
    chk(`shutdown covers "${doc}"`, shutSteps.includes(key), `-> step "${key}"`));
  console.log('\n═══ coverage against the documented weekly review flow');
  const revSteps = await page.evaluate(()=>ritStepsFor('review').map(s=>s.k));
  REVIEW_COVERAGE.forEach(([doc,key])=>
    chk(`review covers "${doc}"`, revSteps.includes(key), `-> step "${key}"`));
  OMITTED.forEach(([doc,why])=>console.log(`  NOTE  omitted: "${doc}" — ${why}`));

  console.log('\n═══ the shutdown actually walks you through it');
  const walk = await page.evaluate(async ()=>{
    ritOpen('shutdown', today());
    const seen=[];
    const snap=()=>({step:_rit.step, body:document.getElementById('ritBody').textContent.slice(0,90),
                     next:document.getElementById('ritNext').textContent,
                     backHidden:document.getElementById('ritBack').style.visibility==='hidden',
                     bars:document.querySelectorAll('#ritSteps i').length,
                     onBar:document.querySelectorAll('#ritSteps i.on').length});
    seen.push(snap());
    for(let i=0;i<3;i++){ritGo(1);seen.push(snap());}
    return {seen, open:document.getElementById('mRitual').classList.contains('open')};
  });
  chk('modal opens',                     walk.open);
  chk('four steps with a progress bar',  walk.seen[0].bars===4 && walk.seen[0].onBar===1, JSON.stringify(walk.seen[0]));
  chk('Back is hidden on the first step',walk.seen[0].backHidden);
  chk('step 1 leads with what you finished', /finished/i.test(walk.seen[0].body), walk.seen[0].body.slice(0,50));
  chk('step 2 is the unfinished decisions',  /unfinished/i.test(walk.seen[1].body), walk.seen[1].body.slice(0,50));
  chk('step 3 previews tomorrow',            /Tomorrow/i.test(walk.seen[2].body), walk.seen[2].body.slice(0,50));
  chk('final step offers to close the day',  walk.seen[3].next==='Close the day', walk.seen[3].next);

  console.log('\n═══ unfinished work is decided item by item, not swept');
  const perItem = await page.evaluate(()=>{
    ritOpen('shutdown', today()); ritGo(1);            // to the unfinished step
    const before=ritOpenItems(today()).length;
    const btns=document.querySelectorAll('#ritBody .rit-item .acts button').length;
    const perRow=btns/before;
    ritRoll('O1', addDays(today(),1));                 // tomorrow
    ritRoll('O3', addDays(today(),7));                 // next week
    ritDrop('O2');                                     // dropped
    return {before, perRow,
      o1:tasks.find(t=>t.id==='O1').due, o3:tasks.find(t=>t.id==='O3').due,
      o2del:!!tasks.find(t=>t.id==='O2').deleted,
      o1orig:tasks.find(t=>t.id==='O1').original_due,
      leftOnStep:document.querySelectorAll('#ritBody .rit-item').length};
  });
  chk('three choices per item',            perItem.perRow===3, `${perItem.perRow} buttons/row`);
  chk('an item can go to tomorrow',        perItem.o1===await page.evaluate(()=>addDays(today(),1)));
  chk('another can go to next week',       perItem.o3===await page.evaluate(()=>addDays(today(),7)));
  chk('another can be dropped',            perItem.o2del===true);
  chk('original due dates are preserved',  !!perItem.o1orig, `original_due=${perItem.o1orig}`);
  chk('the list shrinks as you decide',    perItem.leftOnStep===0, `${perItem.leftOnStep} left`);

  console.log('\n═══ the reflection is saved');
  const note = await page.evaluate(()=>{
    ritOpen('shutdown', today()); ritGo(1); ritGo(1); ritGo(1);
    const ta=document.getElementById('ritNote'); if(!ta)return {err:'no note field'};
    ta.value='Pricing note landed; auditor still silent.';
    ritGo(1);                                          // finishing saves
    const j=getJournal(today());
    return {saved:j?j.text:null, closed:!document.getElementById('mRitual').classList.contains('open')};
  });
  chk('the journal entry is written', /Pricing note landed/.test(note.saved||''), JSON.stringify(note.saved));
  chk('finishing closes the ritual',  note.closed);

  console.log('\n═══ weekly review');
  const rev = await page.evaluate(()=>{
    nav('review');
    const btn=[...document.querySelectorAll('#main button')].find(b=>/guided review/i.test(b.textContent));
    if(!btn)return {err:'no entry point'};
    btn.click();
    const bodies=[];
    for(let i=0;i<4;i++){bodies.push(document.getElementById('ritBody').textContent.slice(0,80)); if(i<3)ritGo(1);}
    return {entry:true, bodies};
  });
  chk('there is an entry point on the Review page', rev.entry===true, rev.err||'');
  chk('step 1 reports what was achieved', /achieved/i.test(rev.bodies[0]), rev.bodies[0].slice(0,45));
  chk('step 2 reports what slipped',      /slipped/i.test(rev.bodies[1]), rev.bodies[1].slice(0,45));
  chk('step 3 shows where time went',     /time went/i.test(rev.bodies[2]), rev.bodies[2].slice(0,45));
  chk('step 4 sets next week',            /Next week/i.test(rev.bodies[3]), rev.bodies[3].slice(0,45));

  console.log('\n═══ next week\'s outcomes land in the planner, not just the modal');
  const planned = await page.evaluate(()=>{
    const inp=document.getElementById('ritPlanInp');
    if(!inp)return {err:'no plan input'};
    inp.value='Close the audit'; ritAddPlan();
    const k=weekKey(addDays(today(),7));
    return {items:planItems('week',k).map(p=>p.text), key:k};
  });
  chk('the outcome is stored as a weekly plan item',
      (planned.items||[]).includes('Close the audit'), JSON.stringify(planned));

  console.log('\n═══ the static review page still works alongside it');
  const still = await page.evaluate(()=>{try{closeM();}catch(e){}
    nav('review');
    return {kpis:document.querySelectorAll('#main .kpi').length,
            printBtn:!!Array.from(document.querySelectorAll('#main button')).find(b=>/Print/.test(b.textContent))};});
  chk('the readable/printable review is intact', still.kpis>0 && still.printBtn, JSON.stringify(still));

  console.log('\n---page errors---', JSON.stringify(errs.slice(0,4)));
  console.log(FAIL===0?'\n*** W6 RITUALS: ALL PASS ***':`\n*** W6 RITUALS: ${FAIL} FAILURE(S) ***`);
  await b.close();
  process.exit(FAIL?1:0);
})();
