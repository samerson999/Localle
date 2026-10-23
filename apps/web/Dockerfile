# syntax=docker/dockerfile:1

# Contexto de build é a raiz do monorepo (mesmo motivo do apps/api/Dockerfile — pnpm precisa dos
# package.json de todos os workspaces para resolver o lockfile corretamente).

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
# `RASTREIO_API_URL`/`RASTREIO_API_KEY` (sem prefixo VITE_) só alimentam o proxy do `vite dev`/`preview`
# (servidor Node, apps/web/vite.config.ts) — não afetam `vite build` nem o bundle estático servido pelo
# Nginx abaixo, então não entram aqui como build-arg. Uma variável `VITE_*` que precisasse ir para o
# bundle (hoje não há nenhuma em uso real) entraria como ARG + ENV antes deste RUN.
RUN pnpm --filter web build

FROM nginx:1.27-alpine AS runner
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
