/* Komara Front — service worker */
const CACHE = "komara-front-v4";
const ESSENTIELS = [
  "./", "index.html", "style.css?v=1", "front.js?v=1", "manifest.json",
  "icon-192.png", "icon-512.png", "assets/logo-256.png", "assets/favicon-64.png"
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ESSENTIELS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((n) => Promise.all(n.filter((x) => x !== CACHE).map((x) => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const vif = req.mode === "navigate" || /\.(html|js|css|json)$/.test(url.pathname);
  if (vif) {
    e.respondWith(fetch(req).then((rep) => {
      const c = rep.clone();
      caches.open(CACHE).then((x) => x.put(req, c)).catch(() => {});
      return rep;
    }).catch(() => caches.match(req).then((m) => m || caches.match("index.html"))));
    return;
  }
  e.respondWith(caches.match(req).then((m) => m || fetch(req).then((rep) => {
    const c = rep.clone();
    caches.open(CACHE).then((x) => x.put(req, c)).catch(() => {});
    return rep;
  })));
});
