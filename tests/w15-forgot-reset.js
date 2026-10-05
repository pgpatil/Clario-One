/* W15 acceptance — "Forgot PIN?" and "Forgot passphrase?" wherever a secret is asked for.
   A reset is only as good as the proof it asks for, so most checks are about refusing: a wrong
   recovery code, a different Microsoft account, a wrong passphrase, an empty device that would
   overwrite the synced file with nothing. The happy paths must also leave the data readable. */
const { chromium } = require('playwright');
let FAIL=0;
const chk=(n,ok,d)=>{console.log(`  ${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`); if(!ok)FAIL++;};
const URL_=process.env.CLARIO_URL || 'http://localhost:8934/index.html';

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport:{width:1300,height:950} });
  const page = await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  const boot=async()=>{await page.waitForTimeout(400);await page.evaluate(()=>{if(document.getElementById('mAsk').classList.contains('open'))askResolve(null);});};
  await page.goto(URL_); await boot();
  await page.evaluate(()=>{try{localStorage.clear();}catch(e){}}); await page.reload(); await boot();

  // helpers inside the page: answer the next dialog(s) in order
  await page.evaluate(()=>{
    window.T_wait=ms=>new Promise(r=>setTimeout(r,ms));
    window.T_dlg=()=>document.getElementById('mAsk').classList.contains('open')?{title:document.getElementById('askTitle').textContent,
      msg:document.getElementById('askMsg').textContent,alt:document.getElementById('askAlt').textContent,
      choices:[...document.querySelectorAll('#askChoices button')].map(b=>b.textContent)}:null;
    // run fn, then feed answers to each dialog as it opens; records every dialog seen
    window.T_run=async(fn,answers)=>{const seen=[];const p=fn();
      for(const a of answers){for(let i=0;i<60&&!T_dlg();i++)await T_wait(25);const d=T_dlg();if(!d)break;seen.push(d);
        if(a&&a.choose){const btn=[...document.querySelectorAll('#askChoices button')].find(b=>b.textContent.includes(a.choose));
          if(btn)btn.click();else askResolve(null);}else askResolve(a);
        await T_wait(60);}
      await p;await T_wait(80);return seen;};
    window.gSched=()=>{};          // no network from persist() in this test
  });

  console.log('\n═══ setting a PIN creates a one-time recovery code');
  const set = await page.evaluate(async()=>{const seen=await T_run(()=>setPin(),['2580','2580',false]);
    return {seen,rc:window._lastRc,stored:!!(_pinCfg&&_pinCfg.rc),raw:localStorage.getItem('cx_pin')};});
  const rcDlg=set.seen.find(d=>d.title==='Save your recovery code');
  chk('PIN set, then the recovery code is shown', !!rcDlg && /[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}/.test(rcDlg.msg), rcDlg&&rcDlg.msg.slice(0,40));
  chk('only a hash of the code is stored', set.stored && !set.raw.includes(set.rc.replace(/-/g,'')) && !set.raw.includes(set.rc));
  const RC1=set.rc;

  console.log('\n═══ "Forgot PIN?" is offered wherever the PIN is asked');
  const where = await page.evaluate(async()=>{const out={};
    _personalUnlocked=false;setMode('personal');out.lock=[...document.querySelectorAll('#main button')].some(b=>b.textContent==='Forgot PIN?');
    let p=changePin();await T_wait(40);out.change=T_dlg().alt;askResolve(null);await p;
    p=removePin();await T_wait(40);out.remove=T_dlg().alt;askResolve(null);await p;
    p=newRecoveryCode();await T_wait(40);out.newrc=T_dlg().alt;askResolve(null);await p;
    setMode('official');nav('settings');
    out.settings=[...document.querySelectorAll('#main button')].map(b=>b.textContent).filter(t=>/Forgot PIN|recovery code/.test(t));
    out.rcRow=[...document.querySelectorAll('.srow')].map(r=>r.textContent).find(t=>/Recovery code/.test(t));
    return out;});
  chk('on the lock screen', where.lock);
  chk('in Change PIN', where.change==='Forgot PIN?');
  chk('in Remove lock', where.remove==='Forgot PIN?');
  chk('in New recovery code', where.newrc==='Forgot PIN?');
  chk('in Settings, with the recovery code status', where.settings.includes('Forgot PIN?')&&where.settings.includes('New recovery code')&&/Saved/.test(where.rcRow||''), JSON.stringify(where.settings));

  console.log('\n═══ reset the PIN with the recovery code');
  const viaRc = await page.evaluate(async RC=>{
    const bad=await T_run(()=>forgotPin(),[{choose:'recovery code'},'AAAA-BBBB-CCCC']);
    const stillOld=await pinVerify('2580');
    const seen=await T_run(()=>forgotPin(),[{choose:'recovery code'},RC.toLowerCase(),'1357','1357',false]);
    return {choices:bad[0].choices,stillOld,newPin:await pinVerify('1357'),oldPin:await pinVerify('2580'),
            oldRc:await rcVerify(RC),newRc:window._lastRc,newRcWorks:await rcVerify(window._lastRc)};},RC1);
  chk('the proof choices offered fit this device', JSON.stringify(viaRc.choices)===JSON.stringify(['Enter your PIN recovery code','None of these — reset this device']), JSON.stringify(viaRc.choices));
  chk('a wrong code changes nothing', viaRc.stillOld);
  chk('the right code (any case, dashes optional) sets a new PIN', viaRc.newPin && !viaRc.oldPin);
  chk('the used code stops working', viaRc.oldRc===false);
  chk('a fresh code replaces it', viaRc.newRc!==RC1 && viaRc.newRcWorks);

  console.log('\n═══ reset the PIN with the db.json passphrase');
  const viaPass = await page.evaluate(async()=>{
    await T_run(()=>enableEnc(),['open sesame 9','open sesame 9']);
    const bad=await T_run(()=>forgotPin(),[{choose:'passphrase'},'wrong one']);
    const unchanged=await pinVerify('1357');
    const seen=await T_run(()=>forgotPin(),[{choose:'passphrase'},'open sesame 9','4680','4680',false]);
    return {choices:bad[0].choices,unchanged,newPin:await pinVerify('4680')};});
  chk('passphrase is offered once encryption is on', viaPass.choices.some(c=>/passphrase/.test(c)), JSON.stringify(viaPass.choices));
  chk('a wrong passphrase changes nothing', viaPass.unchanged);
  chk('the right passphrase sets a new PIN', viaPass.newPin);

  console.log('\n═══ reset the PIN by signing in to Microsoft again');
  const viaMs = await page.evaluate(async()=>{const calls=[];
    window._gAcct={homeAccountId:'acct-A',username:'user@example.com'};
    window._msal={acquireTokenPopup:async o=>{calls.push(o);return {account:{homeAccountId:window.T_msAcct}};}};
    window.T_msAcct='acct-B';
    await T_run(()=>forgotPin(),[{choose:'Microsoft'}]);
    const unchanged=await pinVerify('4680');
    window.T_msAcct='acct-A';
    await T_run(()=>forgotPin(),[{choose:'Microsoft'},'8642','8642',false]);
    const out={calls:calls.map(c=>c.prompt),unchanged,newPin:await pinVerify('8642')};
    window._gAcct=null;window._msal=null;return out;});
  chk('Microsoft sign-in is forced to ask for the password (prompt=login)', viaMs.calls.length===2&&viaMs.calls.every(p=>p==='login'), JSON.stringify(viaMs.calls));
  chk('a different Microsoft account is refused', viaMs.unchanged);
  chk('the linked account sets a new PIN', viaMs.newPin);

  console.log('\n═══ "Forgot passphrase?" in the unlock prompt and Settings');
  const pwhere = await page.evaluate(async()=>{_encKey=null;await encRemClear();
    const p=ensureEncKey(_encMeta.salt,true).catch(()=>'cancelled');await T_wait(80);const d=T_dlg();
    askResolve(null);await p;nav('settings');
    return {alt:d&&d.alt,settings:[...document.querySelectorAll('#main button')].map(b=>b.textContent).filter(t=>/passphrase/i.test(t)),
      msLinks:[...document.querySelectorAll('#main a[href*="password"]')].map(a=>a.getAttribute('rel'))};});
  chk('the unlock prompt links to it', pwhere.alt==='Forgot passphrase?', String(pwhere.alt));
  chk('Settings has Change and Forgot passphrase', pwhere.settings.includes('Change passphrase')&&pwhere.settings.includes('Forgot passphrase?'), JSON.stringify(pwhere.settings));
  chk('OneDrive card links to Microsoft password reset (noopener)', pwhere.msLinks.length===2&&pwhere.msLinks.every(r=>/noopener/.test(r)), JSON.stringify(pwhere.msLinks));

  console.log('\n═══ a device with no data cannot replace the passphrase');
  const empty = await page.evaluate(async()=>{const keep=JSON.parse(JSON.stringify(getState()));
    ['tasks','customers','people','meetings','fintx','invhold','loans','family','ious'].forEach(t=>window[t]=[]);
    const salt0=_encMeta.salt;const seen=await T_run(()=>forgotPassphrase(),[true]);
    applyState(keep);return {msg:seen[0]&&seen[0].msg,same:_encMeta.salt===salt0};});
  chk('it explains instead of overwriting db.json with nothing', /no copy of your data/.test(empty.msg||'')&&empty.same, (empty.msg||'').slice(0,60));

  console.log('\n═══ forgot passphrase: new passphrase, old file kept aside');
  const fp = await page.evaluate(async()=>{
    const n=now();tasks.push({id:'keep1',title:'Keep me',type:'task',owner:'me',due:today(),status:'open',created_at:n,updated_at:n});
    // a linked folder, in memory, holding db.json encrypted with the CURRENT passphrase
    _encKey=await deriveKey('open sesame 9',_encMeta.salt);const oldFile=await serializeDb({silent:true});const oldSalt=_encMeta.salt;
    const files={'db.json':oldFile};window.T_files=files;
    _fsDir={name:'mock',removeEntry:async n=>{delete files[n];},getFileHandle:async(nm,o)=>{if(!(nm in files)){if(o&&o.create)files[nm]='';else{const e=new Error('nf');e.name='NotFoundError';throw e;}}
      return{getFile:async()=>({text:async()=>files[nm],lastModified:1}),createWritable:async()=>{let buf='';return{write:async d=>{buf+=d;},close:async()=>{files[nm]=buf;}};}};}};
    _encKey=null;await encRemClear();
    const seen=await T_run(()=>forgotPassphrase(),[true,{choose:'Personal PIN'},'8642','brand new pass','brand new pass']);
    const bak=Object.keys(files).find(k=>/^db-before-reset-.*\.json$/.test(k));
    const env=JSON.parse(files['db.json']);
    const back=await parseDb(files['db.json']);
    return {warn:seen[0].msg,choices:seen[1].choices,bakSame:bak&&files[bak]===oldFile,oldSalt,newSalt:env.salt,
      readable:back.tasks.some(t=>t.id==='keep1'),remembered:_encRemUntil>Date.now()};});
  chk('it warns what will not carry over', /other devices since this one last synced/.test(fp.warn));
  chk('proof is required (PIN offered here)', fp.choices.some(c=>/Personal PIN/.test(c)), JSON.stringify(fp.choices));
  chk('the old db.json is saved aside unchanged', fp.bakSame===true);
  chk('db.json is re-encrypted with a new salt', fp.newSalt&&fp.newSalt!==fp.oldSalt);
  chk('and decrypts to this device\'s data', fp.readable);
  chk('the new passphrase is remembered on this device', fp.remembered);

  console.log('\n═══ another device picks up the new passphrase');
  const other = await page.evaluate(async()=>{
    const newFile=T_files['db.json'],newSalt=JSON.parse(newFile).salt;
    // pretend to be a device that still has the OLD salt and a remembered old key
    const oldSalt=b64(crypto.getRandomValues(new Uint8Array(16)));
    _encMeta={on:true,salt:oldSalt};_encKey=await deriveKey('open sesame 9',oldSalt);
    let failed=false;try{await parseDb(newFile);}catch(e){failed=true;}
    const p=parseDb(newFile);await T_wait(80);const d=T_dlg();askResolve('brand new pass');const back=await p;
    const out=JSON.parse(await serializeDb({silent:true}));
    return {failed,msg:d&&d.msg,read:back.tasks.some(t=>t.id==='keep1'),adopted:_encMeta.salt===newSalt,writesNew:out.salt===newSalt};});
  chk('the old key fails cleanly', other.failed);
  chk('the prompt says the passphrase changed elsewhere', /re-encrypted with a new passphrase on another device/.test(other.msg||''), (other.msg||'').slice(0,70));
  chk('the new passphrase opens the file', other.read);
  chk('that device adopts the new salt, so its saves stay readable everywhere', other.adopted&&other.writesNew);

  console.log('\n═══ change passphrase (current one known)');
  const cp = await page.evaluate(async()=>{
    const bad=await T_run(()=>changePassphrase(),['not it']);
    const salt0=_encMeta.salt;
    await T_run(()=>changePassphrase(),['brand new pass','third pass ok','third pass ok']);
    const env=JSON.parse(T_files['db.json']);_encKey=null;await encRemClear();
    const p=parseDb(T_files['db.json']);await T_wait(80);askResolve('third pass ok');const back=await p;
    return {unchanged:bad.length===1,changed:env.salt!==salt0,read:back.tasks.some(t=>t.id==='keep1'),
      noBackup:Object.keys(T_files).filter(k=>/before-reset/.test(k)).length===1};});
  chk('a wrong current passphrase is refused', cp.unchanged);
  chk('the file is re-keyed', cp.changed);
  chk('and opens with the new passphrase, data intact', cp.read);
  chk('no backup needed when the old passphrase was known', cp.noBackup);

  console.log('\n═══ last resort: reset this device');
  const r0 = await page.evaluate(async()=>{_fsDir=null;
    const seen=await T_run(()=>forgotPin(),[{choose:'reset this device'},'nope']);
    return {msg:seen[1]&&seen[1].msg,pin:pinIsSet()};});
  chk('it spells out what is erased and how to get data back', /erases everything/.test(r0.msg||'')&&/passphrase/.test(r0.msg||''), (r0.msg||'').slice(0,60));
  chk('anything but RESET erases nothing', r0.pin);
  await page.evaluate(async()=>{const p=forgotPin();for(let i=0;i<40&&!T_dlg();i++)await T_wait(25);
    [...document.querySelectorAll('#askChoices button')].find(b=>/reset this device/.test(b.textContent)).click();
    for(let i=0;i<40&&!(T_dlg()&&T_dlg().title==='Reset this device');i++)await T_wait(25);askResolve('RESET');});
  await page.waitForTimeout(1200); await boot();
  const after = await page.evaluate(async()=>({pin:pinIsSet(),enc:!!_encMeta,
    keep:tasks.some(t=>t.id==='keep1'),
    idb:await new Promise(res=>{const r=indexedDB.open('cx_fs',1);r.onupgradeneeded=()=>r.result.createObjectStore('h');
      r.onsuccess=()=>{const q=r.result.transaction('h').objectStore('h').get('enc');q.onsuccess=()=>res(!!q.result);};})}));
  chk('after RESET: no PIN, no encryption settings, no local data', !after.pin&&!after.enc&&!after.keep, JSON.stringify(after));
  chk('...and no remembered key', after.idb===false);

  await page.evaluate(()=>{try{localStorage.clear();}catch(e){}});
  console.log('\n---page errors---', JSON.stringify(errs.slice(0,4)));
  if(errs.length){FAIL++;console.log('  FAIL  page threw');}
  console.log(FAIL===0?'\n*** W15 FORGOT / RESET: ALL PASS ***':`\n*** W15 FORGOT / RESET: ${FAIL} FAILURE(S) ***`);
  await b.close();
  process.exit(FAIL?1:0);
})();
