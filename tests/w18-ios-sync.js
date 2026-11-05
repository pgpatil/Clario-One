/* W18 — OneDrive sync on iPhone/iPad: sign-in by redirect, automatic renewal, nothing left unsynced.
   Microsoft gives browser apps 24-hour refresh tokens and then renews in a hidden iframe, which
   Safari always blocks; popups cannot hand a result back in an installed iOS app. So on iOS every
   interactive step must be a redirect and renewal must happen by itself. MSAL is replaced by a
   recording stub (served in place of the vendored file) so the test sees exactly which call the
   app makes; OneDrive is a small in-memory fake with ETags. */
const { chromium, devices } = require('playwright');
let FAIL=0;
const chk=(n,ok,d)=>{console.log(`  ${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`); if(!ok)FAIL++;};
const URL_=process.env.CLARIO_URL || 'http://localhost:8934/index.html';
const ACCT={homeAccountId:'acct-A',username:'user@example.com'};

const STUB=`window.msal={PublicClientApplication:class{
  constructor(c){this.c=c;}
  cfg(){try{return JSON.parse(sessionStorage.getItem('__msal')||'{}');}catch(e){return {};}}
  log(n,a){const L=JSON.parse(sessionStorage.getItem('__calls')||'[]');
    L.push({n,prompt:a&&a.prompt,state:a&&a.state,nav:a&&typeof a.onRedirectNavigate==='function'?a.onRedirectNavigate():undefined});
    sessionStorage.setItem('__calls',JSON.stringify(L));}
  async handleRedirectPromise(){const c=this.cfg(),r=c.redirect;delete c.redirect;sessionStorage.setItem('__msal',JSON.stringify(c));
    if(!r)return null;if(r.error){const e=new Error(r.error);e.errorCode=r.error;e.name='InteractionRequiredAuthError';throw e;}return r;}
  getAllAccounts(){const c=this.cfg();return c.account?[c.account]:[];}
  async acquireTokenSilent(){const c=this.cfg();this.log('silent');
    if(c.expired){const e=new Error('interaction_required');e.name='InteractionRequiredAuthError';e.errorCode='interaction_required';throw e;}
    return {accessToken:'tok'};}
  async loginRedirect(a){this.log('loginRedirect',a);}
  async acquireTokenRedirect(a){this.log('acquireTokenRedirect',a);}
  async loginPopup(a){this.log('loginPopup',a);return {account:this.cfg().account};}
  async acquireTokenPopup(a){this.log('acquireTokenPopup',a);return {account:this.cfg().popupAccount||this.cfg().account};}
  async logoutRedirect(a){this.log('logoutRedirect',a);}
  async logoutPopup(a){this.log('logoutPopup',a);}
}};`;

const remote={body:null,m:'',etag:'',n:0,puts:0,gets:0};
async function device(b,profile){
  const ctx=await b.newContext(profile);const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(e.message));page.errs=errs;
  await page.route('**/msal-browser-2.38.1.min.js',r=>r.fulfill({status:200,contentType:'application/javascript',body:STUB}));
  await page.route('https://graph.microsoft.com/**',async route=>{const req=route.request(),u=req.url();
    if(req.method()==='PUT'){const im=req.headers()['if-match'];if(im&&remote.etag&&im!==remote.etag)return route.fulfill({status:412,body:''});
      remote.n++;remote.puts++;remote.body=req.postData();remote.m=new Date(Date.now()+remote.n*1000).toISOString();remote.etag='"e'+remote.n+'"';
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({lastModifiedDateTime:remote.m,eTag:remote.etag})});}
    if(!remote.body)return route.fulfill({status:404,body:''});
    if(/:\/content/.test(u)){remote.gets++;return route.fulfill({status:200,contentType:'application/json',headers:{ETag:remote.etag},body:remote.body});}
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({lastModifiedDateTime:remote.m,eTag:remote.etag})});});
  return page;}
const boot=async(page,msalCfg,opts={})=>{
  await page.goto(URL_);
  await page.evaluate(([c,keep])=>{if(!keep){try{localStorage.clear();}catch(e){}}
    localStorage.setItem('cx_graph',JSON.stringify({clientId:'test-client'}));
    sessionStorage.setItem('__msal',JSON.stringify(c));sessionStorage.setItem('__calls','[]');},[msalCfg,!!opts.keep]);
  await page.reload();await page.waitForTimeout(700);
  await page.evaluate(()=>{ if(document.getElementById('mAsk').classList.contains('open')&&document.getElementById('askTitle').textContent!=='Personal PIN') askResolve(null); });};
const calls=page=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('__calls')||'[]'));
const reauthShown=page=>page.evaluate(()=>document.getElementById('reauthbar').classList.contains('show'));

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const IPHONE={...devices['iPhone 13']};delete IPHONE.defaultBrowserType;
  const DESKTOP={viewport:{width:1300,height:900},userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0'};

  console.log('\n═══ which sign-in method each device uses');
  { const ph=await device(b,IPHONE);await ph.goto(URL_);await ph.waitForTimeout(300);
    const ua=await ph.evaluate(()=>gUseRedirect());
    const ipad=await ph.evaluate(()=>{Object.defineProperty(navigator,'userAgent',{value:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',configurable:true});
      Object.defineProperty(navigator,'platform',{value:'MacIntel',configurable:true});Object.defineProperty(navigator,'maxTouchPoints',{value:5,configurable:true});return gUseRedirect();});
    const dk=await device(b,DESKTOP);await dk.goto(URL_);await dk.waitForTimeout(300);
    const desk=await dk.evaluate(()=>gUseRedirect());
    chk('iPhone uses redirects', ua===true);
    chk('iPad (reports itself as a Mac) uses redirects', ipad===true);
    chk('desktop Edge/Chrome keeps the popup', desk===false);
    await ph.context().close();await dk.context().close(); }

  console.log('\n═══ iPhone: sign in, reconnect and sign out never use a popup');
  { const ph=await device(b,IPHONE);await boot(ph,{});
    await ph.evaluate(async()=>{nav('settings');const i=document.getElementById('gClient');if(i)i.value='test-client';await gSignIn();});
    let c=await calls(ph);
    chk('Sign in → full-page redirect', c.some(x=>x.n==='loginRedirect'&&x.state==='clario:signin')&&!c.some(x=>x.n==='loginPopup'), JSON.stringify(c.map(x=>x.n)));
    await boot(ph,{account:{homeAccountId:'acct-A',username:'user@example.com'}});
    await ph.evaluate(async()=>{await gReconnect();});c=await calls(ph);
    chk('Reconnect → redirect', c.some(x=>x.n==='acquireTokenRedirect'&&x.state==='clario:reconnect')&&!c.some(x=>x.n==='acquireTokenPopup'), JSON.stringify(c.map(x=>x.n+':'+x.state)));
    await ph.evaluate(()=>{sessionStorage.setItem('__calls','[]');gSignOut();});await ph.waitForTimeout(100);c=await calls(ph);
    chk('Sign out clears the sign-in without opening any Microsoft window', c.some(x=>x.n==='logoutRedirect'&&x.nav===false)&&!c.some(x=>x.n==='logoutPopup'), JSON.stringify(c));
    chk('no page errors', ph.errs.length===0, ph.errs.slice(0,2).join(' | '));
    await ph.context().close(); }

  console.log('\n═══ iPhone: the 24-hour sign-in runs out → renewed by itself');
  { const ph=await device(b,IPHONE);await boot(ph,{account:ACCT,expired:true});
    let c=await calls(ph);
    const auto=c.find(x=>x.n==='acquireTokenRedirect');
    chk('at launch it renews with a silent redirect (no password prompt)', auto&&auto.prompt==='none'&&auto.state==='clario:auto', JSON.stringify(c.map(x=>x.n+':'+(x.prompt||''))));
    chk('the Reconnect banner is up in case it cannot', await reauthShown(ph));
    // page comes back from Microsoft with a fresh token
    await boot(ph,{account:ACCT,redirect:{account:ACCT,state:'clario:auto'}},{keep:true});
    chk('back from Microsoft: banner gone, sync running', !(await reauthShown(ph))&&await ph.evaluate(()=>gActive()&&!_gNeedsReauth));
    // a dead Microsoft session: the silent redirect comes back with an error -- no loop
    await ph.evaluate(()=>localStorage.removeItem('cx_g_auto'));
    await boot(ph,{account:ACCT,expired:true},{keep:true});
    await boot(ph,{account:ACCT,expired:true,redirect:{error:'login_required'}},{keep:true});
    c=await calls(ph);
    chk('if Microsoft needs the password: banner, and no second automatic redirect', await reauthShown(ph)&&!c.some(x=>x.n==='acquireTokenRedirect'), JSON.stringify(c.map(x=>x.n)));
    await boot(ph,{account:ACCT,expired:true},{keep:true});c=await calls(ph);
    chk('relaunching within 6 hours does not try again (cannot loop)', !c.some(x=>x.n==='acquireTokenRedirect'));
    await ph.evaluate(async()=>{await gReconnect();});c=await calls(ph);
    chk('one tap on Reconnect still works', c.some(x=>x.n==='acquireTokenRedirect'&&x.state==='clario:reconnect'));
    chk('no page errors', ph.errs.length===0, ph.errs.slice(0,2).join(' | '));
    await ph.context().close(); }

  console.log('\n═══ never interrupts you mid-typing');
  { const ph=await device(b,IPHONE);await boot(ph,{account:ACCT});
    const r=await ph.evaluate(async()=>{localStorage.removeItem('cx_g_auto');
      const c=JSON.parse(sessionStorage.getItem('__msal'));c.expired=true;sessionStorage.setItem('__msal',JSON.stringify(c));sessionStorage.setItem('__calls','[]');
      nav('home');const q=document.getElementById('qaInput');q.focus();q.value='half-typed';
      try{await gToken();}catch(e){}
      const typing=JSON.parse(sessionStorage.getItem('__calls')).filter(x=>x.n==='acquireTokenRedirect').length;
      q.blur();try{await gToken();}catch(e){}
      const idle=JSON.parse(sessionStorage.getItem('__calls')).filter(x=>x.n==='acquireTokenRedirect').length;
      return {typing,idle};});
    chk('no redirect while a field has focus', r.typing===0);
    chk('it happens once you stop', r.idle===1, JSON.stringify(r));
    await ph.context().close(); }

  console.log('\n═══ desktop keeps popups and does not redirect on its own');
  { const dk=await device(b,DESKTOP);await boot(dk,{account:ACCT,expired:true});
    let c=await calls(dk);
    chk('expiry shows the banner but does not navigate away', await reauthShown(dk)&&!c.some(x=>x.n==='acquireTokenRedirect'));
    await dk.evaluate(async()=>{await gReconnect();});c=await calls(dk);
    chk('Reconnect uses the popup there', c.some(x=>x.n==='acquireTokenPopup')&&!c.some(x=>x.n==='acquireTokenRedirect'));
    await dk.context().close(); }

  console.log('\n═══ nothing is left unsynced when iOS closes the app');
  { remote.body=null;remote.n=0;remote.etag='';remote.puts=0;
    const ph=await device(b,IPHONE);await boot(ph,{account:ACCT});
    await ph.waitForTimeout(300);const p0=remote.puts;
    await ph.evaluate(()=>{const n=now();tasks.push({id:'kill1',title:'Typed just before iOS closed the app',type:'task',owner:'me',due:today(),status:'open',created_at:n,updated_at:n});persist();});
    const flag=await ph.evaluate(()=>localStorage.getItem('cx_g_dirty'));
    await ph.reload();await ph.waitForTimeout(1200);          // killed inside the 1.2 s save delay
    const inFile=!!remote.body&&JSON.parse(remote.body).tasks.some(t=>t.id==='kill1');
    chk('the pending upload is remembered across a restart', flag==='1');
    chk('…and sent on the next launch', remote.puts>p0&&inFile, `puts ${p0}→${remote.puts}`);
    chk('the flag clears once uploaded', !(await ph.evaluate(()=>localStorage.getItem('cx_g_dirty'))));
    // coming back to the app pulls at once (iOS pauses the 20-second timer in the background)
    const other=JSON.parse(remote.body);other.tasks.push({id:'lap1',title:'Added on the laptop',type:'task',owner:'me',due:'2026-11-05',status:'open',created_at:'z',updated_at:'z'});
    remote.n++;remote.body=JSON.stringify(other);remote.m=new Date(Date.now()+remote.n*1000+60000).toISOString();remote.etag='"e'+remote.n+'"';
    await ph.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await ph.waitForTimeout(500);
    chk('returning to the app pulls the latest straight away', await ph.evaluate(()=>tasks.some(t=>t.id==='lap1')));
    await ph.context().close(); }

  console.log('\n═══ "Verify with Microsoft" for Forgot PIN works on iPhone');
  { const ph=await device(b,IPHONE);await boot(ph,{account:ACCT});
    await ph.evaluate(async()=>{const s=b64(crypto.getRandomValues(new Uint8Array(16)));_pinCfg={salt:s,hash:await pinHash('1111',s)};localStorage.setItem('cx_pin',JSON.stringify(_pinCfg));
      const p=forgotPin();await new Promise(r=>setTimeout(r,80));
      [...document.querySelectorAll('#askChoices button')].find(x=>/Microsoft/.test(x.textContent)).click();await p;});
    let c=await calls(ph);
    chk('the Microsoft check is a redirect with a password prompt', c.some(x=>x.n==='acquireTokenRedirect'&&x.prompt==='login'&&x.state==='clario:prove:pin'), JSON.stringify(c.map(x=>x.n+':'+x.state)));
    await boot(ph,{account:ACCT,redirect:{account:ACCT,state:'clario:prove:pin'}},{keep:true});await ph.waitForTimeout(600);
    const t=await ph.evaluate(()=>document.getElementById('mAsk').classList.contains('open')?document.getElementById('askTitle').textContent:null);
    chk('back from Microsoft it goes straight to choosing a new PIN', t==='Personal PIN', String(t));
    await ph.evaluate(()=>askResolve(null));
    await ph.evaluate(()=>sessionStorage.setItem('cx_g_proof_for','acct-A'));
    await boot(ph,{account:ACCT,redirect:{account:{homeAccountId:'someone-else',username:'x@example.com'},state:'clario:prove:pin'}},{keep:true});await ph.waitForTimeout(600);
    const t2=await ph.evaluate(()=>document.getElementById('mAsk').classList.contains('open')?document.getElementById('askTitle').textContent:null);
    chk('a different Microsoft account does not skip the check', t2!=='Personal PIN', String(t2));
    chk('…and the linked account stays the one that syncs', await ph.evaluate(()=>_gAcct&&_gAcct.homeAccountId==='acct-A'));
    await ph.context().close(); }

  console.log(FAIL===0?'\n*** W18 iOS SYNC: ALL PASS ***':`\n*** W18 iOS SYNC: ${FAIL} FAILURE(S) ***`);
  await b.close();
  process.exit(FAIL?1:0);
})();
