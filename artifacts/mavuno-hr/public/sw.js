// Mavuno HR service worker -- makes the app installable on phones.
// Scope is wherever this file is served from (/app/ in production). It only
// ever caches one offline page: API responses, payslips and personal details
// are never stored on the device.
const CACHE = "mavuno-offline-v1";
const OFFLINE_URL = new URL("offline.html", self.registration.scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE_URL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Only page navigations get the offline fallback; everything else goes
  // straight to the network untouched.
  if (req.method !== "GET" || req.mode !== "navigate") return;
  event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
});
