---
paths: apps/api/**
---

# Backend (apps/api — NestJS)

Stack real: NestJS 10, `pg` (sem ORM), `node-pg-migrate`, `jsonwebtoken`, `bcryptjs`, Vitest. Não introduza
Prisma/TypeORM/outro ORM sem decisão explícita do usuário — a camada de acesso a dado atual é o
`BaseRepository` com SQL cru, e toda query tem que continuar passando por ela.

## Camadas e onde cada coisa entra

- **Controller** (`*.controller.ts`): HTTP, validação de DTO de entrada, nunca SQL, nunca regra de negócio
  além de orquestrar chamadas ao módulo. Lê `clientId` via `@ClientId()`, nunca de `req.body`/`req.query`.
- **Module** (`*.module.ts`): fiação de DI. Um módulo por domínio (`assets`, `clients`, `users`, `auth`).
- **Repository** (`*.repository.ts`): estende `BaseRepository<Row>` (`src/db/base.repository.ts`). É a
  **única** camada que fala com o `pg.Pool`. Se uma query não cabe nos métodos genéricos
  (`findMany`/`findOne`/`insert`/`update`/`delete`), adicione um método próprio no repository — ele
  ainda deve receber `clientId` como primeiro parâmetro e aplicá-lo no `WHERE`, nunca pular o filtro.
- **Entity** (`*.entity.ts`): tipo da linha da tabela (shape do `Row` do `BaseRepository`), não classe com
  comportamento.
- **DTO** (`dto/*.dto.ts`): shape de entrada/saída HTTP. Regra de negócio e cálculo compartilhado com o
  front vêm de `@localle/shared/<módulo>`, nunca duplicados aqui.

Não crie camada de "service" genérica só por convenção se o controller + repository já resolvem o caso —
mas quando houver orquestração real (mais de uma chamada a repository, regra que não é nem HTTP nem SQL),
ela vai num service, como já é o caso de `auth.service.ts`.

## Isolamento multi-tenant — a regra mais importante deste backend

`docs/ARQUITETURA-BACKEND.md` § 2.1 é a fonte da decisão; aqui está a regra executável:

1. Toda tabela de domínio tem `client_id`. Todo repository de domínio estende `BaseRepository` e nunca
   chama `this.pool.query(...)` fora dela sem passar `clientId` explicitamente pelo `WHERE`.
2. `clientId` só chega na camada de aplicação por `request.auth.clientId`, resolvido pelo `AuthGuard`
   (`src/auth/auth.guard.ts`) a partir do JWT, e só é lido por controllers via `@ClientId()`
   (`src/clients/client-id.decorator.ts`). Uma rota que usa `@ClientId()` tem que estar atrás de
   `@UseGuards(AuthGuard)` — se não estiver, é bug de configuração de rota (por isso o decorator lança
   500, não 400/401, quando `request.auth` não existe).
3. **Toda tabela de domínio nova com `client_id` precisa de uma suite de isolamento** no padrão de
   `assets.isolation.spec.ts`: criar dois `client_id`, inserir dado no primeiro, provar que
   `findMany`/`findOne`/`update`/`delete` autenticados como o segundo não leem nem alteram o dado do
   primeiro, e que o dono continua enxergando e alterando o próprio dado. Isso não é opcional nem é
   "depois" — nasce junto com o repository.
4. RLS no Postgres é reforço adicional nas tabelas mais sensíveis (`positions`/billing), não substitui o
   filtro de aplicação acima. Não implemente só RLS achando que resolve isolamento sozinho.

## Autenticação e JWT

- `AuthGuard` é o único lugar que decodifica e valida o token (`src/auth/jwt.ts`). Não adicione outro
  caminho de autenticação paralelo (ex.: ler header customizado) sem revisar esse guard.
- Senha sempre com `bcrypt.compare`/`bcrypt.hash` (`bcryptjs`), nunca comparação direta nem outro hash.
- Nunca logar token, senha ou `JWT_SECRET`. Mensagens de erro de login são genéricas
  ("E-mail ou senha inválidos") para não revelar se o e-mail existe.

## Contratos de API

- Validar toda entrada HTTP via DTO antes de chegar no repository — não confiar que o front já validou.
- Erros usam as exceptions do Nest (`UnauthorizedException`, `InternalServerErrorException`, etc.), que já
  mapeiam para o status HTTP correto — não capturar e devolver 200 com corpo de erro.
- Ao mudar o formato de uma resposta já consumida pelo front (`apps/web`), verificar quem consome
  (`apps/web/src/lib/rastreioApi.ts` e código correlato) antes de quebrar o contrato; se for mudança
  incompatível, avisar explicitamente — isso ainda não tem versionamento de API formal.

## Banco de conexões

- Um `Pool` por processo (`src/db/pg-pool.provider.ts`), nunca abrir `new Pool()` dentro de um
  request/handler. Se precisar de outro pool (ex.: ingestão separada da leitura, `docs/ARQUITETURA-BACKEND.md`
  § 3), siga o mesmo padrão de provider do Nest, não instancie solto.

## Variáveis de ambiente

`apps/api/.env` (não versionado; `.env.example` documenta as chaves): `DATABASE_URL`, `PORT`,
`JWT_SECRET`. Nunca commitar `.env` real nem segredo em código. Testes de integração usam o mesmo
`DATABASE_URL` do `.env` local (`infra/plataforma`).
