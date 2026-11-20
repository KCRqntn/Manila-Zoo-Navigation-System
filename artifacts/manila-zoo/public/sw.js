/*
 * Manila Zoo offline support (service worker).
 *
 * - App pages, scripts and API data (same origin): network first, saved copy when offline.
 *   Online visitors always get fresh data; the saved copy is only a fallback.
 * - Map tiles, animal photos and fonts (other origins): saved copy first, since they rarely change.
 * - Chat messages and admin changes (POST/PATCH/DELETE) are never cached.
 *
 * Saving is best effort: if the browser's cache storage fails (full disk, private mode),
 * requests still go to the network as if this worker weren't installed.
 */
// v2: clears copies saved while the site was served by the dev server
const VERSION = "v2";
const APP_CACHE = `zoo-app-${VERSION}`;
const MEDIA_CACHE = `zoo-media-${VERSION}`;
const MAX_MEDIA_ENTRIES = 1500; // map tiles + photos; keeps storage bounded
// The app's start page (respects a BASE_PATH deployment such as /zoo/)
const SHELL_URL = self.registration.scope;

const MEDIA_HOSTS = [
  "tile.openstreetmap.org",
  "server.arcgisonline.com", // aerial photos for the 3D map's realistic look
  "images.unsplash.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
];

self.addEventListener("install", event => {
  // Save the page shell right away so the app opens offline even before the next visit
  event.waitUntil(caches.open(APP_CACHE).then(cache => cache.add(SHELL_URL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    try {
      const keep = new Set([APP_CACHE, MEDIA_CACHE]);
      for (const name of await caches.keys()) {
        if (name.startsWith("zoo-") && !keep.has(name)) await caches.delete(name);
      }
    } catch {
      // Old caches stay until the next update; nothing depends on removing them now
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    // The layout version check must reach the server (it decides whether to reload the map).
    // Dev-server files (/@vite/client, /src/...) are fine: network first keeps them fresh,
    // and live reload uses a WebSocket, which service workers never see.
    if (url.pathname.endsWith("/api/map/version")) return;
    // Small photo copies (/api/img?src=…&w=…) never change for a given link: keep them with the photos
    if (url.pathname.endsWith("/api/img")) {
      event.respondWith(cacheFirst(event));
      return;
    }
    // Built scripts and styles (/assets/name-HASH.js) get a new name whenever they change, so a
    // saved copy is always correct: use it instead of downloading it again over the phone link
    if (/\/assets\/[^/]+-[A-Za-z0-9_-]{6,}\.(js|css)$/.test(url.pathname)) {
      event.respondWith(cacheFirstAsset(event));
      return;
    }
    event.respondWith(networkFirst(event));
    return;
  }
  if (MEDIA_HOSTS.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    event.respondWith(cacheFirst(event));
  }
});

async function fromCache(cacheName, request, options) {
  try {
    return await (await caches.open(cacheName)).match(request, options);
  } catch {
    return undefined;
  }
}

function saveCopy(event, cacheName, request, response) {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(cacheName);
      await cache.put(request, response);
      if (cacheName === MEDIA_CACHE) {
        const keys = await cache.keys();
        for (let i = 0; i < keys.length - MAX_MEDIA_ENTRIES; i++) await cache.delete(keys[i]);
      }
    } catch {
      // Storage full or unavailable: this item just won't be available offline
    }
  })());
}

async function networkFirst(event) {
  const request = event.request;
  try {
    const response = await fetch(request);
    if (response.ok) saveCopy(event, APP_CACHE, request, response.clone());
    return response;
  } catch (error) {
    const saved = await fromCache(APP_CACHE, request, { ignoreVary: true });
    if (saved) return saved;
    // Any app page (e.g. /animals/3) can be served by the saved shell; the router takes over
    if (request.mode === "navigate") {
      const shell = await fromCache(APP_CACHE, SHELL_URL);
      if (shell) return shell;
    }
    throw error;
  }
}

async function cacheFirstAsset(event) {
  const request = event.request;
  const saved = await fromCache(APP_CACHE, request);
  if (saved) return saved;
  const response = await fetch(request);
  // Only save the real file: a missing asset comes back as the HTML page, which must not be kept
  const type = response.headers.get("content-type") || "";
  if (response.ok && !type.includes("text/html")) saveCopy(event, APP_CACHE, request, response.clone());
  return response;
}

async function cacheFirst(event) {
  const request = event.request;
  const saved = await fromCache(MEDIA_CACHE, request);
  if (saved) return saved;
  const response = await fetch(request);
  // Opaque (no-cors) responses have status 0 but are still usable for images and tiles
  if (response.ok || response.type === "opaque") saveCopy(event, MEDIA_CACHE, request, response.clone());
  return response;
}
