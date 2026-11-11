# Plano — IPVA, licenciamento e proprietário do veículo

Status: **proposto em 11/11/2026**, aguardando as decisões da § 6. Nada implementado ainda além do campo UF
(ficha do ativo, sem commit).

## 1. Problema

O cadastro de ativos avisa **quando** um documento vence (`packages/shared/src/assetDocs.ts`: CRLV, IPVA,
seguro… com número e data), mas não controla **o pagamento**:

- IPVA e licenciamento são um "documento com vencimento": sem valor, sem parcelas, sem "pago em", sem
  comprovante. Não dá para responder "quanto vou pagar este ano" nem "o que está em aberto".
- O anexo do documento existe só no navegador (`fichaDoAtivo` descarta `file`) — some ao trocar de máquina.
- Não se sabe em nome de quem o veículo está nem se é próprio, locado ou financiado — dado que decide quem
  recebe a notificação de multa e quem paga o IPVA (relevante para locadoras, ex.: FD Locação).
- O cliente digita cada vencimento à mão, embora o calendário do estado já defina a data pelo final da placa.

O que **já existe e não é escopo**: o prazo de indicação de condutor da multa (`fines.ts`:
`indicationState`, aviso em 7 dias, crítico em 3, "Precisa de você").

## 2. Escopo

1. **Cobranças anuais do veículo**: IPVA e licenciamento por exercício, com parcelas, valor, situação
   e comprovante.
2. **Proprietário**: nome, CPF/CNPJ e vínculo (próprio, locado de terceiro, financiado, de terceiro/agregado).
3. **Datas sugeridas** pela UF + final da placa, a partir de um calendário por estado e ano.
4. UF e proprietário na planilha de importação/exportação de ativos.

Fora: cálculo do valor do IPVA (valor venal/FIPE, alíquota, isenções) — o cliente informa o valor do boleto.
Fora: consulta automática a DETRAN/SEFAZ (não há API pública uniforme; fica para quando houver demanda).

## 3. Modelo de dados

Tabela nova `cobrancas_veiculo` (migration, isolamento por `client_id` via `BaseRepository`):

| coluna | tipo | nota |
|---|---|---|
| id, client_id, asset_id | uuid | `asset_id` → `assets` on delete cascade |
| tipo | text | `ipva` \| `licenciamento` |
| exercicio | int | ano de referência |
| parcela | int | 0 = cota única; 1..n |
| vencimento | date | |
| valor | numeric(12,2) null | o cliente pode cadastrar só a data primeiro |
| pago_em | date null | |
| valor_pago | numeric(12,2) null | com juros/desconto, se diferente |
| origem | text | `manual` \| `calendario` (data sugerida) |
| dados | jsonb | observação, futuro id do comprovante no R2 |

`unique (client_id, asset_id, tipo, exercicio, parcela)`. A situação (aberta, vencida, paga) é derivada,
não gravada — mesmo padrão de `docState`.

Proprietário e UF ficam na ficha (`assets.dados`), como chassi e Renavam: são dados de cadastro, lidos
no app; não há consulta no banco filtrando por eles hoje. Se um relatório precisar agrupar por UF no
banco, vira coluna depois.

O tipo de documento `ipva` existente: as cobranças o substituem. Os documentos `ipva` já cadastrados
viram uma cobrança (vencimento e número preservados) numa migração de dados no front, no mesmo padrão de
`temFicha`/sync (ver decisão D2).

## 4. Calendário por UF

`packages/shared/src/calendarioVeiculo.ts`: tabela `{ uf, exercicio, tipo, finalPlaca → datas }` + função
pura `sugerirVencimentos(uf, placa, exercicio)`. Os calendários mudam todo ano por decreto/portaria
estadual — por isso:

- cobertura começa só pelas UFs dos clientes atuais (D1); UF sem calendário = cadastro manual, sem erro;
- cada entrada cita a fonte (portaria/site da SEFAZ) num comentário, e a tela mostra "data sugerida —
  confira no boleto";
- atualização anual é tarefa recorrente (registrar no backlog de jan/dez).

## 5. Etapas

0. **Anexos na API** — `docs/PLANO-ARMAZENAMENTO-ARQUIVOS.md` (R2). Não bloqueia as etapas 1–4: o
   comprovante fica opcional até o R2 existir.
1. UF + proprietário na ficha e na planilha (`assetSheet.ts`, teste existente de importação).
2. Migration + repository + rotas `GET/PUT/DELETE /assets/:id/cobrancas` + `GET /cobrancas?exercicio=` +
   `cobrancas.isolation.spec.ts` (outro cliente não lê/altera; dono lê/altera).
3. Tela: aba "Cobranças" na ficha do ativo (exercício, parcelas, marcar como paga) e visão da frota
   (total do ano, pago, em aberto, vencidas) — local a definir (D3).
4. Calendário das UFs escolhidas + botão "Preencher datas do exercício" + teste unitário em `packages/shared`.
5. Avisos: cobrança vencendo/vencida no "Precisa de você", com os mesmos prazos de `DOC_PARAMS`.

## 6. Decisões pendentes

- **D1** — Quais UFs entram primeiro no calendário? (as dos clientes atuais)
- **D2** — Cobranças substituem o documento "IPVA" (com migração do que existe) ou convivem?
  Recomendação: substituir; o CRLV continua como documento.
- **D3** — Onde fica a visão da frota: aba nova em Gestão de ativos ou junto de Multas num "Custos legais
  do veículo"? Recomendação: aba em Gestão de ativos agora; juntar com multas só se pedirem.
- **D4** — Seguro entra como cobrança (parcelas do prêmio) ou segue só como documento com vigência?
  Recomendação: seguir como documento por ora.
