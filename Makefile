# Localle — atalhos de ambiente. Roda dentro do container infra/tools: use ./make.sh <alvo> (Linux/macOS/VPS)
# ou .\make.ps1 <alvo> (Windows). O host só precisa do Docker — nada de Node/pnpm/make instalado.
#
# Ambientes locais (homologação/produção são Coolify, ver docs/DEPLOY-COOLIFY.md):
#   local     web (Vite :5173) + api (nest --watch :3000) com hot reload — infra/dev
#   prd-like  imagens de produção (nginx :8080, api :3001) — infra/prd-like
# Os dois usam as mesmas stacks de infra (plataforma, fila, traccar).

DEV      := docker compose -f infra/dev/docker-compose.yml
PRD_LIKE := docker compose -f infra/prd-like/docker-compose.yml
# comandos de app dentro do container de dev, com as URLs do apps/api/.env ajustadas (infra/dev/entrypoint.sh)
API_RUN  := $(DEV) run --rm --no-deps api dev-entrypoint

.DEFAULT_GOAL := help
.PHONY: help infra infra-down infra-ps traccar local local-down local-logs local-api-sh local-web-sh \
        install migrate migrate-down seed test typecheck prd-like prd-like-down prd-like-logs \
        prd-like-api-sh build stop

help: ## lista os alvos
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# --- infra (banco, fila, traccar) ---------------------------------------------------------------

infra: ## sobe banco da plataforma, fila e traccar
	docker compose -f infra/plataforma/docker-compose.yml up -d --wait
	docker compose -f infra/fila/docker-compose.yml up -d --wait
	$(MAKE) traccar

traccar: ## sobe o traccar (gera conf e cria o admin na 1ª vez)
	cd infra/traccar && TRACCAR_API=http://host.docker.internal:8082 bash ./setup.sh

infra-down: ## para as stacks de infra (dados preservados nos volumes)
	docker compose -f infra/traccar/docker-compose.yml down
	docker compose -f infra/fila/docker-compose.yml down
	docker compose -f infra/plataforma/docker-compose.yml down

infra-ps: ## estado das stacks de infra
	@docker compose -p plataforma-db ps
	@docker compose -p fila ps
	@docker compose -p traccar ps

# --- local (desenvolvimento) ---------------------------------------------------------------------

local: infra ## sobe infra + web e api com hot reload
	$(DEV) up -d --build
	$(MAKE) migrate
	@echo "web: http://localhost:5173   api: http://localhost:3000/health"

local-down: ## para web e api de dev (infra continua de pé)
	$(DEV) down

local-logs: ## acompanha logs de web e api
	$(DEV) logs -f web api

local-api-sh: ## shell no container da api
	$(DEV) exec api dev-entrypoint sh

local-web-sh: ## shell no container do web
	$(DEV) exec web sh

install: ## reinstala dependências (depois de mudar package.json/lockfile)
	$(DEV) run --rm install

migrate: ## roda migrations pendentes
	$(API_RUN) pnpm --filter api migrate:up

migrate-down: ## desfaz a última migration
	$(API_RUN) pnpm --filter api migrate:down

seed: ## cria o usuário de demonstração
	$(API_RUN) pnpm --filter api seed:demo-user

test: ## testes de todos os workspaces (api contra o Postgres local)
	$(API_RUN) pnpm test

typecheck: ## typecheck de todos os workspaces
	$(API_RUN) pnpm typecheck

# --- prd-like (simulação de produção) ------------------------------------------------------------

prd-like: infra migrate ## sobe as imagens de produção (web :8080, api :3001)
	$(PRD_LIKE) up -d --build
	@echo "web: http://localhost:8080   api: http://localhost:3001/health"

prd-like-down: ## para o prd-like
	$(PRD_LIKE) down

prd-like-logs: ## acompanha logs do prd-like
	$(PRD_LIKE) logs -f

prd-like-api-sh: ## shell no container da api do prd-like
	$(PRD_LIKE) exec api sh

# --- geral ---------------------------------------------------------------------------------------

build: ## reconstrói as imagens (dev e prd-like)
	$(DEV) build
	$(PRD_LIKE) build

stop: ## para web/api de dev e prd-like (infra continua de pé)
	$(DEV) stop
	$(PRD_LIKE) stop
