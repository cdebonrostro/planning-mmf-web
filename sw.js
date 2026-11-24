const scope = self.registration.scope;
const cachePrefix = "planning-mmf-static:" + scope;
const cacheName = cachePrefix + ":1";
const files = [
  "./",
  "./index.html",
  "./app.js",
  "./engine.js",
  "./storage.js",
  "./style.css",
  "./manifest.webmanifest",
  "./apple-touch-icon.png",
  "./icon-192.png",
  "./icon-512.png",
].map((file) => new URL(file, scope).href);
const allowed = new Set(files);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(cacheName)
      .then((cache) =>
        cache.addAll(files.map((url) => new Request(url, { cache: "reload" }))),
      ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith(cachePrefix + ":") && key !== cacheName)
          await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  url.search = "";
  if (!allowed.has(url.href)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(cacheName);
      return (await cache.match(url.href)) ?? fetch(event.request);
    })(),
  );
});
