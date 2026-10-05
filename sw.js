const C='clario-v72';
/* App shell only. This worker handles same-origin GETs and nothing else: it used to cache every
   GET, which put copies of Microsoft Graph responses -- db.json contents, file listings -- into
   Cache Storage, where signing out or resetting the device never removed them, and when offline
   it answered a failed Graph call with index.html. Cross-origin requests now go straight to the
   network, untouched and uncached. Bumping C also deletes the old caches that held those copies. */
const SHELL=['./index.html','./manifest.json','./icon-192.png','./icon-512.png','./icon-maskable-512.png','./logo-mark.png','./inter-var.woff2','./msal-browser-2.38.1.min.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(SHELL))); self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  if(new URL(req.url).origin!==self.location.origin)return;     // never touch or store other sites' responses
  e.respondWith(fetch(req).then(r=>{if(r.ok&&r.type==='basic'){const cp=r.clone();caches.open(C).then(c=>c.put(req,cp));}return r;})
    .catch(()=>caches.match(req).then(m=>m||(req.mode==='navigate'?caches.match('./index.html'):Response.error()))));
});
