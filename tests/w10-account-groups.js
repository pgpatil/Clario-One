/* Account groups: two levels, shared people, and a rollup.
   The load-bearing property is that a group holds no records of its own -- everything is
   derived from its member accounts -- so the rollup can never drift from the accounts it came
   from. Several checks exist to prove exactly that, by changing a member and re-reading. */
const { chromium } = require('playwright');
let FAIL=0;
const chk=(n,ok,d)=>{console.log(`  ${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`); if(!ok)FAIL++;};
const URL = process.env.CLARIO_URL || 'http://localhost:8934/index.html';

const seed = `(()=>{ customers.length=0;contacts.length=0;deals.length=0;tasks.length=0;
  meetings.length=0;activities.length=0;acctGroups.length=0;
  const n=now(), td=today();
  customers.push({id:'A',name:'Acme Chemicals',city:'Mumbai',group:'Acme Group',kam_id:null,created_at:n,updated_at:n});
  customers.push({id:'B',name:'Acme Consumer', city:'Pune',  group:'Acme Group',kam_id:null,created_at:n,updated_at:n});
  customers.push({id:'Z',name:'Standalone Ltd',city:'Kochi', created_at:n,updated_at:n});
  contacts.push({id:'c1',customer_id:'A',name:'Rakesh',role:'Plant buyer',created_at:n,updated_at:n});
  contacts.push({id:'c2',customer_id:'B',name:'Meera', role:'Category head',created_at:n,updated_at:n});
  contacts.push({id:'g1',customer_id:null,group:'Acme Group',name:'Sunita',role:'Group CPO',created_at:n,updated_at:n});
  deals.push({id:'d1',name:'Q3 supply',customer_id:'A',stage:'Proposal',value:1000000,created_at:n,updated_at:n});
  deals.push({id:'d2',name:'Retail pack',customer_id:'B',stage:'Qualified',value:400000,created_at:n,updated_at:n});
  deals.push({id:'d3',name:'Old win',customer_id:'A',stage:'Won',value:900000,created_at:n,updated_at:n});
  deals.push({id:'d4',name:'Other',customer_id:'Z',stage:'Proposal',value:5000000,created_at:n,updated_at:n});
  tasks.push({id:'t1',type:'task',title:'Send samples',owner:'me',customer_id:'A',due:addDays(td,-2),
    original_due:addDays(td,-2),status:'open',priority:'high',dept:'Ops',notes:'',created_at:n,updated_at:n});
  tasks.push({id:'t2',type:'task',title:'Rate card',owner:'me',customer_id:'B',due:addDays(td,3),
    original_due:addDays(td,3),status:'open',priority:'medium',dept:'Ops',notes:'',created_at:n,updated_at:n});
  tasks.push({id:'t3',type:'task',title:'Unrelated',owner:'me',customer_id:'Z',due:td,
    original_due:td,status:'open',priority:'low',dept:'Ops',notes:'',created_at:n,updated_at:n});
  persist(); nav('accounts'); })()`;

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const page = await b.newPage({ viewport:{width:1400,height:1100} });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(URL); await page.waitForTimeout(400);
  await page.evaluate(()=>{ if(document.getElementById('mAsk').classList.contains('open')) askResolve(null); });
  await page.evaluate(seed); await page.waitForTimeout(250);

  console.log('\n═══ a shared person reaches every company in the group');
  const reach = await page.evaluate(()=>{
    const names=cid=>contactsFor(cid).map(x=>x.name).sort();
    const pick=cid=>{fillContact('tContact',cid,'');
      return [...document.getElementById('tContact').options].map(o=>o.textContent).filter(t=>t!=='—').sort();};
    return {A:names('A'), B:names('B'), Z:names('Z'), pickA:pick('A'), pickB:pick('B'), pickZ:pick('Z')};
  });
  chk('company A sees its own plus the shared one', JSON.stringify(reach.A)===JSON.stringify(['Rakesh','Sunita']), JSON.stringify(reach.A));
  chk('company B sees its own plus the shared one', JSON.stringify(reach.B)===JSON.stringify(['Meera','Sunita']), JSON.stringify(reach.B));
  chk('a standalone account sees neither',          JSON.stringify(reach.Z)===JSON.stringify([]), JSON.stringify(reach.Z));
  chk('the FPR picker agrees for B',                reach.pickB.some(x=>/Sunita/.test(x)), JSON.stringify(reach.pickB));
  chk('the FPR picker leaks nothing to Z',          reach.pickZ.length===0, JSON.stringify(reach.pickZ));

  console.log('\n═══ a company added later inherits the shared people');
  const later = await page.evaluate(()=>{
    const n=now();
    customers.push({id:'C',name:'Acme Logistics',city:'Chennai',group:'Acme Group',created_at:n,updated_at:n});
    persist();
    return {C:contactsFor('C').map(x=>x.name), members:groupMembers('Acme Group').length};
  });
  chk('no per-company wiring needed', JSON.stringify(later.C)===JSON.stringify(['Sunita']), JSON.stringify(later.C));
  chk('and it joins the group',       later.members===3);

  console.log('\n═══ the rollup sums its members, and only its members');
  const roll = await page.evaluate(()=>{
    const R=groupRollup('Acme Group');
    return {members:R.members.length, openDeals:R.open.length, openValue:R.openValue,
            weighted:Math.round(R.weighted), won:R.won.length,
            tasks:R.tasks.length, overdue:R.overdue.length,
            shared:R.shared.length, contacts:R.contacts.length};
  });
  // A 1,000,000 @ Proposal 55% + B 400,000 @ Qualified 30% = 550,000 + 120,000
  chk('member count',           roll.members===3, JSON.stringify(roll));
  chk('open pipeline excludes the standalone account', roll.openValue===1400000, `${roll.openValue}`);
  chk('weighted uses stage probability as a percentage', roll.weighted===670000, `${roll.weighted}`);
  chk('won deals counted separately', roll.won===1);
  chk('open items summed across members', roll.tasks===2, `${roll.tasks}`);
  chk('overdue summed across members',    roll.overdue===1, `${roll.overdue}`);
  chk('shared people listed once',        roll.shared===1);
  chk('everyone under the group',         roll.contacts===3, `${roll.contacts}`);

  console.log('\n═══ the rollup is derived, so it cannot drift from its accounts');
  const drift = await page.evaluate(()=>{
    const before=groupRollup('Acme Group').openValue;
    deals.find(d=>d.id==='d2').value=900000;                 // change a member's deal
    const after=groupRollup('Acme Group').openValue;
    customers.find(c=>c.id==='B').group='';                  // move a company out
    const moved=groupRollup('Acme Group');
    /* read this WHILE B is out -- reading it in the return would measure the restored state */
    const whileOut=contactsFor('B').map(x=>x.name).sort();
    customers.find(c=>c.id==='B').group='Acme Group';        // and back
    return {before, after, movedMembers:moved.members.length, movedValue:moved.openValue,
            bReachesSunitaWhenOut:whileOut, restored:contactsFor('B').map(x=>x.name).sort()};
  });
  chk('editing a member deal moves the total', drift.before===1400000 && drift.after===1900000, JSON.stringify(drift));
  chk('moving a company out drops it from the rollup', drift.movedMembers===2 && drift.movedValue===1000000, JSON.stringify(drift));

  console.log('\n═══ leaving the group also drops access to shared people');
  chk('a company outside the group loses Sunita',
      JSON.stringify(drift.bReachesSunitaWhenOut)===JSON.stringify(['Meera']), JSON.stringify(drift.bReachesSunitaWhenOut));
  chk('and regains her on rejoining',
      JSON.stringify(drift.restored)===JSON.stringify(['Meera','Sunita']), JSON.stringify(drift.restored));

  console.log('\n═══ the group page renders and links both ways');
  const view = await page.evaluate(()=>{
    nav('group','Acme Group');
    const kpis=[...document.querySelectorAll('#main .kpi')].map(k=>k.querySelector('.kl').textContent.trim());
    const rows=document.querySelectorAll('#main table.t tr.click').length;
    const h2=document.querySelector('#main h2').textContent;
    nav('accounts','A');
    const backLink=!!Array.from(document.querySelectorAll('#main .pill.lnk')).find(p=>/Acme Group/.test(p.textContent));
    return {kpis, rows, h2, backLink};
  });
  chk('the group page titles itself',       view.h2==='Acme Group', view.h2);
  chk('it shows rollup KPIs',               view.kpis.length===5, JSON.stringify(view.kpis));
  chk('member and deal rows render',        view.rows>0, `${view.rows} rows`);
  chk('the account page links to the group',view.backLink);

  console.log('\n═══ scope is exclusive: a person is company-level or group-level, never both');
  const scope = await page.evaluate(()=>{
    openContact('g1');
    const loadedAsGroup=document.getElementById('coScope').value==='group';
    const groupFieldShown=document.getElementById('fCoGroup').style.display!=='none';
    const custFieldHidden=document.getElementById('fCoCust').style.display==='none';
    // switch a company contact to group scope through the real save path
    openContact('c1');
    document.getElementById('coScope').value='group'; contactScopeUI();
    document.getElementById('coGroup').value='Acme Group';
    saveContact();
    const c1=contacts.find(x=>x.id==='c1');
    return {loadedAsGroup, groupFieldShown, custFieldHidden,
            c1cust:c1.customer_id, c1group:c1.group, nowSharedToB:contactsFor('B').map(x=>x.name).sort()};
  });
  chk('a group contact loads as group-scoped', scope.loadedAsGroup && scope.groupFieldShown && scope.custFieldHidden, JSON.stringify(scope));
  chk('promoting clears the single company', scope.c1cust===null && scope.c1group==='Acme Group', JSON.stringify(scope));
  chk('and the person now reaches the sibling', JSON.stringify(scope.nowSharedToB)===JSON.stringify(['Meera','Rakesh','Sunita']), JSON.stringify(scope.nowSharedToB));

  console.log('\n═══ groups survive a sync round-trip');
  const sync = await page.evaluate(()=>{
    ensureGroup('Acme Group');
    const snap=JSON.parse(JSON.stringify(getState()));
    const inState='acctGroups' in snap;
    customers.length=0;contacts.length=0;acctGroups.length=0;
    applyState(snap);
    return {inState, groups:GROUPS(), members:groupMembers('Acme Group').length,
            shared:CO().filter(isGroupContact).length};
  });
  chk('acctGroups is part of synced state', sync.inState);
  chk('the grouping survives',              sync.members===3 && sync.groups.includes('Acme Group'), JSON.stringify(sync));
  chk('shared people survive as shared',    sync.shared===2, `${sync.shared}`);

  console.log('\n═══ nothing changes for accounts with no group');
  const plain = await page.evaluate(()=>{
    nav('accounts');
    return {zContacts:contactsFor('Z').length, zGroup:acctGroupOf('Z'),
            listRenders:document.querySelectorAll('#main table.t tr.click, #main .acard').length};
  });
  chk('a standalone account is unaffected', plain.zContacts===0 && plain.zGroup==='', JSON.stringify(plain));
  chk('the accounts list still renders',    plain.listRenders>0, `${plain.listRenders}`);

  console.log('\n---page errors---', JSON.stringify(errs.slice(0,4)));
  console.log(FAIL===0?'\n*** ACCOUNT GROUPS: ALL PASS ***':`\n*** ACCOUNT GROUPS: ${FAIL} FAILURE(S) ***`);
  await b.close();
  process.exit(FAIL?1:0);
})();
