const build = 'lagoon-0.46.1-e5d1f0ad55d5';
const prefix = 'lagoon-offline:' + self.registration.scope + ':';
const cacheName = prefix + build;
const files = ["lagoon-0.46.1-e5d1f0ad55d5.apple-touch-icon.png", "lagoon-0.46.1-e5d1f0ad55d5.audio.position.worklet.js", "lagoon-0.46.1-e5d1f0ad55d5.audio.worklet.js", "lagoon-0.46.1-e5d1f0ad55d5.cloud-saves.js", "lagoon-0.46.1-e5d1f0ad55d5.html", "lagoon-0.46.1-e5d1f0ad55d5.icon.png", "lagoon-0.46.1-e5d1f0ad55d5.js", "lagoon-0.46.1-e5d1f0ad55d5.offline.js", "lagoon-0.46.1-e5d1f0ad55d5.pck", "lagoon-0.46.1-e5d1f0ad55d5.png", "lagoon-0.46.1-e5d1f0ad55d5.pwa-192.png", "lagoon-0.46.1-e5d1f0ad55d5.pwa-512.png", "lagoon-0.46.1-e5d1f0ad55d5.touch.js", "lagoon-0.46.1-e5d1f0ad55d5.wasm", "lagoon-0.46.1-e5d1f0ad55d5.webmanifest"];
const entry = new URL(build + '.html', self.registration.scope).href;
const scope = new URL(self.registration.scope);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    try {
      await cache.addAll(files);
    } catch (error) {
      await caches.delete(cacheName);
      throw error;
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const previous = (await caches.keys()).filter(key => key.startsWith(prefix) && key !== cacheName);
    await Promise.all(previous.slice(0, -1).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data !== 'lagoon-offline-status' || !event.ports[0]) return;
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    const ready = (await Promise.all(files.map(file => cache.match(file)))).every(Boolean);
    event.ports[0].postMessage({build, ready});
  })());
});

async function navigate(request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(request, {cache:'no-store', signal:controller.signal});
    if (response.ok) return response;
  } catch (error) {
    // The complete installed pack is the offline entry.
  } finally {
    clearTimeout(timeout);
  }
  const cache = await caches.open(cacheName);
  return await cache.match(entry) || new Response('离线资源已失效，请联网打开海湾生活。', {
    status:503, headers:{'Content-Type':'text/plain; charset=utf-8'}
  });
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const path = url.pathname.slice(scope.pathname.length);
  if (request.mode === 'navigate' && (path === '' || path === 'index.html')) {
    event.respondWith(navigate(request));
  } else if (/^lagoon-\d+\.\d+\.\d+-[a-f0-9]{12}\.[\w.-]+$/.test(path) && !request.headers.has('Range')) {
    event.respondWith((async () => {
      const keys = (await caches.keys()).filter(key => key.startsWith(prefix));
      for (const key of keys) {
        const response = await (await caches.open(key)).match(request);
        if (response) return response;
      }
      return fetch(request);
    })());
  }
});
