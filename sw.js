// Bolsillo: guarda la app en el celu para que abra sin señal
// y recibe facturas desde el menú Compartir de Android.
const CACHE = "bolsillo-v2";
const SHARE = "bolsillo-compartido";
const FILES = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== SHARE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function recibirCompartido(request) {
  const scope = self.registration.scope;
  try {
    const form = await request.formData();
    const c = await caches.open(SHARE);
    await c.delete("archivo");
    await c.delete("texto");
    const archivo = form.getAll("archivo").find((f) => f && typeof f === "object" && f.size > 0);
    if (archivo) {
      await c.put("archivo", new Response(archivo, {
        headers: { "Content-Type": archivo.type || "application/octet-stream", "x-nombre": encodeURIComponent(archivo.name || "factura") }
      }));
    }
    const texto = [form.get("title"), form.get("text"), form.get("url")].filter(Boolean).join(" ").trim();
    if (texto) await c.put("texto", new Response(texto));
  } catch (err) {
    // si algo falla, la app avisa que no llegó nada
  }
  return Response.redirect(scope + "?compartido=1", 303);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  if (req.method === "POST" && url.origin === self.location.origin && url.pathname.endsWith("/compartir")) {
    e.respondWith(recibirCompartido(req));
    return;
  }
  if (req.method !== "GET") return;

  // Gemini, DolarApi y otros servicios: siempre por internet
  if (url.origin !== self.location.origin && !url.hostname.includes("fonts.g")) return;

  // La app: primero internet (para recibir actualizaciones); sin señal, la copia guardada
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("./index.html")))
  );
});
