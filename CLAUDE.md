# Localle — instruções para Claude Code

Monorepo pnpm da plataforma de rastreamento Localle. Produto real em desenvolvimento ativo — não é
protótipo descartável. `PRODUCT.md` é o produto; `docs/ARQUITETURA-BACKEND.md` e
`docs/ARQUITETURA-INTEGRACAO-TRACCAR.md` são a arquitetura decidida — leia-os antes de propor algo
diferente do que já está lá. Regras especializadas e executáveis ficam em `.claude/rules/`.

## Mapa do monorepo

```
apps/web/        front (Vite + React 18 + Zustand), hoje a maior parte do produto
apps/api/        backend (NestJS + pg + node-pg-migrate) — auth/clients/users/assets/grupos/motoristas, ingest/queue/
                 realtime/comandos, cercas/regras/alertas, settings, contratos, jornada/multas/combustivel/
                 manutencao/checklist/pneus/ranking/viagens, reports/painel, retencao
packages/shared/ tipos, contratos e motores de cálculo puros (sem React/DOM/Zustand), compartilhados
infra/           infra/plataforma (Postgres+TimescaleDB+PostGIS) e infra/traccar (gateway de rastreadores)
docs/            decisões de arquitetura e especificação — fonte de verdade de domínio
```

`pnpm-workspace.yaml`: `apps/*`, `packages/*`. O front importa `@localle/shared/<módulo>`; a API também
(`tsconfig.json` de cada app mapeia o path). **Regra de dependência**: `packages/shared` nunca importa de
`apps/*`; `apps/api` e `apps/web` podem importar de `packages/shared`, nunca um do outro.

## Comandos

```
pnpm dev            # web, na porta do vite.config (não assuma 5173 — ver nota abaixo)
pnpm dev:api        # api (nest start --watch), lê apps/api/.env
pnpm typecheck       # -r, todos os workspaces
pnpm test            # -r, todos os workspaces (vitest)
pnpm --filter api migrate:up    # roda migrations pendentes (node-pg-migrate)
pnpm --filter api seed:demo-user
```

Infra local (banco): `infra/plataforma` sobe Postgres+TimescaleDB+PostGIS via `docker compose`; ver
`infra/README.md`. Os testes de integração da API (`*.spec.ts` em `apps/api/src`) rodam contra esse banco
de verdade, lendo `DATABASE_URL` de `apps/api/.env` — não contra mock.

**Nota de ambiente (memória do usuário)**: o usuário normalmente já tem um dev server do front rodando na
porta 5174; não assuma que precisa subir um novo. Se alterar `tailwind.config`, avise que o servidor
antigo pode ficar com estilo desatualizado até reiniciar — não reinicie você mesmo sem perguntar.

## O que já está decidido (não reabra sem motivo novo)

- **Backend nasce neste monorepo** (`apps/api`), não em repositório separado — `docs/ARQUITETURA-BACKEND.md` § 0.
- **Isolamento multi-tenant por `client_id` é obrigatório via `BaseRepository`** (`apps/api/src/db/base.repository.ts`)
  — nenhuma query de domínio chama `pg` diretamente. Ver `.claude/rules/backend.md`.
- **Traccar é o gateway de rastreadores**, não um gateway próprio — `docs/ARQUITETURA-BACKEND.md` § 6.
- **RLS é segunda camada de defesa, não a primeira** — o filtro de aplicação é a fonte da verdade.
- Nomes de tabela/coluna de domínio de telemetria são em português (`rastreadores`, `instalacoes`,
  `posicoes`, `eventos`) — `docs/ARQUITETURA-INTEGRACAO-TRACCAR.md` § 4. Siga a convenção já em uso no
  módulo que está tocando; não traduza para inglês a meio caminho.

## Premissas inegociáveis

- **Toda etapa/módulo novo em `apps/api` nasce com teste** (unitário, ou integração contra o Postgres
  local quando a lógica depende de constraint/trigger/view do banco). Isso já é prática do repositório
  (`assets.isolation.spec.ts`, `telemetria/schema.spec.ts`) — continue, não regrida.
- Nunca confiar em `client_id` vindo de header/corpo/query — só do JWT validado pelo `AuthGuard`.
- Nunca declarar teste como passando sem executá-lo. Se um teste de integração não pôde rodar (banco
  indisponível, etc.), diga isso explicitamente e qual o risco restante.
- Mudança de schema é migration (`apps/api/migrations/`, node-pg-migrate), nunca `ALTER` manual fora
  desse mecanismo. Ver `.claude/rules/database.md`.
- Sem abstração especulativa: não mova função para `packages/shared` "porque pode ser reaproveitada";
  mova quando front e backend realmente precisarem da mesma regra (critério já registrado em
  `docs/ARQUITETURA-BACKEND.md` § 0).
- Sem refatoração paralela à tarefa pedida. Mudança pequena e coesa.
- Todo caminho que pode falhar silenciosamente (ingestão, fila, worker, integração com Traccar) loga com
  o `Logger` do Nest, no nível certo (`error`/`warn`/`log`) e com o identificador que permite diagnosticar
  sem reproduzir — ver `.claude/rules/observability.md`. Log é parte da implementação, não um extra.

## Fluxo esperado numa tarefa não trivial

1. Ler o código e a doc de domínio relevante antes de implementar (`docs/ARQUITETURA-*.md`, migration mais
   recente da tabela afetada, repository existente).
2. Implementar a menor mudança coesa que resolve o pedido, seguindo o padrão já presente no módulo.
3. Testar: criar/atualizar o teste da camada certa (ver `.claude/rules/testing.md`), rodar
   `pnpm --filter <app> test` do pacote afetado, investigar falha em vez de enfraquecer o teste.
4. Reportar: o que mudou, por que essa solução, quais comandos rodaram e o resultado, o que não pôde ser
   verificado e por quê.

Nunca afirmar algo como "pronto" sem ter rodado o typecheck/teste correspondente.

## Regras especializadas

- `.claude/rules/backend.md` — NestJS, camadas, `BaseRepository`, auth/JWT, contratos de API.
- `.claude/rules/database.md` — migrations, Postgres/TimescaleDB/PostGIS, isolamento, performance de query.
- `.claude/rules/testing.md` — matriz de validação por tipo de mudança, convenções dos specs existentes.
- `.claude/rules/monorepo.md` — `packages/shared`, limites entre apps, convenções de workspace.
- `.claude/rules/observability.md` — logs (níveis, o que logar sempre, o que nunca logar), saúde do sistema.
- `.claude/rules/security.md` — IDOR/isolamento, JWT, SQL parametrizado, segredos, superfícies de ataque.
  Para mudança sensível (auth, faturamento, isolamento multi-tenant, ingestão Traccar), rodar a skill
  `security-review` e, se aplicável, os agentes `pentester-isolamento`/`pentester-input` antes de dar como
  concluído.

## Governança deste arquivo

Mantenha este `CLAUDE.md` enxuto (referências, não explicações longas). Documentação extensa de domínio
vive em `docs/`; regras operacionais detalhadas vivem em `.claude/rules/`. Não duplique aqui o que já está
documentado em `docs/ARQUITETURA-BACKEND.md` ou `docs/ARQUITETURA-INTEGRACAO-TRACCAR.md` — referencie.
