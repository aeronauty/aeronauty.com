/* Tile Tally PWA foundation.
 *
 * This is intentionally not an offline data layer. It only caches immutable,
 * content-hashed Next.js assets and the public app icons. App navigations, API and
 * authentication traffic, Supabase requests, and all user data stay on the
 * network and out of Cache Storage.
 */

const CACHE_PREFIX = "tile-tally-static-";
const CACHE_VERSION = "v1";
const STATIC_CACHE = `${CACHE_PREFIX}${CACHE_VERSION}`;
const SAFE_PUBLIC_PATHS = new Set([
  "/tile-tally-icon.svg",
  "/tile-tally-icon-192.png",
  "/tile-tally-icon-512.png",
  "/tile-tally-apple-touch-icon.png",
]);

function isSafeStaticRequest(request) {
  if (request.method !== "GET") return false;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;

  return url.pathname.startsWith("/_next/static/") || SAFE_PUBLIC_PATHS.has(url.pathname);
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (!isSafeStaticRequest(request)) return;

  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cachedResponse = await cache.match(request);
      if (cachedResponse) return cachedResponse;

      const networkResponse = await fetch(request);
      if (!networkResponse.ok || networkResponse.type !== "basic") return networkResponse;

      try {
        await cache.put(request, networkResponse.clone());
      } catch {
        // A full or unavailable cache must never prevent an asset response.
      }

      return networkResponse;
    }),
  );
});
