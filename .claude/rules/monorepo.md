---
paths: packages/shared/**
---

# packages/shared

Único pacote compartilhado do monorepo hoje. Contém tipos, contratos de API e motores de cálculo puros —
sem React, sem DOM, sem Zustand, sem `store`/`idb`. Critério de entrada aqui, já aplicado em
`docs/ARQUITETURA-BACKEND.md` § 0: função pura, independente de front/backend, e não é fixture de
demonstração do protótipo.

## O que entra

- Regra de negócio que precisa dar o mesmo resultado no front (preview/simulação) e no backend (cálculo
  real) — motores como `maint`, `fuel`, `km`, `billing`, `escalation`, `ranking`, `routeStats`, etc.
- Contratos de tipo compartilhados entre `apps/web` e `apps/api` quando a API realmente os consumir.

## O que não entra

- Fixture/dado simulado de demonstração do protótipo (`seed.ts` e afins) — fica em `apps/web`.
- Código acoplado a `document`/CSS vars/DOM (`tokens.ts`) — só roda no navegador, fica em `apps/web`.
- Código acoplado ao mock de rede do protótipo (`positionsSource`, `rastreioApi`, `fenceStats`,
  `nearbyStats`, `speedStats`) — fica em `apps/web` até virarem integração real com a API.
- Não mova uma função para cá só porque é usada duas vezes dentro do mesmo app — o critério é
  compartilhamento real entre `apps/web` e `apps/api`, não duplicação interna a um app.

## Regra de dependência

`packages/shared` nunca importa de `apps/web` nem de `apps/api` — a direção é sempre apps → shared.
Import via alias `@localle/shared/<módulo>` (configurado em `tsconfig.json` de cada app), nunca caminho
relativo atravessando para fora do próprio app.

## Testes

Função pura aqui recebe teste unitário único neste pacote — não duplicar o mesmo teste em `apps/web` e
`apps/api` só porque os dois a importam.
