---
paths: apps/api/**, apps/web/**, packages/shared/**
---

# Testes

Premissa do projeto (memória registrada do usuário): **toda etapa/módulo novo em `apps/api` nasce com
teste** — não é atividade "depois". Vitest é o runner em todos os workspaces (`pnpm -r test`, ou
`pnpm --filter <app> test` para rodar só um).

## O que existe hoje (siga o padrão, não reinvente)

- `apps/api/src/**/*.isolation.spec.ts` — integração contra Postgres local real (`infra/plataforma`), lida
  `DATABASE_URL` via `dotenv/config`. Cria `clients` de teste com `randomUUID()` no nome, limpa em
  `afterAll`. Veja `assets.isolation.spec.ts` como template de isolamento multi-tenant.
- `apps/api/src/telemetria/schema.spec.ts` — integração que testa comportamento do próprio schema
  (constraint, exclusion constraint, view), sem camada de repository porque o módulo ainda não tem uma.
- `apps/web/src/lib/*.test.ts` — unitário, funções puras (`fenceStats`, `nearbyStats`, `speedStats`).

## Matriz de validação por tipo de mudança

| Mudança | Teste esperado |
|---|---|
| Nova regra de negócio pura (`packages/shared`) | Unitário cobrindo casos de borda, sem mock |
| Novo repository/tabela com `client_id` | Suite de isolamento no padrão `assets.isolation.spec.ts` |
| Nova migration com constraint/trigger/view | Integração contra Postgres real provando o comportamento, não só que a migration roda |
| Alteração de endpoint/contrato de API | Teste do controller/repository cobrindo o novo shape; checar consumidor em `apps/web` |
| Mudança em `AuthGuard`/JWT/login | Caso positivo, caso negativo (token ausente/inválido/expirado), caso de autorização |
| Correção de bug | Teste de regressão que falha antes da correção e passa depois |
| Função pura de `packages/shared` usada por front e API | Teste único em `packages/shared`, não duplicado nos dois apps |

## Regras

- Teste de integração usa o Postgres local de verdade (`infra/plataforma`), nunca mock de `pg`/ORM — o que
  está sob teste é a garantia que o banco oferece (constraint, exclusion constraint, dedup), e mockar o
  driver não prova nada sobre isso.
- Teste cria seu próprio dado (`clients`/`rastreadores`/etc. com `randomUUID()` no identificador) e limpa
  em `afterAll`/`afterEach` — nunca depende de dado deixado por outro teste ou de ordem de execução.
- Teste de isolamento multi-tenant sempre cobre os dois lados: que o outro `client_id` não vê/altera, **e**
  que o dono continua vendo/alterando normalmente — um teste que só prova o bloqueio pode mascarar um
  bug que também bloqueia o dono.
- Não usar `sleep` como sincronização; se há assincronismo real para esperar, usar o mecanismo do próprio
  teste (await da promise, não timer arbitrário).
- Não enfraquecer um teste (relaxar assert, pular caso) para fazê-lo passar — investigar a causa raiz.
- Antes de reportar uma tarefa como concluída, rodar o teste do pacote afetado e reportar o resultado
  (comando executado + saída resumida). Se não puder rodar (ex.: banco local fora do ar), dizer isso
  explicitamente e qual o risco de não ter rodado.

## Cobertura

Sem threshold configurado no repositório — não inventar percentual mínimo. Priorizar cobertura de: regra
de isolamento multi-tenant, constraints de banco que protegem invariante de domínio (instalação sem
sobreposição, dedup de ingestão), e cálculos de `packages/shared` consumidos por decisão de produto
(faturamento, manutenção, escalonamento). Não criar teste artificial só para "ter teste".
