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
RUN pnpm --filter api build

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

WORKDIR /app/apps/api
EXPOSE 3000
# dist/apps/api/src: a API importa tipos de packages/shared, então o rootDir do tsc é a raiz do monorepo.
CMD ["node", "dist/apps/api/src/main.js"]

# Migrações não rodam a partir desta imagem (sem node-pg-migrate/ts-node, que são devDependencies —
# propositalmente fora da imagem de runtime). O CI/CD roda `pnpm --filter api migrate:up` a partir do
# estágio "build" (com devDependencies) contra o banco do ambiente, como passo separado antes do deploy —
# ver docs/DEPLOY-COOLIFY.md.
