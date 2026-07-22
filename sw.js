var CACHE = 'atlas-v25';
var SHELL = [
  '/ctsantiagofleitas/',
  '/ctsantiagofleitas/index.html',
  '/ctsantiagofleitas/player.html',
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
  if(e.request.url.indexOf('cdnjs.cloudflare.com') >= 0){
    e.respondWith(
      caches.match(e.request).then(function(r){ return r || fetch(e.request); })
    );
    return;
  }
  // App shell: red primero, cache como fallback
  e.respondWith(
    fetch(e.request).then(function(r){
      var copy = r.clone();
      caches.open(CACHE).then(function(c){ c.put(e.request, copy); });
      return r;
    }).catch(function(){
      return caches.match(e.request)
        .then(function(r){ return r || caches.match('/ctsantiagofleitas/'); });
    })
  );
});
