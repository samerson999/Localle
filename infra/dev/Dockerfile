# Imagem de desenvolvimento: só Node + pnpm (versão do packageManager da raiz). O código entra por bind
# mount e as dependências ficam em volumes nomeados — nada de node_modules no host. Ver infra/README.md.
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo
COPY entrypoint.sh /usr/local/bin/dev-entrypoint
RUN chmod +x /usr/local/bin/dev-entrypoint
ENTRYPOINT ["dev-entrypoint"]
