// Service worker do PWA (docs/PLANO-APK-TWA.md, Fase 1). Escrito à mão, sem dependência.
//
// Só guarda o "shell": a página (index.html) e os arquivos com hash do Vite (/assets/*), mais ícones. Dado nunca:
// nada em /api-localle/ (posições, stream de tempo real, login) passa por aqui — o navegador vai direto à rede, então
// o app nunca mostra posição velha vinda de cache. Requisição de outro domínio (blocos do mapa, fontes) e qualquer
// método além de GET também seguem direto.
//
// Página: rede primeiro (o deploy novo chega na hora; o Nginx manda index.html e sw.js sem cache) e, sem rede, a última
// versão guardada. /assets/*: cache primeiro — o nome muda a cada build, então o arquivo guardado nunca fica velho.
// Trocar VERSAO descarta os caches antigos na ativação.

const VERSAO = 'v1';
const CACHE_PAGINA = `pagina-${VERSAO}`;
const CACHE_ARQUIVOS = `arquivos-${VERSAO}`;
const MAX_ARQUIVOS = 150; // cada deploy traz arquivos novos; os mais antigos saem

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const atuais = new Set([CACHE_PAGINA, CACHE_ARQUIVOS]);
    for (const nome of await caches.keys()) if (!atuais.has(nome)) await caches.delete(nome);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api-localle/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(pagina(req));
    return;
  }
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(arquivo(req));
  }
});

async function pagina(req) {
  const cache = await caches.open(CACHE_PAGINA);
  try {
    const resp = await fetch(req);
    if (resp.ok) await cache.put('/', resp.clone());
    return resp;
  } catch (err) {
    const guardada = await cache.match('/');
    if (guardada) return guardada;
    throw err;
  }
}

async function arquivo(req) {
  const cache = await caches.open(CACHE_ARQUIVOS);
  const guardado = await cache.match(req);
  if (guardado) return guardado;
  const resp = await fetch(req);
  if (resp.ok) {
    await cache.put(req, resp.clone());
    const chaves = await cache.keys();
    for (const velha of chaves.slice(0, Math.max(0, chaves.length - MAX_ARQUIVOS))) await cache.delete(velha);
  }
  return resp;
}

// Push (docs/PLANO-APK-TWA.md § 3): payload é {alertaId, assetId, tipo, titulo, prioridade} — dado, não
// URL (o SW decide a rota). `tag` por veículo+tipo: um alerta novo do mesmo veículo/tipo substitui o
// anterior em vez de empilhar notificação. `requireInteraction` só na prioridade alta (não dispensa sozinha).
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let dados;
  try { dados = event.data.json(); } catch { return; }
  event.waitUntil(self.registration.showNotification(dados.titulo || 'Localle', {
    body: dados.tipo || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: dados.assetId && dados.tipo ? `${dados.assetId}:${dados.tipo}` : undefined,
    requireInteraction: dados.prioridade === 'alta',
    data: { assetId: dados.assetId || null, alertaId: dados.alertaId || null },
  }));
});

// Foca uma aba já aberta (navega para Alertas) em vez de abrir outra; só abre nova se não houver nenhuma.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = '/#/alertas';
  event.waitUntil((async () => {
    const clientes = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of clientes) {
      if ('focus' in c) {
        await c.focus();
        if ('navigate' in c) await c.navigate(destino);
        return;
      }
    }
    await self.clients.openWindow(destino);
  })());
});
