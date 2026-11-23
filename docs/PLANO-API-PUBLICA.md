# Plano — API pública de consulta (REST, Swagger, chaves de acesso)

Status: **proposto em 23/11/2026**, nada implementado. Decisões do usuário em 23/11 registradas na § 9.

## 1. Objetivo

Permitir que outro sistema (ERP, BI, TMS, planilha automatizada) **consulte** os dados de um cliente sem usar o
login de uma pessoa. A API é **somente leitura**: nenhuma rota `POST`/`PATCH`/`DELETE` de domínio.

Casos típicos: última posição e histórico de posições/viagens; eventos e alertas; cadastro de veículos/motoristas/
grupos; abastecimentos, multas, manutenções e jornada para BI.

Fora do escopo: escrita, SDKs, GraphQL, cobrança da API (adiada), API para o Traccar (é o contrário — ver
`ARQUITETURA-INTEGRACAO-TRACCAR.md`).

## 2. Decisão central: superfície própria, versionada

A API pública **não** é a API interna com uma chave na frente. As controllers de `apps/api` têm o formato que a
tela precisa e mudam a cada sprint; expor isso como contrato travaria o front.

- Rotas sob **`/v1/...`** na API, controllers próprias em `apps/api/src/api-publica/` (uma por recurso, só `@Get`),
  que **chamam os services/repositories existentes** — nada de regra duplicada nem SQL fora dos repositories.
- DTOs de resposta próprios (`api-publica/dto/`) com nomes estáveis; a tradução interno → público fica na
  controller pública. Mudança incompatível do contrato vira `/v2`.
- **Endereço público: caminho dentro do app** — `https://app.lclfleet.com/api/v1/...`. O proxy do container web
  (o mesmo que hoje encaminha `/api-localle` para a API) encaminha `/api/v1` → `/v1` da API. Sem subdomínio novo.

## 3. Autenticação: chaves de acesso

### 3.1 Modelo

A chave é **portadora**: quem a tiver consulta os dados do cliente que a emitiu, dentro dos escopos dela — não
importa se é o próprio cliente, a revenda ou um fornecedor de BI. Não há chave de revenda que enxergue vários
clientes: cada chave pertence a **um** `client_id` (o isolamento multi-tenant continua igual ao resto da API).

### 3.2 Formato e armazenamento

- Chave: `lcl_live_<32 bytes aleatórios em base62>`; `lcl_test_` para o sandbox (§ 7). O prefixo é reconhecido
  por scanners de segredo (GitHub etc.).
- No banco só o **hash SHA-256** e os 8 primeiros caracteres (para reconhecer qual é qual). A chave completa
  aparece **uma vez**, na criação. SHA-256 sem salt basta: 256 bits de entropia, não é senha.
- Migration nova `api_chaves`:

  | coluna | |
  |---|---|
  | `id` uuid | |
  | `client_id` uuid not null | isolamento via `BaseRepository` |
  | `nome` text | "Power BI", "ERP" |
  | `prefixo` text | exibição |
  | `hash` bytea unique | busca na autenticação |
  | `escopos` text[] | § 3.4 |
  | `criada_por` uuid | auditoria |
  | `expira_em` timestamptz null | opcional |
  | `revogada_em` timestamptz null | revogação lógica, nunca delete |
  | `ultimo_uso_em` timestamptz | atualizado no máx. 1x/min por chave |

  Sem lista de IPs permitidos por enquanto (decisão 23/11); a coluna entra numa migration futura se pedirem.

### 3.3 Guard

- Header **`Authorization: Bearer lcl_live_...`**.
- Novo `ApiChaveGuard` aplicado só às controllers `/v1` (decorator `@ApiPublica()`), que:
  1. resolve a chave pelo hash, recusa revogada/expirada — sempre `401` genérico;
  2. recusa cliente com contrato em `BLOCKED_STATUSES` (`401`) e módulo fora do contrato (`403`), reaproveitando
     `acessosDoCliente` do `ModuloGuard`;
  3. confere o escopo exigido pela rota (`403`);
  4. preenche `request.auth` com o `clientId` da chave e um principal novo `{ tipo: 'chave', chaveId }`.
- O `AuthGuard` global ignora rotas `@ApiPublica()` (como faz com `@Public()`), e o `ApiChaveGuard` recusa JWT
  nelas: chave nunca abre rota interna, JWT nunca abre `/v1`.
- O guard também recusa qualquer método que não seja `GET`/`HEAD` (defesa extra da regra "só consulta").
- Cache em memória de chave válida por 60 s; revogação vale em até 60 s (documentado no Swagger).
- Log: `warn` em chave inválida/revogada com prefixo e IP (nunca a chave inteira), `log` na criação/revogação.

### 3.4 Escopos (só leitura)

Um por grupo do catálogo (§ 4.1): `frota`, `cercas`, `posicoes`, `eventos`, `alertas`, `comandos`, `relatorios`,
`viagens`, `jornada`, `ranking`, `combustivel`, `multas`, `manutencao`, `checklist`, `pneus`. Cada rota também
declara o módulo de `MODULES` (`@localle/shared/contratos`) de que depende — escopo é o que a chave pode, módulo é o
que o contrato permite; as duas checagens valem.

Só dá para marcar escopo de módulo contratado; se o módulo sair do contrato, a chave perde o acesso na hora
(passo 2), sem editar a chave.

### 3.5 Gestão das chaves (tela)

- **Setup do gestor** (`/setup`), aba "API", com permissão nova `api.gerir_chaves` (padrão: só admin do cliente).
- Criar (nome, escopos, validade opcional) → mostra a chave uma vez, com copiar; listar (prefixo, escopos, último
  uso, criada por); revogar; rotacionar (nova chave, a antiga vale mais 7 dias).
- Tudo em `audit`. E-mail ao admin quando uma chave é criada.
- Máximo de 10 chaves ativas por cliente.

### 3.6 Chave mestra (admin da Localle)

Para a equipe da Localle consultar qualquer cliente pela API.

- Emitida **só pelo superadmin**, no Console da Localle; prefixo `lcl_master_`; tabela própria
  `api_chaves_mestras` (mesmas colunas de `api_chaves`, **sem** `client_id`, mais `ips_permitidos cidr[] not null`).
- O cliente vem **do caminho**, nunca de header/corpo — mesmo padrão do superadmin hoje (`auth.guard.ts`):
  `GET /v1/clientes` lista os clientes; `GET /v1/clientes/{clientId}/veiculos`, `.../posicoes/ultimas` etc. espelham
  as rotas da chave de cliente. Mesmas controllers públicas; o guard resolve o `clientId` do caminho para a chave
  mestra e o da chave para a chave de cliente. Chave de cliente em `/v1/clientes/...` → `401`; chave mestra nas
  rotas sem `clientId` → `401`.
- Sem rotas extras (faturamento, contratos, Console): só as mesmas consultas, em qualquer cliente.
- Proteções obrigatórias, além das da chave de cliente:
  1. **lista de IPs obrigatória** (a decisão 5 de não ter lista vale só para chave de cliente);
  2. **validade obrigatória**, máximo 90 dias;
  3. **toda requisição na auditoria** com `client_id` consultado, rota e IP (não só o agregado diário);
  4. **e-mail a todos os superadmins** na criação, na revogação e no primeiro uso de um IP;
  5. limite próprio: 300 req/min, 100.000/dia; módulos do contrato do cliente consultado continuam valendo.
- Log `warn` em qualquer tentativa com chave mestra inválida, revogada ou de IP fora da lista.

## 4. Convenções do contrato

- **JSON**, campos em `camelCase` **em português** (`placa`, `ignicao`, `velocidadeKmh`, `dataHora`), datas ISO 8601
  UTC, km, km/h, `latitude`/`longitude` decimais.
- **IDs**: os uuid internos. Filtros por `?placa=` e, quando existir, `?codigoExterno=` (campo opcional novo em
  veículo/motorista, preenchido na tela, para casar com o ERP).
- **Paginação por cursor**: `?limite=100&cursor=...` → `{ dados: [], proximoCursor }`. Nada de `offset` (hypertables
  grandes).
- **Período obrigatório** em séries temporais (`de`/`ate`), reaproveitando `validar-periodo` de `common/`.
- **Erros** no formato do `HttpExceptionFilter` mais `codigo` estável: `{ statusCode, codigo: "periodo_invalido",
  message }`.
- Cabeçalhos: `X-Request-Id` em toda resposta (o suporte acha no log), `X-RateLimit-Limite`, `-Restante`,
  `-Reinicio`; `ETag` nas listas de cadastro para o integrador economizar.

### 4.1 Catálogo de endpoints

Levantado em 23/11 a partir dos `@Get` das controllers internas: tudo que o cliente enxerga na plataforma tem um
equivalente de consulta. Todas sob `app.lclfleet.com/api/v1`; "fonte" é o service interno reaproveitado.

**Frota e cadastros** — escopo `frota`, módulo `ativos`

| Rota | Conteúdo | Fonte |
|---|---|---|
| `GET /empresa` | dados do cliente dono da chave | `empresa` |
| `GET /veiculos`, `/veiculos/{id}` | cadastro, documentos, grupo, operação, status | `assets` |
| `GET /veiculos/{id}/rastreadores` | rastreador principal e backup, modelo, última comunicação | `rastreadores` |
| `GET /rastreadores` | rastreadores do cliente | `rastreadores-cliente` |
| `GET /grupos`, `/grupos/{id}` | grupos e seus veículos | `grupos` |
| `GET /operacoes` | operações/centros de custo | `operacoes` |
| `GET /motoristas`, `/motoristas/{id}` | cadastro, CNH, cartão | `motoristas` |
| `GET /motoristas/vencimentos` | CNH, exames e cursos a vencer | `motoristas` |
| `GET /motoristas/vinculos` | histórico motorista ↔ veículo | `motoristas` |

**Cercas e regras** — escopo `cercas`, módulo `monitoramento`

| Rota | Conteúdo | Fonte |
|---|---|---|
| `GET /cercas`, `/cercas/{id}` | cercas em GeoJSON | `cercas` |
| `GET /regras` | regras de alerta configuradas | `regras` |

**Telemetria** — módulo `monitoramento`

| Rota | Escopo | Conteúdo | Fonte |
|---|---|---|---|
| `GET /posicoes/ultimas` | `posicoes` | última posição, ignição, velocidade, status de cada veículo | `monitoring/current` |
| `GET /veiculos/{id}/posicoes` | `posicoes` | histórico de posições (máx. 7 dias) | `monitoring/.../history` |
| `GET /veiculos/{id}/percurso` | `posicoes` | trajeto simplificado do período, com paradas | `reports/percurso` |
| `GET /eventos` | `eventos` | eventos do rastreador (ignição, SOS, bateria, CAN…) | `monitoring/events` |
| `GET /alertas`, `/alertas/{id}` | `alertas` | ocorrências e avisos, situação e tratativa | `alertas` |
| `GET /comandos` | `comandos` | histórico de comandos enviados (bloqueio etc.) e resultado | `comandos` |

**Relatórios** — escopo `relatorios`, módulo `monitoramento`

| Rota | Conteúdo | Fonte |
|---|---|---|
| `GET /relatorios/quilometragem` | km por veículo e dia | `reports/km` |
| `GET /relatorios/velocidade` | perfil de velocidade | `reports/velocidade` |
| `GET /relatorios/excessos-velocidade` | cada excesso, com local e duração | `reports/excesso-velocidade` |
| `GET /relatorios/paradas` | paradas, local e duração | `reports/paradas` |
| `GET /relatorios/cercas` | entradas e saídas de cerca | `reports/cercas` |
| `GET /relatorios/passou-por-aqui` | veículos que passaram num ponto/raio no período | `reports/passou-por-aqui` |
| `GET /relatorios/uso` | tempo ligado, parado, em movimento | `monitoring/resumo-uso` |

**Viagens** — escopo `viagens`, módulo `viagens`

| Rota | Conteúdo | Fonte |
|---|---|---|
| `GET /viagens`, `/viagens/{id}` | viagens, paradas, desvios | `viagens` |
| `GET /viagens/rotas` | rotas-padrão (matrizes) | `viagens/matrizes` |

**Jornada** — escopo `jornada`, módulo `jornada`

| Rota | Conteúdo | Fonte |
|---|---|---|
| `GET /jornada/marcacoes` | marcações do motorista | `jornada/marcacoes` |
| `GET /jornada/espelho` | espelho de ponto por motorista e período | `jornada/espelho` |

**Ranking** — escopo `ranking`, módulo `ranking`

| Rota | Conteúdo | Fonte |
|---|---|---|
| `GET /ranking` | pontuação por motorista/veículo | `ranking` |
| `GET /ranking/eventos` | eventos que compõem a nota | `ranking/eventos` |

**Combustível** — escopo `combustivel`, módulo `combustivel`

| Rota | Conteúdo | Fonte |
|---|---|---|
| `GET /abastecimentos`, `/abastecimentos/{id}` | abastecimentos, litros, valor, consumo | `combustivel` |

**Multas** — escopo `multas`, módulo `multas`

| Rota | Conteúdo | Fonte |
|---|---|---|
| `GET /multas`, `/multas/{id}` | infrações, valor, situação | `multas` |
| `GET /multas/indicacoes` | indicações de condutor | `multas/indicacoes` |
| `GET /motoristas/pontuacao-cnh` | pontos e risco de suspensão da CNH | `multas/cnh-risco` |

**Manutenção** — escopo `manutencao`, módulo `manutencao`

| Rota | Conteúdo | Fonte |
|---|---|---|
| `GET /manutencao/planos` | planos preventivos | `manutencao/planos` |
| `GET /manutencao/situacao` | próximas e vencidas por veículo | `manutencao/status` |
| `GET /manutencao/ordens`, `/manutencao/ordens/{id}` | ordens de serviço, itens, custos | `manutencao/os` |

**Checklist** — escopo `checklist`, módulo `checklist`

| Rota | Conteúdo | Fonte |
|---|---|---|
| `GET /checklists/modelos` | modelos de checklist | `checklist/modelos` |
| `GET /checklists`, `/checklists/{id}` | checklists respondidos, não conformidades | `checklist/respostas` |

**Pneus** — escopo `pneus`, módulo `pneus`

| Rota | Conteúdo | Fonte |
|---|---|---|
| `GET /pneus`, `/pneus/{id}` | pneus, posição atual, sulco, vida | `pneus` |
| `GET /pneus/movimentos`, `/pneus/{id}/movimentos` | montagens, rodízios, recapagens | `pneus/movimentos` |

São **~50 rotas**. Ficam de fora de propósito: usuários, perfis e permissões; configurações do Setup; notificações
e avatar; links de localização compartilhada; arquivos de relatório gerados; tudo de `superadmin/` (contratos,
faturamento, Traccar, conciliação).

## 5. Limites (definidos em 23/11)

| | Padrão | Motivo |
|---|---|---|
| Requisições por chave | **60/min** (rajada de 20) | polling de última posição a cada 30 s com folga para outras rotas |
| Requisições por chave por dia | **20.000** | ~14/min contínuos; cobre BI e TMS comuns |
| Chaves por cliente | **10** | |
| Itens por página | padrão **100**, máximo **500**; posições máximo **1.000** | |
| Janela de posições/viagens de **um veículo** | **7 dias** por chamada | ~20 mil posições a 30 s, paginado |
| Janela de posições da **frota** inteira | **24 h** por chamada | evita varredura da hypertable toda |
| Janela de eventos, alertas e demais módulos | **31 dias** por chamada | |
| Histórico consultável | o que a retenção guarda (`RetencaoService`) | a API não estende retenção |

Excedeu → `429` com `Retry-After`. Os números ficam no registro `setting-definitions.ts` (camada plataforma),
ajustáveis sem deploy de código quando um cliente precisar de mais.

Implementação: token bucket **em memória** (a API roda em uma instância e não há Redis; a fila é no Postgres),
atrás de uma interface `LimitadorDeTaxa` para trocar por contador no Postgres quando houver 2+ instâncias. Tabela
`api_uso_diario (client_id, chave_id, dia, requisicoes, erros)` gravada em lote a cada minuto — base para o limite
diário e para enxergar uso no Painel da Localle.

## 6. Swagger / OpenAPI

- `@nestjs/swagger` + **plugin do CLI** em `nest-cli.json`: o projeto não usa class-validator, então o plugin lê os
  tipos TypeScript dos DTOs; descrições e exemplos em JSDoc (`introspectComments`).
- **Só as controllers `/v1`** entram no documento (`include: [ApiPublicaModule]`).
- **Nenhuma referência à chave mestra** (decisão 23/11): os caminhos `/v1/clientes/...`, a rota `GET /v1/clientes`,
  o prefixo `lcl_master_` e as controllers de gestão de chaves mestras ficam fora do documento (`@ApiExcludeEndpoint`
  no caminho mestre e `@ApiExcludeController` na gestão). Teste: o `openapi-v1.json` não contém `clientes`,
  `master` nem `mestra`.
- Servido em `app.lclfleet.com/api/v1/docs` (UI) e `/api/v1/openapi.json`. Página neutra, sem marca obrigatória
  (white label).
- `docs/openapi-v1.json` versionado no repositório e conferido no CI: mudou o contrato sem atualizar o arquivo, o
  teste falha — mudança de contrato vira revisão explícita.
- Guia curto de primeiros passos no próprio Swagger: gerar chave → `curl` → paginação → limites → erros.

## 7. Sandbox

Para o integrador desenvolver sem tocar dados reais:

- Um **cliente de sandbox** por ambiente, com frota fictícia (veículos, motoristas e um gerador de posições/
  eventos que alimenta o banco como se viesse do Traccar), isolado como qualquer outro cliente.
- Chaves `lcl_test_` só autenticam nesse cliente; `lcl_live_` nunca autentica nele.
- O gestor gera a chave de teste na mesma aba "API" do Setup.
- Os dados fictícios ficam **só na API pública**: não aparecem no front de nenhum cliente real (coerente com a
  decisão de 28/10 de não ter modo demo no front).

## 8. Fases

| Fase | Entrega | Testes |
|---|---|---|
| **0 — Fundação** | migration `api_chaves` e `api_uso_diario`; repository via `BaseRepository`; `ApiChaveGuard` + `@ApiPublica()`; limitador; `X-Request-Id`; permissão `api.gerir_chaves`; aba "API" no Setup; audit; Swagger; rota `/api/v1` no proxy do web; **chave mestra** (§ 3.6): migration `api_chaves_mestras`, tela no Console, rotas `/v1/clientes/{clientId}/...`, auditoria por requisição | chave mestra: IP fora da lista → 401; sem validade → recusada na criação; chave de cliente em `/v1/clientes/...` → 401; só superadmin cria/revoga; toda consulta gera linha de auditoria; isolamento (chave de A não lê nada de B; admin de A não lista/revoga chave de B); chave revogada/expirada/errada → 401; JWT em `/v1` → 401; chave em rota interna → 401; método ≠ GET → 405; módulo fora do contrato → 403; escopo faltando → 403; contrato suspenso → 401; 429 no limite; E2E da aba "API" |
| **1 — Frota, cercas e telemetria** | § 4.1: frota e cadastros, cercas e regras, telemetria (posições, percurso, eventos, alertas, comandos) | integração contra o Postgres local por rota; cursor estável; janela acima do limite → 400; snapshot do `openapi-v1.json` |
| **2 — Relatórios e operação** | § 4.1: relatórios, viagens, jornada, ranking | idem |
| **3 — Módulos de custo** | § 4.1: combustível, multas, manutenção, checklist, pneus | idem |
| **4 — Sandbox** | cliente de sandbox, gerador de dados, chaves `lcl_test_` | `lcl_test_` não lê cliente real e vice-versa |
| Futuro | webhooks de saída (avisos ao sistema do cliente, com HMAC e bloqueio SSRF); limite por contrato; cobrança | — |

Cada fase com `security-review` e `pentester-isolamento`/`pentester-input` antes de dar como concluída
(`.claude/rules/security.md` — rota pública nova).

## 9. Decisões (23/11/2026)

| # | Tema | Decisão |
|---|---|---|
| — | Escopo | Somente consulta |
| 1 | Endereço | Caminho dentro do app: `app.lclfleet.com/api/v1` |
| 2 | Quem usa | Qualquer um que tiver a chave; a chave pertence a um único cliente |
| 3 | Cobrança | Adiada |
| 4 | Limites | Os da § 5 |
| 5 | Lista de IPs | Não, por enquanto |
| 6 | Idioma dos campos | Português |
| 7 | Sandbox | Sim (§ 7) |
| 8 | Chave mestra da Localle | Sim, na fase 0 (§ 3.6) |
| 9 | Cliente vê que a Localle o consultou pela chave mestra? | Não — a auditoria da chave mestra fica só no Console da Localle |
| 10 | Chave mestra no Swagger | Nenhuma referência (§ 6) |
| 11 | Tamanho da API | Catálogo completo de consulta (§ 4.1, ~50 rotas), não só os recursos principais |
