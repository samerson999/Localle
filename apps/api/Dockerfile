# syntax=docker/dockerfile:1

# Build no contexto do monorepo inteiro (precisa dos package.json de todos os workspaces para o pnpm
# resolver corretamente, mesmo construindo só a imagem da API) — ver infra/README.md e
# docs/ARQUITETURA-BACKEND.md § 7.3 ("Dockerfile de cada app, não a raiz do monorepo" refere-se ao
# arquivo, o contexto de build continua sendo a raiz).

FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter api build && pnpm --filter api build:migrations

FROM node:20-alpine AS runner
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/pnpm-workspace.yaml /repo/package.json /repo/pnpm-lock.yaml ./
COPY --from=build /repo/apps/api/package.json apps/api/package.json
COPY --from=build /repo/apps/web/package.json apps/web/package.json
COPY --from=build /repo/packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile --prod --filter api
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/dist-migrations apps/api/dist-migrations
COPY apps/api/scripts/start-prod.sh apps/api/scripts/start-prod.sh

WORKDIR /app/apps/api
EXPOSE 3000
# Aplica as migrations pendentes (dist-migrations, compiladas no build) e sobe a API — scripts/start-prod.sh.
# dist/apps/api/src: a API importa tipos de packages/shared, então o rootDir do tsc é a raiz do monorepo.
CMD ["sh", "scripts/start-prod.sh"]

# Migrações rodam na subida do container (scripts/start-prod.sh), com o node-pg-migrate de dependência de
# runtime e as migrations já em JS — ts-node/typescript continuam fora da imagem.
