// Offline-Speicher der App (Service Worker).
// Programmdateien: erst aus dem Netz (damit Änderungen sofort ankommen), ohne Netz aus dem Speicher.
// Schriften von Google: einmal geladen, dann aus dem Speicher.
// Der Abgleich mit Google Apps Script wird nie zwischengespeichert.
const SPEICHER = "bauchtagebuch-v2";
const DATEIEN = [
  "./", "index.html", "style.css", "app.js", "logik.js", "speicher.js", "abgleich.js",
  "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (ev) => {
  ev.waitUntil(caches.open(SPEICHER).then((c) => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(caches.keys()
    .then((namen) => Promise.all(namen.filter((n) => n !== SPEICHER).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (ev) => {
  const anfrage = ev.request;
  if (anfrage.method !== "GET") return;
  const url = new URL(anfrage.url);

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    ev.respondWith(caches.open(SPEICHER).then(async (c) => {
      const da = await c.match(anfrage);
      if (da) return da;
      const neu = await fetch(anfrage);
      if (neu.ok || neu.type === "opaque") c.put(anfrage, neu.clone());
      return neu;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;   // z. B. script.google.com: nicht anfassen

  ev.respondWith((async () => {
    const c = await caches.open(SPEICHER);
    try {
      const neu = await fetch(anfrage, { cache: "no-cache" });
      if (neu.ok) c.put(anfrage, neu.clone());
      return neu;
    } catch {
      return (await c.match(anfrage, { ignoreSearch: true })) || (await c.match("index.html"));
    }
  })());
});
