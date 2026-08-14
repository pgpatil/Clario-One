/* W1 acceptance: bounded+reversible list expansion, in-flight input survival, scroll semantics. */
const { chromium } = require('playwright');
let FAIL=0; const chk=(name,ok,detail)=>{console.log(`  ${ok?'PASS':'FAIL'}  ${name}${detail?'  '+detail:''}`); if(!ok)FAIL++;};
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const page = await b.newPage({ viewport:{width:1400,height:1000} });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(process.env.CLARIO_URL || 'http://localhost:8934/index.html'); await page.waitForTimeout(500);
  await page.evaluate(()=>{ if(document.getElementById('mAsk').classList.contains('open')) askResolve(null); });

  const seed=(N)=>page.evaluate((N)=>{tasks.length=0;const n=now(),td=today();
    for(let i=0;i<N;i++)tasks.push({id:'t'+i,type:'task',title:'Task number '+i,owner:'me',due:td,original_due:td,
      at:null,estimate_min:30,priority:'medium',status:'open',dept:'',customer_id:null,notes:'note '+i,created_at:n,updated_at:n});
    persist();nav('tasks');},N);

  console.log('\n═══ (a) "Show all" is bounded and reversible');
  await seed(20000); await page.waitForTimeout(400);
  const a = await page.evaluate(()=>{
    const btn=()=>[...document.querySelectorAll('#main button')].find(x=>/Show \d+ more/.test(x.textContent));
    const less=()=>[...document.querySelectorAll('#main button')].find(x=>/Show less/.test(x.textContent));
    const rows=()=>document.querySelectorAll('#main tbody tr').length;
    const r0=rows(), hasBtn=!!btn(), lessBefore=!!less();
    let t0=performance.now(); btn().click(); const step1=performance.now()-t0, r1=rows();
    t0=performance.now(); btn().click(); const step2=performance.now()-t0, r2=rows();
    const lessAfter=!!less();
    t0=performance.now(); less().click(); const backMs=performance.now()-t0, r3=rows();
    return {r0,hasBtn,lessBefore,r1,r2,r3,step1:+step1.toFixed(1),step2:+step2.toFixed(1),backMs:+backMs.toFixed(1),
            lessAfter, dom:document.getElementById('main').querySelectorAll('*').length};
  });
  chk('default page is 50 rows',            a.r0===51||a.r0===50, `rows=${a.r0}`);
  chk('no "Show less" until expanded',      a.lessBefore===false);
  chk('each click adds one bounded page',   a.r1-a.r0===50 && a.r2-a.r1===50, `${a.r0}->${a.r1}->${a.r2}`);
  chk('each step stays under 100ms',        a.step1<100 && a.step2<100, `${a.step1}ms / ${a.step2}ms`);
  chk('"Show less" appears once expanded',  a.lessAfter===true);
  chk('"Show less" returns to the default', a.r3===a.r0, `back to ${a.r3} rows in ${a.backMs}ms`);
  chk('DOM stays bounded after collapse',   a.dom<2000, `${a.dom} nodes`);

  // the old trap: is there any way to get an unbounded render in one action?
  const trap = await page.evaluate(()=>({stickyFlagStillUsed: typeof window._all_tasks!=='undefined'}));
  chk('old sticky _all_ flag is gone',      trap.stickyFlagStillUsed===false);

  console.log('\n═══ (a2) expansion does not leak into another view');
  const leak = await page.evaluate(()=>{
    const btn=()=>[...document.querySelectorAll('#main button')].find(x=>/Show \d+ more/.test(x.textContent));
    btn().click(); btn().click();
    const expanded=document.querySelectorAll('#main tbody tr').length;
    nav('people'); nav('tasks');
    return {expanded, afterRoundTrip:document.querySelectorAll('#main tbody tr').length};
  });
  chk('expanded list resets on navigation', leak.afterRoundTrip<leak.expanded, `${leak.expanded} -> ${leak.afterRoundTrip}`);

  console.log('\n═══ (b) in-flight typing survives a background sync');
  await page.evaluate(()=>{tasks.length=0;persist();nav('home');}); await page.waitForTimeout(300);
  const qa = await page.$('#qaInput');
  await qa.click();
  await page.keyboard.type('Renew insurance tomorrow',{delay:15});
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); // caret mid-string
  const bSync = await page.evaluate(()=>{
    const e=document.getElementById('qaInput');
    const before={v:e.value,caret:e.selectionStart};
    reRender();                                   // exactly what gPull() does off the 20s poll
    const a=document.getElementById('qaInput');
    return {before, value:a?a.value:null, focused:document.activeElement===a, caret:a?a.selectionStart:null};
  });
  chk('typed text survives',   bSync.value===bSync.before.v, JSON.stringify(bSync.value));
  chk('focus survives',        bSync.focused===true);
  chk('caret position survives',bSync.caret===bSync.before.caret, `${bSync.before.caret} -> ${bSync.caret}`);

  console.log('\n═══ (b2) mid-string editing in the Tasks filter');
  await seed(300); await page.waitForTimeout(300);
  const fbox = await page.$('#tqFilter');
  await fbox.click();
  await page.keyboard.type('number 15',{delay:20});
  await page.waitForTimeout(500);                 // debounce fires -> reRender
  await page.keyboard.press('Home');               // jump to start
  await page.keyboard.type('X',{delay:20});
  await page.waitForTimeout(500);
  const f2 = await page.evaluate(()=>{const e=document.getElementById('tqFilter');
    return {value:e.value, caret:e.selectionStart, focused:document.activeElement===e};});
  chk('caret is NOT forced to the end', f2.value==='Xnumber 15' && f2.caret===1, JSON.stringify(f2));

  console.log('\n═══ (c) mutations keep scroll; navigation resets it');
  await page.evaluate(()=>{window._tq='';window._tOwn='';window._tDp='';window._tSt='open';}); // clear (b2)'s filter
  await seed(300); await page.waitForTimeout(300);
  const c = await page.evaluate(()=>{
    const res={};
    window.scrollTo(0,1200); const y0=window.pageYOffset;
    res.pageActuallyScrolls = y0>400;              // guard: a 0->0 "pass" proves nothing
    res.scrollHeight=document.documentElement.scrollHeight;
    setTaskDue('t7', today());                    // a plain renderView() mutation handler
    res.mutationKeepsScroll={y0,y1:window.pageYOffset,ok:y0>400&&Math.abs(window.pageYOffset-y0)<40};
    window.scrollTo(0,1200);
    nav('people');                                 // a real navigation
    res.navResetsScroll={y:window.pageYOffset,ok:window.pageYOffset===0};
    return res;
  });
  chk('test is not vacuous — page really scrolls', c.pageActuallyScrolls, `y0>400, scrollHeight=${c.scrollHeight}`);
  chk('mutation keeps scroll position', c.mutationKeepsScroll.ok, `${c.mutationKeepsScroll.y0} -> ${c.mutationKeepsScroll.y1}`);
  chk('navigation resets to top',       c.navResetsScroll.ok, `y=${c.navResetsScroll.y}`);

  console.log('\n═══ default-path render stays O(1)');
  for(const N of [500,20000]){
    await seed(N);
    const ms = await page.evaluate(()=>{for(let i=0;i<3;i++)renderView();
      const t=[];for(let i=0;i<5;i++){const a=performance.now();renderView();t.push(performance.now()-a);}
      t.sort((x,y)=>x-y);return +t[2].toFixed(1);});
    chk(`render @${N} tasks under 100ms`, ms<100, `${ms}ms`);
  }

  console.log('\n---page errors---', JSON.stringify(errs.slice(0,5)));
  console.log(FAIL===0?'\n*** W1 ACCEPTANCE: ALL PASS ***':`\n*** W1 ACCEPTANCE: ${FAIL} FAILURE(S) ***`);
  await b.close();
  process.exit(FAIL?1:0);
})();
