const CACHE_NAME='night-flow-shell-v4';
const APP_SHELL=['./','./index.html','./manifest.webmanifest','./assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/js/island-3d.js',
  './assets/vendor/three.module.js',
  './assets/vendor/three.core.js',
  './assets/vendor/THREE-LICENSE.txt','./assets/game/island-scene.svg','./assets/game/facility-research.svg','./assets/game/facility-dock.svg','./assets/game/facility-habitat.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)))));self.clients.claim();});
self.addEventListener('fetch',event=>{const request=event.request;if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;event.respondWith(caches.match(request).then(cached=>{if(cached)return cached;return fetch(request).then(response=>{if(response&&response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(request,copy));}return response;}).catch(()=>caches.match('./index.html'));}));});
