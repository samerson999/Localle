#!/usr/bin/env bash
# Gera conf/traccar.xml a partir do template + .env, sobe os containers e cria o administrador.
# Uso: cd infra/traccar && ./setup.sh
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Falta o .env. Copie .env.example para .env e troque as senhas antes de continuar."
  exit 1
fi
set -a; source .env; set +a
# Sobrescrevível: o Makefile roda este script num container, onde o Traccar é host.docker.internal.
TRACCAR_API="${TRACCAR_API:-http://localhost:8082}"

mkdir -p conf
if [ -z "${INGEST_KEY:-}" ]; then
  echo "Falta INGEST_KEY no .env (mesma chave de TRACCAR_INGEST_KEY em apps/api/.env)."
  exit 1
fi
# O Traccar roda em container; a API, por padrão, no host.
INGEST_URL="${INGEST_URL:-http://host.docker.internal:3000}"
sed -e "s/__POSTGRES_PASSWORD__/${POSTGRES_PASSWORD}/" \
    -e "s|__INGEST_URL__|${INGEST_URL}|g" \
    -e "s|__INGEST_KEY__|${INGEST_KEY}|g" \
    traccar.xml.template > conf/traccar.xml

docker compose up -d

echo "Esperando o Traccar responder em ${TRACCAR_API} ..."
for i in $(seq 1 30); do
  if curl -fs ${TRACCAR_API}/api/server > /dev/null 2>&1; then break; fi
  sleep 2
done

echo "Criando o administrador (só funciona se ainda não existir nenhum usuário) ..."
# Sem o campo "administrator": o Traccar promove o 1º usuário criado a administrador sozinho.
# Mandar "administrator": true aqui quebra com erro 500 (bug conhecido do endpoint de bootstrap).
curl -fs -X POST ${TRACCAR_API}/api/users \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Administrador\",\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}" \
  && echo "Administrador criado: ${ADMIN_EMAIL}" \
  || echo "Não criou (provavelmente já existe um usuário) — entre com as credenciais já cadastradas."

echo "Painel: http://localhost:8082"
