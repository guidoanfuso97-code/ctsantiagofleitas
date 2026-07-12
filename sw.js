var CACHE = 'atlas-v14';
var SHELL = [
  '/ctsantiagofleitas/icon.svg',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js'
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){ return c.addAll(SHELL); })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(
        keys.filter(function(k){ return k !== CACHE; })
            .map(function(k){ return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e){
  // Supabase y CDN externo: siempre red
  if(e.request.url.indexOf('supabase.co') >= 0) return;
  // index.html: siempre red para garantizar version actualizada
  if(e.request.url.indexOf('index.html') >= 0 || e.request.url.endsWith('/ctsantiagofleitas/') || e.request.url.endsWith('/ctsantiagofleitas')) return;
  // Resto: cache first
  e.respondWith(
    caches.match(e.request).then(function(cached){
      return cached || fetch(e.request).then(function(resp){
        return caches.open(CACHE).then(function(c){
          c.put(e.request, resp.clone());
          return resp;
        });
      });
    })
  );
});
