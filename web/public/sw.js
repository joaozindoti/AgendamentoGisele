// Service worker do Studio Gisele Lima (seção 7: PWA).
//
// - Shell do app (JS/CSS do Next, ícones, fotos): cache-first — nomes com
//   hash, nunca mudam de conteúdo.
// - Páginas (navegação): network-first. Com rede, sempre a versão nova, e
//   a cópia vai pro cache. Sem rede, abre a última cópia — é assim que o
//   próximo agendamento fica legível offline. Sem cópia, página /offline.
// - Escrita (marcar, remarcar, Server Actions = POST) nunca passa por cache:
//   exige conexão, como pede a seção 7.
// - Supabase e qualquer outra origem: ignorados.
//
// O cache de páginas guarda HTML com dado pessoal; o botão "Sair" apaga os
// caches "paginas-*" antes de encerrar a sessão (components/pwa.tsx).

const VERSAO = "v1";
const SHELL = `shell-${VERSAO}`;
const PAGINAS = `paginas-${VERSAO}`;
const PRECACHE = ["/offline", "/icons/icon-192.png", "/icons/icon-512.png", "/fotos/logo.webp"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== SHELL && n !== PAGINAS).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (evento) => {
  const req = evento.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/fotos/")) {
    evento.respondWith(
      caches.match(req).then(
        (salvo) =>
          salvo ||
          fetch(req).then((resp) => {
            if (resp.ok) {
              const copia = resp.clone();
              caches.open(SHELL).then((c) => c.put(req, copia));
            }
            return resp;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    evento.respondWith(
      fetch(req)
        .then((resp) => {
          // só guarda página final de verdade (não redirect pro login)
          if (resp.ok && !resp.redirected) {
            const copia = resp.clone();
            caches.open(PAGINAS).then((c) => c.put(req, copia));
          }
          return resp;
        })
        .catch(() =>
          caches.match(req, { ignoreSearch: true }).then((salvo) => salvo || caches.match("/offline")),
        ),
    );
  }
});
