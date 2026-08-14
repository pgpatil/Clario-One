/* W3 acceptance — natural-language capture.
   Section A is the same 30-phrase battery W0 measured at 16/30, kept verbatim so the numbers
   stay comparable. Section B covers what the extended parser adds. Section C is the part that
   matters most in practice: phrases that must NOT be over-parsed, and titles that must come
   out clean once tokens are consumed. A parser that finds a date in everything is worse than
   one that finds none. */
const { chromium } = require('playwright');
let FAIL=0;
const chk=(n,ok,d)=>{console.log(`  ${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`); if(!ok)FAIL++;};

// 2026-08-20 is a Thursday.
const BATTERY = [
  ['Renew insurance tomorrow',            {due:'+1'}],
  ['Call Ramesh at 3pm',                  {type:'call',time:'15:00'}],
  ['Submit report friday',                {dueDow:5}],
  ['Review budget next week',             {due:'+7'}],
  ['urgent fix the leak',                 {priority:'high'}],
  ['!low tidy desk',                      {priority:'low'}],
  ['@Priya send the deck tomorrow',       {ownerName:'Priya',due:'+1'}],
  ['Pay electricity bill on 20 Aug',      {dueLiteral:'-08-20'}],
  ['Team sync every monday',              {repeat:'weekly'}],
  ['Meeting at 15:00',                    {time:'15:00'}],
  ['Dentist in 3 days',                   {due:'+3'}],
  ['Finish deck by 20/08',                {dueLiteral:'-08-20'}],
  ['Buy milk #errands',                   {label:'errands'}],
  ['Draft proposal p1',                   {priority:'high'}],
  ['Review PR tomorrow 9am',              {due:'+1',time:'09:00'}],
  ['call @Anil 11:30am',                  {type:'call',time:'11:30'}],
  ['Quarterly review next monday 2pm',    {dueDow:1,time:'14:00'}],
  ['Fix bug today !high',                 {due:'+0',priority:'high'}],
  ['Send invoice for 45m',                {duration:45}],
  ['Standup every weekday',               {repeat:'weekly'}],
  ['Book flight on the 25th',             {dueLiteral:'-25'}],
  ['Follow up with @Sunil next week',     {ownerName:'Sunil',due:'+7'}],
  ['Renew domain in 2 weeks',             {due:'+14'}],
  ['Lunch with Priya at 1pm',             {ownerName:'Priya',time:'13:00'}],
  ['Report due end of month',             {dueEom:true}],
  ['Water plants every 3 days',           {repeat:'daily',interval:3}],
  ['Call vendor tuesday 4pm',             {type:'call',dueDow:2,time:'16:00'}],
  ['urgent escalate to @Ravi today',      {priority:'high',ownerName:'Ravi',due:'+0'}],
  ['Review Q3 numbers on Sept 1',         {dueLiteral:'-09-01'}],
  ['Prep board pack 3 days before friday',{dueDow:2}],
];

// titles must survive token consumption intact
const TITLES = [
  ['Renew insurance tomorrow',              'Renew insurance'],
  ['Pay electricity bill on 20 Aug',        'Pay electricity bill'],
  ['Buy milk #errands',                     'Buy milk'],
  ['Send invoice for 45m',                  'Send invoice'],
  ['Report due end of month',               'Report'],
  ['Water plants every 3 days',             'Water plants'],
  ['Draft proposal p1',                     'Draft proposal'],
  ['Meeting at 15:00',                      'Meeting'],
  ['Review Q3 numbers on Sept 1',           'Review Q3 numbers'],
  ['Book flight on the 25th',               'Book flight'],
];

// a parser that finds a date in everything is worse than one that finds none
const NEGATIVES = [
  ['Order 500 units of packaging',        'no date from a bare quantity'],
  ['Review the 2026 budget model',        'no date from a bare year'],
  ['Discuss May options with the board',  'no date from an ambiguous month word'],
  ['Fix issue 3 in the tracker',          'no date from a bare number'],
];

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const page = await b.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(process.env.CLARIO_URL || 'http://localhost:8934/index.html');
  await page.waitForTimeout(400);
  await page.evaluate(()=>{ if(document.getElementById('mAsk').classList.contains('open')) askResolve(null); });
  await page.evaluate(()=>{ const n=now();
    ['Priya Nair','Ramesh Kumar','Anil Shah','Sunil Rao','Ravi Menon']
      .forEach(nm=>people.push({id:uid(),name:nm,role:'',dept:'',created_at:n,updated_at:n}));
    persist(); });

  console.log('\n═══ A. the 30-phrase battery  (W0 measured this at 16/30)');
  const res = await page.evaluate((BAT)=>{
    const td=today();
    const shift=d=>{const x=new Date(td+'T12:00');x.setDate(x.getDate()+d);
      return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
    const eom=()=>{const x=new Date(td+'T12:00');const y=x.getFullYear(),m=x.getMonth();
      const last=new Date(y,m+1,0).getDate();
      return y+'-'+String(m+1).padStart(2,'0')+'-'+String(last).padStart(2,'0');};
    return BAT.map(([phrase,exp])=>{
      let r; try{ r=parseQA(phrase); }catch(e){ return {phrase,ok:false,miss:'threw: '+e.message}; }
      const miss=[];
      if(exp.type && r.type!==exp.type) miss.push('type');
      if(exp.time && r.time!==exp.time) miss.push('time='+r.time);
      if(exp.priority && r.priority!==exp.priority) miss.push('priority='+r.priority);
      if(exp.due!=null && r.due!==shift(+exp.due)) miss.push('due='+r.due);
      if(exp.dueDow!=null){ if(!r.due) miss.push('due=null'); else if(new Date(r.due+'T12:00').getDay()!==exp.dueDow) miss.push('dueDow='+r.due); }
      if(exp.dueLiteral && !(r.due||'').includes(exp.dueLiteral)) miss.push('due='+r.due);
      if(exp.dueEom && r.due!==eom()) miss.push('eom='+r.due);
      if(exp.ownerName){ const nm=(P().find(p=>p.id===r.owner)||{}).name||''; if(!nm.startsWith(exp.ownerName)) miss.push('owner'); }
      if(exp.label && !(r.labels||[]).includes(exp.label)) miss.push('label');
      if(exp.duration && +r.duration!==exp.duration) miss.push('duration='+r.duration);
      if(exp.repeat && r.repeat!==exp.repeat) miss.push('repeat='+r.repeat);
      if(exp.interval && +r.repeat_interval!==exp.interval) miss.push('interval='+r.repeat_interval);
      return {phrase, ok:miss.length===0, miss:miss.join(' ')};
    });
  }, BATTERY);
  res.forEach(r=>chk(r.phrase.padEnd(40), r.ok, r.ok?'':r.miss));
  const pass=res.filter(r=>r.ok).length;
  console.log(`\n  battery: ${pass}/30  (target >= 28)`);
  if(pass<28){FAIL++;console.log('  FAIL  battery below target');}

  console.log('\n═══ B. titles come out clean');
  const titles = await page.evaluate((T)=>T.map(([p,want])=>{
    let got; try{ got=parseQA(p).title; }catch(e){ got='THREW'; }
    return {p,want,got,ok:got===want};
  }), TITLES);
  titles.forEach(t=>chk(`"${t.p}"`, t.ok, t.ok?`-> "${t.got}"`:`want "${t.want}" got "${t.got}"`));

  console.log('\n═══ C. no over-parsing');
  const negs = await page.evaluate((N)=>N.map(([p,why])=>{
    let r; try{ r=parseQA(p); }catch(e){ return {p,why,ok:false,got:'THREW'}; }
    return {p,why,ok:r.due===null,got:r.due,title:r.title};
  }), NEGATIVES);
  negs.forEach(n=>chk(n.why, n.ok, n.ok?`"${n.p}" -> title "${n.title}"`:`got due=${n.got}`));

  console.log('\n═══ D. what quickAdd actually stores');
  const stored = await page.evaluate(()=>{
    tasks.length=0;
    const i=document.getElementById('qaInput');
    if(!i) return {err:'no capture bar'};
    nav('home');
    document.getElementById('qaInput').value='Water plants every 3 days #home for 20m p1';
    quickAdd();
    const t=tasks[tasks.length-1];
    return {title:t.title, repeat:t.repeat, interval:t.repeat_interval, labels:t.labels,
            est:t.estimate_min, priority:t.priority};
  });
  chk('quickAdd persists repeat',   stored.repeat==='daily' && +stored.interval===3, JSON.stringify(stored));
  chk('quickAdd persists labels',   (stored.labels||[]).includes('home'));
  chk('quickAdd persists duration', +stored.est===20, 'est='+stored.est);
  chk('quickAdd persists priority', stored.priority==='high');
  chk('quickAdd title is clean',    stored.title==='Water plants', `"${stored.title}"`);

  console.log('\n---page errors---', JSON.stringify(errs.slice(0,4)));
  console.log(FAIL===0?'\n*** W3 CAPTURE: ALL PASS ***':`\n*** W3 CAPTURE: ${FAIL} FAILURE(S) ***`);
  await b.close();
  process.exit(FAIL?1:0);
})();
