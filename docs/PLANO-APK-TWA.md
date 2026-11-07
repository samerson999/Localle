# Plano do app mobile — PWA, notificações e APK (TWA), com caminho para o nativo

> Plano de 04/11/2026, revisto em 07/11/2026 depois da fila única de ingestão (722cb55) e das decisões abaixo.
> Público primeiro: **gestor da frota**. Ordem: PWA → push → APK via TWA na Play Store → app nativo (Expo) depois.

## 0. Decisões tomadas (07/11/2026)

| Tema | Decisão |
|---|---|
| Formato | PWA agora; APK via TWA para a Play Store; nativo (Expo) numa fase futura |
| Identidade | **Um app só, igual para todos.** Nome e ícone na loja e na tela inicial: **Localle**. A marca da revenda (logo/cor do Setup) aparece dentro da plataforma, depois do login — não existe app por revenda |
| Publicação | Conta de organização da empresa (Google Play; Apple quando houver nativo). Pedir o D-U-N-S já |
| Quais alertas viram push | O usuário escolhe por tipo; padrão = prioridade alta |
| Quem recebe | Quem tem permissão de ver o veículo (a mesma regra da tela) — o push nunca mostra veículo que o usuário não vê |
| Sessão | Persistente com renovação (dias), derrubada por logout, troca de senha ou desativação. Passa por `security-review` |
| Toque | Alvos de 44 px; zoom do mapa visível no celular |

**Em aberto** (só travam a partir da Fase 4): domínio definitivo e nome do pacote Android. O pacote não muda depois de
publicado e deve ser o mesmo do futuro app nativo (§ 8).

## 1. Fase 1 — PWA (front, ~1 dia)

- `apps/web/public/` (o Vite copia para o `dist/`; o Nginx serve arquivo real antes do fallback da SPA).
- `manifest.webmanifest`: `name`/`short_name` "Localle", `start_url: "/"`, `display: "standalone"`, `theme_color` e
  `background_color`, ícones 192, 512 e maskable 512 a partir do símbolo da marca.
- `public/sw.js` escrito à mão, sem dependência nova: cache só do shell (`index.html` e assets com hash) e **nunca
  intercepta `/api-localle/`** (dados, stream de tempo real, login). Já nasce com os eventos `push` e
  `notificationclick` (Fase 3).
- `index.html`: `<link rel="manifest">`, `theme-color`, `apple-touch-icon` e favicon de produção (hoje aponta para
  `/src/images/...`, que só existe no dev).
- Registro do SW em `main.tsx`, só no build de produção.
- `nginx.conf`: `Cache-Control: no-cache` também no `sw.js` (como já é no `index.html`).
- Conferência no navegador (do usuário): DevTools → Application → Manifest/Service Workers; Lighthouse "Installable".

## 2. Fase 2 — notificações na API (~3 dias)

Modelada **por canal** desde o início: Web Push agora, Expo/FCM/APNs quando o nativo chegar, sem refazer o domínio.

- **Fila de notificações no Postgres** (mesmo padrão do `ingest_inbox`, sem Redis): a linha nasce **na mesma transação
  do alerta**, no ponto único de criação de alerta (`alertas.repository`), cobrindo alertas da posição, do evento e dos
  jobs. Push lento ou fora do ar nunca atrasa a gravação de posições.
- **Worker de notificações** (lease + retry com backoff, como o inbox): resolve os destinatários — usuários do cliente
  com permissão de ver o veículo e com aquele tipo ligado nas preferências — e entrega em cada aparelho pelo canal dele.
- **Controle de rajada** nesta camada, não no canal: `tag` por veículo + tipo (a notificação nova substitui a anterior)
  e limite por veículo + tipo em janela curta.
- **Payload com dados, não URL**: `alertaId`, `assetId`, `tipo`, prioridade, título curto. O PWA monta a rota
  (`/#/...`); o nativo abre a tela dele.
- **Tabelas** (migration, `client_id` + RLS, acesso pelo `BaseRepository`):
  - `notificacao_aparelhos`: `user_id`, `client_id`, `canal` (`webpush` hoje), `endpoint`/token (único), chaves do
    canal (nulas fora do webpush), `user_agent`, `ultimo_envio_em`, `falhas`.
  - `notificacao_preferencias`: tipos ligados por usuário (ausente = padrão prioridade alta).
  - fila de envio com estado, tentativas e erro.
- **Rotas** (sempre `client_id`/`user_id` do JWT): `GET /notificacoes/chave-publica`, `POST /notificacoes/aparelhos`,
  `DELETE /notificacoes/aparelhos`, `GET|PUT /notificacoes/preferencias`.
- Canal Web Push: biblioteca `web-push` com chaves VAPID na env do Coolify (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT`), nunca no repositório. Resposta 404/410 apaga o aparelho; outras falhas somam `falhas`.
- Usuário desativado ou com senha trocada: apagar os aparelhos dele.
- Logs (`Logger`): `warn` em falha de entrega (client_id, id do aparelho, status), `error` ao esgotar tentativas;
  nunca endpoint, token ou chaves.
- Testes: isolamento dos repositórios (cliente A não lê nem apaga aparelho do B), destinatários respeitando permissão
  de veículo e preferências, rajada/`tag`, limpeza no 410 — contra o Postgres local, `web-push` simulado. Depois
  `security-review` e `pentester-isolamento`/`pentester-input`.

## 3. Fase 3 — notificações no front (~1 dia)

- Botão "Ativar notificações" em Alertas e em Minha conta; a permissão é pedida no toque, nunca ao abrir o app.
  Mostra o estado: ativado, bloqueado no aparelho, não suportado.
- Preferências por tipo de alerta em Minha conta.
- `pushManager.subscribe` → `POST /notificacoes/aparelhos`; no logout, `unsubscribe` + `DELETE`.
- `sw.js`: `push` → `showNotification` (ícone, badge, `tag`, `requireInteraction` na prioridade alta);
  `notificationclick` foca o app aberto ou abre na tela do alerta.
- Testável já na HML pelo navegador (HTTPS do sslip.io), no Chrome desktop e Android.

**Sessão persistente** entra junto com as Fases 2–3 (é o que torna o push útil: app fechado não pode pedir login):
token de longa duração com renovação, revogado por logout/troca de senha/desativação; `security-review` antes do deploy.

## 4. Fase 4 — domínio e HTTPS (~½ dia, depois do domínio)

DNS para a VPS, domínio no resource do front no Coolify (Let's Encrypt), `APP_URL` da API no mesmo domínio (corrige o
link de convite). Gerar aqui as chaves VAPID de produção e **não trocá-las depois** (invalidaria todos os aparelhos).

## 5. Fase 5 — APK (~½ dia)

`npm i -g @bubblewrap/cli`; `bubblewrap init --manifest https://<dominio>/manifest.webmanifest`; `enableNotifications:
true` (permissão `POST_NOTIFICATIONS` do Android 13+); keystore **com backup seguro**; `bubblewrap build` → `.apk` e
`.aab`. Usar Play App Signing.

## 6. Fase 6 — Digital Asset Links (~1 h)

`apps/web/public/.well-known/assetlinks.json` com o pacote e os dois SHA-256 (upload e Play App Signing); conferir que
o Nginx devolve JSON e não o `index.html`. Barra do Chrome no topo do app = verificação falhou.

## 7. Fase 7 — teste e publicação (~1 dia + revisão)

Android real: login, Monitoramento ao vivo, PDF/XLSX, link de convite; push com app fechado, tela bloqueada e depois
de reiniciar; aparelho Xiaomi/Samsung com economia de bateria agressiva. Play: ficha, capturas, política de privacidade
e segurança de dados (localização e notificações); teste interno → produção.

## 8. Caminho para o app nativo (Expo)

O que já serve: a API autentica por `Authorization: Bearer` (sem cookie) e tem `/auth/renovar`; o tempo real é lido
com `fetch` em stream (sem `EventSource`), o que o `fetch` do Expo suporta; regras puras em `packages/shared`.

O que este plano já prepara: notificações por canal (o nativo é só mais um canal), payload com ids, sessão persistente
(no nativo, guardada no armazenamento seguro do aparelho).

Na Play Store, o nativo publicado **com o mesmo pacote e pela mesma conta** chega como atualização do app TWA —
quem instalou recebe sem reinstalar. Por isso o nome do pacote se escolhe pensando no app definitivo.

Fora de escopo agora: criar `apps/mobile` ou mover o cliente de API do front para `packages/shared` antes de o nativo
começar (critério do `CLAUDE.md`: só quando os dois apps precisarem).

## 9. Estimativa

Fases 1–3 + sessão: ~5–6 dias, testáveis na HML sem domínio. Fases 4–7: ~2 dias de trabalho, mais a espera do domínio,
do D-U-N-S e da revisão da Play.
