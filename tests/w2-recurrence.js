/* W2 acceptance — recurrence coverage.
   The spec is the twelve patterns Todoist supports. Each case states the pattern, the options
   handed to buildRepeatDates, and the exact dates expected. Written before the implementation
   so the target could not drift to whatever the code happened to do. */
const { chromium } = require('playwright');
let FAIL=0;
const chk=(name,ok,detail)=>{console.log(`  ${ok?'PASS':'FAIL'}  ${name}${detail?'\n           '+detail:''}`); if(!ok)FAIL++;};

// start date 2026-08-20 is a Thursday, and the 3rd Thursday of August 2026.
const CASES = [
  ['1  daily',                 '2026-08-20','daily',   {},                                              ['2026-08-20','2026-08-21','2026-08-22','2026-08-23']],
  ['2  every other day',       '2026-08-20','daily',   {interval:2},                                    ['2026-08-20','2026-08-22','2026-08-24','2026-08-26']],
  ['3  every 3 days',          '2026-08-20','daily',   {interval:3},                                    ['2026-08-20','2026-08-23','2026-08-26','2026-08-29']],
  ['4  weekly',                '2026-08-20','weekly',  {},                                              ['2026-08-20','2026-08-27','2026-09-03','2026-09-10']],
  ['5  every 2 weeks',         '2026-08-20','weekly',  {interval:2},                                    ['2026-08-20','2026-09-03','2026-09-17','2026-10-01']],
  ['6  weekdays',              '2026-08-20','weekly',  {weekdays:[1,2,3,4,5]},                          ['2026-08-20','2026-08-21','2026-08-24','2026-08-25']],
  ['7  weekends',              '2026-08-20','weekly',  {weekdays:[0,6]},                                ['2026-08-20','2026-08-22','2026-08-23','2026-08-29']],
  ['8  monthly',               '2026-08-20','monthly', {monthMode:'date',monthDay:20},                  ['2026-08-20','2026-09-20','2026-10-20','2026-11-20']],
  ['9  every 3rd Thursday',    '2026-08-20','monthly', {monthMode:'weekday',monthNth:3,monthWeekday:4}, ['2026-08-20','2026-09-17','2026-10-15','2026-11-19']],
  ['10 last day of month',     '2026-08-31','monthly', {monthMode:'date',monthDay:-1},                  ['2026-08-31','2026-09-30','2026-10-31','2026-11-30']],
  ['11 yearly',                '2026-08-20','yearly',  {},                                              ['2026-08-20','2027-08-20','2028-08-20','2029-08-20']],
  ['12 every 2 months',        '2026-08-20','monthly', {monthMode:'date',monthDay:20,interval:2},       ['2026-08-20','2026-10-20','2026-12-20','2027-02-20']],
];

// end conditions are pattern 12's sibling: "ends after N" / "ends on <date>"
const END_CASES = [
  ['ends on a date',   '2026-08-20','daily', {until:'2026-08-23'}, ['2026-08-20','2026-08-21','2026-08-22','2026-08-23']],
  ['ends before start of next', '2026-08-20','weekly', {until:'2026-09-01'}, ['2026-08-20','2026-08-27']],
];

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const page = await b.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(process.env.CLARIO_URL || 'http://localhost:8934/index.html');
  await page.waitForTimeout(400);
  await page.evaluate(()=>{ if(document.getElementById('mAsk').classList.contains('open')) askResolve(null); });

  console.log('\n═══ the twelve recurrence patterns');
  for (const [name,start,repeat,opts,want] of CASES) {
    const got = await page.evaluate(([s,r,o,n])=>{
      try{ return buildRepeatDates(s,r,n,o); }catch(e){ return 'THROWS: '+e.message; }
    },[start,repeat,opts,want.length]);
    chk(name, JSON.stringify(got)===JSON.stringify(want),
        JSON.stringify(got)===JSON.stringify(want)?'':`want ${JSON.stringify(want)}\n           got  ${JSON.stringify(got)}`);
  }

  console.log('\n═══ end conditions');
  for (const [name,start,repeat,opts,want] of END_CASES) {
    const got = await page.evaluate(([s,r,o])=>{
      try{ return buildRepeatDates(s,r,8,o); }catch(e){ return 'THROWS: '+e.message; }
    },[start,repeat,opts]);
    chk(name, JSON.stringify(got)===JSON.stringify(want),
        JSON.stringify(got)===JSON.stringify(want)?'':`want ${JSON.stringify(want)}\n           got  ${JSON.stringify(got)}`);
  }

  console.log('\n═══ no duplicate function declarations shadowing each other');
  const shadow = await page.evaluate(()=>({
    nthWeekdayDateArity: typeof nthWeekdayDate==='function' ? nthWeekdayDate.length : -1,
    weekOfMonthArity:    typeof weekOfMonth==='function'    ? weekOfMonth.length    : -1,
    nthWeekdayDateWorks: (()=>{try{return nthWeekdayDate(2026,8,4,3);}catch(e){return 'THROWS: '+e.message;}})(),
  }));
  chk('nthWeekdayDate(y,m,wd,nth) resolves to the date builder', shadow.nthWeekdayDateArity===4, JSON.stringify(shadow));
  chk('nthWeekdayDate returns a date, not a throw', /^\d{4}-\d{2}-\d{2}$/.test(String(shadow.nthWeekdayDateWorks)), String(shadow.nthWeekdayDateWorks));
  chk('weekOfMonth(ds) still available for weekly offs', shadow.weekOfMonthArity===1);

  console.log('\n═══ completing a recurring task honours its end condition');
  const endc = await page.evaluate(()=>{
    tasks.length=0; const n=now();
    tasks.push({id:'r1',type:'task',title:'Standup',owner:'me',due:'2026-08-20',original_due:'2026-08-20',
      repeat:'daily',repeat_interval:1,repeat_ends:'after',repeat_count:3,repeat_done:1,
      status:'open',priority:'medium',dept:'',customer_id:null,notes:'',created_at:n,updated_at:n});
    const made=[];
    for(let i=0;i<5;i++){
      const open=tasks.filter(t=>!t.deleted&&t.status!=='done'&&t.title==='Standup');
      if(!open.length)break;
      toggleTask(open[0].id);
      made.push(tasks.filter(t=>!t.deleted&&t.title==='Standup').length);
    }
    return {total:tasks.filter(t=>!t.deleted&&t.title==='Standup').length, made};
  });
  chk('"ends after 3" stops at 3 occurrences', endc.total===3, JSON.stringify(endc));

  console.log('\n═══ the patterns are reachable from the task modal, and round-trip through save/load');
  const ui = await page.evaluate(()=>{
    const out=[];
    const set=(id,v)=>{const e=document.getElementById(id);if(!e)return false;
      if(e.type==='checkbox')e.checked=v;else e.value=v; e.dispatchEvent(new Event('change',{bubbles:true})); return true;};
    const trip=(name,fill,expect)=>{
      tasks.length=0; openTask();
      document.getElementById('tTitle').value=name;
      set('tDue','2026-08-20');
      fill(set);
      saveTask();
      const t=tasks.find(x=>x.title===name);
      if(!t){out.push({name,ok:false,why:'not saved'});return;}
      const got={}; Object.keys(expect).forEach(k=>got[k]=t[k]);
      const ok=Object.keys(expect).every(k=>JSON.stringify(t[k])===JSON.stringify(expect[k]));
      out.push({name,ok,expect,got,label:repeatLabel(t)});
    };
    trip('every 3 days',      s=>{s('tRepeat','daily');s('tRepeatEvery',3);},              {repeat:'daily',repeat_interval:3});
    trip('yearly',            s=>{s('tRepeat','yearly');},                                  {repeat:'yearly',repeat_interval:1});
    trip('last day monthly',  s=>{s('tRepeat','monthly');s('tRepeatMonthMode','date');s('tRepeatLastDay',true);}, {repeat:'monthly',repeat_month_day:-1});
    trip('ends after 5',      s=>{s('tRepeat','weekly');s('tRepeatEnds','after');s('tRepeatCount',5);}, {repeat:'weekly',repeat_ends:'after',repeat_count:5});
    trip('ends on a date',    s=>{s('tRepeat','daily');s('tRepeatEnds','on');s('tRepeatUntil','2026-12-31');}, {repeat:'daily',repeat_ends:'on',repeat_until:'2026-12-31'});
    try{closeM();}catch(e){}
    return out;
  });
  ui.forEach(r=>chk('modal round-trip: '+r.name, r.ok,
    r.ok?`label: "${r.label}"`:`want ${JSON.stringify(r.expect)}\n           got  ${JSON.stringify(r.got)} ${r.why||''}`));

  console.log('\n---page errors---', JSON.stringify(errs.slice(0,4)));
  console.log(FAIL===0?'\n*** W2 RECURRENCE: ALL PASS ***':`\n*** W2 RECURRENCE: ${FAIL} FAILURE(S) ***`);
  await b.close();
  process.exit(FAIL?1:0);
})();
