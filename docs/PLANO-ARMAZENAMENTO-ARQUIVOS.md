# Plano de armazenamento de arquivos — fotos, documentos e vídeo no Cloudflare R2

> **Proposta de 08/11/2026, aguardando aprovação.** Complementa `docs/PLANO-INFRA-PRODUCAO.md` (§ 5 backup, § 6
> monitoramento) e `docs/DEPLOY-COOLIFY.md`. Decide onde ficam os bytes de arquivos enviados pelo sistema e pelos
> aparelhos (hoje em base64 dentro do JSON, no navegador ou no Postgres) e prepara a chegada dos aparelhos com câmera.
> Preços consultados em 08/11/2026 nas páginas oficiais (links no § 11); números de volume são estimativa para
> dimensionar, não medição — a Etapa 4 existe para medi-los.
>
> Resumo: arquivos no **Cloudflare R2** (compatível com S3, sem custo de saída), metadados e controle de acesso no
> **Postgres** (tabela `arquivos`), upload **direto do navegador para o bucket por URL assinada** (os bytes não passam
> pela API), **bucket privado**, consumo medido **pelo próprio sistema** e conferido com a API de métricas da
> Cloudflare, backup dos arquivos permanentes no **Backblaze B2** (o mesmo provedor já previsto para o backup do banco).

## 1. Por que mudar (estado em 08/11/2026)

- **13 pontos de upload** no front guardam o arquivo em base64 dentro do estado (foto do ativo, foto do painel na
  instalação, documentos, checklist, abastecimento, nota fiscal, evidências de OS — que já aceitam vídeo e áudio —,
  portaria, viagens, logo e foto de login da revenda). A maior parte fica só no navegador de quem enviou.
- O que vai para a API vai dentro do JSON, e a API usa o limite padrão do Express (**100 KB por requisição**, nada
  configurado em `apps/api/src/main.ts`): evidência de OS ou foto de checklist maior que isso falha hoje.
- Vídeo não cabe no banco nem no disco: o plano de infra já aponta disco e I/O do banco como gargalo de longo prazo
  (VPS de 200 GB), e cada arquivo gravado no Postgres passa também pelo WAL e pelo backup com PITR.
- O Traccar grava a mídia dos aparelhos (foto, áudio, vídeo) só em pasta local (`media.path`, uma subpasta por
  aparelho, até 32 MB por arquivo) e não tem opção de S3. Hoje essa pasta nem tem volume no
  `infra/traccar/docker-compose.yml` (se perde ao recriar o container).

## 2. Volume e custo — do plano grátis até a nossa escala

### 2.1 Preços do R2 (classe padrão)

| Item | Preço | Grátis por mês |
|---|---|---|
| Armazenamento | US$ 0,015 por GB-mês (média dos picos diários em 30 dias, arredondada para cima) | 10 GB |
| Gravação (Classe A: PUT, cópia, listagem) | US$ 4,50 por milhão | 1 milhão |
| Leitura (Classe B: GET, HEAD) | US$ 0,36 por milhão | 10 milhões |
| Apagar | grátis | — |
| Saída para a internet | grátis | — |

Classe de acesso raro (Infrequent Access): US$ 0,01 por GB-mês, mas cobra US$ 0,01 por GB lido, operações mais caras
e mínimo de 30 dias guardado. Não compensa para vídeo de evento (assistido logo depois e apagado antes de 90 dias);
fica como opção para documentos antigos se o volume crescer (§ 2.3).

Produtos descartados: **Stream** (US$ 5 por 1.000 minutos guardados + US$ 1 por 1.000 assistidos — ~30 vezes o R2
para o mesmo vídeo; o clipe do aparelho já é MP4 H.264, que o navegador toca direto) e **Images** (US$ 5 por 100 mil
imagens guardadas; comprimir e gerar miniatura no navegador resolve de graça).

### 2.2 Hipóteses de volume

| Tipo | Hipótese | Por veículo |
|---|---|---|
| Fotos e documentos | ~5 fotos por dia de ~300 KB (já comprimidas no front) | ~45 MB por mês |
| Vídeo de evento | 2 câmeras, clipe de 20 s a ~1,5 Mbps (~3,75 MB por câmera), ~10 eventos por dia | ~2,25 GB por mês; ~6,75 GB guardados com 90 dias de retenção |

Gravação contínua na nuvem está fora: o aparelho grava no cartão SD e manda só o clipe do evento ou o trecho pedido.

Custo do vídeo por veículo com câmera, em regime (90 dias): **~US$ 0,10 por mês** de armazenamento (30 dias: ~US$
0,03). Gravações: ~600 por veículo por mês — o 1 milhão grátis cobre ~1.600 veículos com câmera; acima disso, ~US$
0,003 por veículo. Leituras são desprezíveis. **Esse é o número para precificar o vídeo no plano comercial.**

### 2.3 Estágios

| Estágio | O que entra | Guardado (aprox.) | R2 por mês | Backup B2 por mês |
|---|---|---|---|---|
| **0 — Grátis** (dev, HML e primeiros clientes) | fotos e documentos | até 10 GB | **US$ 0** | ~US$ 0,07 |
| **1 — Produção, só fotos** (200 veículos) | fotos e documentos | ~9 GB por mês; ~110 GB no fim do 1º ano | ~US$ 0 no 1º mês → **~US$ 1,50** no fim do ano | ~US$ 0,75 |
| **2 — Primeiros clientes com câmera** (50 veículos, 90 dias) | + vídeo de evento | ~340 GB | **~US$ 5** | igual ao estágio 1 (vídeo fora do backup, § 7) |
| **3 — Escala** (500 veículos com câmera, 90 dias) | idem | ~3,4 TB | **~US$ 50** | idem |
| **4 — Grande escala** (2.000 veículos com câmera, 90 dias) | idem | ~13,5 TB | **~US$ 200** | idem |

No estágio 4 vale: falar com o comercial da Cloudflare (preço por volume), passar documentos com mais de 1 ano para
acesso raro (regra de ciclo de vida, § 6.3) e rever a retenção de vídeo por plano.

Ainda não confirmado: se ativar o R2 exige cartão cadastrado mesmo no plano grátis (a página de preços não diz).
Conferir no cadastro da conta (Etapa 0).

## 3. Desenho

### 3.1 Fluxo de upload (navegador)

```
navegador ──1. POST /arquivos/upload {origem, tipo, tamanho}──► API: confere JWT, permissão do módulo, tipo e tamanho;
                                                                cria linha em `arquivos` (status pendente);
          ◄──────────── URL assinada de PUT (válida ~5 min, Content-Type travado na assinatura) ──
navegador ──2. PUT dos bytes direto no bucket ──────────────────► R2
navegador ──3. POST /arquivos/:id/confirmar ─────────────────────► API: HEAD no objeto (tamanho e tipo reais);
                                                                fora do limite → apaga e recusa; ok → status ativo
```

- A URL assinada do R2 trava o `Content-Type` (assinatura falha com outro tipo), mas **não trava o tamanho**: por isso
  a confirmação com `HEAD` e o descarte. Upload pendente não confirmado em 24 h é apagado por uma rotina (apagar é
  grátis).
- O registro que usa o arquivo (OS, checklist, ativo…) guarda o **id do arquivo**, não o conteúdo. O JSON volta a ser
  pequeno e a API passa a ter limite explícito de corpo (ex.: 1 MB) em vez do padrão implícito.
- Arquivo acima de 5 GB exigiria upload em partes; clipe de evento e foto ficam muito abaixo, então não entra agora.

### 3.2 Exibição

- **Bucket privado, sem domínio público** (sem `r2.dev`). Para mostrar, a API assina uma URL de GET curta (5–15 min)
  **só depois de conferir que o arquivo é do cliente do JWT** — o isolamento é pela tabela `arquivos` (`client_id`),
  não pelo segredo da chave. A URL assinada só funciona no domínio S3 da conta (`<conta>.r2.cloudflarestorage.com`),
  não em domínio próprio.
- O front guarda a URL assinada em memória até perto de vencer (não pede outra a cada render).

### 3.3 Organização das chaves (prefixos)

Um bucket por ambiente (`localle-dev`, `localle-hml`, `localle-prd`). Chave sempre nova (uuid), **nunca sobrescrita**
— importa porque o R2 não tem versionamento (§ 7).

| Prefixo | Conteúdo | Retenção |
|---|---|---|
| `cad/{client_id}/{uuid}` | foto do ativo, foto do painel, documentos (CNH, CRLV…), logo e foto de login da revenda | permanente |
| `evid/{client_id}/{uuid}` | evidências de OS, checklist, portaria, viagens, abastecimento, nota fiscal | permanente (revisar com o jurídico) |
| `video/r{dias}/{client_id}/{uuid}.mp4` | clipes de evento das câmeras | por plano: `r30`, `r90`… |

A retenção do vídeo fica no prefixo porque a regra de ciclo de vida do R2 é por prefixo (até 1.000 regras por
bucket): uma regra por faixa (`video/r30/` apaga com 30 dias, `video/r90/` com 90). O cliente entra na faixa do
contrato; mudar de faixa vale para os clipes novos. A tabela `arquivos` continua sendo a fonte da verdade (a rotina
própria também apaga pelo banco).

### 3.4 Banco

- `arquivos`: `id`, `client_id`, `chave`, `origem` (módulo), `tipo_mime`, `tamanho_bytes`, `duracao_s` (vídeo),
  `status` (pendente/ativo/apagado), `criado_por`, `criado_em`, `apagado_em`, `expira_em`. Repository em
  `BaseRepository` (isolamento por `client_id`), suíte de isolamento no padrão de `assets.isolation.spec.ts`.
- `armazenamento_diario`: retrato diário por cliente e por prefixo (bytes, arquivos, uploads, leituras assinadas) e o
  total do bucket vindo da Cloudflare — base da medição (§ 5).

### 3.5 Vídeo dos aparelhos (quando o modelo estiver escolhido)

- Traccar com `media.path` num volume nomeado, montado também no container da API (estão na mesma VPS na Fase 1 e na
  mesma VPS-APP na Fase 2).
- Worker na API: lê os arquivos novos da pasta, sobe para `video/r{dias}/…` (ou `evid/` para foto), registra em
  `arquivos` ligado ao evento/posição e apaga o arquivo local. Log com o identificador do aparelho em cada falha
  (`.claude/rules/observability.md`).
- **Vídeo ao vivo** (MDVR com JT/T 1078, vídeo em RTP no padrão próprio) não passa pelo Traccar nem por esse caminho:
  precisa de um servidor de mídia à parte. Projeto separado, decidido com o aparelho em mãos.

## 4. Mudanças em infra e deploy

| Onde | Mudança |
|---|---|
| Conta Cloudflare | Criar conta da Localle (não pessoal), ativar R2, criar os 3 buckets com *location hint* `enam` (leste da América do Norte, o mais perto do Brasil; **não há região na América do Sul**). |
| Tokens | Um token por uso, todos restritos ao bucket: API (leitura e escrita de objetos), backup (só leitura), métricas (leitura de Analytics). Guardados no Coolify e no gerenciador de senhas; nunca no repositório. |
| CORS do bucket | Liberar `PUT` e `GET` só para as origens do front de cada ambiente (HML, PRD; `http://localhost:5174` só no bucket de dev), com `Content-Type` permitido e `ETag` exposto. |
| Regras do bucket | Ciclo de vida: `video/r30/` e `video/r90/` (apagar), abortar uploads em partes incompletos com 7 dias. Trava de retenção (bucket lock) de 30 dias em `cad/` e `evid/` (§ 7). |
| API (`apps/api`) | Variáveis novas no `.env.example` e no Coolify: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `ARQUIVOS_ENABLED`, `CF_ANALYTICS_TOKEN`. Dependência `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`. Limite explícito de corpo JSON. |
| Front (`apps/web`) | Nenhuma variável: as URLs vêm assinadas pela API. Hoje não há CSP; quando houver, incluir `https://<conta>.r2.cloudflarestorage.com` em `img-src`, `media-src` e `connect-src`. O `client_max_body_size 10m` do nginx deixa de importar (os bytes não passam por ele). |
| Traccar | Volume para `/opt/traccar/media` e `media.path` no `traccar.xml.template` (só na Etapa 6). |
| Desenvolvimento local | Bucket `localle-dev` no próprio R2 (cabe no grátis e é idêntico à produção) — evita manter um emulador. Testes de integração que precisam do bucket rodam só com as variáveis presentes e dizem explicitamente quando pularam. |
| Pipeline | Nada muda no `deploy.yml` além das variáveis. A migration da tabela `arquivos` entra no fluxo normal (`scripts/start-prod.sh`). |

## 5. Medição do consumo

O consumo por cliente só o nosso sistema sabe (a Cloudflare enxerga o bucket inteiro). Por isso a medição tem duas
pontas que se conferem.

### 5.1 Pelo nosso sistema (fonte para cobrança e para o painel)

- **Armazenamento por cliente e por tipo:** soma de `tamanho_bytes` em `arquivos` (ativos), por `client_id` e
  prefixo; minutos de vídeo pela `duracao_s`. Exato, porque toda gravação passa pela confirmação.
- **Operações:** cada URL de upload emitida e confirmada = 1 gravação; cada URL de leitura emitida ≈ 1 leitura (uma
  URL pode ser reaproveitada pelo cache do navegador, então é aproximado — suficiente para tendência).
- **Painel da Localle → Armazenamento:** por cliente, GB guardados, nº de arquivos, minutos de vídeo, crescimento no
  mês e custo estimado com a tabela do § 2.1. Depois pode virar item do contrato (franquia de GB ou retenção de vídeo
  por plano, como já existe `historyMonths` em `ContractTerms`).
- **Cota por cliente na API:** acima da franquia, avisa ou recusa o upload. É a única trava de verdade — o alerta de
  orçamento da Cloudflare só avisa.

### 5.2 Pela Cloudflare (conferência e fatura)

- **Painel do R2 → Metrics** por bucket, e **Billable Usage** da conta (gasto do ciclo).
- **Alertas de orçamento:** a Cloudflare cria um de US$ 10 por padrão em contas pay-as-you-go; configurar degraus
  (ex.: US$ 5, 20, 50). Chegam por e-mail, calculados uma vez por dia pela projeção do ciclo, e **não bloqueiam** nada.
- **API GraphQL de Analytics** (datasets `r2StorageAdaptiveGroups` — `payloadSize`, `metadataSize`, `objectCount`,
  `uploadCount`; `r2OperationsAdaptiveGroups` — `requests` por `actionType` e `responseStatusCode`;
  `r2BandwidthUsageAdaptiveGroups`). Consulta de até 31 dias, filtrada pelo id da conta.
- **Rotina diária na API** (mesmo padrão de `retencao.service.ts`): grava o total da Cloudflare em
  `armazenamento_diario` e compara com a soma de `arquivos`. Diferença acima de ~5% gera `warn` no log e aparece na
  saúde do sistema — é sinal de arquivo órfão (upload não confirmado que não foi limpo, falha ao apagar) ou de algo
  gravando fora do fluxo.

## 6. Segurança e LGPD

- Integração externa nova e superfície de upload: rodar `security-review` e os agentes `pentester-isolamento` /
  `pentester-input` antes do go-live (`.claude/rules/security.md`).
- Lista de tipos permitidos e tamanho máximo **por origem** (ex.: documento: imagem/PDF até 10 MB; evidência:
  imagem/vídeo curto; logo: imagem até 2 MB). A permissão exigida para emitir a URL é a do módulo (ex.:
  `manutencao.editar` para evidência de OS).
- Chave com uuid, nunca derivada de nome de arquivo; nome original só no banco.
- **LGPD:** vídeo de cabine mostra o rosto do motorista e documentos têm CNH. Sem região do R2 no Brasil, os dados
  ficam no exterior (leste dos EUA). É permitido com as salvaguardas da LGPD, mas precisa constar no contrato e na
  política de privacidade — revisão do jurídico antes do primeiro cliente com câmera. A exclusão a pedido do titular
  segue a trava de 30 dias (§ 7): marca como apagado na hora e a remoção física acontece quando a trava vence.

### 6.1 Regra de exclusão

Excluir na tela marca `apagado_em` no banco na hora (some para todos). A remoção física é feita por uma rotina quando
a trava de retenção do prefixo vence. Assim a trava protege contra apagamento por engano ou por credencial vazada sem
travar a operação.

## 7. Backup e recuperação

O R2 **não tem versionamento nem replicação** (a API S3 dele não implementa `PutBucketVersioning` nem
`PutBucketReplication`). A proteção é feita em camadas:

| Camada | O que protege | Como |
|---|---|---|
| Chave nunca sobrescrita | sobrescrita acidental | uuid novo a cada upload (§ 3.3) |
| Trava de retenção (bucket lock) de 30 dias em `cad/` e `evid/` | apagamento por engano, bug ou credencial vazada | a trava vence a regra de ciclo de vida e o `DELETE`; exclusão vira lógica (§ 6.1) |
| Cópia em outro provedor | perda da conta ou do bucket, incidente na Cloudflare | `rclone sync` diário de `cad/` e `evid/` para um bucket no **Backblaze B2** (o mesmo provedor do backup do banco, bucket separado), com histórico de versões de 30 dias no B2. Saída do R2 é grátis e entrada no B2 também. |
| Metadados | perda do banco | já cobertos pelo pgBackRest (`PLANO-INFRA-PRODUCAO.md` § 5): a tabela `arquivos` vai junto |

- **Vídeo fica fora da cópia** por padrão: é volumoso, temporário (30–90 dias) e o original continua no cartão SD do
  aparelho. Se algum plano vender "vídeo com backup", entra como prefixo próprio na cópia.
- **Onde roda o rclone:** container agendado no Coolify (`infra/arquivos-backup/`, com o token só de leitura do R2 e
  um token de escrita do B2), no mesmo esquema dos outros serviços de infra.
- **Regra 3-2-1** passa a valer também para arquivos: R2 + B2 + metadados no backup do banco.
- **Teste de restore mensal**, junto com o do banco: restaurar uma amostra de arquivos do B2 num bucket de teste e
  conferir com a tabela `arquivos` restaurada (mesmos ids, mesmos tamanhos).
- **Conferência de consistência** (semanal): listar o bucket e cruzar com `arquivos` — objeto sem linha é órfão (apaga
  depois da trava); linha sem objeto é perda (alerta `error` com o id).
- **Se o R2 cair:** upload novo falha com mensagem clara (o resto do sistema continua); a exibição volta quando o R2
  voltar. Em último caso, apontar a API para o bucket do B2 (também compatível com S3) é troca de configuração.

## 8. Etapas de implementação

Cada etapa nasce com teste (premissa do projeto) e termina com o comando executado e o resultado.

| Etapa | Entrega | Teste |
|---|---|---|
| **0 — Conta e buckets** | Conta Cloudflare da Localle, R2 ativo, buckets `dev`/`hml`, CORS, tokens, alertas de orçamento. Confirmar exigência de cartão. | checklist manual |
| **1 — Fundação na API** | Migration `arquivos` + `armazenamento_diario`; módulo `arquivos` (emitir URL de upload, confirmar com HEAD, emitir URL de leitura, exclusão lógica); rotinas de limpeza de pendentes e de remoção física; limite explícito de corpo JSON. | isolamento por cliente (outro cliente não confirma, não lê, não apaga); confirmação recusa tamanho/tipo fora do limite; integração contra o bucket de dev quando houver variáveis |
| **2 — Front** | Componente de upload (compressão WebP ~1600 px, miniatura, progresso, erro claro) e de exibição (URL assinada em cache). Migrar os 13 pontos, começando pelo que falha hoje: evidências de OS → checklist → foto do ativo e documentos → portaria/viagens → abastecimento/nota → revenda. | unitário da compressão e do cache; typecheck; conferência no navegador por tela |
| **3 — Migração do que já existe** | Arquivos em base64 que estão no navegador sobem na primeira carga (mesmo padrão da migração da ficha do ativo); os que estão em JSON no banco (evidências de OS) saem por script único. | contagem antes/depois; nenhum base64 restante |
| **4 — Medição** | Painel "Armazenamento" no Painel da Localle; rotina diária com a API GraphQL; conferência e alerta de divergência; cota por cliente. | unitário do cálculo de custo; integração da soma por cliente |
| **5 — Backup** | Bucket lock em `cad/` e `evid/`; `infra/arquivos-backup` com rclone para o B2; conferência de consistência; primeiro restore de teste. | restore de teste documentado |
| **6 — Vídeo** (com o aparelho definido) | Volume de mídia do Traccar, worker de envio, faixas de retenção no ciclo de vida, retenção de vídeo como item do contrato, player na tela do evento. | e2e com arquivo de mídia de exemplo do aparelho |

Etapas 1 a 3 resolvem o problema de hoje (limite de 100 KB e arquivos presos no navegador). 4 e 5 antes do primeiro
cliente em produção. 6 quando houver aparelho com câmera.

## 9. Decisões pendentes

1. Aprovar o R2 como armazenamento de arquivos (este plano) e quem é o titular da conta Cloudflare.
2. Retenção de vídeo por plano (30, 60, 90 dias?) e se vira item de preço ou franquia.
3. Franquia de armazenamento por cliente e o que acontece acima dela (aviso, cobrança de excedente ou bloqueio).
4. Revisão do jurídico sobre dados no exterior (vídeo de cabine, CNH) e prazo de guarda das evidências.
5. Modelo do aparelho com câmera e protocolo — define a Etapa 6 e se haverá vídeo ao vivo.
6. Vídeo com backup como opção comercial ou não.

## 10. O que não muda

- Metadados e regras de acesso continuam no Postgres, com isolamento por `client_id` no `BaseRepository`.
- Backup do banco segue o `PLANO-INFRA-PRODUCAO.md` § 5 (pgBackRest → B2).
- O código fala S3 padrão: trocar de provedor (B2, AWS, MinIO) é configuração, não reescrita.

## 11. Fontes (consultadas em 08/11/2026)

- Preços do R2: https://developers.cloudflare.com/r2/pricing/
- URLs assinadas: https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- CORS: https://developers.cloudflare.com/r2/buckets/cors/
- Ciclo de vida: https://developers.cloudflare.com/r2/buckets/object-lifecycles/
- Trava de retenção: https://developers.cloudflare.com/r2/buckets/bucket-locks/
- Compatibilidade S3 (versionamento e replicação não implementados): https://developers.cloudflare.com/r2/api/s3/api/
- Localização dos dados: https://developers.cloudflare.com/r2/reference/data-location/
- Métricas: https://developers.cloudflare.com/r2/platform/metrics-analytics/
- Alertas de orçamento: https://developers.cloudflare.com/billing/manage/budget-alerts/
- Stream: https://developers.cloudflare.com/stream/pricing/ · Images: https://developers.cloudflare.com/images/pricing/
- Backblaze B2: https://www.backblaze.com/cloud-storage/pricing
- Traccar (`media.path`): https://www.traccar.org/configuration-file/
