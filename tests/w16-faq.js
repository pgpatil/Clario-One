/* W16 — the Help/FAQ keeps up with the app.
   Each user-facing feature must be findable by the words someone would type into the FAQ search.
   When a feature ships, add its FAQ entry and a line here; this list is the checklist. */
const { chromium } = require('playwright');
let FAIL=0;
const chk=(n,ok,d)=>{console.log(`  ${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`); if(!ok)FAIL++;};

// [what someone types, a question that must be among the matches]
const FINDS = [
  ['forgot pin',          'Forgot PIN? Recovery code'],
  ['recovery code',       'Forgot PIN? Recovery code'],
  ['forgot passphrase',   'Change or forgot passphrase'],
  ['change passphrase',   'Change or forgot passphrase'],
  ['remembers the passphrase', 'Encryption'],
  ['reset this device',   'Reset this device'],
  ['microsoft password',  'Forgot Microsoft password / Reconnect'],
  ['pin lock',            'Personal PIN lock'],
  ['companies',           'Several companies in Official'],
  ['shared between companies', 'What is shared between companies'],
  ['missing on another device','A company is missing on another device'],
  ['build number',        'A company is missing on another device'],
  ['merge into one',      'A company is missing on another device'],
  ['reload now',          'A company is missing on another device'],
  ['borrowed',            'Borrowed & lent'],
  ['lent',                'Borrowed & lent'],
  ['xirr',                'Returns, XIRR and the labels'],
  ['carried',             'Returns, XIRR and the labels'],
  ['analysis',            'Analysis dashboard'],
  ['what moved',          'Analysis dashboard'],
  ['net worth',           'Investments: holdings and net worth'],
  ['pf',                  'PF accounts'],
  ['forecast',            'Cashflow forecast'],
  ['fixed commitments',   'Fixed commitments'],
  ['monthly plan',        'Monthly plan'],
  ['emi',                 'Loans'],
  ['saved view',          'Saved views'],
  ['subtask',             'Subtasks and labels'],
  ['label',               'Subtasks and labels'],
  ['account group',       'Account groups'],
  ['set a trip',          'Month planner'],
  ['press and hold',      'Drag to schedule (Day and Week)'],
  ['snaps to 15',         'Drag to schedule (Day and Week)'],
  ['run shutdown',        'Shutdown ritual'],
  ['guided review',       'Weekly review'],
  ['3rd thursday',        'Recurring tasks'],
  ['clear future',        'Your location for the day'],
  ['birthday',            'Birthdays and family'],
  ['privacy',             'Privacy — what leaves this device'],
  ['analytics',           'Privacy — what leaves this device'],
  ['wipe',                'Wipe this device vs delete everything'],
  ['delete everything',   'Wipe this device vs delete everything'],
];

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const page = await b.newPage({ viewport:{width:1300,height:950} });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(process.env.CLARIO_URL || 'http://localhost:8934/index.html');
  await page.waitForTimeout(400);
  await page.evaluate(()=>{ if(document.getElementById('mAsk').classList.contains('open')) askResolve(null); });
  await page.evaluate(()=>{setMode('official');nav('help');});
  await page.waitForTimeout(150);

  console.log('\n═══ every feature is findable from the FAQ search');
  for (const [q,want] of FINDS) {
    const hits = await page.evaluate(q=>{faqSearch(q);
      return [...document.querySelectorAll('.faqi')].filter(d=>d.style.display!=='none').map(d=>d.querySelector('summary').textContent.trim());},q);
    chk(`"${q}" → ${want}`, hits.includes(want), hits.includes(want)?`${hits.length} match${hits.length===1?'':'es'}`:JSON.stringify(hits.slice(0,5)));
  }
  await page.evaluate(()=>faqSearch(''));

  console.log('\n═══ the FAQ reads cleanly');
  const q = await page.evaluate(()=>{
    document.querySelectorAll('.faqi').forEach(d=>d.open=true);
    const qs=[...document.querySelectorAll('.faqi summary')].map(s=>s.textContent.trim());
    const dup=qs.filter((x,i)=>qs.indexOf(x)!==i);
    const text=document.getElementById('main').innerText;
    const esc=text.match(/\\u[0-9a-fA-F]{4}/);
    const ents=text.match(/&(amp|mdash|lt|gt);/);
    const sections=[...document.querySelectorAll('.card.faq .ch')].map(c=>c.textContent.trim());
    return {n:qs.length,dup,esc:esc&&esc[0],ents:ents&&ents[0],sections};});
  chk('no question appears twice', q.dup.length===0, JSON.stringify(q.dup));
  chk('no raw \\u escapes in any answer', !q.esc, String(q.esc));
  chk('no double-escaped HTML entities', !q.ents, String(q.ents));
  chk('Companies and Personal have their own sections', q.sections.includes('Companies')&&q.sections.some(s=>/^Personal/.test(s)), JSON.stringify(q.sections));
  chk(`${q.n} entries`, q.n>=60);

  console.log('\n---page errors---', JSON.stringify(errs.slice(0,4)));
  if(errs.length){FAIL++;console.log('  FAIL  page threw');}
  console.log(FAIL===0?'\n*** W16 FAQ COVERAGE: ALL PASS ***':`\n*** W16 FAQ COVERAGE: ${FAIL} FAILURE(S) ***`);
  await b.close();
  process.exit(FAIL?1:0);
})();
