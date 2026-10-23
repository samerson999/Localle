# Configuração do repositório no GitHub (CI/CD)

23/10/2026. Checklist do que precisa ser clicado/cadastrado nas configurações do repositório no GitHub
para `.github/workflows/ci.yml` e `.github/workflows/deploy.yml` funcionarem — nenhum desses passos é
código, por isso fica separado de `docs/DEPLOY-COOLIFY.md` (que cobre o lado Coolify/VPS). Sem isso, os
workflows existem mas falham na primeira execução real.

## 1. Permitir as actions de terceiros usadas

Os workflows usam `dorny/paths-filter`, `pnpm/action-setup`, `docker/login-action` e
`docker/build-push-action` — nenhuma é da própria GitHub. Se a organização restringe actions de
terceiros:

**Settings → Actions → General → Actions permissions** → "Allow all actions and reusable workflows"
(ou, se a política da organização exigir lista explícita, adicionar as quatro acima).

## 2. Permissão do `GITHUB_TOKEN` para publicar em ghcr.io

`deploy.yml` já declara `permissions: packages: write` no próprio workflow, mas isso só funciona se a
configuração do repositório **permitir** essa permissão — o bloco do workflow pede um teto, não o ignora.

**Settings → Actions → General → Workflow permissions** → marcar "Read and write permissions".

Sem isso, `build-push-api`/`build-push-web` falham no `docker/login-action`/push com 403/denied, mesmo com
o `permissions:` certo no YAML.

## 3. Environment "producao"

Os jobs `migrate`, `deploy-api` e `deploy-web` de `deploy.yml` rodam contra o Environment `producao` — é
nele que os secrets de produção ficam, não nos secrets gerais do repositório (separação deliberada: um
secret de repositório vale para qualquer branch/PR; um secret de Environment só é injetado em jobs que
declaram esse Environment).

**Settings → Environments → New environment** → nome exatamente `producao` (o YAML referencia esse nome
literal). Dentro dele, **Environment secrets** → adicionar:

| Secret | Valor |
|---|---|
| `PRODUCTION_DATABASE_URL` | connection string do Postgres de produção — ver a ressalva de rede em `docs/DEPLOY-COOLIFY.md` § 3 antes de usar este secret de verdade |
| `COOLIFY_WEBHOOK_API` | URL de deploy webhook do Resource da API no Coolify |
| `COOLIFY_WEBHOOK_WEB` | URL de deploy webhook do Resource do front no Coolify |

Opcional, mas recomendado antes de ligar o deploy automático de verdade: em **Environment protection
rules**, marcar "Required reviewers" (alguém aprova manualmente antes do job rodar contra produção) —
evita que um push direto à `main` dispare deploy sem revisão, enquanto o time ainda está validando o
pipeline.

## 4. Visibilidade do pacote no GHCR (ghcr.io)

O primeiro push de `deploy.yml` cria os pacotes `ghcr.io/<org>/<repo>/api` e `.../web` como **privados**
por padrão. O Coolify precisa conseguir puxar essas imagens — duas opções:

- **Pacote público** (mais simples, aceitável se o código não for sensível só por estar numa imagem
  buildada — a imagem não contém segredo nenhum, variáveis de ambiente entram em runtime, não no build):
  na página do pacote (aparece em "Packages" do repositório/organização depois do primeiro push) →
  Package settings → Change visibility → Public.
- **Pacote privado**: criar um Personal Access Token (classic) com escopo `read:packages`, e cadastrar
  esse token como credencial de registry no Coolify (cada Resource de imagem do Coolify tem um campo de
  autenticação de registry privado).

## 5. Proteção da branch `main` (recomendado, não bloqueante)

**Settings → Branches → Branch protection rules** → `main` → "Require status checks to pass before
merging" → selecionar os jobs `web`/`api` de `ci.yml`. Evita merge de código que quebra typecheck/test/build
— não é exigido pelos workflows em si, mas fecha o ciclo: sem isso, `ci.yml` roda e avisa, mas não impede
o merge.

## 6. Ordem de configuração recomendada

1. Seção 1 e 2 (permissões) — sem isso nada do resto funciona.
2. Seção 3 (Environment `producao`) — antes do primeiro push que toque `apps/api/**`/`apps/web/**` na
   `main`, senão `deploy.yml` falha por secret ausente.
3. Primeiro push de teste (pode ser um commit pequeno, tipo um comentário) para confirmar que
   `build-push-api`/`build-push-web` publicam em ghcr.io.
4. Seção 4 (visibilidade do pacote) — assim que o pacote existir.
5. Seção 5 (proteção de branch) — quando o time achar que o CI está estável o suficiente para bloquear
   merge nele.
