# Plano de infraestrutura de produção — de 25 a 2.000+ placas

> **Decisão aprovada em 07/11/2026** (Fase 1 e estratégia de expansão). Complementa `docs/ARQUITETURA-BACKEND.md`
> § 5 e § 7 (topologia, backup) e `docs/DEPLOY-COOLIFY.md` (pipeline). Muda o § 7: a produção nasce com 1 VPS e separa
> o banco por gatilho medido (Fase 2), não com 2 VPS desde o início. Decisões comerciais e de fornecedor seguem
> pendentes (§ 9). Números de volume são estimativa a partir da HML, não benchmark — a Fase 1 existe também para
> medi-los.
>
> Resumo do que foi aprovado: 1 VPS de produção + backup externo; faixas de placas só como referência de custo;
> expansão decidida por métricas reais; perfis rastreamento e CAN medidos separadamente; na Fase 2 o banco recebe mais
> memória que a aplicação; TimescaleDB restrito a migrations/repositories; Traccar segue como gateway oficial até
> existir um caso real para substituir algum protocolo (§ 6b).

## 1. Volume esperado

Base: medição na HML (GT06 real: 6.516 posições/dia; `tc_positions` ~900 bytes/posição) e a faixa já usada em
`ARQUITETURA-BACKEND.md` § 2.2 (600–2.000 veículos = 1,7 a 8,6 milhões de linhas/dia). Faixa adotada:
**3.000 a 6.500 posições por veículo por dia**.

| Frota | Posições/dia | Gravação média | Banco da plataforma (comprimido após 7 dias) | Traccar com retenção de 30 dias |
|---|---|---|---|---|
| 25 | 75 mil – 160 mil | ~2/s | ~2–4 GB/ano | até ~4 GB |
| 200 | 0,6 – 1,3 milhão | ~15/s | ~15–30 GB/ano | até ~35 GB |
| 800 | 2,4 – 5,2 milhões | ~60/s | ~60–120 GB/ano | até ~140 GB |
| 2.000 | 6 – 13 milhões | ~150/s (picos de 5–10x) | ~150–300 GB/ano | ~160–350 GB → reduzir para 15 dias |

Conclusão: o gargalo no longo prazo é **disco e I/O do banco**, não CPU. Com 2.000 placas, a retenção do Traccar
(hoje infinita — `GUIA-FORWARDING-TRACCAR-HML.md`, "Retenção do Traccar") e a retenção por plano da plataforma
(`RetencaoService`) deixam de ser opcionais.

**Dois perfis de equipamento, medidos separadamente.** A faixa acima vem de um GT06 (rastreamento simples). Um
equipamento com CAN (ex.: JR12, hoje em bancada) manda mais campos e, possivelmente, mais pacotes — não dá para
extrapolar o produto inteiro a partir do GT06. Perfis oficiais:

- **Rastreamento**: GPS, velocidade, ignição, alimentação.
- **CAN**: rastreamento + sinais da rede CAN.

A métrica que fecha a conta é **bytes no banco por veículo por dia, por perfil** (§ 6). Depois de 30 dias de produção
ela substitui as estimativas desta tabela e vira base de preço (custo de armazenamento por placa/mês).

## 2. Fases e gatilhos

Cada fase muda de tamanho por **gatilho medido**, não por data nem por número de placas. As faixas de placas abaixo
são só estimativa para planejar custo: a mesma VPS pode aguentar 300 placas de rastreamento simples ou apertar com
80 equipamentos CAN agressivos. **Placas orientam o planejamento; métricas decidem a expansão.** Os gatilhos ficam
no monitoramento (§ 6).

### Fase 1 — estimativa de 25 a ~150 placas: 1 VPS de produção

```
Internet ──► VPS-PRD (Hostinger KVM 4: 4 vCPU, 16 GB, 200 GB NVMe, datacenter Brasil)
             Coolify · proxy HTTPS · front · API · Traccar + Postgres do Traccar · Redis
             Postgres da plataforma (TimescaleDB + PostGIS) · PgBouncer (só rede interna)
                  │
                  └── backup ──► object storage em outro provedor (Backblaze B2 ou S3 compatível)
```

- Separada da HML. A HML atual (1 vCPU, 3,8 GB, com swap) continua só homologação.
- Custo: ~R$ 50/mês (promoção 24 meses) → ~R$ 130/mês na renovação; backup externo < R$ 5/mês.
- **Gatilhos para a Fase 2** (qualquer um): CPU > 60% sustentada em horário comercial; disco do banco > 60%;
  p95 da API de posições > 500 ms; profundidade do `ingest_inbox` subindo sem voltar a zero; ou contrato com SLA.

### Fase 2 — estimativa de ~150 a ~600 placas: banco separado

```
Internet ──► VPS-APP (KVM 4: 8–16 GB)                       VPS-DB (KVM 8: 32 GB, mais NVMe)
             proxy · front · API · Traccar · Redis   ◄─WireGuard─►  Postgres plataforma + Postgres Traccar
                                                                   pgBackRest ──► object storage
```

- Topologia de `ARQUITETURA-BACKEND.md` § 7.2, sem mudança. Rede privada via WireGuard (Hostinger KVM não garante
  VPC entre VPS). VPS-DB sem porta pública além do 22 restrito.
- Os dois servidores não precisam ser iguais: a memória vai para o banco (cache de páginas, índices, compressão).
  A aplicação aguenta bem com 8–16 GB.
- Custo estimado: R$ 250–450/mês (cotar KVM 8 no checkout).

### Fase 3 — estimativa de ~600 a 2.000+ placas: redundância e leitura separada

- **VPS-DB primário + réplica em streaming** (hot standby): a réplica atende relatórios/BI/replay pesado e vira
  primária em falha (RTO de minutos, não de horas).
- **2 instâncias da API** atrás do proxy, PgBouncer em `transaction` (já previsto no compose). O tempo real já foi
  desenhado por instância via Redis pub/sub (`ARQUITETURA-INTEGRACAO-TRACCAR.md` § 5.2).
- **Traccar em VPS própria** se conexões TCP simultâneas ou CPU de decodificação pesarem; os aparelhos seguem o DNS.
- Armazenamento frio em Parquet para planos longos e continuous aggregates (já decididos em § 2.4, ainda não feitos).
- Geocodificação na API (Nominatim próprio ou contratado — § 2.6), provavelmente em VPS separada.
- Custo estimado: R$ 800–1.500/mês. Nesta fase vale reavaliar provedor (rede privada nativa, disco com IOPS
  garantido, snapshot de volume) antes de continuar crescendo na Hostinger.

## 3. Decisões do dia 1 que tornam a escala barata

Fazer na Fase 1, mesmo com 25 placas — é o que transforma as Fases 2 e 3 em troca de configuração, não em retrabalho:

1. **Aparelhos apontam para domínio, não IP** (`gw.<dominio>`, TTL 300 s). Trocar de servidor = trocar DNS, sem
   reprogramar 2.000 aparelhos por SMS. Confirmar por modelo (GT06 aceita; testar JR12, Teltonika, Suntech).
   Painel e API também em domínio próprio (`app.`, `api.`).
2. **Versões fixas de imagem**: hoje `timescale/timescaledb-ha:pg16` e `traccar/traccar:latest` são tags móveis.
   Restore e réplica exigem a **mesma** versão do TimescaleDB dos dois lados — fixar a tag exata.
3. **Backup em object storage desde o primeiro dia** (§ 5). O mesmo repositório de backup é o meio de migração
   entre servidores (§ 4.2).
4. **Nada manual no servidor**: a ligação Traccar ↔ API hoje depende de `docker network connect` que some ao recriar o
   container (HML). Em produção, rede, `traccar.xml` e portas ficam declarados no compose/Coolify.
5. **Build no GitHub Actions → GHCR**, produção só faz `pull` (`DEPLOY-COOLIFY.md`). Servidor substituível.
6. **Retenção do Traccar ligada** (`database.historyDays` — conferir a chave na 6.17): 30 dias; 15 dias na Fase 3.
   A plataforma é a dona do histórico; o Traccar só precisa cobrir a conciliação (`INGEST_DEDUP_DIAS`, 14 dias).
7. **Endereços por variável de ambiente** (`DATABASE_URL`, `MIGRATION_DATABASE_URL`, `REDIS_URL`, `TRACCAR_*`) —
   já é assim; separar o banco na Fase 2 = mudar a variável e reiniciar.

## 4. Migração de VPS menor para maior (produção)

Há dois caminhos. Escolher sempre o mais simples que resolva:

| | A. Upgrade do plano na Hostinger | B. Migração para servidor novo |
|---|---|---|
| Quando | Fase 1 cresceu (KVM 4 → KVM 8), mesmo servidor | Separar o banco (Fase 1 → 2), passar do KVM 8, trocar de provedor, ou upgrade indisponível |
| IP | Mesmo (confirmar com o suporte antes) | Muda → os aparelhos seguem o DNS (`gw.<dominio>`) |
| Dados | Ficam no disco | Copiados por réplica em streaming |
| Parada | ~10 min (reinício) + ajuste de partição | 5–15 min de painel; aparelhos reconectam sozinhos |
| Perda de posição | Nenhuma: a conciliação recupera a janela | Nenhuma: idem |
| Volta atrás | Não há downgrade simples → backup antes | Servidor antigo intacto até o ponto de decisão |

**Por que não se perde posição em nenhum dos dois:** durante a parada, quem fica sem receber é a plataforma, não o
Traccar — ele grava em `tc_positions` e, quando a API volta, a conciliação (`apps/api/src/ingest/conciliacao.*`)
busca no Traccar o que o Forwarding não entregou. A condição é a janela ser menor que a retenção do Traccar e que
`INGEST_DEDUP_DIAS` — folga de dias para uma janela de minutos.

### 4.1 Caminho A — upgrade do plano no mesmo servidor

Segundo a Hostinger, arquivos e configuração ficam intactos e o upgrade leva até 10 min; os recursos não são
vendidos separadamente (sobe o plano inteiro), o KVM 8 é o topo e **o disco extra pode exigir aumentar a partição
manualmente**. Não está documentado se há reinício ou troca de IP — perguntar ao suporte antes da primeira vez.

1. **Antes (D-1)**: conferir que o backup do dia concluiu e que o último teste de restore está em dia (§ 5.3);
   snapshot manual da Hostinger; anotar o número de aparelhos online e a contagem de posições da última hora.
2. **Janela** (madrugada, menor tráfego): avisar clientes; disparar o upgrade no hPanel.
3. **Depois**: se o disco não cresceu, aumentar partição/sistema de arquivos (artigo da Hostinger "increase VPS
   partition size"); `docker ps` com todos os containers de pé; ajustar a memória do Postgres ao novo tamanho
   (`shared_buffers` ≈ 25% da RAM, `effective_cache_size` ≈ 70%) — sem isso o banco não usa a RAM nova.
4. **Conferência** (checklist § 4.3).

### 4.2 Caminho B — migração para servidor novo (runbook)

Vale para "tudo de um servidor para outro maior" e para "tirar o banco para um VPS-DB" (Fase 2 — aí só o passo do
banco se aplica, e a API passa a apontar para o IP privado do VPS-DB).

**Pré-requisitos (já devem existir desde a Fase 1 — § 3):** aparelhos em `gw.<dominio>`; imagens com tag fixa
(mesmo Postgres e **mesma versão do TimescaleDB** nos dois lados — réplica entre versões diferentes não sobe);
pgBackRest com backup em object storage; configuração toda no Coolify/compose, nada manual no servidor.

**O próprio Coolify:** se o painel dele mora no servidor antigo, o novo entra como "servidor remoto" desse mesmo
painel, e o Coolify é movido depois pelo backup/restore dele. Alternativa que simplifica todas as migrações: deixar o
painel do Coolify num VPS pequeno separado (~R$ 30/mês) desde a Fase 1, gerenciando produção e homologação — se ele
cair, os apps continuam rodando; só os deploys param.

**Preparação (D-7 a D-1), sem impacto em produção:**

1. Contratar o servidor novo; endurecer (SSH por chave, firewall, `fail2ban`); adicioná-lo como servidor no Coolify.
2. Túnel WireGuard entre o antigo e o novo (replicação nunca pela internet aberta).
3. No antigo: usuário de replicação e regra no `pg_hba.conf` só para o IP do túnel (`wal_level=replica` já é o
   padrão).
4. No novo: restaurar o último backup do pgBackRest (puxa do object storage, não onera o servidor antigo) como
   **réplica em streaming** do antigo (`standby.signal` + `primary_conninfo`). Tempo de cópia proporcional ao banco:
   minutos na Fase 1, horas com 800+ placas — por isso fica dias antes.
5. Acompanhar o atraso da réplica (`pg_stat_replication` no antigo) até ficar perto de zero e se manter.
6. Subir no novo, **parados**, os serviços com as mesmas variáveis de produção: API, front, Traccar, Redis.
7. D-1: baixar o TTL dos registros DNS (`gw.`, `app.`, `api.`) para 60 s.

**Janela de troca (madrugada; ~30 min reservados, 5–15 min de painel fora):**

| # | Ação | Conferência |
|---|---|---|
| 1 | Congelar deploys; anotar aparelhos online e posições da última hora | números anotados |
| 2 | Parar a API no antigo (painel fora; o Traccar antigo continua recebendo e guardando) | — |
| 3 | Réplica com atraso zero → promover (`pg_promote()`) | `select pg_is_in_recovery()` = `false` |
| 4 | Parar o Traccar antigo; `pg_dump` do banco dele → restaurar no novo (pequeno, por causa da retenção) | contagem de `tc_devices` igual |
| 5 | **Ponto de decisão (go/no-go)**. Até aqui, voltar = religar a API e o Traccar antigos | — |
| 6 | Trocar o DNS de `gw.`/`app.`/`api.` para o IP novo; subir Traccar e API no novo | `/health` ok |
| 7 | Religar o Traccar antigo com o Forwarding apontando para `https://api.<dominio>/ingest/...` | posições de aparelhos "atrasados" chegam |
| 8 | Checklist § 4.3 | tudo verde |

Sobre o passo 7: muitos rastreadores guardam o IP resolvido até reconectar ou reiniciar. O Traccar antigo, ligado e
encaminhando para a API nova, garante que esses aparelhos continuem entregando enquanto migram sozinhos. Depois de
24 h, ver no log do Traccar antigo quais IMEIs ainda chegam nele e mandar reiniciar por comando/SMS só esses.
Manter assim por 48–72 h.

**Depois da troca:**

- Rodar logo um **backup completo** no novo primário (nova *stanza* do pgBackRest) — o anterior pertence ao servidor
  antigo.
- Conferir que os jobs do TimescaleDB rodam no novo (`timescaledb_information.jobs`: compressão), a
  rotina de retenção da API e a conciliação.
- Subir o TTL do DNS de volta (ex.: 3600 s).
- Servidor antigo: desligado, **não cancelado**, por 7 dias; depois cancelar.

**Volta atrás depois do passo 6:** não reverter a réplica. Corrigir para a frente no novo; se for impossível, voltar
o DNS e religar o antigo — ele fica atrás nos cadastros feitos durante os minutos no novo (poucos, de madrugada) e
as posições se recuperam pela conciliação. Por isso o go/no-go do passo 5 é o momento sério de decidir.

### 4.3 Checklist de conferência (vale para A e B)

- Login no painel; mapa ao vivo atualizando (tempo real/SSE).
- Aparelhos online ≈ número anotado antes (tolerância para os que estão reconectando).
- Console → Saúde: `ingest_inbox` voltando a zero, nenhuma esgotada, "Recuperadas pela conciliação" cobrindo a
  janela.
- Posições da última hora ≈ contagem anotada (depois que a conciliação passar).
- Um comando de teste num aparelho de bancada (não num veículo de cliente).
- Backup do dia concluído **no servidor novo**; monitor externo apontando para o lugar certo.

### 4.4 Ensaio antes da primeira vez

Antes da primeira migração real, ensaiar o caminho B inteiro com a HML (ou um VPS descartável alimentado por um
restore de produção): mede o tempo real de cada passo e encontra o que falta no runbook sem cliente olhando. Repetir
o ensaio quando a frota mudar de ordem de grandeza (o tempo de cópia da réplica cresce com o banco).

## 5. Backup e recuperação

### 5.1 O que proteger

| Dado | Como | Frequência | Guarda |
|---|---|---|---|
| Postgres da plataforma | **pgBackRest** (completo semanal, diferencial diário, WAL contínuo) → object storage, criptografado | contínuo | 30 dias de PITR + 4 completos semanais |
| Postgres do Traccar | `pg_dump -Fc` → object storage | diário | 14 dias (dado secundário: a plataforma é a dona do histórico) |
| Configuração | `traccar.xml`, compose, variáveis do Coolify | a cada mudança | gerenciador de senhas (variáveis) + repositório (resto, sem segredo) |
| Coolify | backup nativo do Coolify para S3 | diário | 14 dias |
| VPS inteira | backup diário da Hostinger | diário | o que o plano oferece (2 diários + 2 semanais) |
| Redis | não precisa — só tempo real, sem estado durável | — | — |

Regra 3-2-1: disco do servidor + object storage em **outro provedor** + snapshot da Hostinger.

### 5.2 Metas por fase

| Fase | Perda máxima aceitável (RPO) | Tempo para voltar (RTO) |
|---|---|---|
| 1 (go-live, primeiras semanas com `pg_dump`) | 24 h de cadastro; posições recuperáveis do Traccar | 2–4 h |
| 1 (com pgBackRest) | ~5 min | 2–4 h |
| 2 | ~1 min | 1–2 h |
| 3 (réplica hot standby) | segundos | < 15 min |

Posição tem rede de segurança extra: enquanto estiver dentro da retenção do Traccar, a conciliação reconstrói o que
faltar depois de um restore.

### 5.3 Pontos técnicos

- A imagem `timescaledb-ha` traz o pgBackRest — conferir na tag fixada antes de instalar outro.
- `pg_dump` de banco com TimescaleDB restaura com `timescaledb_pre_restore()`/`timescaledb_post_restore()` e mesma
  versão da extensão — senão o restore "funciona" com hypertables quebradas.
- **Teste de restore mensal** num servidor descartável (ou local), medindo o tempo. Backup nunca restaurado não conta.
  Registrar data e tempo de cada teste.
- Chave de criptografia do backup fora do servidor (gerenciador de senhas) — sem ela o backup é inútil.

## 6. Monitoramento mínimo de produção

- Monitor externo de disponibilidade (`/health` da API, painel, porta TCP do Traccar) com alerta por e-mail/Telegram.
- Alertas: disco > 70%, backup do dia não concluído, `ingest_inbox` com esgotadas, aparelhos sem comunicação
  (a tela Saúde já mostra; falta o alerta ativo).
- Logs da API e do Traccar retidos por pelo menos 14 dias fora do `docker logs` (coletor do Coolify ou Loki na Fase 2).

**Métricas de capacidade** (base dos gatilhos da § 2 e do preço por placa). Hoje nenhuma é coletada de forma
contínua; a primeira entrega pode ser uma consulta diária gravada em tabela, sem ferramenta nova:

| Métrica | De onde sai |
|---|---|
| Mensagens recebidas por segundo (Forwarding + conciliação) | `ingest_inbox`, contagem por minuto |
| Posições gravadas por segundo | `positions`, contagem por minuto |
| Bytes recebidos por segundo e tamanho médio do payload | `ingest_inbox` (tamanho do JSON) |
| **Bytes no banco por veículo por dia, por perfil** | tamanho dos chunks do dia (`chunks_detailed_size`) ÷ veículos que transmitiram, separado por perfil de equipamento |
| Profundidade e idade do item mais antigo do `ingest_inbox` | já na tela Saúde |
| CPU, RAM, disco e I/O do servidor | agente do Coolify ou `node_exporter` |

## 6b. Gateway de rastreadores substituível

Visão de produto: substituir o Traccar aos poucos por gateway próprio, protocolo por protocolo (ex.: GT06 nativo,
o resto ainda no Traccar), sem uma troca de uma vez só. **Isso não muda a infraestrutura da Fase 1 e não exige
construir uma camada nova agora** — o Traccar continua sendo o gateway decidido (`ARQUITETURA-BACKEND.md` § 6), e uma
abstração sem segundo gateway real seria especulativa. O que importa é saber onde está a costura:

- **Já é independente da origem:** tudo depois do `ingest_inbox` — admissão, gravação idempotente, tempo real,
  regras, relatórios (`apps/api/src/ingest/processador-posicao.ts`). Um gateway nativo grava no mesmo inbox.
- **Ainda é amarrado ao Traccar:** o formato do payload no inbox (JSON do Forwarding, convertido por
  `traccar-position.mapper.ts`), a identidade do aparelho (`traccar_device_id`, não o IMEI), a conciliação (lê a API
  REST do Traccar) e os comandos.

Quando o primeiro protocolo nativo for de fato planejado: inbox passa a aceitar a posição já normalizada com a origem
marcada, identidade por IMEI, e conciliação/comandos por gateway. Na infraestrutura, o gateway nativo é só mais um
serviço na VPS-APP com as portas do protocolo dele — o DNS `gw.` continua valendo.

Na mesma linha: funções específicas do TimescaleDB (hypertable, compressão, continuous aggregates) ficam nas
migrations e nos repositories, nunca nos services de domínio — já é a regra do `BaseRepository`.

## 7. Segurança de base (Fase 1)

- Firewall: 22 só por chave e IP conhecido, 80/443, portas dos protocolos em uso. Painel do Traccar (8082) nunca
  exposto. PgBouncer e Postgres sem porta pública (desde 38c6f2c, `infra/plataforma/docker-compose.yml` publica os dois
  só em 127.0.0.1 por padrão).
- Painel do Coolify em domínio com HTTPS e 2FA. `fail2ban` no SSH.
- `security-review` da ingestão: feito em 229e98d (07/11/2026). Repetir antes do go-live se a ingestão mudar.

## 8. Ordem de execução para o go-live

1. Decisões pendentes (§ 9).
2. Código: tags de imagem fixas (`timescaledb-ha:pg16`, `pgbouncer:latest`, `traccar:latest` ainda móveis);
   `deploy.yml` funcionando com GHCR (hoje só manual, `workflow_dispatch`); push do que está em `dev`. Já feito:
   extensões `timescaledb`/`postgis` criadas pela primeira migration e Postgres/PgBouncer só em 127.0.0.1 (38c6f2c);
   `security-review` da ingestão (229e98d).
3. Contratar VPS-PRD e domínio; DNS (`app.`, `api.`, `gw.`); firewall.
4. Coolify em produção; stack com variáveis de produção (SMTP, `APP_URL`).
5. Traccar de produção com retenção e Forwarding declarados no compose.
6. Backup externo ligado e **um restore de teste feito** antes do primeiro aparelho real.
7. Monitor externo e alertas.
8. Produção nasce limpa (não copiar o banco da HML: tem clientes de teste e cadastros do Traccar feitos por outra
   conta). Aparelhos entram em lotes de 5: cadastro → reprogramar para `gw.<dominio>` → primeira posição → 24 h
   estável → próximo lote.

## 9. Decisões pendentes (comerciais e de fornecedor — em aberto)

1. Orçamento de R$ 700: mensal ou único? Inclui chips M2M (~R$ 10–20/placa/mês)?
2. Origem das 25 placas (Clube do Rastreador? aparelhos novos?) e se o histórico antigo precisa vir.
3. Domínio de produção (lembrando a decisão de white label: o login é neutro).
4. Provedor de e-mail (SMTP).
5. Object storage: Backblaze B2 (sugerido) ou outro.

Resolvido: Fase 1 com 1 VPS — aprovada em 07/11/2026; `ARQUITETURA-BACKEND.md` § 7 aponta para este plano.
