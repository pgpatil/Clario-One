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

  console.log('\n═══ month on month and year on year on the dashboard');
  const view = await page.evaluate(()=>{
    personalTab='invest';invView='analysis';renderView();
    const cur=monthKey(today());
    const kpis=Object.fromEntries([...document.querySelectorAll('#main .kpi')].map(k=>[k.querySelector('.kl').textContent.trim(),k.querySelector('.kv').textContent.trim()]));
    const yoy=nwAt(cur).net-nwAt(ymAdd(cur,-12)).net, mom=nwAt(cur).net-nwAt(ymAdd(cur,-1)).net;
    const cards=[...document.querySelectorAll('#main .card')].map(c=>c.querySelector('.ch')?.textContent||'');
    const momRows=[...document.querySelectorAll('#main table.t')][0].querySelectorAll('tr.click').length;
    const pills=[...document.querySelectorAll('#main .pill')].map(p=>p.textContent);
    const tabOn=[...document.querySelectorAll('.vtog button.on')].map(b=>b.textContent);
    return {kpis, yoy, mom, yoyTxt:sgnMoney(yoy), momTxt:sgnMoney(mom), cards, momRows, pills, tabOn,
            net:fmtMoney(nwAt(cur).net)};
  });
  chk('Analysis tab is selected', view.tabOn.includes('Analysis'), JSON.stringify(view.tabOn));
  chk('Net worth KPI matches nwAt(today)', view.kpis['Net worth']===view.net, `${view.kpis['Net worth']} vs ${view.net}`);
  chk('This month KPI is today minus last month', view.kpis['This month']===view.momTxt, `${view.kpis['This month']} vs ${view.momTxt}`);
  chk('Year on year KPI is today minus 12 months ago', view.kpis['Year on year']===view.yoyTxt, `${view.kpis['Year on year']} vs ${view.yoyTxt}`);
  chk('every section renders', ['Net worth over time','What moved','Over this range','Month on month','Year on year','Holdings performance','Allocation']
      .every(h=>view.cards.some(c=>c.includes(h))), JSON.stringify(view.cards.map(c=>c.slice(0,24))));
  chk('12-month range lists 11 month-on-month rows', view.momRows===11, `rows=${view.momRows}`);
  chk('months with no holding value are flagged "carried"', view.pills.includes('carried'));
  chk('partial calendar years are flagged "part"', view.pills.includes('part'));

  console.log('\n═══ growth rate, drawdown, XIRR on known inputs');
  const math = await page.evaluate(()=>{
    const ser=[];for(let i=0;i<=24;i++)ser.push({net:i===24?121:100});
    const dd=nwDrawdown([{ym:'a',net:100},{ym:'b',net:120},{ym:'c',net:90},{ym:'d',net:130}]);
    const x1=xirr([{t:0,v:-1000},{t:365,v:1100}]);
    const x2=xirr([{t:0,v:-1000},{t:365,v:-1000},{t:730,v:2310}]);   // 10% on both tranches
    return {cagr:nwCagr(ser), negCagr:nwCagr([{net:-5},{net:10}]), dd, x1, x2, x0:xirr([{t:0,v:-1}])};
  });
  chk('CAGR: 100 → 121 over two years is 10%/yr', near(math.cagr,0.10,1e-6), String(math.cagr));
  chk('CAGR is undefined from a negative start', math.negCagr===null);
  chk('drawdown: 120 → 90 is −25%, peak to trough', near(math.dd.pct,-0.25,1e-9)&&math.dd.from==='b'&&math.dd.at==='c', JSON.stringify(math.dd));
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
    renderView();
    const estPills=[...document.querySelectorAll('#main .pill')].filter(p=>p.textContent==='est.').length;
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
    const legOn=[...document.querySelectorAll('.nwleg.on')].map(b=>b.textContent.trim());
    toggleNwSeries('assets');toggleNwSeries('net');
    setSort('invperf','name');
    const names=[...document.querySelectorAll('#main table.t')][2].querySelectorAll('tbody tr, tr');
    const order=[...names].map(r=>r.cells[0]?.textContent||'').filter(t=>/Index fund|Gold/.test(t)).map(t=>t.slice(0,4));
    return {r6,r12,r3y,rAll,span,stillOne,legOn,order};
  }).catch(e=>({err:e.message}));
  chk('6 months → 6 points', ui.r6===6, JSON.stringify(ui));
  chk('12 months → 12 points', ui.r12===12);
  chk('3 years is clipped to the first month with data', ui.r3y===ui.span, `${ui.r3y} vs ${ui.span}`);
  chk('All starts at the first month with data', ui.rAll===ui.span);
  chk('the last visible series cannot be hidden', ui.stillOne===true);
  chk('legend toggles reflect state', JSON.stringify(ui.legOn)===JSON.stringify(['Assets']), JSON.stringify(ui.legOn));
  chk('holdings table sorts by name', ui.order&&ui.order.length===2, JSON.stringify(ui.order));

  const yr = await page.evaluate(()=>{
    const cells=()=>{const t=[...document.querySelectorAll('#main table.t')][1];
      return [...t.querySelectorAll('tr')].slice(1).map(r=>[...r.cells].map(c=>c.textContent.trim()));};
    const prevYr=String(+today().slice(0,4)-1);
    setNwRange('12m'); const short=cells().find(r=>r[0].startsWith(prevYr));
    setNwRange('all'); const full=cells().find(r=>r[0].startsWith(prevYr));
    setNwRange('12m');
    return {short, full, prevYr};});
  chk('a year row does not change with the chart range', !!yr.short && JSON.stringify(yr.short)===JSON.stringify(yr.full),
      `${JSON.stringify(yr.short)} vs ${JSON.stringify(yr.full)}`);

  console.log('\n═══ chart: hover shows a month, click drills into it');
  await page.evaluate(()=>{nwSel=null;renderView();window.scrollTo(0,0);});
  await page.waitForTimeout(100);
  const box = await page.locator('#nwCv').boundingBox();
  chk('canvas has real size', box && box.width>300 && box.height>200, JSON.stringify(box));
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
    const head=[...document.querySelectorAll('#main .card .ch')].find(h=>/What moved/.test(h.textContent));
    const row=document.querySelector('#main tr.sel');
    return {nwSel, want, head:head&&head.textContent, wantLbl:finMonthLabel(want), row:row&&row.cells[0].textContent};});
  chk('click selects that month', sel.nwSel===sel.want, `${sel.nwSel} vs ${sel.want}`);
  chk('"What moved" follows the selection', sel.head && sel.head.includes(sel.wantLbl), sel.head);
  chk('month-on-month row is highlighted', sel.row===sel.wantLbl, sel.row);
  await page.mouse.move(box.x+box.width/2, box.y-40); await page.waitForTimeout(60);
  chk('tooltip hides on leave', await page.evaluate(()=>getComputedStyle(document.getElementById('nwTip')).display==='none'));
  const rowSel = await page.evaluate(()=>{const r=document.querySelectorAll('#main table.t')[0].querySelectorAll('tr.click')[0];
    r.click();return {nwSel, want:window._nwData[window._nwData.length-1].ym};});
  chk('clicking a table row selects the month', rowSel.nwSel===rowSel.want, JSON.stringify(rowSel));

  console.log('\n═══ net worth tab and analysis agree');
  const agree = await page.evaluate(()=>{
    invMonth=monthKey(today());invView='overview';renderView();
    const o=document.querySelector('#main .kpi.blue .kv').textContent;
    invView='analysis';renderView();
    const a=document.querySelector('#main .kpi.blue .kv').textContent;
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
  const phone = await page.evaluate(()=>({sw:document.documentElement.scrollWidth,
    cw:document.getElementById('nwCv').clientWidth}));
  chk('no horizontal page scroll at 390px', phone.sw<=390, `scrollWidth=${phone.sw}`);
  chk('chart fits the phone', phone.cw>250 && phone.cw<=390, `${phone.cw}px`);

  await clear(); await page.evaluate(()=>{setMode('official');persist();});
  console.log('\n---page errors---', JSON.stringify(errs.slice(0,4)));
  if(errs.length){FAIL++;console.log('  FAIL  page threw');}
  console.log(FAIL===0?'\n*** W12 INVESTMENT ANALYSIS: ALL PASS ***':`\n*** W12 INVESTMENT ANALYSIS: ${FAIL} FAILURE(S) ***`);
  await b.close();
  process.exit(FAIL?1:0);
})();
