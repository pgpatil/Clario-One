/* W19 — reminders & notifications.
   Reminders are derived from the data at fixed clock times passed in, so every check is
   deterministic. The privacy rule is checked on every surface a reminder can reach: the popup,
   the bell panel and the system notification, in Official and in Personal -- a personal reminder
   names what is due and never shows an amount. */
const { chromium } = require('playwright');
let FAIL=0;
const chk=(n,ok,d)=>{console.log(`  ${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`); if(!ok)FAIL++;};
const URL_=process.env.CLARIO_URL || 'http://localhost:8934/index.html';

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport:{width:1300,height:950} });
  const page = await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(URL_); await page.waitForTimeout(300);
  await page.evaluate(()=>{try{localStorage.clear();}catch(e){}}); await page.reload(); await page.waitForTimeout(1700);
  await page.evaluate(()=>{ if(document.getElementById('mAsk').classList.contains('open')) askResolve(null); });

  // a fixed day, and data on it
  const seed = await page.evaluate(()=>{
    const D='2026-11-10', n=now(), S=o=>Object.assign({created_at:n,updated_at:n},o);
    window.T_D=D; window.T_ms=hm=>new Date(D+'T'+hm).getTime();
    tasks.length=0;meetings.length=0;decisions.length=0;birthdays.length=0;ious.length=0;ioutx.length=0;remlog.length=0;
    people.push(S({id:'pr',name:'Ravi'}));
    tasks.push(S({id:'tCall',type:'call',title:'Call Ravi about pricing',owner:'me',due:D,when:D+'T11:00',status:'open'}));
    tasks.push(S({id:'tAt',type:'task',title:'Send board pack',owner:'me',due:D,at:'14:30',status:'open'}));
    tasks.push(S({id:'tDay',type:'task',title:'Review contract',owner:'me',due:D,status:'open'}));
    tasks.push(S({id:'tWait',type:'task',title:'Quote from Ravi',owner:'pr',due:'2026-11-20',follow_up:D,status:'waiting'}));
    tasks.push(S({id:'tDone',type:'task',title:'Already done',owner:'me',due:D,at:'10:00',status:'done'}));
    tasks.push(S({id:'pt',scope:'personal',type:'task',title:'Pick up passport',owner:'me',due:D,status:'open'}));
    meetings.push(S({id:'mT',title:'Ops review',date:D,time:'15:00'}));
    decisions.push(S({id:'dR',what:'Switch supplier',date:'2026-08-10',review_date:D}));
    birthdays.push(S({id:'bA',name:'Aarav',date:'1990-11-10'}));
    ious.push(S({id:'iL',dir:'lent',person:'Uncle',principal:45000,date:'2026-09-01',due:D}));
    // money due: the real list with amounts in it -- they must never reach a reminder
    window.finDueItems=ym=>ym==='2026-11'?[{kind:'card',name:'HDFC Regalia ••4821',amount:23456,due:'2026-11-12'},{kind:'emi',name:'Home loan',amount:45678,due:D},{kind:'commit',name:'Rent',amount:30000,due:'2026-11-25'}]:[];
    // a second company with a call today
    const n2=now();companies.push({id:'cB',name:'Beta Traders',created_at:n2,updated_at:n2});
    _coStore.cB=Object.assign(coEmpty(),{tasks:[S({id:'bCall',type:'call',title:'Call Beta supplier',owner:'me',due:D,when:D+'T16:00',status:'open'})]});
    localStorage.setItem('cx_rem_fired','[]');persist();
    return remCollect(D).map(i=>({key:i.key,at:remHM(i.at),title:i.title,sub:i.sub,digest:!!i.digest,personal:!!i.personal}));});

  console.log('\n═══ what creates a reminder, and when');
  const by=k=>seed.filter(i=>i.key.startsWith(k));
  chk('call: at its time, plus 10 min heads-up', by('t:tCall:').map(i=>i.at).sort().join()==='10:50,11:00', JSON.stringify(by('t:tCall:').map(i=>i.at)));
  chk('task with a time: at that time', by('t:tAt:').length===1&&by('t:tAt:')[0].at==='14:30');
  chk('meeting: at its time, plus heads-up', by('m:mT:').map(i=>i.at).sort().join()==='14:50,15:00');
  chk('task due today without a time: in the morning digest', by('d:t:tDay:').length===1&&by('d:t:tDay:')[0].digest&&by('d:t:tDay:')[0].at==='09:00');
  chk('follow-up date: in the digest, naming who', by('d:f:tWait:').length===1&&/with Ravi/.test(by('d:f:tWait:')[0].sub), by('d:f:tWait:')[0]&&by('d:f:tWait:')[0].sub);
  chk('decision review: in the digest', by('d:r:dR:').length===1);
  chk('birthday: in the digest', seed.some(i=>i.key.startsWith('d:b:bA:')&&/Aarav/.test(i.title)));
  chk('completed work does not remind', !seed.some(i=>i.key.includes('tDone')));
  chk('a call in another company reminds too, labelled with it', seed.some(i=>i.key.startsWith('t:bCall:')&&/Beta Traders/.test(i.sub)));
  chk('money: on the day and 2 days before; not 15 days out', seed.some(i=>/Home loan.*EMI due today/.test(i.title))&&seed.some(i=>/HDFC.*card bill due in 2 days/.test(i.title))&&!seed.some(i=>/Rent/.test(i.title)), JSON.stringify(seed.filter(i=>i.personal).map(i=>i.title)));
  chk('money lent: reminds on its expected date', seed.some(i=>/Uncle is due to repay you today/.test(i.title)));

  console.log('\n═══ personal reminders never show an amount');
  const money=seed.filter(i=>i.personal).map(i=>i.title+' '+i.sub).join(' | ');
  chk('no amounts or currency in any personal reminder', !/₹|23,?456|45,?678|45,?000|30,?000|\d{4,}/.test(money.replace(/••\d{4}/g,'')), money);

  console.log('\n═══ alerts fire once, at the right moment');
  const t = await page.evaluate(()=>{
    const r={};const shown=()=>[...document.querySelectorAll('#remPop .remcard')].map(c=>c.querySelector('b').textContent);
    setMode('official');nav('home');
    r.early=remTick(T_ms('08:00')).length;
    r.digest=remTick(T_ms('09:00')).map(i=>i.key);r.cards=shown();
    r.digestText=document.getElementById('remPop').textContent;
    r.again=remTick(T_ms('09:01')).length;
    r.call=remTick(T_ms('10:50')).map(i=>i.key);
    r.badge=document.getElementById('ghBellN').textContent;
    return r;});
  chk('nothing before the first time', t.early===0);
  chk('9:00 brings one digest card with the dated items', t.cards.length===1&&/Today: \d+ reminders/.test(t.cards[0])&&t.digest.length>=6, JSON.stringify(t.cards));
  chk('the digest carries no amounts', !/45,?678|23,?456|₹/.test(t.digestText));
  chk('a second check does not alert again', t.again===0);
  chk('the call heads-up fires at 10:50', t.call.length===1&&/:pre$/.test(t.call[0]), JSON.stringify(t.call));
  chk('the bell counts what is due', +t.badge>=7, t.badge);
  const sup = await page.evaluate(()=>{const pre='t:tCall:'+T_D+'T11:00:pre';
    return {before:remActive(T_ms('10:55')).some(i=>i.key===pre),after:remActive(T_ms('11:00')).some(i=>i.key===pre)};});
  chk('the heads-up gives way to the real reminder (no double entry)', sup.before&&!sup.after, JSON.stringify(sup));

  console.log('\n═══ snooze, dismiss, mark done — and they sync');
  const a = await page.evaluate(()=>{const r={};
    const call='t:tCall:'+T_D+'T11:00';
    remTick(T_ms('11:00'));
    remLogSet(call,{status:'snoozed',until:T_ms('11:10')});
    r.snoozedActive=remActive(T_ms('11:05')).some(i=>i.key===call);
    r.reAlert=remTick(T_ms('11:11')).some(i=>i.key===call);
    remDismiss(call);r.afterDismiss=remActive(T_ms('11:12')).some(i=>i.key===call);
    remMarkDone('d:t:tDay:'+T_D);r.taskDone=tasks.find(x=>x.id==='tDay').status;
    // another device: same data, nothing shown yet there
    const st=JSON.parse(JSON.stringify(getState()));remlog.length=0;applyState(st);
    localStorage.setItem('cx_rem_fired','[]');
    r.otherDevice=remTick(T_ms('11:15')).map(i=>i.key);
    r.syncedDismiss=!r.otherDevice.includes(call);
    return r;});
  chk('a snoozed reminder is quiet until its time', a.snoozedActive===false);
  chk('…and alerts again when the snooze ends', a.reAlert);
  chk('dismissed reminders leave the bell', a.afterDismiss===false);
  chk('“Mark done” completes the task', a.taskDone==='done');
  chk('dismissals sync: another device does not alert them again', a.syncedDismiss, JSON.stringify(a.otherDevice));

  console.log('\n═══ opening a reminder');
  const o = await page.evaluate(async()=>{const r={};
    remOpen('t:bCall:'+T_D+'T16:00');await new Promise(x=>setTimeout(x,60));
    r.company=coLabel(activeCo);r.view=view;r.arg=viewArg;
    switchCompany('home');
    const s=b64(crypto.getRandomValues(new Uint8Array(16)));_pinCfg={salt:s,hash:await pinHash('2468',s)};_personalUnlocked=false;
    const money=remCollect(T_D).find(i=>/Home loan/.test(i.title));remOpen(money.key);
    r.mode=appMode;r.locked=!!document.querySelector('#main #pinInput');r.mainText=document.getElementById('main').textContent;
    _pinCfg=null;setMode('official');return r;});
  chk('a reminder from another company switches to it and opens the call', o.company==='Beta Traders'&&o.view==='task'&&o.arg==='bCall', JSON.stringify(o).slice(0,90));
  chk('a personal reminder opens Personal — behind the PIN when it is set', o.mode==='personal'&&o.locked&&!/45,?678/.test(o.mainText));

  console.log('\n═══ system notifications in the background');
  await ctx.grantPermissions(['notifications'],{origin:'http://localhost:8934'});
  const nt = await page.evaluate(async()=>{const sent=[];
    navigator.serviceWorker.getRegistration=async()=>({showNotification:async(t,o)=>{sent.push({t,b:o.body,tag:o.tag});}});
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
    localStorage.setItem('cx_rem_fired','[]');remlog.length=0;
    const n=now();['12:00','13:00'].forEach((hm,k)=>tasks.push({id:'x'+k,type:'task',title:'Extra '+hm,owner:'me',due:T_D,at:hm,status:'open',created_at:n,updated_at:n}));
    remTick(T_ms('14:30'));await new Promise(x=>setTimeout(x,100));
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});
    return {perm:Notification.permission,sent};});
  chk('in the background, alerts go to the system', nt.perm==='granted'&&nt.sent.length>=1, JSON.stringify(nt.sent).slice(0,140));
  chk('more than three at once become one notification (payments keep their own)', nt.sent.length===2&&/^\d+ reminders$/.test(nt.sent[0].t)&&/payments need attention/.test(nt.sent[1].t), JSON.stringify(nt.sent.map(x=>x.t)));
  chk('notification text carries no amount', !nt.sent.some(x=>/₹|45,?678|23,?456/.test(x.t+' '+x.b)));

  console.log('\n═══ bills and payments: until paid, every open and every hour');
  const pay = await page.evaluate(async()=>{const r={},H=3600e3,D=T_D;
    const tk=ms=>{window.__remNow=ms;return remTick(ms);};window.__remNow=T_ms('08:00');
    // Money due: last month's unpaid card bill, this month's EMI (overdue), an EMI from last month, rent far ahead
    window.T_paid=new Set();
    window.finDueItems=ym=>({'2026-10':[{kind:'card',id:'cc1',ym,name:'HDFC Regalia ••4821',amount:23456,due:'2026-10-28'},{kind:'emi',id:'ln0',ym,name:'Old EMI',amount:1,due:'2026-10-05'}],
      '2026-11':[{kind:'emi',id:'ln1',ym,name:'Home loan',amount:45678,due:'2026-11-08'},{kind:'commit',id:'fc1',ym,name:'Rent',amount:30000,due:'2026-11-25'}]}[ym]||[]).filter(i=>!T_paid.has(i.id));
    window.cardPayFull=(id,ym)=>{T_paid.add(id);toast('Paid ₹23,456 — HDFC Regalia.');};
    window.loanPayEmi=(id,ym)=>{toast('Set the EMI amount first.');};
    ious.push({id:'iB',dir:'borrowed',person:'Uncle',principal:5000,date:'2026-09-01',due:'2026-11-01',created_at:now(),updated_at:now()});
    remlog.length=0;_remShown=[];remPaintPop();localStorage.removeItem('cx_rem_pay_at');_remOpenRound=true;
    const list=remCollect(D).filter(i=>i.sticky);
    r.titles=list.map(i=>i.title);r.keys=list.map(i=>i.key);
    r.inDigest=remCollect(D).some(i=>i.sticky&&i.digest);
    const cardTitle=()=>{const c=document.querySelector('#remPop .remcard.pay');return c?c.querySelector('b').textContent:null;};
    tk(T_ms('08:00'));r.onOpen=cardTitle();r.rows=[...document.querySelectorAll('#remPop .remcard.pay .rc-pay')].length;
    r.btns=[...document.querySelectorAll('#remPop .remcard.pay button')].map(b=>b.textContent.trim());
    _remShown=[];remPaintPop();
    tk(T_ms('08:30'));r.halfHour=cardTitle();
    tk(T_ms('09:00')+60e3);r.hourLater=cardTitle();_remShown=[];remPaintPop();
    // coming back to the app after 5+ minutes counts as opening it
    _remHiddenAt=Date.now()-6*60e3;document.dispatchEvent(new Event('visibilitychange'));
    tk(T_ms('09:10'));r.reopen=cardTitle();_remShown=[];remPaintPop();
    // dismiss is refused
    remDismiss(list[0].key);r.afterDismiss=remActive(T_ms('09:11')).some(i=>i.key===list[0].key);
    // snooze 1 hour, then 1 day
    const k=r.keys.find(x=>x.startsWith('$:emi:ln1'));
    remLogSet(k,{status:'snoozed',until:T_ms('10:15')});
    r.snoozed=remActive(T_ms('10:00')).some(i=>i.key===k);r.back=remActive(T_ms('10:16')).some(i=>i.key===k);
    remSnoozePays(1440,k);const until=remLog(k).until;r.dayMin=Math.round((until-window.__remNow)/60e3);
    // the payments card survives a crowd of other reminders
    localStorage.setItem('cx_rem_fired','[]');localStorage.removeItem('cx_rem_pay_at');_remOpenRound=true;remlog.length=0;
    tk(T_ms('14:31'));r.crowd=[...document.querySelectorAll('#remPop .remcard')].map(c=>c.classList.contains('pay')?'PAY':c.querySelector('b').textContent);
    // mark paid: records it, quietly, and the reminder goes away by itself
    const ck=r.keys.find(x=>x.startsWith('$:card:cc1'));
    const p=remPay(ck);await new Promise(x=>setTimeout(x,60));r.confirm=document.getElementById('askMsg').textContent;askResolve(true);await p;
    r.toast=document.getElementById('toast').textContent;r.paidGone=!remCollect(D).some(i=>i.key===ck);
    // a payment that cannot be recorded here says so, without the amount
    const ek=r.keys.find(x=>x.startsWith('$:emi:ln1'));remlog.length=0;
    const p2=remPay(ek);await new Promise(x=>setTimeout(x,60));askResolve(true);await p2;r.failToast=document.getElementById('toast').textContent;
    r.stillThere=remCollect(D).some(i=>i.key===ek);
    // opening goes to Money
    remOpen(ek);r.open={mode:appMode,tab:personalTab,fv:finView};setMode('official');
    r.allText=document.getElementById('remPop').textContent+' '+r.titles.join(' ')+' '+r.confirm+' '+r.toast+' '+r.failToast;
    _remShown=[];remPaintPop();window.__remNow=0;return r;});
  chk('overdue and upcoming payments are listed; far-off ones are not', pay.titles.some(t=>/Home loan — EMI overdue since/.test(t))&&!pay.titles.some(t=>/Rent/.test(t)), JSON.stringify(pay.titles));
  chk('last month’s unpaid card bill is still there', pay.titles.some(t=>/HDFC Regalia ••4821 — card bill overdue since/.test(t)));
  chk('last month’s EMI is not (loans only record their latest paid month)', !pay.titles.some(t=>/Old EMI/.test(t)));
  chk('money you owe a person stays until repaid', pay.titles.some(t=>/Repayment to Uncle overdue since/.test(t)));
  chk('payment reminders are not in the digest, and their key carries no day', !pay.inDigest&&pay.keys.every(k=>/^\$:/.test(k)&&!/\d{4}-\d{2}-\d{2}/.test(k)), JSON.stringify(pay.keys));
  chk('on opening the app: one payments card listing them all', /payments need attention/.test(pay.onOpen||'')&&pay.rows===3, `${pay.onOpen} / ${pay.rows} rows`);
  chk('its options: Mark paid, Snooze 1 hour, Snooze 1 day — no Dismiss', pay.btns.includes('Snooze 1 hour')&&pay.btns.includes('Snooze 1 day')&&pay.btns.includes('Mark paid')&&!pay.btns.includes('Dismiss'), JSON.stringify(pay.btns));
  chk('not again within the hour', pay.halfHour===null);
  chk('again an hour later', /payments need attention/.test(pay.hourLater||''));
  chk('again whenever you come back to the app', /payments need attention/.test(pay.reopen||''));
  chk('it cannot be dismissed', pay.afterDismiss===true);
  chk('Snooze 1 hour hides it, then it is back', pay.snoozed===false&&pay.back===true);
  chk('Snooze 1 day is a day', Math.abs(pay.dayMin-1440)<=1, `${pay.dayMin} min`);
  chk('the payments card is never crowded out by other reminders', pay.crowd.includes('PAY'), JSON.stringify(pay.crowd));
  chk('Mark paid records it, and the reminder goes away by itself', pay.paidGone);
  chk('…confirming by name, never by amount', /Record “HDFC Regalia ••4821” as paid in full\?/.test(pay.confirm)&&/recorded as paid/.test(pay.toast), pay.confirm+' | '+pay.toast);
  chk('a payment that cannot be recorded here stays, and says so without the amount', pay.stillThere&&/Set the EMI amount first/.test(pay.failToast));
  chk('opening a payment goes to Money', pay.open.mode==='personal'&&pay.open.tab==='money'&&pay.open.fv==='month', JSON.stringify(pay.open));
  chk('no amount anywhere: card, titles, confirm, messages', !/₹|23,?456|45,?678|30,?000|5,?000/.test(pay.allText.replace(/••\d{4}/g,'')), pay.allText.slice(0,120));

  console.log('\n═══ settings and the bell panel');
  const ui = await page.evaluate(()=>{const r={};nav('settings');
    r.card=!!document.getElementById('remCard');
    remSetCfg({digest:'08:15'});r.digestAt=remHM(remCollect(T_D).find(i=>i.digest).at);
    remSetCfg({src:{bday:false}});r.noBday=!remCollect(T_D).some(i=>i.kind==='bday');
    remSetCfg({lead:0});r.noPre=!remCollect(T_D).some(i=>/:pre$/.test(i.key));
    remSetCfg({moneyDays:0});r.noEarly=!remCollect(T_D).some(i=>/in 2 days/.test(i.title));
    remSetCfg({on:false});localStorage.setItem('cx_rem_fired','[]');r.offFires=remTick(T_ms('15:00')).length;
    remSetCfg({on:true,digest:'09:00',lead:10,moneyDays:2,src:{bday:true}});
    remPanel(true);r.panel=document.getElementById('remPanel').textContent;r.panelShown=document.getElementById('remPanel').classList.contains('show');
    remPanel(false);return r;});
  chk('Settings has a Reminders & notifications card', ui.card);
  chk('changing the digest time moves the digest', ui.digestAt==='08:15');
  chk('a source can be switched off (birthdays)', ui.noBday);
  chk('heads-up can be switched off', ui.noPre);
  chk('money lead time is adjustable', ui.noEarly);
  chk('reminders off: nothing fires', ui.offFires===0);
  chk('the bell opens a panel of reminders', ui.panelShown&&/Reminders/.test(ui.panel));

  console.log('\n═══ phone width, and opening from a notification');
  await page.setViewportSize({width:390,height:844});
  const ph = await page.evaluate(()=>{setMode('official');nav('home');localStorage.setItem('cx_rem_fired','[]');remlog.length=0;
    remTick(T_ms('11:00'));const pop=document.getElementById('remPop').getBoundingClientRect();
    const gh=document.getElementById('gh');return {sw:document.documentElement.scrollWidth,popW:pop.width,popR:pop.right,ghFits:gh.scrollWidth<=gh.clientWidth+1};});
  chk('popup fits a phone screen', ph.popW>200&&ph.popR<=390&&ph.sw<=390, JSON.stringify(ph));
  chk('the header still fits with the bell', ph.ghFits);
  const fs=require('fs'),path=require('path');const sw=fs.readFileSync(path.join(__dirname,'..','sw.js'),'utf8');
  chk('tapping a notification focuses Clario and opens that reminder', /notificationclick/.test(sw)&&/rem-open/.test(sw)&&/#rem=/.test(sw));

  await page.evaluate(()=>{try{localStorage.clear();}catch(e){}});
  console.log('\n---page errors---', JSON.stringify(errs.slice(0,4)));
  if(errs.length){FAIL++;console.log('  FAIL  page threw');}
  console.log(FAIL===0?'\n*** W19 REMINDERS: ALL PASS ***':`\n*** W19 REMINDERS: ${FAIL} FAILURE(S) ***`);
  await b.close();
  process.exit(FAIL?1:0);
})();
