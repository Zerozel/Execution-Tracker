// ============================================================
// Execution Tracker — Service Worker
// ============================================================
// Minimal service worker for PWA installability.
//
// Cache strategy:
//   - Static assets: Cache-First (CSS, JS, fonts, icons, manifest)
//   - Everything else: Network-Only (API calls, data, pages)
//
// This ensures task data is always fresh while the app shell
// loads instantly on repeat visits and during offline mode.
// ============================================================

// Name for this cache version — increment when assets change significantly
const CACHE_NAME = "execution-tracker-v2.1";

// Static assets to pre-cache on install.
// These are the minimum files needed for the app shell.
const PRECACHE_ASSETS = [
  "/offline.html",
  "/manifest.json",
];

// File extensions considered static and safe to cache.
// All cached items are matched by extension pattern.
const STATIC_EXTENSIONS = [
  ".css",
  ".js",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".ico",
  ".webp",
];

// ============================================================
// INSTALL: Pre-cache essential static assets
// ============================================================
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  // Activate immediately — don't wait for old workers to close
  self.skipWaiting();
});

// ============================================================
// ACTIVATE: Clean up old cache versions
// ============================================================
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  // Take control of all clients immediately
  self.clients.claim();
});

// ============================================================
// FETCH: Apply caching rules
// ============================================================
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Rule 1: Never cache API requests — always go to the network
  if (url.pathname.startsWith("/api/")) {
    return; // Let the browser handle it (network-only by default)
  }

  // Rule 2: Never cache Supabase requests (database, auth, storage)
  if (url.hostname.includes("supabase.co")) {
    return;
  }

  // Rule 3: Cache static assets by file extension
  const isStaticAsset = STATIC_EXTENSIONS.some((ext) =>
    url.pathname.toLowerCase().endsWith(ext)
  );

  if (isStaticAsset) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          // Return cached version immediately
          return cachedResponse;
        }

        // Fetch from network and cache for next time
        return fetch(event.request).then((networkResponse) => {
          // Only cache successful responses
          if (networkResponse.ok) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // Rule 4: For everything else (HTML pages, dynamic content),
  // try network first, fall back to offline page
  event.respondWith(
    fetch(event.request).catch(() => {
      // If the request is a navigation (page load), show offline page
      if (event.request.mode === "navigate") {
        return caches.match("/offline.html");
      }
      // For other requests (images, etc.), just fail silently
      return new Response("", { status: 408 });
    })
  );
});
