// Bump CACHE's version suffix (thrivemap-vN) on any deploy that changes
// what /offline needs to render correctly (its own markup, or shared
// layout/globals.css that visibly affects it). This file is served
// byte-identical unless edited, so the browser's SW update check
// (byte-diff against the last-installed script) only re-runs `install`
// when this file's bytes change — a version bump is how you force that.
//
// Belt-and-suspenders: `activate` (below) also re-fetches "/offline" on
// every activation, network permitting, so a plain redeploy that changes
// nothing in this file still gets a fresh shell within one activation as
// long as the device has connectivity at some point after deploying.
const CACHE = "thrivemap-v1";
const PRECACHE = ["/offline"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() =>
        // Refresh the precached shell so a byte-stable sw.js doesn't leave
        // /offline referencing stale, no-longer-deployed chunk hashes
        // forever. Best-effort: offline activations (e.g. a device that
        // was already offline when this SW first installed) simply keep
        // whatever shell is already cached.
        fetch("/offline")
          .then((response) => {
            if (!response.ok) return;
            return caches.open(CACHE).then((cache) => cache.put("/offline", response));
          })
          .catch(() => {}),
      ),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match("/offline");
      return cached ?? Response.error();
    }),
  );
});
