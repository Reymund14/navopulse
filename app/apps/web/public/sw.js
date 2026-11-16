/* NavoPulse service worker: app-shell caching so the citizen app opens offline.
   API calls are never cached (except read-only public content as a fallback),
   so dashboards and report status are always live when online. */
const VERSION = "np-v2";
const SHELL = ["/app", "/app/sos", "/app/report", "/app/reports", "/app/directory", "/app/advisories", "/brand/navotas-seal-192.webp", "/brand/icon-192.png", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // Public reference data: network first, cached copy when offline.
  if (url.pathname.startsWith("/api/public/")) {
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res; }).catch(() => caches.match(req)));
    return;
  }
  if (url.pathname.startsWith("/api/")) return;

  // Build assets are immutable: cache first.
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res; })));
    return;
  }
  // Pages: network first, fall back to the cached shell.
  if (req.mode === "navigate" && url.pathname.startsWith("/app")) {
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("/app"))));
  }
});
