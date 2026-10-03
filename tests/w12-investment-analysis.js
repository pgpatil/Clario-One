/* W12 acceptance — investment analysis dashboard and the as-of net worth model behind it.
   The numbers come first: every figure on the dashboard is a difference between two nwAt()
   months, so most of these checks prove that nwAt() is right for a PAST month, not just today.
   The headline regression is the home-loan case: principal repaid used to show as a change of 0
   because last month reused today's debt. */
const { chromium } = require('playwright');
let FAIL=0;
const chk=(n,ok,d)=>{console.log(`  ${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`); if(!ok)FAIL++;};
const near=(a,b,eps=0.5)=>Math.abs(a-b)<=eps;

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const page = await b.newPage({ viewport:{width:1300,height:950} });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(process.env.CLARIO_URL || 'http://localhost:8934/index.html');
  await page.waitForTimeout(400);
  await page.evaluate(()=>{ if(document.getElementById('mAsk').classList.contains('open')) askResolve(null); });

  const clear=()=>page.evaluate(()=>{invhold.length=0;invval.length=0;invpf.length=0;loans.length=0;
    ious.length=0;ioutx.length=0;nwsnap.length=0;nwSel=null;nwRange='12m';nwShow={net:true,assets:false,debt:false};});

  console.log('\n═══ debt paydown counts as a gain (the bug this replaced)');
  await clear();
  const pay = await page.evaluate(()=>{
    const n=now(), cur=monthKey(today()), m1=ymAdd(cur,-1), m2=ymAdd(cur,-2);
    invhold.push({id:'H',name:'Savings fund',kind:'Mutual fund',created_at:n,updated_at:n});
    invval.push({id:'v1',hold_id:'H',month:m2,value:500000,added:0,created_at:n,updated_at:n});
    loans.push({id:'L',name:'Home loan',emi:45000,rate:8.5,start_ym:'2020-01',end_ym:'2040-01',
      last_paid_ym:cur,outstanding:0,created_at:n,updated_at:n});
    const principal=loanOutstanding(loans[0],m2)-loanOutstanding(loans[0],m1);
    const a=nwAttrib(m1);
    personalTab='invest';invView='overview';invMonth=m1;setMode('personal');renderView();
    const kpi=[...document.querySelectorAll('#main .kpi')].find(k=>/Change vs/.test(k.textContent));
    invMonth=null;
    return {principal, change:a.change, part:a.parts.find(p=>p.k==='Loan principal repaid').v,
            overviewKpi:kpi?kpi.querySelector('.kv').textContent:null};
  });
  chk('a month of EMI repays real principal', pay.principal>10000, `principal=${pay.principal}`);
  chk('net worth change equals principal repaid', near(pay.change,pay.principal), `change=${pay.change}`);
  chk('attributed to "Loan principal repaid"', near(pay.part,pay.principal), `part=${pay.part}`);
  chk('Net worth tab shows it too (was ₹0)', pay.overviewKpi && !/^\+?₹?0$/.test(pay.overviewKpi.replace(/[^\d₹+−]/g,'')), pay.overviewKpi);

  console.log('\n═══ attribution parts always sum to the change');
  await clear();
  const att = await page.evaluate(()=>{
    const n=now(), cur=monthKey(today()), M=k=>ymAdd(cur,-k);
    invhold.push({id:'A',name:'Index fund',kind:'Mutual fund',created_at:n,updated_at:n},
                 {id:'B',name:'Gold',kind:'Gold',created_at:n,updated_at:n});
    const v=(h,m,val,add)=>invval.push({id:uid(),hold_id:h,month:m,value:val,added:add||0,created_at:n,updated_at:n});
    v('A',M(14),100000); v('A',M(12),104000,2000); v('A',M(8),112000,5000); v('A',M(5),98000); v('A',M(2),121000,10000); v('A',M(0),126000,2000);
    v('B',M(6),50000); v('B',M(3),53000); v('B',M(0),51000);     // B appears mid-range: its first value is money in
    invpf.push({id:'P',company:'Acme',employee:300000,employer:300000,bonus:0,created_at:n,updated_at:n});
    nwsnap.push({id:'s1',month:M(10),pf:520000,flat:80000,created_at:n,updated_at:n},
                {id:'s2',month:M(4),pf:560000,flat:60000,created_at:n,updated_at:n});
    loans.push({id:'L1',name:'Car',emi:15000,rate:9,start_ym:M(20),end_ym:ymAdd(cur,30),last_paid_ym:cur,created_at:n,updated_at:n},
               {id:'L2',name:'Family loan',outstanding:30000,created_at:n,updated_at:n},
               {id:'L3',name:'Overdraft',outstanding:20000,created_at:n,updated_at:n});
    ious.push({id:'I1',dir:'lent',person:'Ravi',principal:40000,date:M(7)+'-10',created_at:n,updated_at:n},
              {id:'I2',dir:'borrowed',person:'Uncle',principal:25000,date:M(3)+'-05',created_at:n,updated_at:n});
    ioutx.push({id:'X1',iou_id:'I1',amount:15000,date:M(4)+'-20',created_at:n,updated_at:n},
               {id:'X2',iou_id:'I2',amount:5000,date:M(1)+'-02',created_at:n,updated_at:n});
    const out=[];
    for(let k=13;k>=0;k--){const a=nwAttrib(M(k));const sum=a.parts.reduce((s,p)=>s+p.v,0);
      out.push({ym:M(k),change:a.change,sum});}
    const bFirst=nwAttrib(M(6)).parts[0].v;
    // the snapshot holds the TOTAL for both unscheduled loans; it must not be added once per loan
    const pastLoans=nwAt(M(4)).loans-loanOutstandingAt(loans[0],M(4));
    return {out, bFirst, pastLoans, bad:out.filter(r=>Math.abs(r.change-r.sum)>0.5)};
  });
  chk('every month in 14 balances to the rupee', att.bad.length===0, att.bad.length?JSON.stringify(att.bad[0]):`${att.out.length} months`);
  chk('a new holding\'s first value counts as money invested', near(att.bFirst,50000), `invested part=${att.bFirst}`);
  chk('two unscheduled loans use the recorded total once', near(att.pastLoans,60000), `got ${att.pastLoans}, want 60000`);

  console.log('\n═══ summary card: this month and year on year');
  const view = await page.evaluate(()=>{
    personalTab='invest';invView='analysis';nwTab='moved';renderView();
    const cur=monthKey(today());
    const st=Object.fromEntries([...document.querySelectorAll('#main .nwst')].map(k=>[k.querySelector('.kl').textContent.trim(),k.querySelector('b').textContent.trim()]));
    const yoy=nwAt(cur).net-nwAt(ymAdd(cur,-12)).net, mom=nwAt(cur).net-nwAt(ymAdd(cur,-1)).net;
    const tabOn=[...document.querySelectorAll('.vtog button.on')].map(b=>b.textContent);
    const tabs=[...document.querySelectorAll('#main .nwtabs .tab')].map(b=>b.textContent.trim());
    return {st, yoyTxt:sgnMoney(yoy), momTxt:sgnMoney(mom), tabOn, tabs,
            hero:document.querySelector('#main .nwh-v').textContent.trim(), net:fmtMoney(nwAt(cur).net)};
  });
  chk('Analysis tab is selected', view.tabOn.includes('Analysis'), JSON.stringify(view.tabOn));
  chk('headline net worth matches nwAt(today)', view.hero===view.net, `${view.hero} vs ${view.net}`);
  chk('This month is today minus last month', view.st['This month']===view.momTxt, `${view.st['This month']} vs ${view.momTxt}`);
  chk('Year on year is today minus 12 months ago', view.st['Year on year']===view.yoyTxt, `${view.st['Year on year']} vs ${view.yoyTxt}`);
  chk('returns per year is shown for investments', /%/.test(view.st['Returns / yr']||''), view.st['Returns / yr']);
  chk('details sit behind five tabs', JSON.stringify(view.tabs)===JSON.stringify(['What moved','Monthly','Yearly','Holdings','Allocation']), JSON.stringify(view.tabs));

  console.log('\n═══ every tab renders its picture');
  const tabs = await page.evaluate(()=>{const out={};
    const painted=id=>{const c=document.getElementById(id);if(!c)return 0;const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i])n++;return n;};
    setNwTab('moved');out.moved=document.querySelectorAll('#main .dv').length;
    setNwTab('monthly');out.bars=painted('nwBars');out.sum=(document.querySelector('#main .nwsum')||{}).textContent||'';
    nwTbl=true;renderView();out.rows=document.querySelectorAll('#main table.nwt tr.click').length;
    out.pills=[...document.querySelectorAll('#main .pill')].map(p=>p.textContent);nwTbl=false;
    setNwTab('yearly');out.years=document.querySelectorAll('#main .yrow').length;
    out.ypills=[...document.querySelectorAll('#main .pill')].map(p=>p.textContent);
    out.ytext=document.querySelector('#main .yrow .note').textContent;
    setNwTab('holdings');out.holds=document.querySelectorAll('#main .hrow').length;
    setNwTab('alloc');out.donut=painted('nwDonut');out.legend=document.querySelectorAll('#main .al-row').length;
    setNwTab('moved');return out;});
  chk('What moved: six diverging bars', tabs.moved===6, `${tabs.moved}`);
  chk('Monthly: bar chart is painted', tabs.bars>1500, `${tabs.bars} px`);
  chk('Monthly: selected month spelled out', /put in/.test(tabs.sum) && /market/.test(tabs.sum), tabs.sum.slice(0,70));
  chk('Monthly: "Show the numbers" gives 11 rows for 1Y', tabs.rows===11, `rows=${tabs.rows}`);
  chk('months with no holding value are flagged "carried"', tabs.pills.includes('carried'));
  chk('Yearly: one row per calendar year', tabs.years===2, `${tabs.years}`);
  chk('partial calendar years are flagged "part"', tabs.ypills.includes('part'));
  chk('Yearly % is the market\'s return, not net worth change', /market [+−]₹[\d,.]+( L)? \([+−][\d.]+%\)/.test(tabs.ytext), tabs.ytext);
  chk('Holdings: one row per holding', tabs.holds===2, `${tabs.holds}`);
  chk('Allocation: donut painted with a legend', tabs.donut>1500 && tabs.legend>=3, `${tabs.donut}px, ${tabs.legend} rows`);

  console.log('\n═══ returns, drawdown, XIRR on known inputs');
  const math = await page.evaluate(()=>{
    const dd=nwDrawdown([{ym:'a',net:100},{ym:'b',net:120},{ym:'c',net:90},{ym:'d',net:130}]);
    const ddNeg=nwDrawdown([{ym:'a',net:-500},{ym:'b',net:-300},{ym:'c',net:-450}]);
    const x1=xirr([{t:0,v:-1000},{t:365,v:1100}]);
    const x2=xirr([{t:0,v:-1000},{t:365,v:-1000},{t:730,v:2310}]);   // 10% on both tranches
    const px=portXirr([{ym:'2025-01',holdings:1000},{ym:'2026-01',holdings:1100}],[]);
    const px2=portXirr([{ym:'2025-01',holdings:0},{ym:'2025-02',holdings:1000},{ym:'2026-02',holdings:1100}],[{ym:'2025-02',inv:1000}]);
    return {px, px2, dd, ddNeg, x1, x2, x0:xirr([{t:0,v:-1}])};
  });
  chk('returns/yr: 1000 → 1100 in a year is 10%', near(math.px,0.10,2e-3), String(math.px));
  chk('returns/yr ignores money put in: invest 1000, worth 1100 a year on is 10%', near(math.px2,0.10,2e-3), String(math.px2));
  chk('drawdown: 120 → 90 is −25%, peak to trough', near(math.dd.pct,-0.25,1e-9)&&math.dd.from==='b'&&math.dd.at==='c', JSON.stringify(math.dd));
  chk('drawdown still measured in rupees while net worth is negative', math.ddNeg.amt===-150&&math.ddNeg.pct===null, JSON.stringify(math.ddNeg));
  chk('XIRR: −1000 then +1100 a year later is 10%', near(math.x1,0.10,1e-4), String(math.x1));
  chk('XIRR: two yearly tranches at 10%', near(math.x2,0.10,1e-4), String(math.x2));
  chk('XIRR needs two flows', math.x0===null);

  console.log('\n═══ history that is not known is flagged, never presented as known');
  const est = await page.evaluate(()=>{
    nwsnap.length=0;
    const cur=monthKey(today()), past=ymAdd(cur,-3);
    const before=nwAt(past).assumed;
    const wrote=nwRecord(), again=nwRecord();
    const snap=nwsnap.find(x=>x.month===cur);
    nwTab='monthly';nwTbl=true;renderView();
    const estPills=[...document.querySelectorAll('#main .pill')].filter(p=>p.textContent==='est.').length;
    nwTab='moved';nwTbl=false;renderView();
    return {before, wrote, again, snapPf:snap&&snap.pf, pf:pfCorpus(), snapFlat:snap&&snap.flat, estPills,
            nowAssumed:nwAt(cur).assumed};
  });
  chk('a past month with no recording is marked assumed', est.before===true);
  chk('nwRecord writes this month once', est.wrote===false||est.snapPf===est.pf, `wrote=${est.wrote}`);  // the render above may have recorded already
  chk('nwRecord does not rewrite an unchanged month', est.again===false);
  chk('recording holds PF and the unscheduled-loan total', est.snapPf===600000&&est.snapFlat===50000, `pf=${est.snapPf} flat=${est.snapFlat}`);
  chk('"est." pills shown for assumed months', est.estPills>0, `${est.estPills}`);
  chk('the current month is never assumed', est.nowAssumed===false);

  console.log('\n═══ range chips, legend, sorting');
  const ui = await page.evaluate(()=>{
    const len=r=>{setNwRange(r);return window._nwData.length;};
    const r6=len('6m'), r12=len('12m'), r3y=len('3y'), rAll=len('all');
    const first=nwFirstMonth(), span=ymDiff(first,monthKey(today()))+1;
    setNwRange('12m');
    toggleNwSeries('net');  const stillOne=nwShow.net;          // cannot hide the last series
    toggleNwSeries('assets');toggleNwSeries('net');
    const legOn=[...document.querySelectorAll('button.nwleg.on')].map(b=>b.textContent.trim());
    toggleNwSeries('assets');toggleNwSeries('net');
    nwTab='holdings';delete _sort.invperf;renderView();
    const byVal=[...document.querySelectorAll('#main .hrow .hr-top b:first-child')].map(b=>b.textContent);
    setSort('invperf','name');
    const order=[...document.querySelectorAll('#main .hrow .hr-top b:first-child')].map(b=>b.textContent.slice(0,4));
    const r0=document.querySelector('#main .hrow');r0.click();const opened=!!document.querySelector('#main .hr-more');
    nwTab='moved';nwHoldOpen=null;renderView();
    return {r6,r12,r3y,rAll,span,stillOne,legOn,order,byVal,opened};
  }).catch(e=>({err:e.message}));
  chk('6 months → 6 points', ui.r6===6, JSON.stringify(ui));
  chk('12 months → 12 points', ui.r12===12);
  chk('3 years is clipped to the first month with data', ui.r3y===ui.span, `${ui.r3y} vs ${ui.span}`);
  chk('All starts at the first month with data', ui.rAll===ui.span);
  chk('the last visible series cannot be hidden', ui.stillOne===true);
  chk('legend toggles reflect state', JSON.stringify(ui.legOn)===JSON.stringify(['Assets']), JSON.stringify(ui.legOn));
  chk('holdings default to largest value first', JSON.stringify(ui.byVal)===JSON.stringify(['Index fund','Gold']), JSON.stringify(ui.byVal));
  chk('holdings sort by name', JSON.stringify(ui.order)===JSON.stringify(['Gold','Inde']), JSON.stringify(ui.order));
  chk('tapping a holding opens its details', ui.opened);

  const yr = await page.evaluate(()=>{
    nwTab='yearly';
    const cells=()=>[...document.querySelectorAll('#main .yrow')].map(r=>[r.textContent.replace(/\s+/g,' ').trim()]);
    const prevYr=String(+today().slice(0,4)-1);
    setNwRange('12m'); const short=cells().find(r=>r[0].startsWith(prevYr));
    setNwRange('all'); const full=cells().find(r=>r[0].startsWith(prevYr));
    setNwRange('12m');nwTab='moved';renderView();
    return {short, full, prevYr};});
  chk('a year row does not change with the chart range', !!yr.short && JSON.stringify(yr.short)===JSON.stringify(yr.full),
      `${JSON.stringify(yr.short)} vs ${JSON.stringify(yr.full)}`);

  console.log('\n═══ chart: hover shows a month, click drills into it');
  await page.evaluate(()=>{nwSel=null;renderView();window.scrollTo(0,0);});
  await page.waitForTimeout(100);
  const box = await page.locator('#nwCv').boundingBox();
  chk('canvas has real size', box && box.width>300 && box.height>=200, JSON.stringify(box));
  const painted = await page.evaluate(()=>{const c=document.getElementById('nwCv');
    const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i])n++;return n;});
  chk('canvas is painted', painted>2000, `${painted} px`);
  // 4th of 12 points: x = pad.l + 3/11 of the plot width
  const px = box.x + 46 + (box.width-58)*3/11, py = box.y + box.height/2;
  await page.mouse.move(px,py); await page.waitForTimeout(60);
  const tip = await page.evaluate(()=>{const t=document.getElementById('nwTip');
    return {shown:getComputedStyle(t).display!=='none', text:t.textContent, want:finMonthLabel(window._nwData[3].ym)};});
  chk('hover shows a tooltip', tip.shown);
  chk('tooltip is for the hovered month', tip.text.startsWith(tip.want), `${tip.text.slice(0,40)} | want ${tip.want}`);
  await page.mouse.click(px,py); await page.waitForTimeout(120);
  const sel = await page.evaluate(()=>{const want=window._nwData[3].ym;
    const head=document.querySelector('#main .nwstep b');
    nwTab='monthly';nwTbl=true;renderView();
    const row=document.querySelector('#main tr.sel');
    return {nwSel, want, head:head&&head.textContent, wantLbl:finMonthLabel(want), short:shortYm(want), row:row&&row.cells[0].textContent};});
  chk('click selects that month', sel.nwSel===sel.want, `${sel.nwSel} vs ${sel.want}`);
  chk('"What moved" follows the selection', sel.head && sel.head.includes(sel.wantLbl), sel.head);
  chk('month-on-month row is highlighted', sel.row===sel.short, sel.row);
  await page.mouse.move(box.x+box.width/2, box.y-40); await page.waitForTimeout(60);
  chk('tooltip hides on leave', await page.evaluate(()=>getComputedStyle(document.getElementById('nwTip')).display==='none'));
  const rowSel = await page.evaluate(()=>{const r=document.querySelectorAll('#main table.t')[0].querySelectorAll('tr.click')[0];
    r.click();return {nwSel, want:window._nwData[window._nwData.length-1].ym};});
  chk('clicking a table row selects the month', rowSel.nwSel===rowSel.want, JSON.stringify(rowSel));

  console.log('\n═══ monthly bars and the month stepper');
  await page.evaluate(()=>{nwTbl=false;nwTab='monthly';nwSel=null;renderView();window.scrollTo(0,0);});
  await page.locator('#nwBars').scrollIntoViewIfNeeded(); await page.waitForTimeout(80);
  const bb = await page.locator('#nwBars').boundingBox();
  // 3rd of 11 bars: x = pad.l + 2.5/11 of the plot width
  const bx = bb.x + 46 + (bb.width-54)*2.5/11, by = bb.y + bb.height/2;
  await page.mouse.move(bx,by); await page.waitForTimeout(60);
  const btip = await page.evaluate(()=>{const t=document.getElementById('nwBarTip');
    return {shown:getComputedStyle(t).display!=='none', text:t.textContent, want:finMonthLabel(window._nwData[3].ym)};});
  chk('hovering a bar shows that month', btip.shown && btip.text.startsWith(btip.want), btip.text.slice(0,40));
  chk('bar tooltip splits put in / market / other', /Put in/.test(btip.text)&&/Market/.test(btip.text)&&/Other/.test(btip.text));
  await page.mouse.click(bx,by); await page.waitForTimeout(120);
  const bsel = await page.evaluate(()=>({nwSel, want:window._nwData[3].ym, tab:nwTab,
    sum:(document.querySelector('#main .nwsum b')||{}).textContent}));
  chk('clicking a bar selects the month and stays on Monthly', bsel.nwSel===bsel.want && bsel.tab==='monthly', JSON.stringify(bsel));
  chk('the summary line follows it', bsel.sum===await page.evaluate(()=>finMonthLabel(window._nwData[3].ym)), bsel.sum);
  const step = await page.evaluate(()=>{setNwTab('moved');const a=nwSel;nwStep(-1);const b1=nwSel;nwStep(1);nwStep(1);const c1=nwSel;
    for(let i=0;i<40;i++)nwStep(-1);const lo=nwSel;return {a,b1,c1,lo,first:window._nwData[1].ym,
      prevOf:ymAdd(a,-1),nextOf:ymAdd(a,1),tab:nwTab};});
  chk('‹ steps one month back', step.b1===step.prevOf, `${step.a} -> ${step.b1}`);
  chk('› steps forward', step.c1===step.nextOf, step.c1);
  chk('stepping stops at the first month that has a change', step.lo===step.first, `${step.lo} vs ${step.first}`);

  console.log('\n═══ Investments lens: value vs money put in');
  const lens = await page.evaluate(()=>{setNwMode('inv');
    const last=window._nwData[window._nwData.length-1];
    const perf=IH().map(holdingPerf).filter(Boolean);
    const inv=perf.reduce((a,x)=>a+x.invested,0), val=perf.reduce((a,x)=>a+x.value,0);
    const legend=document.querySelector('#main .nwlegs').textContent;
    return {lastInv:last.inv,inv,lastHold:last.hold,val,legend};});
  chk('money put in matches the holdings table', near(lens.lastInv,lens.inv), `${lens.lastInv} vs ${lens.inv}`);
  chk('holdings value matches', near(lens.lastHold,lens.val), `${lens.lastHold} vs ${lens.val}`);
  chk('legend shows the gain', /Gain|Loss/.test(lens.legend), lens.legend.slice(0,80));
  const cb = await page.locator('#nwCv').boundingBox();
  await page.mouse.move(cb.x+cb.width-20, cb.y+cb.height/2); await page.waitForTimeout(60);
  const ltip = await page.evaluate(()=>document.getElementById('nwTip').textContent);
  chk('hover in this lens reads holdings, put in and gain', /Holdings/.test(ltip)&&/Put in/.test(ltip)&&/(Gain|Loss)/.test(ltip), ltip.slice(0,80));
  chk('figures in the tooltip are in lakhs', /₹[\d.]+ L/.test(ltip), ltip.slice(0,80));
  await page.evaluate(()=>setNwMode('net'));

  console.log('\n═══ allocation donut responds');
  await page.evaluate(()=>{setNwTab('alloc');});
  await page.locator('#nwDonut').scrollIntoViewIfNeeded(); await page.waitForTimeout(60);
  const db = await page.locator('#nwDonut').boundingBox();
  await page.mouse.move(db.x+db.width/2+db.width*0.4, db.y+db.height/2); await page.waitForTimeout(60);
  const dn = await page.evaluate(()=>[...document.querySelectorAll('#main .al-row')].findIndex(r=>r.classList.contains('on')));
  chk('hovering a slice highlights its legend row', dn>=0, `row ${dn}`);
  await page.evaluate(()=>setNwTab('moved'));

  console.log('\n═══ net worth tab and analysis agree');
  const agree = await page.evaluate(()=>{
    invMonth=monthKey(today());invView='overview';renderView();
    const o=document.querySelector('#main .kpi.blue .kv').textContent;
    invView='analysis';renderView();
    const a=document.querySelector('#main .nwh-v').textContent;
    return {o,a};});
  chk('same net worth on both tabs', agree.o===agree.a, `${agree.o} vs ${agree.a}`);

  console.log('\n═══ recordings survive a sync round-trip');
  const sync = await page.evaluate(()=>{
    const before=nwsnap.filter(x=>!x.deleted).length;
    const snap=JSON.parse(JSON.stringify(getState()));
    nwsnap.length=0; applyState(snap);
    return {before, after:nwsnap.filter(x=>!x.deleted).length, inState:Array.isArray(snap.nwsnap)};});
  chk('nwsnap is part of synced state', sync.inState);
  chk('recordings restore through applyState', sync.before>0 && sync.after===sync.before, JSON.stringify(sync));

  console.log('\n═══ phone width');
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{renderView();}); await page.waitForTimeout(150);
  const phone = await page.evaluate(()=>{const out={};
    for(const t of ['moved','monthly','yearly','holdings','alloc']){setNwTab(t);
      out[t]={sw:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight};}
    const tb=document.querySelector('#main .nwtabs');out.tabsFit=tb.scrollWidth<=tb.clientWidth+1;
    out.cw=document.getElementById('nwCv').clientWidth;setNwTab('moved');return out;});
  chk('no horizontal page scroll at 390px on any tab', Object.values(phone).every(v=>!v.sw||v.sw<=390), JSON.stringify(Object.fromEntries(Object.entries(phone).filter(([k,v])=>v.sw).map(([k,v])=>[k,v.sw]))));
  chk('all five tabs fit without scrolling', phone.tabsFit);
  chk('chart fits the phone', phone.cw>250 && phone.cw<=390, `${phone.cw}px`);
  chk('the page stays short: under 1,800px on every tab', ['moved','monthly','yearly','holdings','alloc'].every(t=>phone[t].h<1800),
      JSON.stringify(Object.fromEntries(['moved','monthly','yearly','holdings','alloc'].map(t=>[t,phone[t].h]))));

  await clear(); await page.evaluate(()=>{setMode('official');persist();});
  console.log('\n---page errors---', JSON.stringify(errs.slice(0,4)));
  if(errs.length){FAIL++;console.log('  FAIL  page threw');}
  console.log(FAIL===0?'\n*** W12 INVESTMENT ANALYSIS: ALL PASS ***':`\n*** W12 INVESTMENT ANALYSIS: ${FAIL} FAILURE(S) ***`);
  await b.close();
  process.exit(FAIL?1:0);
})();
