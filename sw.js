// Kanal İzle — kurulabilir uygulama için hizmet betiği
// Uygulamanın kendi dosyalarını saklar; yayınlara (başka sitelere) dokunmaz.
const ONBELLEK = 'kanal-izle-v12';
const DOSYALAR = ['./', './index.html', './manifest.webmanifest', './ikon-192.png', './ikon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(ONBELLEK).then((c) => c.addAll(DOSYALAR)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((adlar) => Promise.all(adlar.filter((a) => a !== ONBELLEK).map((a) => caches.delete(a)))).then(() => self.clients.claim()));
});
// Önce internetten dener (yeni sürüm hemen gelsin), internet yoksa saklanan kopyayı açar
self.addEventListener('fetch', (e) => {
  const istek = e.request;
  if (istek.method !== 'GET' || new URL(istek.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(istek).then((yanit) => {
      if (yanit.ok) { const kopya = yanit.clone(); caches.open(ONBELLEK).then((c) => c.put(istek, kopya)); }
      return yanit;
    }).catch(() => caches.match(istek, { ignoreSearch: true }).then((y) => y || caches.match('./index.html')))
  );
});
