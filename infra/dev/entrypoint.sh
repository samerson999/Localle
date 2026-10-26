#!/bin/sh
# apps/api/.env aponta para localhost (útil fora do Docker). Dentro do container, localhost é o próprio
# container: os serviços de infra/plataforma, infra/fila e infra/traccar são alcançados pelo host.
for var in DATABASE_URL REDIS_URL TRACCAR_URL; do
  eval "val=\${$var:-}"
  [ -n "$val" ] && export "$var=$(echo "$val" | sed -E 's#(@|//)(localhost|127\.0\.0\.1)([:/]|$)#\1host.docker.internal\3#')"
done
exec "$@"
