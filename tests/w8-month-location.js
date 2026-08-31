/* Month planner — location layer, plus the mobile column defect.
   Location is the first layer on this view, not a detail: where you are decides what work is
   possible that day. So the tests assert the travel-map reading (one label per stretch, stable
   colour per city, visible gaps) rather than just "a chip exists". */
const { chromium, devices } = require('playwright');
let FAIL=0;
const chk=(n,ok,d)=>{console.log(`  ${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`); if(!ok)FAIL++;};
const URL = process.env.CLARIO_URL || 'http://localhost:8934/index.html';

const seed = `(()=>{ tasks.length=0;meetings.length=0;locations.length=0;
  const td=today(), mk=monthKey(td), D=d=>mk+'-'+String(d).padStart(2,'0');
  for(let d=3;d<=7;d++)  setLoc(D(d),'Mumbai');        // Mon..Fri, one row
  for(let d=10;d<=13;d++)setLoc(D(d),'Delhi');
  for(let d=17;d<=19;d++)setLoc(D(d),'Kochi plant');
  persist(); plTab='month'; plAnchor=td; nav('planner');
  document.querySelectorAll('.ovl.open').forEach(o=>o.classList.remove('open')); })()`;

(async () => {
  const browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });

  // ── the defect: 7 columns on a phone ──
  console.log('\n═══ the month grid fits on a phone');
  const ctx = await browser.newContext({...devices['iPhone 13']});
  const mp = await ctx.newPage();
  const merrs=[]; mp.on('pageerror',e=>merrs.push(e.message));
  await mp.goto(URL); await mp.waitForTimeout(400);
  await mp.evaluate(()=>{ if(document.getElementById('mAsk').classList.contains('open')) askResolve(null); });
  await mp.evaluate(seed); await mp.waitForTimeout(300);
  const mob = await mp.evaluate(()=>{
    const g=document.querySelector('.mgrid');
    const cols=getComputedStyle(g).gridTemplateColumns.split(' ').map(x=>Math.round(parseFloat(x)));
    const cells=[...document.querySelectorAll('.mg-c')];
    const vw=window.innerWidth;
    const offscreen=cells.filter(c=>{const r=c.getBoundingClientRect();return r.right>vw+1||r.left<-1;}).length;
    return {cols, spread:Math.max(...cols)-Math.min(...cols), offscreen,
            headers:document.querySelectorAll('.mg-h').length};
  });
  chk('all 7 columns are equal width', mob.spread<=1, JSON.stringify(mob.cols));
  chk('no cell is off-screen',         mob.offscreen===0, `${mob.offscreen} clipped`);
  chk('all 7 weekday headers render',  mob.headers===7);
  await mp.close(); await ctx.close();

  // ── the location layer ──
  const page = await browser.newPage({ viewport:{width:1400,height:1150} });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(URL); await page.waitForTimeout(400);
  await page.evaluate(()=>{ if(document.getElementById('mAsk').classList.contains('open')) askResolve(null); });
  await page.evaluate(seed); await page.waitForTimeout(300);

  console.log('\n═══ every day carries a location band');
  const bands = await page.evaluate(()=>{
    const cells=[...document.querySelectorAll('.mg-c')];
    return {cells:cells.length, bands:document.querySelectorAll('.locband').length,
            unset:document.querySelectorAll('.locband.none').length,
            named:document.querySelectorAll('.locband:not(.none):not(.cont)').length,
            cont:document.querySelectorAll('.locband.cont').length};
  });
  chk('one band per cell', bands.bands===bands.cells, JSON.stringify(bands));
  chk('three stretches produce three labels', bands.named===3, `${bands.named} labels, ${bands.cont} continuations`);
  chk('unset days show the affordance', bands.unset===bands.cells-(bands.named+bands.cont), `${bands.unset} unset`);

  console.log('\n═══ a city keeps the same colour everywhere');
  const colours = await page.evaluate(()=>{
    const td=today(), mk=monthKey(td), D=d=>mk+'-'+String(d).padStart(2,'0');
    const cls=ds=>{const c=[...document.querySelectorAll('.mg-c')].find(x=>x.querySelector('.locband'));return null;};
    return {mumbai:locColor('Mumbai'), mumbaiAgain:locColor('Mumbai'),
            delhi:locColor('Delhi'), kochi:locColor('Kochi plant'),
            caseStable:locColor('mumbai')===locColor('Mumbai'),
            inPalette:[locColor('Mumbai'),locColor('Delhi'),locColor('Kochi plant')]
              .every(c=>/^lc[0-7]$/.test(c))};
  });
  chk('deterministic per city', colours.mumbai===colours.mumbaiAgain, colours.mumbai);
  chk('different cities differ', colours.mumbai!==colours.delhi && colours.delhi!==colours.kochi,
      `${colours.mumbai}/${colours.delhi}/${colours.kochi}`);
  chk('case does not change the colour', colours.caseStable);
  chk('always inside the 8-colour palette', colours.inPalette);

  console.log('\n═══ a run that wraps to a new week re-labels');
  const wrap = await page.evaluate(()=>{
    const mk=monthKey(today()), D=d=>mk+'-'+String(d).padStart(2,'0');
    locations.length=0;
    for(let d=6;d<=13;d++)setLoc(D(d),'Pune');    // Thu..Thu, crosses a row boundary
    persist(); renderView();
    document.querySelectorAll('.ovl.open').forEach(o=>o.classList.remove('open'));
    return {labels:document.querySelectorAll('.locband:not(.none):not(.cont)').length,
            cont:document.querySelectorAll('.locband.cont').length};
  });
  chk('one stretch across two rows labels twice', wrap.labels===2, JSON.stringify(wrap));

  console.log('\n═══ setting a trip in one action');
  const trip = await page.evaluate(()=>{
    const mk=monthKey(today()), D=d=>mk+'-'+String(d).padStart(2,'0');
    locations.length=0; setLoc(D(1),'KeepMe'); persist();
    openTrip();
    document.getElementById('tripCity').value='Chennai';
    document.getElementById('tripFrom').value=D(9);
    document.getElementById('tripTo').value=D(14);
    saveTrip();
    return {inRange:[9,10,11,12,13,14].map(d=>locOn(D(d))),
            before:locOn(D(8)), after:locOn(D(15)), untouched:locOn(D(1)),
            inList:locationSuggestions().includes('Chennai'),
            modalClosed:!document.getElementById('mTrip').classList.contains('open')};
  });
  chk('every day in the range is set', trip.inRange.every(c=>c==='Chennai'), JSON.stringify(trip.inRange));
  chk('the day before is untouched',   trip.before==='', `"${trip.before}"`);
  chk('the day after is untouched',    trip.after==='',  `"${trip.after}"`);
  chk('unrelated days survive',        trip.untouched==='KeepMe');
  chk('the place joins the master list',trip.inList);
  chk('the modal closes',              trip.modalClosed);

  console.log('\n═══ reversed dates still work, and clearing is bounded');
  const rev = await page.evaluate(()=>{
    const mk=monthKey(today()), D=d=>mk+'-'+String(d).padStart(2,'0');
    openTrip();
    document.getElementById('tripCity').value='Goa';
    document.getElementById('tripFrom').value=D(22);   // deliberately backwards
    document.getElementById('tripTo').value=D(20);
    saveTrip();
    const set=[20,21,22].map(d=>locOn(D(d)));
    openTrip();
    document.getElementById('tripFrom').value=D(20);
    document.getElementById('tripTo').value=D(21);
    clearTrip();
    return {set, afterClear:[20,21,22].map(d=>locOn(D(d))), chennaiIntact:locOn(D(12))};
  });
  chk('from/to given backwards are swapped', rev.set.every(c=>c==='Goa'), JSON.stringify(rev.set));
  chk('clearing a range clears only it', JSON.stringify(rev.afterClear)===JSON.stringify(['','','Goa']), JSON.stringify(rev.afterClear));
  chk('a different trip is unaffected',  rev.chennaiIntact==='Chennai');

  console.log('\n═══ the legend matches the bands');
  const leg = await page.evaluate(()=>{
    const chips=[...document.querySelectorAll('.locleg')].map(c=>({t:c.textContent.trim(),cls:c.className}));
    const chennai=chips.find(c=>/Chennai/.test(c.t));
    return {chips:chips.length, chennai, unsetChip:chips.some(c=>/unset/.test(c.t)),
            matches:chennai?chennai.cls.includes(locColor('Chennai')):false};
  });
  chk('legend colour matches the band colour', leg.matches, JSON.stringify(leg.chennai));
  chk('legend counts the days',                /6d/.test(leg.chennai?leg.chennai.t:''), leg.chennai&&leg.chennai.t);
  chk('unset days are surfaced',               leg.unsetChip);

  console.log('\n═══ clicking a band edits that day only, without selecting it');
  const click = await page.evaluate(async ()=>{
    const before=selDay;
    const band=[...document.querySelectorAll('.locband:not(.none)')][0];
    band.click();
    await new Promise(r=>setTimeout(r,80));
    const open=document.getElementById('mAsk').classList.contains('open');
    if(open) askResolve(null);
    return {promptOpened:open, selDayUnchanged:selDay===before};
  });
  chk('the day-location prompt opens', click.promptOpened);
  chk('the day is not re-selected underneath', click.selDayUnchanged);

  console.log('\n---page errors---', JSON.stringify([...merrs,...errs].slice(0,4)));
  console.log(FAIL===0?'\n*** MONTH LOCATION: ALL PASS ***':`\n*** MONTH LOCATION: ${FAIL} FAILURE(S) ***`);
  await browser.close();
  process.exit(FAIL?1:0);
})();
