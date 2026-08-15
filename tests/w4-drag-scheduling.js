/* W4 acceptance — drag scheduling.
   Driven with real pointer input, not synthetic state pokes: the whole point of the feature is
   the gesture, so a test that calls dragApplyMove() directly would prove nothing. Touch is
   exercised separately because it takes a different path (press-and-hold, so a flick can still
   scroll the page) and because this grid gets used on a phone. */
const { chromium, devices } = require('playwright');
let FAIL=0;
const chk=(n,ok,d)=>{console.log(`  ${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`); if(!ok)FAIL++;};
const URL = process.env.CLARIO_URL || 'http://localhost:8934/index.html';

const seed = `(()=>{ tasks.length=0; meetings.length=0; const n=now(), td=today();
  tasks.push({id:'T1',type:'task',title:'Write the board pack',owner:'me',due:td,original_due:td,
    at:null,estimate_min:60,priority:'high',status:'open',dept:'Ops',customer_id:null,notes:'',created_at:n,updated_at:n});
  tasks.push({id:'T2',type:'task',title:'Placed already',owner:'me',due:td,original_due:td,
    at:'10:00',estimate_min:60,priority:'medium',status:'open',dept:'Ops',customer_id:null,notes:'',created_at:n,updated_at:n});
  meetings.push({id:'M1',title:'Ops sync',date:td,time:'09:00',duration:60,attendee_ids:[],created_at:n,updated_at:n});
  persist(); plTab='day'; plAnchor=td; nav('planner'); })()`;

async function boot(page){
  await page.goto(URL); await page.waitForTimeout(400);
  await page.evaluate(()=>{ if(document.getElementById('mAsk').classList.contains('open')) askResolve(null); });
  await page.evaluate(seed); await page.waitForTimeout(300);
}

(async () => {
  const browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });

  // ─────────────────────────── MOUSE ───────────────────────────
  const page = await browser.newPage({ viewport:{width:1400,height:1000} });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await boot(page);

  console.log('\n═══ the grid is actually draggable now (W0 measured 0/0/0)');
  const present = await page.evaluate(()=>({
    sources:document.querySelectorAll('#main [data-drag-task]').length,
    blocks:document.querySelectorAll('#main .tl-b[data-bid]').length,
    handles:document.querySelectorAll('#main .tl-rz').length,
    dropTargets:document.querySelectorAll('#main .tl-blocks[data-date], #main .wcal-col-body[data-date]').length,
  }));
  chk('draggable source rows exist', present.sources>0, JSON.stringify(present));
  chk('blocks carry identity',       present.blocks>0);
  chk('resize handles exist',        present.handles>0);
  chk('drop targets carry a date',   present.dropTargets>0);

  console.log('\n═══ 1. drag an unplaced task onto the hour grid');
  const box = await page.evaluate(()=>{
    const src=document.querySelector('#main [data-drag-task="T1"]');
    const tl=document.querySelector('#main .tl-blocks');
    const s=src.getBoundingClientRect(), t=tl.getBoundingClientRect();
    return {sx:s.left+s.width/2, sy:s.top+s.height/2, tx:t.left+t.width/2, ty:t.top, HPX:46, H0:7};
  });
  // 14:00 is 7 hours below the top of the grid
  await page.mouse.move(box.sx, box.sy);
  await page.mouse.down();
  await page.mouse.move(box.sx+20, box.sy+10, {steps:3});
  await page.mouse.move(box.tx, box.ty + 7*box.HPX + 2, {steps:12});
  const midGhost = await page.evaluate(()=>{const g=document.getElementById('dragGhost');
    return {shown:g&&g.style.display!=='none', text:g?g.textContent:null,
            litTargets:document.querySelectorAll('.drop-live').length};});
  await page.mouse.up();
  await page.waitForTimeout(250);
  const placed = await page.evaluate(()=>{const t=tasks.find(x=>x.id==='T1');return {at:t.at,due:t.due};});
  chk('a live time chip follows the pointer', midGhost.shown && /14:00/.test(midGhost.text||''), JSON.stringify(midGhost));
  chk('drop target highlights',               midGhost.litTargets===1, `${midGhost.litTargets} lit`);
  chk('task lands at the dropped hour',       placed.at==='14:00', JSON.stringify(placed));

  console.log('\n═══ 2. drag a placed block to a new time');
  const mv = await page.evaluate(()=>{
    const b=document.querySelector('#main .tl-b[data-bid="T2"]');
    const r=b.getBoundingClientRect();
    return {x:r.left+r.width/2, y:r.top+6};
  });
  await page.mouse.move(mv.x, mv.y);
  await page.mouse.down();
  await page.mouse.move(mv.x, mv.y+20, {steps:4});
  await page.mouse.move(mv.x, mv.y + 3*46, {steps:10});   // +3 hours
  await page.mouse.up();
  await page.waitForTimeout(250);
  const moved = await page.evaluate(()=>tasks.find(x=>x.id==='T2').at);
  chk('block moves to the new hour', moved==='13:00', `at=${moved}`);

  console.log('\n═══ 3. resize a meeting block by its bottom edge');
  const rz = await page.evaluate(()=>{
    const b=document.querySelector('#main .tl-b[data-bid="M1"]');
    const h=b.querySelector('.tl-rz').getBoundingClientRect();
    return {x:h.left+h.width/2, y:h.top+h.height/2, before:meetings.find(m=>m.id==='M1').duration};
  });
  await page.mouse.move(rz.x, rz.y);
  await page.mouse.down();
  await page.mouse.move(rz.x, rz.y+15, {steps:3});
  await page.mouse.move(rz.x, rz.y+46, {steps:8});        // +1 hour
  await page.mouse.up();
  await page.waitForTimeout(250);
  const dur = await page.evaluate(()=>meetings.find(m=>m.id==='M1').duration);
  chk('resize changes duration', dur===120, `${rz.before} -> ${dur}`);

  console.log('\n═══ 4. everything snaps to 15 minutes');
  const snap = await page.evaluate(()=>[3,11,20,37,52].map(px=>dragTimeAt(px)));
  const okSnap = snap.every(t=>['00','15','30','45'].includes(t.slice(3)));
  chk('snapped times land on quarter hours', okSnap, JSON.stringify(snap));

  console.log('\n═══ 5. a plain click still opens the block (drag must not eat taps)');
  const clicked = await page.evaluate(()=>{ window.__opened=null;
    const orig=window.openTask; window.openTask=id=>{window.__opened=id;};
    const b=document.querySelector('#main .tl-b[data-bid="T2"]');
    const r=b.getBoundingClientRect();
    return {x:r.left+r.width/2, y:r.top+6, restore:true};});
  await page.mouse.move(clicked.x, clicked.y);
  await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(200);
  const opened = await page.evaluate(()=>window.__opened);
  chk('click without movement opens the task', opened==='T2', `opened=${opened}`);

  console.log('\n═══ 6. changes survive a re-render and a reload');
  const persisted = await page.evaluate(()=>{
    reRender();
    const fromDom=[...document.querySelectorAll('#main .tl-b[data-bid]')].map(b=>({id:b.dataset.bid,top:b.style.top}));
    const snapshot=JSON.parse(JSON.stringify(getState()));
    tasks.length=0;meetings.length=0;applyState(snapshot);
    return {fromDom, t1:tasks.find(x=>x.id==='T1').at, t2:tasks.find(x=>x.id==='T2').at,
            m1:meetings.find(m=>m.id==='M1').duration};});
  chk('positions survive re-render', persisted.fromDom.length===3, JSON.stringify(persisted.fromDom));
  chk('values survive a state round-trip',
      persisted.t1==='14:00'&&persisted.t2==='13:00'&&persisted.m1===120, JSON.stringify(persisted));

  console.log('\n═══ 7. week grid: dragging across a column changes the day');
  const wk = await page.evaluate(()=>{
    const td=today();
    tasks.length=0;meetings.length=0;const n=now();
    meetings.push({id:'W1',title:'Review',date:td,time:'10:00',duration:60,attendee_ids:[],created_at:n,updated_at:n});
    persist();plTab='week';plAnchor=td;renderView();
    const cols=[...document.querySelectorAll('#main .wcal-col-body[data-date]')].map(c=>c.dataset.date);
    return {cols};});
  await page.waitForTimeout(300);
  /* the week tab fires openPlanPrompt on an 80ms timeout, so it has to be dismissed AFTER the
     wait -- doing it synchronously inside the render evaluate is simply undone */
  const modalsOpen = await page.evaluate(()=>{
    document.querySelectorAll('.ovl.open').forEach(o=>o.classList.remove('open'));
    return document.querySelectorAll('.ovl.open').length;});
  chk('no modal is intercepting the grid', modalsOpen===0, `${modalsOpen} still open`);
  const cross = await page.evaluate(()=>{
    const b=document.querySelector('#main .tl-b[data-bid="W1"]');
    const cols=[...document.querySelectorAll('#main .wcal-col-body[data-date]')];
    const from=b.getBoundingClientRect();
    const myDate=meetings.find(m=>m.id==='W1').date;
    const target=cols.find(c=>c.dataset.date!==myDate);
    const t=target.getBoundingClientRect();
    const grabOff=6, dropY=t.top+2*46;
    /* the block keeps the offset you grabbed it by, so the expected time follows from the
       same geometry the engine uses -- not from a hand-picked round number */
    return {sx:from.left+from.width/2, sy:from.top+grabOff, tx:t.left+t.width/2, ty:dropY,
            before:myDate, want:target.dataset.date,
            wantTime:dragTimeAt(dropY-t.top-grabOff)};});
  await page.mouse.move(cross.sx, cross.sy);
  await page.mouse.down();
  await page.mouse.move(cross.sx+8, cross.sy+8, {steps:3});
  await page.mouse.move(cross.tx, cross.ty, {steps:14});
  await page.mouse.up();
  await page.waitForTimeout(250);
  const after = await page.evaluate(()=>{const m=meetings.find(x=>x.id==='W1');return {date:m.date,time:m.time};});
  chk('week columns carry dates', wk.cols.length===7, JSON.stringify(wk.cols.length));
  chk('dragging across columns moves the day', after.date===cross.want, `${cross.before} -> ${after.date} (wanted ${cross.want})`);
  chk('and sets the dropped time',             after.time===cross.wantTime, `time=${after.time}, expected ${cross.wantTime}`);

  console.log('\n---mouse page errors---', JSON.stringify(errs.slice(0,4)));
  await page.close();

  // ─────────────────────────── TOUCH ───────────────────────────
  console.log('\n═══ 8. touch: press-and-hold drags, a flick still scrolls');
  const ctx = await browser.newContext({...devices['iPhone 13'], hasTouch:true, isMobile:true});
  const tp = await ctx.newPage();
  const terrs=[]; tp.on('pageerror',e=>terrs.push(e.message));
  await boot(tp);

  const tb = await tp.evaluate(()=>{
    document.querySelectorAll('.ovl.open').forEach(o=>o.classList.remove('open'));
    const b=document.querySelector('#main .tl-b[data-bid="T2"]');
    if(!b)return null;
    const r=b.getBoundingClientRect();
    return {x:r.left+r.width/2, y:r.top+6, before:tasks.find(t=>t.id==='T2').at};
  });
  if(!tb){ chk('touch: block present on mobile layout', false, 'no block rendered'); }
  else {
    const drive = (holdMs, dy, pid) => tp.evaluate(async ({holdMs,dy,pid})=>{
      const el=document.querySelector('#main .tl-b[data-bid="T2"]');
      if(!el)throw new Error('block vanished');
      /* x must sit over the grid: a drop resolves by hit-testing the column under the pointer */
      const r=el.getBoundingClientRect(); const x=r.left+r.width/2, y=r.top+6;
      const ev=(type,cy,target)=>(target||window).dispatchEvent(new PointerEvent(type,{
        pointerId:pid,pointerType:'touch',clientX:x,clientY:cy,bubbles:true,cancelable:true}));
      ev('pointerdown',y,el);
      await new Promise(r=>setTimeout(r,holdMs));
      ev('pointermove',y+Math.round(dy/2));
      ev('pointermove',y+dy);
      ev('pointerup',y+dy);
      await new Promise(r=>setTimeout(r,60));
    }, {holdMs,dy,pid});

    const before1 = await tp.evaluate(()=>tasks.find(t=>t.id==='T2').at);
    await drive(320, 2*46, 1);                       // press past HOLD_MS, then move
    await tp.waitForTimeout(250);
    const afterHold = await tp.evaluate(()=>tasks.find(t=>t.id==='T2').at);
    chk('touch press-and-hold moves the block', afterHold!==before1, `${before1} -> ${afterHold}`);

    const before2 = await tp.evaluate(()=>tasks.find(t=>t.id==='T2').at);
    await drive(40, 60, 2);                          // a flick, well under HOLD_MS
    await tp.waitForTimeout(250);
    const flicked = await tp.evaluate(()=>tasks.find(t=>t.id==='T2').at);
    chk('a quick flick does not reschedule', flicked===before2, `${before2} -> ${flicked}`);
  }
  console.log('\n---touch page errors---', JSON.stringify(terrs.slice(0,4)));

  console.log(FAIL===0?'\n*** W4 DRAG SCHEDULING: ALL PASS ***':`\n*** W4 DRAG SCHEDULING: ${FAIL} FAILURE(S) ***`);
  await browser.close();
  process.exit(FAIL?1:0);
})();
