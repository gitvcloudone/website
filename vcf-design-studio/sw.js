// VCF Design Studio's service worker: makes the page installable and lets it open offline.
// Network first, so a new version always shows when online; the cached copy is used only when the network
// fails. Only this site's own files are cached: never AI providers, fonts or other sites, and never a design
// (designs live in the browser's storage, not in requests). The same file is in /vcf-design-studio/ and
// /vcf-design-studio-ai/ (each page's own folder sets what it controls); a test keeps them identical.
const CACHE = "vcf-design-studio-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok && res.type === "basic") { const c = await caches.open(CACHE); await c.put(req, res.clone()); }
      return res;
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: req.mode === "navigate" });
      if (hit) return hit;
      throw err;
    }
  })());
});
