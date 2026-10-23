# Deploy e CI/CD (Coolify + GitHub Actions)

23/10/2026. Este arquivo era referenciado por `docs/ARQUITETURA-BACKEND.md` § 7.3 e § 8 como "o guia real
de deploy/CI-CD", mas nunca tinha sido escrito — a referência ficou pendurada desde 22/10. Este documento
fecha essa lacuna, descrevendo o pipeline que de fato existe no repositório (`.github/workflows/`,
`apps/api/Dockerfile`, `apps/web/Dockerfile`) e o que falta só para a VPS.

**Status**: workflows e Dockerfiles testados localmente (`docker build`/`docker run` reais contra o
Postgres e o Redis de `infra/`, `pnpm --filter <app> typecheck/test/build` reais). O que não foi testado
daqui — porque exige credenciais e uma VPS de verdade que esta sessão não tem — é a execução no GitHub
Actions em si (push ao registry, webhook do Coolify) e o provisionamento das 2 VPS. Isso fica como
checklist de configuração, não como código a escrever.

---

## 1. Visão geral do pipeline

```
push em main (apps/api/** ou apps/web/** ou packages/shared/**)
        │
        ▼
.github/workflows/ci.yml          — typecheck + test + build (sempre, em toda PR também)
        │ (só em push à main, depois do CI)
        ▼
.github/workflows/deploy.yml
    1. build-push-api / build-push-web   — builda a imagem, publica em ghcr.io
    2. migrate                            — pnpm --filter api migrate:up contra o Postgres de produção
    3. deploy-api / deploy-web             — chama o webhook do Coolify (ele só puxa a imagem e reinicia)
```

Coerente com a decisão já registrada em `docs/ARQUITETURA-BACKEND.md` § 7.3: **o build roda no GitHub
Actions, não no Coolify de produção** — o Coolify de produção só faz `pull` + restart a partir da imagem
pronta. Isso é diferente de homologação (seção 4 abaixo), onde o próprio Coolify builda a partir do
código-fonte.

## 2. Imagens

- `apps/api/Dockerfile` — multi-stage: instala com `pnpm` (contexto de build é a raiz do monorepo, porque
  o pnpm precisa dos `package.json` de todos os workspaces para resolver o lockfile), builda com
  `nest build`, e a imagem final (`node:20-alpine`) só tem `dist/` + `node_modules` de produção — sem
  `node-pg-migrate`/`ts-node` (ficam de propósito fora: são devDependencies, usadas só pelo job `migrate`
  do workflow, que roda a partir do código-fonte, não da imagem).
- `apps/web/Dockerfile` — builda com `vite build`, serve com `nginx:1.27-alpine` (`apps/web/nginx.conf`,
  com fallback de SPA para `react-router`/`BrowserRouter` e cache longo só para `/assets/`).
- `.dockerignore` na raiz exclui `node_modules`, `dist`, `.env*` (exceto `.env.example`) do contexto de
  build.

## 3. Secrets do repositório (GitHub)

**O passo a passo de cliques nas configurações do GitHub (permissões, Environment, visibilidade do pacote
no GHCR) está em `docs/CONFIGURACAO-GITHUB.md`** — esta seção lista só o quê, não o como.

A configurar em Settings → Secrets and variables → Actions do repositório, antes do primeiro deploy:

| Secret | Para quê |
|---|---|
| `PRODUCTION_DATABASE_URL` | job `migrate` roda as migrações contra o Postgres de produção (via rede privada/WireGuard entre o runner... **atenção**: ver nota abaixo) |
| `COOLIFY_WEBHOOK_API` | URL de deploy webhook do Resource da API no Coolify |
| `COOLIFY_WEBHOOK_WEB` | URL de deploy webhook do Resource do front no Coolify |

`GITHUB_TOKEN` para publicar em `ghcr.io` é automático (não precisa cadastrar).

**Nota sobre `PRODUCTION_DATABASE_URL`**: o runner do GitHub Actions roda fora da rede privada entre as 2
VPS (`docs/ARQUITETURA-BACKEND.md` § 7.2). Rodar a migração direto do runner exige expor o Postgres de
produção à internet (mesmo que com senha forte e IP allowlist), o que a arquitetura já decidiu **não**
fazer (seção 7.2: "nunca Postgres exposto na internet pública"). Alternativas, a decidir antes do primeiro
deploy de produção real:
1. Um self-hosted GitHub Actions runner dentro da rede privada das VPS (mais simples de manter coerente
   com a regra acima).
2. O Coolify já tem acesso de rede ao Postgres (mesma infraestrutura) — mover o passo de migração para um
   comando pré-deploy do próprio Resource da API no Coolify, em vez de um job do GitHub Actions.
Até essa decisão, o job `migrate` do workflow serve de referência/documentação do comando certo, mas
**não deve rodar contra produção com o Postgres exposto só para isso**.

## 4. Coolify — Resources a criar

Ordem recomendada (`docs/ARQUITETURA-BACKEND.md` § 8, adaptado ao que já existe):

### VPS-DB
1. **Postgres da plataforma** — a partir de `infra/plataforma/docker-compose.yml`. Remover a publicação
   da porta 5432 (deixar só a rede privada/WireGuard alcançar a VPS-APP).

### VPS-APP
2. **Traccar** — a partir de `infra/traccar/docker-compose.yml`.
3. **Redis (fila)** — a partir de `infra/fila/docker-compose.yml`. Remover a publicação de porta (só a
   API, na mesma VPS, precisa alcançá-lo).
4. **API** (`apps/api`):
   - **Homologação**: Resource "Dockerfile" apontando para `apps/api/Dockerfile`, build direto do
     GitHub a cada push (Coolify builda).
   - **Produção**: Resource "imagem" apontando para `ghcr.io/<org>/<repo>/api:latest`, deploy só via o
     webhook que `deploy.yml` chama — nunca builda a partir do código-fonte em produção.
   - Variáveis de ambiente (iguais às de `apps/api/.env.example`): `DATABASE_URL` (para o Postgres do
     VPS-DB via rede privada, usando `pgbouncer`), `REDIS_URL` (para o Redis desta mesma VPS), `JWT_SECRET`
     (gerar um novo, nunca reaproveitar o de desenvolvimento), `PORT`, e `TRACCAR_URL`/`TRACCAR_USER`/
     `TRACCAR_PASSWORD` quando o polling for ligado.
5. **Front** (`apps/web`): mesmo padrão do item 4 (Dockerfile em homologação, imagem de `ghcr.io` em
   produção), atrás do reverse proxy do Coolify com HTTPS (Let's Encrypt).

## 5. Homologação vs. produção

- **Homologação**: Postgres e app na mesma VPS; o Coolify builda a imagem a partir do Dockerfile de cada
  app direto do código-fonte a cada push — não passa pelo workflow `deploy.yml` (que é só para produção).
- **Produção**: build só no GitHub Actions (`deploy.yml`), publicado em `ghcr.io`; o Coolify de produção só
  recebe o webhook e faz `pull`+restart. Banco em VPS separada (seção 7.2 de `ARQUITETURA-BACKEND.md`).

## 6. Primeiro deploy — checklist

1. Provisionar as 2 VPS (Hostinger), confirmar rede privada ou configurar WireGuard.
2. Subir `infra/plataforma` na VPS-DB (fora do Coolify ou como Resource — a decidir conforme o que o
   Coolify suportar melhor para um compose com múltiplos serviços).
3. Subir `infra/traccar` e `infra/fila` na VPS-APP.
4. Criar os Resources de `apps/api` e `apps/web` no Coolify (seção 4), com as variáveis de ambiente.
5. Rodar a primeira migração manualmente (`pnpm --filter api migrate:up` com `DATABASE_URL` apontando
   para a VPS-DB, de uma máquina com acesso à rede privada — não do runner do GitHub Actions, pela nota
   da seção 3) antes do primeiro deploy da API.
6. Cadastrar os secrets do GitHub (seção 3).
7. Primeiro push à `main` tocando `apps/api/**` ou `apps/web/**` dispara `deploy.yml` de verdade.
8. Confirmar HTTPS (Let's Encrypt via Coolify) nos dois domínios antes de divulgar qualquer URL.
