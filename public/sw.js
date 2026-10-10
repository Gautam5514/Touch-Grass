/* WildQuest service worker: caches the app shell and WASM runtime for offline use.
   Model weights are cached separately by Transformers.js in the "transformers-cache" bucket.
   Bump VERSION whenever cached app assets must be refreshed. */
const VERSION = "wq-v2";
const SHELL = ["/", "/explore/", "/adventure/", "/journal/", "/settings/", "/about/", "/privacy/", "/manifest.webmanifest", "/icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("wq-") && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_URLS") return;
  const port = event.ports[0];
  event.waitUntil(
    caches.open(VERSION)
      .then((c) => Promise.all(event.data.urls.map((u) => c.add(u).then(() => true, () => false))))
      .then((results) => port?.postMessage({ ok: results.some(Boolean), failed: results.filter((r) => !r).length }))
      .catch((e) => port?.postMessage({ ok: false, error: e.name === "QuotaExceededError" ? "Not enough free storage to save the app." : String(e) })),
  );
});

const isStatic = (p) => p.startsWith("/_next/static/") || p.startsWith("/ort/") || p.startsWith("/icons/");

// Pages whose URL carries a runtime id (/adventure/12/, /adventure/12/complete/) all use one static shell.
const shellFor = (path) => (path.startsWith("/adventure/") ? "/adventure/" : path);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  if (isStatic(url.pathname)) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      })),
    );
    return;
  }

  // Pages and data: network first (deploys show up immediately), cache as a fallback when offline.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && !url.pathname.startsWith("/adventure/")) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(async () => {
        const exact = await caches.match(req, { ignoreSearch: true });
        if (exact) return exact;
        if (req.mode === "navigate") {
          const shell = await caches.match(shellFor(url.pathname), { ignoreSearch: true });
          if (shell) return shell;
          return (await caches.match("/")) ?? Response.error();
        }
        return Response.error();
      }),
  );
});
