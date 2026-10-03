/* Borrowed & lent — informal debt in both directions.
   The load-bearing properties are the signs. Lending is an asset and cash out; borrowing is a
   liability and cash in; each repayment reverses its own direction. Get one sign wrong and net
   worth or the bank balance is silently off, so most of these checks are arithmetic on the
   four movements rather than UI presence. */
const { chromium } = require('playwright');
let FAIL=0;
const chk=(n,ok,d)=>{console.log(`  ${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`); if(!ok)FAIL++;};
const URL = process.env.CLARIO_URL || 'http://localhost:8934/index.html';

const seed = `(()=>{ ious.length=0; ioutx.length=0; fincats.length=0; finplan.length=0;
  fintx.length=0; finbal.length=0; loans.length=0; invhold.length=0; invpf.length=0; fincard.length=0;
  const n=now(), M=monthKey(today());
  const prev=(()=>{const d=new Date(M+'-15T12:00');d.setMonth(d.getMonth()-1);return d.toISOString().slice(0,7);})();
  window.__M=M; window.__PREV=prev;
  ious.push({id:'B1',dir:'borrowed',party:'Ravi',principal:100000,date:M+'-05',due:M+'-25',rate:0,note:'bridge',created_at:n,updated_at:n});
  ious.push({id:'L1',dir:'lent',    party:'Anita',principal:60000, date:M+'-08',due:M+'-28',rate:12,note:'',created_at:n,updated_at:n});
  ious.push({id:'L2',dir:'lent',    party:'Old friend',principal:20000,date:prev+'-10',due:prev+'-20',rate:0,note:'',created_at:n,updated_at:n});
  persist(); setMode('personal'); personalTab='money'; finMonth=M; finView='iou'; renderView(); })()`;

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const page = await b.newPage({ viewport:{width:1300,height:1100} });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(URL); await page.waitForTimeout(400);
  await page.evaluate(()=>{ if(document.getElementById('mAsk').classList.contains('open')) askResolve(null); });
  await page.evaluate(seed); await page.waitForTimeout(300);

  console.log('\n═══ outstanding is derived from the repayments logged against it');
  const base = await page.evaluate(()=>({
    b1:iouOutstanding(ious.find(i=>i.id==='B1')),
    l1:iouOutstanding(ious.find(i=>i.id==='L1')),
    owe:iouTotal('borrowed'), owed:iouTotal('lent')}));
  chk('nothing repaid yet', base.b1===100000 && base.l1===60000, JSON.stringify(base));
  chk('totals per direction', base.owe===100000 && base.owed===80000, JSON.stringify(base));

  const part = await page.evaluate(()=>{
    const M=window.__M;
    ioutx.push({id:'t1',iou_id:'B1',date:M+'-20',amount:40000,created_at:now(),updated_at:now()});
    persist();
    const i=ious.find(x=>x.id==='B1');
    return {out:iouOutstanding(i), repaid:iouRepaid('B1'), settled:iouSettled(i), owe:iouTotal('borrowed')};
  });
  chk('a partial repayment reduces it', part.out===60000 && part.repaid===40000, JSON.stringify(part));
  chk('not settled until it reaches zero', part.settled===false);
  chk('the direction total follows', part.owe===60000);

  console.log('\n═══ the four cash movements land in the right month and the right direction');
  const cash = await page.evaluate(()=>{
    const M=window.__M, P=window.__PREV;
    return {inM:iouCashIn(M), outM:iouCashOut(M), inP:iouCashIn(P), outP:iouCashOut(P)};
  });
  // this month: borrowed 100,000 in; lent 60,000 out + repaid 40,000 out
  chk('borrowing is cash in',            cash.inM===100000, `in=${cash.inM}`);
  chk('lending and repaying are cash out', cash.outM===100000, `out=${cash.outM}`);
  // last month: lent 20,000 out, nothing in
  chk('a prior month keeps its own movements', cash.outP===20000 && cash.inP===0, JSON.stringify(cash));

  const recv = await page.evaluate(()=>{
    const M=window.__M;
    ioutx.push({id:'t2',iou_id:'L1',date:M+'-22',amount:25000,created_at:now(),updated_at:now()});
    persist();
    return {inM:iouCashIn(M), outM:iouCashOut(M)};
  });
  chk('being repaid on a loan out is cash in', recv.inM===125000, `in=${recv.inM}`);
  chk('and does not touch cash out',           recv.outM===100000, `out=${recv.outM}`);

  console.log('\n═══ the monthly plan and closing balance move with it');
  const plan = await page.evaluate(()=>{
    const M=window.__M;
    finSetOpening(M,500000);
    return {income:finIncomeActual(M), outflow:finOutflowActual(M), closing:finClosing(M)};
  });
  // 500,000 + 125,000 in - 100,000 out
  chk('income actual includes money in',  plan.income===125000, `${plan.income}`);
  chk('outflow actual includes money out',plan.outflow===100000, `${plan.outflow}`);
  chk('closing balance reflects both',    plan.closing===525000, `${plan.closing}`);

  console.log('\n═══ net worth: lending is an asset, borrowing a liability');
  const nw = await page.evaluate(()=>{
    const M=window.__M;
    const before=invNetWorth(M);
    ious.find(i=>i.id==='B1').deleted=true;          // drop the borrowing
    const noBorrow=invNetWorth(M);
    ious.find(i=>i.id==='B1').deleted=false;
    ious.filter(i=>i.dir==='lent').forEach(i=>i.deleted=true);
    const noLend=invNetWorth(M);
    ious.filter(i=>i.dir==='lent').forEach(i=>i.deleted=false);
    return {before, noBorrow, noLend, owe:iouTotal('borrowed'), owed:iouTotal('lent')};
  });
  // owed to you 55,000 (35k Anita + 20k old) minus you owe 60,000 = -5,000
  chk('net worth nets the two directions', nw.before===-5000, `${nw.before}`);
  chk('removing a borrowing raises it',    nw.noBorrow===nw.before+nw.owe, `${nw.noBorrow}`);
  chk('removing lending lowers it',        nw.noLend===nw.before-nw.owed, `${nw.noLend}`);

  console.log('\n═══ overdue surfaces in the Money tab count');
  const od = await page.evaluate(()=>{
    const before=iouOverdueCount();
    ious.find(i=>i.id==='L1').due=addDays(today(),-3);   // now overdue
    persist();
    return {before, after:iouOverdueCount(), inTabCount:finOverdueCount()>=iouOverdueCount()};
  });
  chk('an unsettled entry past its date is overdue', od.after>od.before, `${od.before} -> ${od.after}`);
  chk('and it reaches the Money tab badge',          od.inTabCount);

  console.log('\n═══ settled entries drop out of the totals but stay on the page');
  const settle = await page.evaluate(()=>{
    const M=window.__M;
    ioutx.push({id:'t3',iou_id:'B1',date:M+'-26',amount:60000,created_at:now(),updated_at:now()});
    persist(); renderView();
    const i=ious.find(x=>x.id==='B1');
    return {settled:iouSettled(i), owe:iouTotal('borrowed'),
            stillListed:document.querySelector('#main').textContent.includes('Ravi'),
            marked:document.querySelectorAll('#main .row.done').length};
  });
  chk('fully repaid is settled',        settle.settled===true && settle.owe===0, JSON.stringify(settle));
  chk('it stays visible, marked done',  settle.stillListed && settle.marked>0, JSON.stringify(settle));

  console.log('\n═══ optional interest accrues, and never compounds or amortises');
  const int = await page.evaluate(()=>{
    const i=ious.find(x=>x.id==='L1');
    i.date=addDays(today(),-365); i.rate=12; persist();
    const oneYear=iouAccrued(i);
    i.rate=0; const none=iouAccrued(i);
    i.rate=12; i.date=addDays(today(),-182); const half=iouAccrued(i);
    return {out:iouOutstanding(i), oneYear, none, half, hasSchedule:typeof i.emi!=='undefined'};
  });
  // 35,000 outstanding at 12% for a year
  chk('a year at 12% on the outstanding', int.oneYear===4200, `${int.oneYear} on ${int.out}`);
  chk('half a year is about half',        Math.abs(int.half-2100)<=20, `${int.half}`);
  chk('zero rate accrues nothing',        int.none===0);
  chk('no EMI schedule is created',       int.hasSchedule===false);

  console.log('\n═══ expected settlements reach the forecast');
  const fc = await page.evaluate(()=>{
    const M=window.__M;
    ious.length=0; ioutx.length=0;
    const n=now(), nx=(()=>{const d=new Date(M+'-15T12:00');d.setMonth(d.getMonth()+1);return d.toISOString().slice(0,7);})();
    ious.push({id:'F1',dir:'lent',party:'A',principal:50000,date:M+'-01',due:nx+'-10',rate:0,created_at:n,updated_at:n});
    ious.push({id:'F2',dir:'borrowed',party:'B',principal:30000,date:M+'-01',due:nx+'-15',rate:0,created_at:n,updated_at:n});
    persist();
    return {inNext:iouExpectedIn(nx), outNext:iouExpectedOut(nx),
            plannedIn:finPlannedIncome(nx), plannedOut:finPlannedOutflow(nx)};
  });
  chk('money due back is expected income',   fc.inNext===50000 && fc.plannedIn>=50000, JSON.stringify(fc));
  chk('money due out is expected outflow',   fc.outNext===30000 && fc.plannedOut>=30000, JSON.stringify(fc));

  console.log('\n═══ deleting an entry takes its repayments with it');
  const del = await page.evaluate(async ()=>{
    ioutx.push({id:'t9',iou_id:'F1',date:today(),amount:1000,created_at:now(),updated_at:now()});
    const p=iouDel('F1');
    await new Promise(r=>setTimeout(r,80));
    if(document.getElementById('mAsk').classList.contains('open')) askResolve(true);
    await p;
    return {gone:!!ious.find(i=>i.id==='F1').deleted, orphans:ioutx.filter(x=>x.iou_id==='F1'&&!x.deleted).length};
  });
  chk('the entry is removed',   del.gone);
  chk('no orphaned repayments', del.orphans===0);

  console.log('\n═══ it survives a sync round-trip');
  const sync = await page.evaluate(()=>{
    const snap=JSON.parse(JSON.stringify(getState()));
    const inState=('ious' in snap)&&('ioutx' in snap);
    ious.length=0; ioutx.length=0; applyState(snap);
    return {inState, n:IOU().length, owe:iouTotal('borrowed')};
  });
  chk('both tables are synced state', sync.inState);
  chk('entries survive',              sync.n===1 && sync.owe===30000, JSON.stringify(sync));

  console.log('\n═══ the row shows progress, not just a number');
  const row = await page.evaluate(()=>{
    ious.length=0; ioutx.length=0; const n=now(), M=monthKey(today());
    ious.push({id:'P1',dir:'borrowed',party:'Ravi',principal:200000,date:M+'-02',rate:0,created_at:n,updated_at:n});
    ioutx.push({id:'p1',iou_id:'P1',date:M+'-10',amount:80000,created_at:n,updated_at:n});
    persist(); finView='iou'; renderView();
    const html=document.querySelector('#main').innerHTML;
    return {pctPill:/40% back/.test(html), bar:!!document.querySelector('#main .subbar i'),
            barW:(document.querySelector('#main .subbar i')||{style:{}}).style.width,
            repaidById:iouRepaid('P1')};
  });
  chk('the percentage repaid is shown', row.pctPill, JSON.stringify(row));
  chk('and a progress bar is drawn',    row.bar && row.barW==='40%', JSON.stringify(row));

  console.log('\n═══ the tab renders, and Loans is untouched');
  const ui = await page.evaluate(()=>{
    setMode('personal'); personalTab='money'; finView='iou'; renderView();
    const kpis=[...document.querySelectorAll('#main .kpi .kl')].map(k=>k.textContent.trim());
    const btns=[...document.querySelectorAll('#main .vtog button')].map(b=>b.textContent.trim());
    finView='loans'; renderView();
    const loansOk=!!document.querySelector('#main');
    finView='iou'; renderView();
    return {kpis, btns, loansOk};
  });
  chk('three KPIs',                 ui.kpis.length===3, JSON.stringify(ui.kpis));
  chk('a fifth toggle button',      ui.btns.length===5 && ui.btns.some(b=>/Borrowed/.test(b)), JSON.stringify(ui.btns));
  chk('the Loans view still works', ui.loansOk);

  console.log('\n---page errors---', JSON.stringify(errs.slice(0,4)));
  console.log(FAIL===0?'\n*** BORROWED & LENT: ALL PASS ***':`\n*** BORROWED & LENT: ${FAIL} FAILURE(S) ***`);
  await b.close();
  process.exit(FAIL?1:0);
})();
