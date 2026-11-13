// Service worker do PWA (docs/PLANO-APK-TWA.md, Fase 1). Escrito à mão, sem dependência.
//
// Só guarda o "shell": a página (index.html) e os arquivos com hash do Vite (/assets/*), mais ícones. Dado nunca:
// nada em /api-localle/ (posições, stream de tempo real, login) passa por aqui — o navegador vai direto à rede, então
// o app nunca mostra posição velha vinda de cache. Requisição de outro domínio e qualquer método além de GET também seguem
// direto — exceto os blocos do mapa do OpenFreeMap (abaixo).
//
// Página: rede primeiro (o deploy novo chega na hora; o Nginx manda index.html e sw.js sem cache) e, sem rede, a última
// versão guardada. /assets/*: cache primeiro — o nome muda a cada build, então o arquivo guardado nunca fica velho.
// Trocar VERSAO descarta os caches antigos na ativação.
//
// Mapa (MapLibre, 11/11/2026): blocos, relevo, fontes e ícones do tiles.openfreemap.org têm endereço imutável (os blocos
// vetoriais levam a versão do planeta no caminho; o servidor manda cache de 10 anos), então cache primeiro: reabrir o mapa
// não baixa de novo o que já veio. O cache HTTP do navegador faria o mesmo, mas no celular ele é despejado cedo. Estilo e
// índice do planeta (/styles, /planet sem versão) mudam a cada atualização do OpenFreeMap e seguem direto pela rede.
// Os contornos do globo (/geo/) são arquivos do app sem hash: rede primeiro, cópia guardada sem rede.

const VERSAO = 'v1';
const CACHE_PAGINA = `pagina-${VERSAO}`;
const CACHE_ARQUIVOS = `arquivos-${VERSAO}`;
const MAX_ARQUIVOS = 150; // cada deploy traz arquivos novos; os mais antigos saem
const CACHE_MAPA = `mapa-${VERSAO}`;
const MAX_MAPA = 600; // blocos de 20 KB a 1 MB; os mais antigos saem
const MAPA_ORIGEM = 'https://tiles.openfreemap.org';
const MAPA_IMUTAVEL = /^\/(planet\/[^/]+\/|natural_earth\/|fonts\/|sprites\/)/;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const atuais = new Set([CACHE_PAGINA, CACHE_ARQUIVOS, CACHE_MAPA]);
    for (const nome of await caches.keys()) if (!atuais.has(nome)) await caches.delete(nome);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === MAPA_ORIGEM && MAPA_IMUTAVEL.test(url.pathname)) {
    event.respondWith(guardado(req, CACHE_MAPA, MAX_MAPA));
    return;
  }
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api-localle/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(pagina(req));
    return;
  }
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(guardado(req, CACHE_ARQUIVOS, MAX_ARQUIVOS));
  } else if (url.pathname.startsWith('/geo/')) {
    event.respondWith(redePrimeiro(req));
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

// cache primeiro (arquivo que nunca muda no mesmo endereço); guarda o que veio da rede e apara os mais antigos
async function guardado(req, nome, max) {
  const cache = await caches.open(nome);
  const achado = await cache.match(req);
  if (achado) return achado;
  const resp = await fetch(req);
  if (resp.ok) {
    await cache.put(req, resp.clone());
    const chaves = await cache.keys();
    for (const velha of chaves.slice(0, Math.max(0, chaves.length - max))) await cache.delete(velha);
  }
  return resp;
}

async function redePrimeiro(req) {
  const cache = await caches.open(CACHE_ARQUIVOS);
  try {
    const resp = await fetch(req);
    if (resp.ok) await cache.put(req, resp.clone());
    return resp;
  } catch (err) {
    const achado = await cache.match(req);
    if (achado) return achado;
    throw err;
  }
}

// Push (docs/PLANO-APK-TWA.md § 3): payload é {alertaId, assetId, tipo, titulo, corpo, prioridade} — o texto já vem
// pronto da API (título curto = veículo, corpo = a frase do alerta); o `tipo` cru nunca aparece, só compõe a `tag`.
// `tag` por veículo+tipo: um alerta novo do mesmo veículo/tipo substitui o anterior em vez de empilhar notificação.
// `requireInteraction` só na prioridade alta (não dispensa sozinha).
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let dados;
  try { dados = event.data.json(); } catch { return; }
  event.waitUntil(self.registration.showNotification(dados.titulo || 'Alerta da frota', {
    body: dados.corpo || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: dados.assetId && dados.tipo ? `${dados.assetId}:${dados.tipo}` : undefined,
    requireInteraction: dados.prioridade === 'alta',
    data: { assetId: dados.assetId || null, alertaId: dados.alertaId || null },
  }));
});

// Leva direto ao alerta na Central de alertas (?alerta=<id>, Alertas.tsx destaca a linha). Com o app já aberto, foca a
// janela e pede a troca de rota por mensagem (main.tsx) — `navigate()` do cliente não é confiável no iPhone; sem janela
// aberta, abre uma já na rota.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const id = event.notification.data && event.notification.data.alertaId;
  const rota = id ? `/monitoramento/alertas?alerta=${encodeURIComponent(id)}` : '/monitoramento/alertas';
  event.waitUntil((async () => {
    const clientes = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const c = clientes.find((x) => 'focus' in x);
    if (c) {
      await c.focus();
      c.postMessage({ tipo: 'abrir', rota });
      return;
    }
    await self.clients.openWindow(`/#${rota}`);
  })());
});
