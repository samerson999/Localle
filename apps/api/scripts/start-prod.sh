#!/bin/sh
# Entrada da imagem de produção/homologação: aplica as migrations pendentes e só então sobe a API. Se a
# migration falhar, o container não sobe (e o deploy no Coolify mostra o erro), em vez de a API rodar
# contra um schema desatualizado.
#
# MIGRATION_DATABASE_URL: conexão DIRETA ao Postgres (não pelo PgBouncer). Em pool por transação, a trava
# (advisory lock) do node-pg-migrate pode cair em conexões diferentes do servidor e ficar presa. Sem ela,
# usa DATABASE_URL sem trava — seguro com uma instância só da API; com várias, defina a variável.
set -e
if [ -n "$MIGRATION_DATABASE_URL" ]; then
  export MIGRATE_URL="$MIGRATION_DATABASE_URL"
  LOCK=""
else
  export MIGRATE_URL="$DATABASE_URL"
  LOCK="--no-lock"
  echo "start-prod: MIGRATION_DATABASE_URL não definida; migrations pela DATABASE_URL, sem trava"
fi
node node_modules/node-pg-migrate/bin/node-pg-migrate.js up -m dist-migrations -d MIGRATE_URL $LOCK
exec node dist/apps/api/src/main.js
