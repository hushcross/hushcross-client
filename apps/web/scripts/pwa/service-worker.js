/* The immutable allowlist is injected at build time. No wallet data belongs here. */
const CACHE_NAME = 'hushcross-static-' + CONFIG.version;
const inflight = new Map();
const routeRoots = new Set(['', 'app', 'vault', 'send', 'pay', 'gift', 'launch', 'book', 'give', 'settings', 'more', 'about', 'docs', 'do', 'jobs', 'dev']);

async function digest(response) {
  const bytes = await response.clone().arrayBuffer();
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function verifiedAsset(request, path) {
  const expected = CONFIG.assets[path];
  let cache;
  try {
    cache = await caches.open(CACHE_NAME);
    const found = await cache.match(request);
    if (found && await digest(found) === expected) return found;
    if (found) await cache.delete(request);
  } catch {
    // Storage may be disabled or full. Integrity is still required from the network.
    cache = undefined;
  }
  const response = await fetch(request, { cache: 'no-store' });
  if (response.status !== 200 || response.redirected || response.type === 'opaque' || await digest(response) !== expected) {
    return new Response('Asset integrity check failed. Reconnect and refresh HushCross.', { status: 502, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
  }
  if (cache && !/no-store|private/i.test(response.headers.get('cache-control') || '') && response.headers.get('vary') !== '*') {
    try { await cache.put(request, response.clone()); } catch { /* A full cache must not break verified online assets. */ }
  }
  return response;
}

self.addEventListener('install', () => {
  // No speculative downloads, skipWaiting, or cache of account pages.
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('hushcross-static-') && n !== CACHE_NAME).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', (event) => {
  // Only an explicit in-app refresh choice activates an update early.
  if (event.data?.type === 'HUSHCROSS_APPLY_UPDATE' && event.source?.url && new URL(event.source.url).origin === self.location.origin) {
    event.waitUntil(self.skipWaiting());
  }
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('range') || request.headers.has('authorization')) return;
  if (request.mode === 'navigate' && routeRoots.has(url.pathname.split('/')[1])) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response.status < 500) return response;
      } catch { /* Offline navigation must not replay a stale wallet screen. */ }
      return new Response(CONFIG.offlineHtml, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" } });
    })());
    return;
  }
  if (/^\/deployments\/[0-9]+\.json$/.test(url.pathname)) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }
  // A path must be in this build's exact allowlist. No broad extension or origin matching.
  if (url.search || !Object.hasOwn(CONFIG.assets, url.pathname)) return;
  if (!inflight.has(url.pathname)) {
    const pending = verifiedAsset(request, url.pathname).finally(() => inflight.delete(url.pathname));
    inflight.set(url.pathname, pending);
  }
  event.respondWith(inflight.get(url.pathname).then((response) => response.clone()));
});
