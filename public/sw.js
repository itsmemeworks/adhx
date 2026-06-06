/*
 * Minimal service worker — exists ONLY to satisfy PWA installability.
 *
 * Chrome won't fire `beforeinstallprompt` (the one-tap "Add to Home Screen"
 * flow) unless the site registers a service worker with a fetch handler. This
 * worker deliberately does NOT cache anything: the fetch handler is a no-op
 * that lets every request hit the network exactly as if there were no SW, so
 * there's zero risk of serving stale content. It's a capability shim, not an
 * offline cache.
 */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {
  // Intentionally empty — no respondWith(), so the browser handles every
  // request normally. Present only so the app counts as installable.
})
