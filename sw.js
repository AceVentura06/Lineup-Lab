// Ace Lineup Lab service worker: keeps a copy of the page and its data so the app opens
// with weak or no signal. Always tries the network first (projections change often) and
// falls back to the saved copy after a few seconds. Live scores and league APIs are never cached.
const CACHE = 'lineup-lab-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const sameOrigin = url => url.origin === self.location.origin;
const isFont = url => /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);

// network first; the saved copy if the network is slow (4s) or down
function networkFirst(req, key) {
  return caches.open(CACHE).then(cache => new Promise(resolve => {
    let done = false;
    const fallback = () => cache.match(key, { ignoreSearch: true }).then(hit => hit || null);
    const timer = setTimeout(() => fallback().then(hit => { if (hit && !done) { done = true; resolve(hit); } }), 4000);
    fetch(req).then(res => {
      if (res && res.ok) cache.put(key, res.clone());
      clearTimeout(timer);
      if (!done) { done = true; resolve(res); }
    }).catch(() => {
      clearTimeout(timer);
      fallback().then(hit => { if (!done) { done = true; resolve(hit || Response.error()); } });
    });
  }));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (sameOrigin(url)) {
    if (req.mode === 'navigate') return e.respondWith(networkFirst(req, './index.html'));
    // data files carry a ?v= stamp; keep one copy per file
    return e.respondWith(networkFirst(req, url.pathname));
  }
  if (isFont(url)) {
    e.respondWith(caches.open(CACHE).then(c => c.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }))));
  }
  // everything else (league APIs, live scores, news photos, headshots) goes straight to the network
});
