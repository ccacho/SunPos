const CACHE_NAME = "sunpos-ar-v5";

// Detectar la base URL automaticamente (funciona en localhost y GitHub Pages)
const BASE = self.location.pathname.replace(/\/sw\.js$/, "") || "/";

const ASSETS = [
  BASE + "/",
  BASE + "/index.html",
  BASE + "/styles.css",
  BASE + "/manifest.json",
  BASE + "/sw.js",
  BASE + "/js/suncalc.js",
  BASE + "/js/sensors.js",
  BASE + "/js/ar-renderer.js",
  BASE + "/js/app.js",
  BASE + "/icons/icon-192.png",
  BASE + "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
    }),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    }),
  );
});
