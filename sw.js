const CACHE='dayline-shell-v3-collaboration';
const APP=['./','./index.html','./styles.css','./timeline.js','./app.js','./config.js','./manifest.webmanifest','./icon.svg'];
const EXTERNAL=['fonts.googleapis.com','fonts.gstatic.com','cdn.jsdelivr.net'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('dayline-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);if(req.method!=='GET')return;
 // Never cache Auth, database calls, signed file URLs, or private user data.
 if(url.origin!==self.location.origin&&!EXTERNAL.includes(url.hostname))return;
 const same=url.origin===self.location.origin;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  if(!same){const cached=await cache.match(req);if(cached)return cached;}
  try{const response=await fetch(req);if(response.ok||response.type==='opaque')await cache.put(req,response.clone());return response;}
  catch{const cached=await cache.match(req);if(cached)return cached;if(req.mode==='navigate')return cache.match('./index.html');return Response.error();}
 })());
});
