/* Month planner — load, density, completed work, and drag-to-reschedule.
   The drag half is driven with real pointer input for the same reason as W4: the feature is
   the gesture. The month drop is a different contract from the day/week one -- it changes the
   DAY and must leave the time of day alone -- so that is asserted explicitly. */
const { chromium, devices } = require('playwright');
let FAIL=0;
const chk=(n,ok,d)=>{console.log(`  ${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`); if(!ok)FAIL++;};
const URL = process.env.CLARIO_URL || 'http://localhost:8934/index.html';

const seed = `(()=>{ tasks.length=0;meetings.length=0;locations.length=0;_mExpand={};
  mShowDone=false; mDensity='full';
  const n=now(), td=today(), mk=monthKey(td), D=d=>mk+'-'+String(d).padStart(2,'0');
  const mk2=(id,d,title,o)=>tasks.push(Object.assign({id,type:'task',title,owner:'me',
    due:D(d),original_due:D(d),estimate_min:120,priority:'medium',status:'open',dept:'Ops',
    customer_id:null,notes:'',created_at:n,updated_at:n},o||{}));
  // day 10 is deliberately overloaded: 5 x 120min = 10h against an 8h day
  for(let i=0;i<5;i++) mk2('L'+i,10,'Heavy task '+i);
  mk2('K1',12,'Light task');                       // 2h
  mk2('DN1',12,'Finished thing',{status:'done',completed_at:D(12)+'T10:00:00Z'});
  mk2('MOVE',5,'Move me',{at:'14:30'});            // has a time of day to preserve
  meetings.push({id:'MM',title:'Ops sync',date:D(5),time:'09:30',duration:60,attendee_ids:[],created_at:n,updated_at:n});
  persist(); plTab='month'; plAnchor=td; nav('planner'); })()`;

/* The planner fires openPlanPrompt on an 80ms timeout, so a modal dismissed inside the same
   evaluate as the render simply comes back and swallows every pointer event. Dismiss after. */
const settle = async (pg) => { await pg.waitForTimeout(300);
  const open = await pg.evaluate(()=>{document.querySelectorAll('.ovl.open').forEach(o=>o.classList.remove('open'));
    return document.querySelectorAll('.ovl.open').length;});
  return open; };

(async () => {
  const browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport:{width:1400,height:1200} });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(URL); await page.waitForTimeout(400);
  await page.evaluate(()=>{ if(document.getElementById('mAsk').classList.contains('open')) askResolve(null); });
  await page.evaluate(seed);
  chk('no modal is intercepting the grid', (await settle(page))===0);

  console.log('\n═══ each day shows how full it already is');
  const load = await page.evaluate(()=>{
    const mk=monthKey(today()), D=d=>mk+'-'+String(d).padStart(2,'0');
    const cellOf=ds=>[...document.querySelectorAll('.mg-c')].find(c=>c.dataset.date===ds);
    const bar=ds=>{const c=cellOf(ds);const b=c&&c.querySelector('.mg-load');
      return b?{pct:b.querySelector('i').style.width,over:b.classList.contains('over'),title:b.title}:null;};
    return {heavy:dayLoad(D(10)), light:dayLoad(D(12)), empty:dayLoad(D(2)),
            heavyBar:bar(D(10)), lightBar:bar(D(12)), emptyBar:bar(D(2))};
  });
  chk('an overloaded day is flagged', load.heavy.mins===600 && load.heavy.over===true, JSON.stringify(load.heavy));
  chk('and its bar is the over colour', load.heavyBar && load.heavyBar.over===true, JSON.stringify(load.heavyBar));
  chk('a light day is not flagged',    load.light.over===false && load.light.mins===120, JSON.stringify(load.light));
  chk('bar width tracks the load',     load.lightBar && load.lightBar.pct==='25%', JSON.stringify(load.lightBar));
  chk('an empty day shows no bar',     load.emptyBar===null && load.empty.mins===0);
  chk('completed work is not counted as load', load.light.mins===120, 'the done task on the same day is excluded');

  console.log('\n═══ completed work can be shown, and is off by default');
  const done = await page.evaluate(()=>{
    const mk=monthKey(today()), D=d=>mk+'-'+String(d).padStart(2,'0');
    const cell=()=>[...document.querySelectorAll('.mg-c')].find(c=>c.dataset.date===D(12));
    const before={items:cell().querySelectorAll('.mg-it').length,
                  doneShown:cell().querySelectorAll('.mg-it.done').length};
    toggleMonthDone();
    const after={items:cell().querySelectorAll('.mg-it').length,
                 doneShown:cell().querySelectorAll('.mg-it.done').length};
    const loadUnchanged=dayLoad(D(12)).mins;
    toggleMonthDone();
    return {before, after, loadUnchanged, backOff:cell().querySelectorAll('.mg-it.done').length};
  });
  chk('hidden by default',            done.before.doneShown===0, JSON.stringify(done.before));
  chk('the toggle reveals it',        done.after.doneShown===1 && done.after.items===done.before.items+1, JSON.stringify(done.after));
  chk('showing it does not change the load', done.loadUnchanged===120);
  chk('the toggle turns back off',    done.backOff===0);

  console.log('\n═══ compact density fits a busy day');
  const dens = await page.evaluate(()=>{
    const mk=monthKey(today()), D=d=>mk+'-'+String(d).padStart(2,'0');
    const cell=()=>[...document.querySelectorAll('.mg-c')].find(c=>c.dataset.date===D(10));
    const full={titles:cell().querySelectorAll('.mg-it').length,
                dots:cell().querySelectorAll('.mg-dot').length,
                more:!!cell().querySelector('.mg-more'), h:Math.round(cell().getBoundingClientRect().height)};
    setDensity('compact');
    const comp={titles:cell().querySelectorAll('.mg-it').length,
                dots:cell().querySelectorAll('.mg-dot').length,
                more:!!cell().querySelector('.mg-more'), h:Math.round(cell().getBoundingClientRect().height)};
    const persisted=localStorage.getItem('cx_mdens');
    setDensity('full');
    return {full, comp, persisted};
  });
  chk('titles mode truncates at 3',      dens.full.titles===3 && dens.full.more===true, JSON.stringify(dens.full));
  chk('compact shows all five as dots',  dens.comp.dots===5 && dens.comp.more===false, JSON.stringify(dens.comp));
  chk('compact is not taller',           dens.comp.h<=dens.full.h, `${dens.full.h}px -> ${dens.comp.h}px`);
  chk('the choice is remembered',        dens.persisted==='compact');

  console.log('\n═══ "+N more" expands in place instead of sending you elsewhere');
  const exp = await page.evaluate(()=>{
    const mk=monthKey(today()), D=d=>mk+'-'+String(d).padStart(2,'0');
    const cell=()=>[...document.querySelectorAll('.mg-c')].find(c=>c.dataset.date===D(10));
    const selBefore=selDay;
    cell().querySelector('.mg-more').click();
    const after={items:cell().querySelectorAll('.mg-it').length,
                 less:!!cell().querySelector('.mg-more'),
                 selUnchanged:selDay===selBefore};
    cell().querySelector('.mg-more').click();
    return {after, collapsed:cell().querySelectorAll('.mg-it').length};
  });
  chk('expanding shows every item',   exp.after.items===5, JSON.stringify(exp.after));
  chk('it does not hijack the selection', exp.after.selUnchanged);
  chk('and it collapses again',       exp.collapsed===3, `${exp.collapsed} items`);

  console.log('\n═══ drag an item to another day');
  const geo = await page.evaluate(()=>{
    const mk=monthKey(today()), D=d=>mk+'-'+String(d).padStart(2,'0');
    const src=[...document.querySelectorAll('.mg-it[data-bid="MOVE"]')][0];
    const tgt=[...document.querySelectorAll('.mg-c')].find(c=>c.dataset.date===D(19));
    const a=src.getBoundingClientRect(), b=tgt.getBoundingClientRect();
    return {sx:a.left+a.width/2, sy:a.top+a.height/2, tx:b.left+b.width/2, ty:b.top+b.height/2,
            want:D(19), timeBefore:tasks.find(t=>t.id==='MOVE').at};
  });
  await page.mouse.move(geo.sx, geo.sy);
  await page.mouse.down();
  await page.mouse.move(geo.sx+10, geo.sy+8, {steps:3});
  await page.mouse.move(geo.tx, geo.ty, {steps:12});
  const mid = await page.evaluate(()=>({ghost:(document.getElementById('dragGhost')||{}).textContent,
    lit:document.querySelectorAll('.mg-c.drop-live').length}));
  await page.mouse.up();
  await page.waitForTimeout(250);
  const after = await page.evaluate(()=>{const t=tasks.find(x=>x.id==='MOVE');
    return {due:t.due, at:t.at, orig:t.original_due};});
  chk('the target day highlights',        mid.lit===1, `${mid.lit} lit`);
  chk('the ghost names the day, not a time', /\d/.test(mid.ghost||'') && !/:/.test(mid.ghost||''), JSON.stringify(mid.ghost));
  chk('the item moves to that day',       after.due===geo.want, `${after.due} (wanted ${geo.want})`);
  chk('its time of day is preserved',     after.at===geo.timeBefore, `at=${after.at}, was ${geo.timeBefore}`);
  chk('the original due date is kept',    !!after.orig, `original_due=${after.orig}`);

  console.log('\n═══ dragging a meeting keeps its time too');
  const mgeo = await page.evaluate(()=>{
    const mk=monthKey(today()), D=d=>mk+'-'+String(d).padStart(2,'0');
    const src=[...document.querySelectorAll('.mg-it[data-bid="MM"]')][0];
    const tgt=[...document.querySelectorAll('.mg-c')].find(c=>c.dataset.date===D(20));
    const a=src.getBoundingClientRect(), b=tgt.getBoundingClientRect();
    return {sx:a.left+a.width/2, sy:a.top+a.height/2, tx:b.left+b.width/2, ty:b.top+b.height/2, want:D(20)};
  });
  await page.mouse.move(mgeo.sx, mgeo.sy);
  await page.mouse.down();
  await page.mouse.move(mgeo.sx+10, mgeo.sy+8, {steps:3});
  await page.mouse.move(mgeo.tx, mgeo.ty, {steps:12});
  await page.mouse.up();
  await page.waitForTimeout(250);
  const mAfter = await page.evaluate(()=>{const m=meetings.find(x=>x.id==='MM');return {date:m.date,time:m.time};});
  chk('the meeting moves day',      mAfter.date===mgeo.want, `${mAfter.date}`);
  chk('and keeps 09:30',            mAfter.time==='09:30', `time=${mAfter.time}`);

  console.log('\n═══ a plain click still selects the day');
  const clickSel = await page.evaluate(()=>{
    const mk=monthKey(today()), D=d=>mk+'-'+String(d).padStart(2,'0');
    const cell=[...document.querySelectorAll('.mg-c')].find(c=>c.dataset.date===D(21));
    cell.click();
    return {selDay, wanted:D(21)};
  });
  chk('clicking a cell selects it', clickSel.selDay===clickSel.wanted, JSON.stringify(clickSel));

  console.log('\n═══ touch: press-and-hold reschedules, a flick does not');
  await page.close();
  const ctx = await browser.newContext({...devices['iPhone 13']});
  const tp = await ctx.newPage();
  const terrs=[]; tp.on('pageerror',e=>terrs.push(e.message));
  await tp.goto(URL); await tp.waitForTimeout(400);
  await tp.evaluate(()=>{ if(document.getElementById('mAsk').classList.contains('open')) askResolve(null); });
  await tp.evaluate(seed); await settle(tp);
  const drive = (holdMs,pid) => tp.evaluate(async ({holdMs,pid})=>{
    const mk=monthKey(today()), D=d=>mk+'-'+String(d).padStart(2,'0');
    const el=document.querySelector('.mg-it[data-bid="MOVE"]');
    const tgt=[...document.querySelectorAll('.mg-c')].find(c=>c.dataset.date===D(19));
    if(!el||!tgt)throw new Error('missing source or target');
    /* a phone shows about three rows: bring both ends on screen, as a real user scrolling would */
    el.scrollIntoView({block:'center'});
    await new Promise(r=>setTimeout(r,60));
    const a=el.getBoundingClientRect(), b=tgt.getBoundingClientRect();
    if(b.top<0||b.bottom>window.innerHeight)return {offscreen:true};
    const ev=(type,x,y,t)=>(t||window).dispatchEvent(new PointerEvent(type,{pointerId:pid,
      pointerType:'touch',clientX:x,clientY:y,bubbles:true,cancelable:true}));
    ev('pointerdown',a.left+a.width/2,a.top+a.height/2,el);
    await new Promise(r=>setTimeout(r,holdMs));
    ev('pointermove',b.left+b.width/2,b.top+b.height/2);
    ev('pointerup',  b.left+b.width/2,b.top+b.height/2);
    await new Promise(r=>setTimeout(r,60));
  },{holdMs,pid});
  const tBefore = await tp.evaluate(()=>tasks.find(t=>t.id==='MOVE').due);
  await drive(40,1);                       // flick, under the hold threshold
  await tp.waitForTimeout(200);
  const tFlick = await tp.evaluate(()=>tasks.find(t=>t.id==='MOVE').due);
  chk('a flick does not reschedule', tFlick===tBefore, `${tBefore} -> ${tFlick}`);
  await drive(320,2);                      // deliberate press
  await tp.waitForTimeout(250);
  const tHold = await tp.evaluate(()=>({due:tasks.find(t=>t.id==='MOVE').due, at:tasks.find(t=>t.id==='MOVE').at}));
  chk('press-and-hold reschedules', tHold.due!==tBefore, `${tBefore} -> ${tHold.due}`);
  chk('and still keeps the time',   tHold.at==='14:30', `at=${tHold.at}`);

  console.log('\n═══ dragging near an edge scrolls, so distant weeks are reachable on a phone');
  const edge = await tp.evaluate(async ()=>{
    window.scrollTo(0,0);
    const before=window.pageYOffset;
    const el=document.querySelector('.mg-it[data-bid="MOVE"]');
    const a=el.getBoundingClientRect();
    const ev=(t,x,y,tg)=>(tg||window).dispatchEvent(new PointerEvent(t,{pointerId:9,pointerType:'touch',
      clientX:x,clientY:y,bubbles:true,cancelable:true}));
    ev('pointerdown',a.left+a.width/2,a.top+a.height/2,el);
    await new Promise(r=>setTimeout(r,320));
    for(let i=0;i<6;i++){ev('pointermove',a.left+a.width/2,window.innerHeight-20);await new Promise(r=>setTimeout(r,16));}
    const after=window.pageYOffset;
    ev('pointerup',a.left+a.width/2,window.innerHeight-20);
    return {before,after};
  });
  chk('the page scrolls toward the edge', edge.after>edge.before, `${edge.before} -> ${edge.after}`);

  console.log('\n---page errors---', JSON.stringify([...errs,...terrs].slice(0,4)));
  console.log(FAIL===0?'\n*** MONTH PLANNING: ALL PASS ***':`\n*** MONTH PLANNING: ${FAIL} FAILURE(S) ***`);
  await browser.close();
  process.exit(FAIL?1:0);
})();
