# Infraestrutura (Docker)

Decisões e porquês em `docs/ARQUITETURA-BACKEND.md`. Passo a passo do Traccar em `docs/GUIA-TRACCAR.md`.

## Pastas

- `plataforma/` — Postgres 16 + TimescaleDB + PostGIS (banco da plataforma) + PgBouncer. Sobe no VPS-DB em produção; local em desenvolvimento.
- `traccar/` — Traccar + o Postgres próprio dele. Sobe no VPS-APP em produção; local em desenvolvimento.

Os dois são independentes um do outro — bancos separados, mesmo rodando no mesmo compose em desenvolvimento.

## Subir tudo localmente

```bash
# banco da plataforma
cd infra/plataforma && cp .env.example .env   # troque a senha
docker compose up -d

# traccar
cd ../traccar && cp .env.example .env         # troque as duas senhas
./setup.sh
```

Verificar:

```bash
docker compose -p plataforma-db ps
docker compose -p traccar ps
```

## Em produção (2 VPS)

- `plataforma/docker-compose.yml` vai para o VPS-DB. Remover a publicação da porta 5432 no `docker-compose.yml` (deixar só a rede privada/WireGuard entre os dois servidores alcançar o banco).
- `traccar/docker-compose.yml` vai para o VPS-APP, junto com a API NestJS (quando existir) e o reverse proxy com HTTPS.
- O Coolify, quando entrar, assume o `docker compose up -d` de cada stack a partir do GitHub — os arquivos aqui continuam sendo a fonte da verdade.

## Por que dois serviços de Postgres diferentes

O Traccar é opinativo sobre o próprio schema (`tc_*`) e não deve dividir banco com as tabelas de negócio da plataforma — mantê-lo isolado facilita trocar de gateway de rastreador no futuro sem tocar no banco principal, e evita que uma migration da plataforma colida com uma atualização do Traccar.
