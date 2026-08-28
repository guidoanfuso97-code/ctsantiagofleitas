var CACHE = 'atlas-v48';
var SUPABASE_URL = 'https://gbgvcipaeipanfciwylg.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZ3ZjaXBhZWlwYW5mY2l3eWxnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NjMzMzgsImV4cCI6MjA5NjIzOTMzOH0.taAZnfsb8YX50DoPVuk1az8YppWZVD_WAiW8oh9kXT8';
var MAX_RETRIES = 3;
var SHELL = [
  '/ctsantiagofleitas/',
  '/ctsantiagofleitas/index.html',
  '/ctsantiagofleitas/checkin.html',
  '/ctsantiagofleitas/player.html',
  '/ctsantiagofleitas/icon.svg',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
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
  if(e.request.url.indexOf('supabase.co') >= 0) return;
  if(e.request.url.indexOf('cdnjs.cloudflare.com') >= 0){
    e.respondWith(
      caches.match(e.request).then(function(r){ return r || fetch(e.request); })
    );
    return;
  }
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

// ── Background Sync ──────────────────────────────
self.addEventListener('sync', function(e){
  if(e.tag === 'atlas-sync'){
    e.waitUntil(bgSync());
  }
});

function swOpenIDB(){
  return new Promise(function(resolve, reject){
    var req = indexedDB.open('atlas_idb', 1);
    req.onsuccess = function(e){ resolve(e.target.result); };
    req.onerror = function(){ reject(new Error('IDB open failed')); };
  });
}
function swIdbGetAll(db, store){
  return new Promise(function(resolve){
    var tx = db.transaction(store, 'readonly');
    var req = tx.objectStore(store).getAll();
    req.onsuccess = function(){ resolve(req.result || []); };
    req.onerror = function(){ resolve([]); };
  });
}
function swIdbDelete(db, key){
  return new Promise(function(resolve){
    var tx = db.transaction('queue', 'readwrite');
    tx.objectStore('queue').delete(key);
    tx.oncomplete = resolve; tx.onerror = resolve;
  });
}
function swIdbPut(db, item){
  return new Promise(function(resolve){
    var tx = db.transaction('queue', 'readwrite');
    tx.objectStore('queue').put(item);
    tx.oncomplete = resolve; tx.onerror = resolve;
  });
}

async function bgSync(){
  var db;
  try{ db = await swOpenIDB(); }catch(e){ return; }
  var items = await swIdbGetAll(db, 'queue');
  var synced = 0;
  var hdrs = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json'
  };
  for(var i = 0; i < items.length; i++){
    var item = items[i];
    if((item.retries || 0) >= MAX_RETRIES) continue;
    var r, ok = false;
    try{
      if(item.method === 'insert' || item.method === 'upsert'){
        r = await fetch(SUPABASE_URL + '/rest/v1/' + item.table, {method:'POST',
          headers: Object.assign({}, hdrs, {'Prefer':'resolution=merge-duplicates,return=minimal'}),
          body: JSON.stringify(item.data)});
      } else if(item.method === 'insertReturn'){
        r = await fetch(SUPABASE_URL + '/rest/v1/' + item.table, {method:'POST',
          headers: Object.assign({}, hdrs, {'Prefer':'return=representation'}),
          body: JSON.stringify(item.data)});
      } else if(item.method === 'update'){
        r = await fetch(SUPABASE_URL + '/rest/v1/' + item.table + '?' + item.filter, {method:'PATCH',
          headers: Object.assign({}, hdrs, {'Prefer':'return=minimal'}),
          body: JSON.stringify(item.data)});
      } else if(item.method === 'delete'){
        r = await fetch(SUPABASE_URL + '/rest/v1/' + item.table + '?' + item.filter, {method:'DELETE',
          headers: hdrs});
      }
      ok = r && r.ok;
    }catch(e){}
    if(ok){
      await swIdbDelete(db, item.id);
      synced++;
    } else {
      if(r && r.status >= 400 && r.status < 500){
        item.retries = MAX_RETRIES; // error permanente
      } else {
        item.retries = (item.retries || 0) + 1;
      }
      await swIdbPut(db, item);
    }
  }
  // Notificar a todos los clientes abiertos
  var clients = await self.clients.matchAll({includeUncontrolled: true});
  clients.forEach(function(client){
    client.postMessage({type: 'SYNC_COMPLETE', synced: synced});
  });
}
