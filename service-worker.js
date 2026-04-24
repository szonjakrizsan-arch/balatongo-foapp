const CACHE_NAME = "balatongo-v3";
const URLS_TO_CACHE = [
  "/balatongo-foapp/",
  "/balatongo-foapp/index.html",
  "/balatongo-foapp/style.css",
  "/balatongo-foapp/script.js",
  "/balatongo-foapp/manifest.json",
  "/balatongo-foapp/icon-192.png",
  "/balatongo-foapp/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(URLS_TO_CACHE);
    })
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
