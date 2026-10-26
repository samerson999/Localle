#!/usr/bin/env sh
# Roda o Makefile dentro do container de ferramentas (infra/tools) — o host só precisa do Docker.
# Uso: ./make.sh <alvo>   (ex.: ./make.sh local, ./make.sh help)
set -e
repo="$(cd "$(dirname "$0")" && pwd)"

docker image inspect localle-tools >/dev/null 2>&1 || docker build -q -t localle-tools "$repo/infra/tools" >/dev/null

# repo montado no mesmo caminho do host: o compose dentro do container passa esses caminhos ao daemon
if [ -t 0 ]; then tty=-it; else tty=-i; fi
exec docker run --rm $tty \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$repo:$repo" -w "$repo" \
  --add-host host.docker.internal:host-gateway \
  localle-tools make "$@"
