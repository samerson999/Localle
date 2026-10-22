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

mkdir -p conf
sed "s/__POSTGRES_PASSWORD__/${POSTGRES_PASSWORD}/" traccar.xml.template > conf/traccar.xml

docker compose up -d

echo "Esperando o Traccar responder em http://localhost:8082 ..."
for i in $(seq 1 30); do
  if curl -fs http://localhost:8082/api/server > /dev/null 2>&1; then break; fi
  sleep 2
done

echo "Criando o administrador (só funciona se ainda não existir nenhum usuário) ..."
# Sem o campo "administrator": o Traccar promove o 1º usuário criado a administrador sozinho.
# Mandar "administrator": true aqui quebra com erro 500 (bug conhecido do endpoint de bootstrap).
curl -fs -X POST http://localhost:8082/api/users \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Administrador\",\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}" \
  && echo "Administrador criado: ${ADMIN_EMAIL}" \
  || echo "Não criou (provavelmente já existe um usuário) — entre com as credenciais já cadastradas."

echo "Painel: http://localhost:8082"
