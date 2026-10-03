/* W14 acceptance — the db.json passphrase is remembered per device for a fixed window.
   What must hold: no prompt on relaunch inside the window; a prompt again once it lapses; daily use
   does not stretch the window; a wrong passphrase is never remembered (or used to write the file);
   the key cannot be read back out; and every way of turning it off actually forgets it. */
const { chromium } = require('playwright');
let FAIL=0;
const chk=(n,ok,d)=>{console.log(`  ${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`); if(!ok)FAIL++;};
const URL_=process.env.CLARIO_URL || 'http://localhost:8934/index.html';
const PASS='correct horse 42';

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport:{width:1300,height:950} });
  const page = await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  const askOpen=()=>page.evaluate(()=>document.getElementById('mAsk').classList.contains('open')?document.getElementById('askTitle').textContent:null);
  // the location check can open #mAsk on boot; only that one is dismissed
  const boot=async()=>{await page.waitForTimeout(300);
    if(await page.evaluate(()=>document.getElementById('mAsk').classList.contains('open')&&document.getElementById('askTitle').textContent!=='Unlock db.json'))
      await page.evaluate(()=>askResolve(null));
    await page.waitForTimeout(1500);};
  const rec=()=>page.evaluate(()=>new Promise(res=>{const r=indexedDB.open('cx_fs',1);r.onupgradeneeded=()=>r.result.createObjectStore('h');
    r.onsuccess=()=>{const q=r.result.transaction('h').objectStore('h').get('enc');q.onsuccess=()=>{const v=q.result;
      res(v?{until:v.until,salt:v.salt,type:v.key&&v.key.type,extractable:v.key&&v.key.extractable,usages:v.key&&v.key.usages}:null);};};}));
  const setUntil=ms=>page.evaluate(ms=>new Promise(res=>{const r=indexedDB.open('cx_fs',1);r.onsuccess=()=>{const t=r.result.transaction('h','readwrite');
    const st=t.objectStore('h');const q=st.get('enc');q.onsuccess=()=>{const v=q.result;v.until=ms;st.put(v,'enc');};t.oncomplete=res;};}),ms);

  await page.goto(URL_); await boot();
  await page.evaluate(()=>{try{localStorage.clear();}catch(e){}});
  await page.reload(); await boot();

  console.log('\n═══ turning encryption on remembers the new passphrase');
  const on = await page.evaluate(async P=>{
    const p=enableEnc();
    await new Promise(r=>setTimeout(r,60));askResolve(P);
    await new Promise(r=>setTimeout(r,60));askResolve(P);
    await p;
    const enc=await serializeDb({silent:true});
    return {on:!!(_encMeta&&_encMeta.on), hasChk:!!(_encMeta&&_encMeta.chk), enc:JSON.parse(enc).clarioEnc===1};
  },PASS);
  const r1=await rec();
  chk('encryption is on and the file is encrypted', on.on&&on.enc);
  chk('a check value is kept so typos can be caught', on.hasChk);
  chk('the key is remembered for 7 days by default', r1 && Math.abs(r1.until-(Date.now()+7*864e5))<120000, r1&&new Date(r1.until).toISOString());
  chk('the stored key cannot be read out (non-extractable)', r1 && r1.type==='secret' && r1.extractable===false, JSON.stringify(r1));
  const exp = await page.evaluate(async()=>{try{await crypto.subtle.exportKey('raw',_encKey);return 'EXPORTED';}catch(e){return 'refused';}});
  chk('exportKey on it is refused', exp==='refused', exp);

  console.log('\n═══ relaunch inside the window: no prompt');
  const before=r1.until;
  await page.reload(); await boot();
  const ask1=await askOpen();
  const rt = await page.evaluate(async()=>{const t=await serializeDb({silent:true});const back=await parseDb(t);
    return {unlocked:!!_encKey, roundTrip:Array.isArray(back.tasks)};});
  chk('no passphrase prompt after a reload', ask1!=='Unlock db.json', String(ask1));
  chk('the file encrypts and decrypts with the remembered key', rt.unlocked&&rt.roundTrip, JSON.stringify(rt));
  chk('using it does not extend the window', (await rec()).until===before);
  await page.evaluate(()=>{setMode('official');nav('settings');});
  const st1 = await page.evaluate(()=>({sel:document.getElementById('encRemSel')&&document.getElementById('encRemSel').value,
    status:(()=>{const c=[...document.querySelectorAll('.setcard')].find(x=>x.querySelector('h4')&&x.querySelector('h4').textContent==='Encryption');
      return c?[...c.querySelectorAll('.srow')].map(r=>r.textContent).find(t=>/Status/.test(t)):null;})()}));
  chk('Settings shows 7 days and the expiry', st1.sel==='7'&&/Remembered until/.test(st1.status||''), JSON.stringify(st1));

  console.log('\n═══ once the window lapses it asks again');
  await setUntil(Date.now()-1000);
  await page.reload(); await boot();
  chk('prompt shown after expiry', await askOpen()==='Unlock db.json');
  chk('the prompt says how long it will remember', await page.evaluate(()=>/remember it for 7 days/.test(document.getElementById('askMsg').textContent)));
  chk('the expired key was deleted', (await rec())===null);

  console.log('\n═══ a wrong passphrase is refused and never remembered');
  const wrong = await page.evaluate(async()=>{document.getElementById('askInput').value='nope';askResolve('nope');
    await new Promise(r=>setTimeout(r,900));return {key:!!_encKey};});
  chk('wrong passphrase leaves it locked', wrong.key===false);
  chk('nothing remembered', (await rec())===null);
  const wroteBad = await page.evaluate(async()=>{try{await serializeDb({silent:true});return 'wrote';}catch(e){return e.message;}});
  chk('nothing can be written with it', wroteBad==='no pass', wroteBad);

  console.log('\n═══ the right passphrase starts a fresh window');
  const right = await page.evaluate(async P=>{const p=ensureEncKey(_encMeta.salt,true);await new Promise(r=>setTimeout(r,60));
    askResolve(P);await p;return !!_encKey;},PASS);
  const r2=await rec();
  chk('unlocked', right);
  chk('remembered for another 7 days from now', r2 && Math.abs(r2.until-(Date.now()+7*864e5))<120000);

  console.log('\n═══ settings: shorter, every launch, forget');
  await page.evaluate(()=>{nav('settings');});
  await page.selectOption('#encRemSel','1'); await page.waitForTimeout(300);
  const r3=await rec();
  chk('1 day re-times the window', r3 && Math.abs(r3.until-(Date.now()+864e5))<120000);
  await page.selectOption('#encRemSel','0'); await page.waitForTimeout(300);
  chk('"Ask every launch" forgets the key', (await rec())===null);
  await page.reload(); await boot();
  chk('...and the next launch asks', await askOpen()==='Unlock db.json');
  await page.evaluate(async P=>{askResolve(P);await new Promise(r=>setTimeout(r,900));},PASS);
  chk('typing it with "every launch" set stores nothing', (await rec())===null);
  await page.evaluate(async()=>{localStorage.setItem('cx_enc_remember','7');await encRemSave(true);nav('settings');});
  chk('remembered again once set back to 7 days', !!(await rec()));
  await page.click('button:has-text("Forget on this device")'); await page.waitForTimeout(300);
  chk('"Forget on this device" deletes it', (await rec())===null);

  console.log('\n═══ a device set up before this update (no check value)');
  const legacy = await page.evaluate(async P=>{
    const file=await serializeDb({silent:true});              // an encrypted db.json as OneDrive would hold it
    await encRemClear();delete _encMeta.chk;localStorage.setItem('cx_enc',JSON.stringify(_encMeta));_encKey=null;
    const p=ensureEncKey(_encMeta.salt,true);await new Promise(r=>setTimeout(r,60));askResolve(P);await p;
    const beforeDecrypt=await new Promise(res=>{const r=indexedDB.open('cx_fs',1);r.onsuccess=()=>{const q=r.result.transaction('h').objectStore('h').get('enc');q.onsuccess=()=>res(!!q.result);};});
    await parseDb(file);                                         // first successful pull proves the passphrase
    return {beforeDecrypt, chk:!!_encMeta.chk};},PASS);
  chk('not remembered until the passphrase is proven', legacy.beforeDecrypt===false);
  chk('remembered after the first good decrypt', !!(await rec()));
  chk('a check value is created for next time', legacy.chk);

  console.log('\n═══ turning encryption off forgets it too');
  await page.evaluate(async()=>{await encRemSave(true);});
  chk('(re-remembered for this check)', !!(await rec()));
  await page.evaluate(async()=>{const p=disableEnc();await new Promise(r=>setTimeout(r,60));askResolve(true);await p;});
  chk('disabling encryption deletes the remembered key', (await rec())===null);
  const plain = await page.evaluate(async()=>{const t=await serializeDb({silent:true});return !JSON.parse(t).clarioEnc;});
  chk('and the file is written plain again', plain);

  await page.evaluate(()=>{try{localStorage.clear();}catch(e){}});
  console.log('\n---page errors---', JSON.stringify(errs.slice(0,4)));
  if(errs.length){FAIL++;console.log('  FAIL  page threw');}
  console.log(FAIL===0?'\n*** W14 PASSPHRASE MEMORY: ALL PASS ***':`\n*** W14 PASSPHRASE MEMORY: ${FAIL} FAILURE(S) ***`);
  await b.close();
  process.exit(FAIL?1:0);
})();
