# Plano — Setup de parâmetros de operação

Status: **proposta para aprovação**, nada codado. Data: 17/10/2026.

## 0. Onde o Setup entra na administração (decidido em 22/10/2026)

A administração da plataforma foi desenhada por perfil, em três áreas separadas (não uma tela única):

1. **Console da Locale** (dona da plataforma) — estrutura final (✅ construído em 22/10/2026, ⏳ pendente):
   1. ✅ Visão geral (clientes, veículos ativos, receita prevista, margem estimada, "Precisa de você": inadimplência, contratos vencendo, rastreadores com problema, equipamentos a recolher). `src/pages/Locale.tsx`, dados em `src/lib/platformOverview.ts`.
   2. ✅ Contratos (23/10/2026: substitui o catálogo de Planos — contrato individual por cliente, mensalidade fixa ou por veículo ativo com franquia/excedente, funcionalidades, vigência e versionamento; "duplicar de outro contrato" acelera o cadastro sem vincular os dois). `src/pages/Contratos.tsx`, dados em `src/lib/contracts.ts`.
   3. ✅ Clientes (cadastro, veículos, usuários, situação, saúde da conta; contrato é editado em Contratos). `src/pages/Clientes.tsx`, dados em `src/lib/clients.ts`. Pagamento aceita múltiplas datas/parciais (`payment.history`). Suspensão hoje é um único nível e suspende o acesso imediatamente — a suspensão gradual por etapas fica para quando houver definição com a operação.
   4. ✅ Faturamento (apuração do mês a partir do contrato vigente: receita prevista, faturamento apurado — por medição diária de veículos-dia — e valor recebido; exportação para o financeiro, registro de pagamentos, atraso). `src/pages/Faturamento.tsx`.
   5. ✅ Rastreadores e chips (estoque, custos, vínculos, instalações e recolhimento). `src/pages/Rastreadores.tsx`, dados em `src/lib/trackerFleet.ts`. Fluxo de recolhimento (23/10/2026): cancelamento de contrato não apaga o histórico nem encerra a instalação sozinho — o equipamento fica "pendente de recolhimento" até confirmação manual.
   6. ⏳ Central de rastreadores (estados de cada aparelho, ações de reconfiguração) — não construída: depende de decidir como as ações de reconfiguração se conectam ao comando que já existe por cliente (`sendCommand`/`commandDefs`).
   7. ✅ Jurídico (reservada, sem regra automática por enquanto). `src/pages/Juridico.tsx`.
   8. ✅ Saúde da plataforma. `src/pages/Saude.tsx`, dados em `src/lib/platformHealth.ts`.
   9. ✅ Equipe e auditoria (usuários da Locale + o mesmo registro de alterações usado nos cadastros do cliente). `src/pages/Equipe.tsx`.
   10. ⏳ **Setup da plataforma** — é este plano: os padrões e limites (mín./máx.) de cada parâmetro de operação, calibração por modelo de rastreador, integração e modelos por segmento. Vive dentro do Console da Locale, não como tela separada. Ainda não construído (é o resto deste documento, seções 1 a 8).

Os dados de clientes, planos e rastreadores de cada tela foram seedados de forma independente (cada `lib/*.ts` tem sua própria simulação); os totais de uma tela não necessariamente batem com os de outra ainda. Integrar numa fonte única é item futuro, quando o modelo de dados for ao Supabase.
2. **Configurações do cliente** (gestor da frota) — dentro do produto: empresa/logo, usuários e perfis, grupos de veículos, **Setup** (camadas cliente e grupo deste plano), notificações, integrações, plano contratado.
3. **Painel da revenda** — **fora do escopo por ora**: a camada de revenda continua existindo no modelo de dados (`setting_scope`, `fn_set_setting`, claim `tenant_admin`), mas não há tela de administração da revenda no momento. Quando existir, repete o padrão: a revenda ajusta o padrão dos clientes dela dentro dos limites da Locale.

Isso muda o que a seção 8 tratava como pendência 2 (módulos por revenda): fica adiado junto com o painel da revenda, não é mais parte do MVP deste plano.

Contratos (mensalidade, franquia, preço por veículo, módulos contratados, limites de usuários, tempo de histórico, versionamento) e inadimplência/pagamento são **cobrança e contrato**, não parâmetros de operação — ficam nas telas 2 a 4 do Console da Locale, fora do registro `settings.ts` deste plano.

## 1. Objetivo

Nenhum parâmetro de operação fixo no código. Uma tela **Setup** gerada a partir de um registro central, com herança em camadas:

```
Plataforma (Locale) → Revenda → Cliente (gestor da frota) → Grupo (só alguns parâmetros)
                    ↘ Modelo de rastreador (calibrações técnicas, só Locale)
```

- A Locale define o **padrão** e os **limites** (mín./máx.) de cada parâmetro.
- A revenda define o padrão dos clientes dela, dentro dos limites da Locale.
- O cliente ajusta a operação dele e as exceções por grupo, dentro dos limites.
- Parâmetros com **piso legal** só podem endurecer (cada parâmetro diz se endurecer é subir ou descer).
- Cada perfil vê só a própria camada. Cada parâmetro mostra a origem do valor ("herdado da revenda") e tem **Restaurar padrão**, que apaga o valor da camada e volta a herdar.

## 2. Fora do setup do cliente

| Item | Fica onde |
|---|---|
| Fórmulas dos indicadores (MTBF, MTTR, disponibilidade, km/L…) | Código. Só os parâmetros usados nelas entram no registro. |
| Regras de integridade (km nunca menor que o último, recapagem bloqueada sem vidas, obrigatórias do checklist) | Código e banco. O **tamanho** do salto suspeito é parâmetro; a validação não. |
| Calibrações técnicas (RPM de motor ligado, falha de transmissão, tensão válida…) | Camada **modelo de rastreador**, só a Locale. |
| Integração (intervalos de consulta, retenção), cobrança e módulos | Só a Locale. |
| Conteúdo cadastrado pelo cliente: regras de alerta, matriz de pesos do ranking, planos, modelos de checklist, metas por veículo, cercas | Continua nas telas dos módulos. O Setup só traz os **padrões** usados ao criar esses itens. |
| Marca da revenda (logo, cor, foto do login) | Painel da revenda (não é parâmetro de operação). |

## 3. Inventário de parâmetros

Camadas: **P** plataforma · **R** revenda · **C** cliente · **G** grupo · **M** modelo de rastreador.
Aplicação: **agora** = vale a partir da alteração (o passado fica como estava) · **recalcula** = relatórios e telas recalculam com o valor novo.
Os mínimos e máximos são **proposta** (limite técnico absoluto do registro). A Locale pode estreitar dentro deles.

### 3.1 Jornada (Lei 13.103/2015) — hoje em `src/lib/jornada.ts` (`LEGAL`) e `journeyCfg` no navegador

| Chave | Camadas | Padrão | Mín | Máx | Piso legal (endurece para) | Base legal | Aplicação |
|---|---|---|---|---|---|---|---|
| `jornada.base_diaria_h` | P R C G | 8 h | 4 h | 8 h | máx. 8 h (↓) | CLT art. 235-C, caput | agora |
| `jornada.extras_max_h` | P R C G | 2 h | 0 h | 4 h | máx. 4 h (↓); acima de 2 h exige convenção coletiva (aviso na tela) | CLT art. 235-C, caput | agora |
| `jornada.refeicao_min_h` | P R C G | 1 h | 1 h | 2 h | mín. 1 h (↑) | CLT art. 235-C §2º | agora |
| `jornada.refeicao_obrigatoria_apos_h` | P R C G | 6 h | 4 h | 6 h | máx. 6 h (↓) | CLT art. 71 | agora |
| `jornada.interjornada_min_h` | P R C G | 11 h | 11 h | 16 h | mín. 11 h (↑) | CLT art. 235-C §3º | agora |
| `jornada.descanso_semanal_min_h` | P R C G | 35 h | 35 h | 72 h | mín. 35 h (↑) | CLT art. 235-D (citado hoje no código; confirmar com o jurídico) | agora |
| `jornada.direcao_continua_cargas_h` | P R C G | 5,5 h | 2 h | 5,5 h | máx. 5,5 h (↓) | CTB art. 67-C | agora |
| `jornada.direcao_continua_passageiros_h` | P R C G | 4 h | 2 h | 4 h | máx. 4 h (↓) | CTB art. 67-C | agora |
| `jornada.fechamento_automatico_h` | P | 20 h | 12 h | 24 h | — (técnico: fecha marcação sem fim) | — | agora |
| `jornada.apontamentos_atencao` | P R C | 3 em 30 dias | 1 | 30 | — | — | recalcula |

Fixos por lei, só exibidos: adicional noturno das 22h às 5h (CLT art. 73 §2º).

No modo sem banco (18/10/2026), estes limites já se editam em Jornada › Regras e passam por `jornadaLimits`/`clampLegal` (`src/lib/jornada.ts`). Um valor que afrouxe a lei volta ao limite legal.
Jornada usa **agora** porque o espelho de ponto é documento assinado: um espelho antigo não pode mudar de infrações depois.

### 3.2 Combustível — hoje em `src/pages/Combustivel.tsx` e `fuelGoals` no navegador

| Chave | Camadas | Padrão | Mín | Máx | Aplicação |
|---|---|---|---|---|---|
| `combustivel.salto_km_suspeito` | P R C G | 10.000 km | 500 km | 50.000 km | agora |
| `combustivel.meta_kml` | C G | 5,0 km/L | 0,5 | 30 | recalcula |
| `combustivel.orcamento_mensal` | C G | R$ 80.000 | 0 | — | recalcula |
| `combustivel.tol_litros_pct` | P R C | 2 % | 0 % | 20 % | recalcula |
| `combustivel.tol_valor_rs` | P R C | R$ 1,00 | R$ 0 | R$ 50 | recalcula |
| `combustivel.tol_data_dias` | P R C | 1 dia | 0 | 7 | recalcula |
| `combustivel.exigir_mesmo_posto` | P R C | ligado | — | — | recalcula |
| `combustivel.ocr_ativo` | P R C | desligado | — | — | agora |
| `combustivel.tol_km_rastreador` | P R C | 50 km | 0 | 2.000 km | recalcula |

No modo sem banco (18/10/2026), o salto de km e as tolerâncias (inclusive a correção do km lido do rastreador, que acima da tolerância entra no índice de confiabilidade como "km diferente do rastreador") estão em `FUEL_PARAMS` (`src/lib/fuel.ts`), à espera do Setup. O OCR liga e desliga em Combustível › Notas fiscais.

A meta por veículo continua na ficha do ativo (é cadastro, não parâmetro). Hoje o padrão da meta da empresa aparece com 3 valores diferentes: 5 no seed, 6 em Metas e 0 no BI.

### 3.3 Odômetro e instalação — hoje em `fn_check_odometer` (migration de instalação)

| Chave | Camadas | Padrão | Mín | Máx | Aplicação |
|---|---|---|---|---|---|
| `odometro.divergencia_min_km` | P R C | 500 km | 50 | 5.000 | agora |
| `odometro.divergencia_pct` | P R C | 3 % | 0,5 % | 20 % | agora |

### 3.4 Manutenção — hoje em `maintenance_plans`, `maintKpis.ts` (`GRACE`), `needs.ts`, `insights.ts`, formulários de plano

| Chave | Camadas | Padrão | Mín | Máx | Aplicação |
|---|---|---|---|---|---|
| `manutencao.critico_apos_dias` | P R C + exceção por plano | 10 dias | 1 | 90 | agora (o histórico de níveis não muda) |
| `manutencao.critico_apos_km` | P R C + exceção por plano | 1.000 km | 100 km | 50.000 km | agora |
| `manutencao.plano_padrao_km` | C | 10.000 km | 500 | 200.000 | agora (só sugestão ao criar plano) |
| `manutencao.plano_padrao_dias` | C | 180 dias | 7 | 730 | agora |
| `manutencao.antecedencia_padrao_km` | C | 1.000 km | 0 | 20.000 | agora |
| `manutencao.antecedencia_padrao_dias` | C | 15 dias | 0 | 90 | agora |
| `manutencao.meta_disponibilidade` | C G | 95 % | 50 % | 100 % | recalcula |
| `manutencao.os_parada_alerta_h` | C | 24 h | 1 | 240 | recalcula |
| `manutencao.os_parada_critica_h` | C | 48 h | 2 | 480 | recalcula |
| `manutencao.aprovacao_lenta_h` | C | 24 h | 1 | 240 | recalcula |
| `manutencao.janela_analise_corretivas_dias` | P | 365 dias | 90 | 730 | recalcula |

Os planos já criados continuam com os próprios valores. Os padrões valem para planos novos.

Prazo de crítico (decidido em 18/10/2026): não tem camada de grupo. A exceção é por plano (campos "Crítico após" do plano; vazio = herda). No modo sem banco a regra está num ponto só, `critAfter` em `src/lib/maint.ts`, hoje lendo `CRIT_DEFAULT` até o Setup existir. O padrão por km passou de vazio para 1.000 km, para que planos só por km também cheguem a Crítico.
Hoje há três divergências:
- A antecedência padrão é **15 dias** no modo local e **30** no Supabase.
- Os 10 dias de crítico apareciam em três lugares (resolvido no modo sem banco em 18/10/2026: agora só `critAfter`).
- O BI ignora o valor do plano.

### 3.5 Pneus — tabela atual `tire_settings` (continua) e `DEFAULT_TIRE_CFG`

| Chave | Camadas | Padrão | Mín | Máx | Piso legal | Aplicação |
|---|---|---|---|---|---|---|
| `pneus.sulco_alerta_mm` | P R C G | 5,0 mm | 2,0 | 12,0 | precisa ser maior que a retirada | recalcula |
| `pneus.sulco_retirada_mm` | P R C G | 3,0 mm | 1,6 | 8,0 | mín. 1,6 mm (↑) — Res. CONTRAN 558/1980 | recalcula |
| `pneus.custo_recapagem_padrao` | C | R$ 650 | 0 | — | — | agora |
| `pneus.vidas_padrao` | C | 3 | 1 | 8 | — | agora |
| `pneus.km_min_taxa_desgaste` | P | 500 km | 100 | 5.000 | — | recalcula |

Fixo por lei, só exibido: sulco mínimo legal de 1,6 mm (hoje é a coluna `legal_min_mm`, que deixa de ser editável).
O estoque mínimo por medida continua na tela de Pneus.

No modo sem banco (18/10/2026), Pneus › Parâmetros já segue essas regras: o mínimo legal aparece só para leitura (`LEGAL_MIN_MM` em `src/lib/pneus.ts`); retirada abaixo dele, ou alerta que não seja maior que a retirada, é recusado no campo e o valor salvo continua valendo. A sigla e o logo gravados no pneu são cadastro do cliente, não parâmetro do Setup.

### 3.6 Ranking — tabelas atuais `ranking_settings` e `event_types` (continuam)

| Chave | Camadas | Padrão | Mín | Máx | Aplicação |
|---|---|---|---|---|---|
| `ranking.limite_pontos` | P R C G | 100 | 1 | 10.000 | recalcula |
| `ranking.periodo_limite` | P R C | mês | semana · mês · trimestre | — | recalcula |
| `ranking.pesos_padrao` | P R | matriz de `EVENT_TYPES` (`catalog.ts`) | — | — | agora (vira o ponto de partida de cliente novo) |

A matriz de cada cliente continua na tela Ranking.

### 3.7 Telemetria CAN — tabela atual `can_settings` (continua) e `DEFAULT_CAN_SETTINGS`

| Chave | Camadas | Padrão | Mín | Máx | Aplicação |
|---|---|---|---|---|---|
| `can.velocidade_limite_kmh` | P R C G | 80 | 20 | 150 | recalcula |
| `can.excesso_episodio_s` | P R C | 10 s | 1 | 120 | recalcula |
| `can.rpm_lenta_max` | P R C G | 900 | 500 | 1.500 | recalcula |
| `can.rpm_verde_max` | P R C G | 1.600 | 800 | 3.000 | recalcula |
| `can.rpm_amarela_max` | P R C G | 2.100 | 1.000 | 4.000 | recalcula |
| `can.banguela_vel_min_kmh` | P R C G | 20 | 5 | 60 | recalcula |
| `can.pedal_fundo_pct` | P R C G | 90 % | 50 | 100 | recalcula |
| `can.temperatura_alta_c` | P R C G | 100 °C | 80 | 130 | recalcula |
| `can.ocioso_episodio_min` | P R C G | 5 min | 1 | 60 | recalcula |

Regra cruzada: lenta < verde < amarela. As faixas dependem do motor, por isso entram por grupo.

### 3.8 Calibração por modelo de rastreador (só Locale, camadas P M)

| Chave | Padrão | Mín | Máx | Hoje em |
|---|---|---|---|---|
| `calib.motor_ligado_rpm` | 300 | 100 | 800 | `can.ts:136`, `fn_can_report` |
| `calib.eventos_repetidos_s` | 5 s | 0 | 60 | `debounceSec` (hoje é do cliente; passa para cá) |
| `calib.falha_transmissao_min` | 10 min | 1 | 120 | `can.ts` (`gap > 600`) |
| `calib.intervalo_max_integracao_s` | 120 s | 10 | 900 | `can.ts` (`gap <= 120`) |
| `calib.tensao_min_valida_v` | 5 V | 0 | 12 | `can.ts`, `fn_can_report` |
| `calib.freio_mao_vel_min_kmh` | 5 | 1 | 20 | `fn_can_report` |
| `calib.horimetro_tolerancia_min` | 5 min | 1 | 60 | `fn_can_report` |

Todos recalculam. A chave de modelo é o texto de `tracker_installations.tracker_model`.

### 3.9 Monitoramento e alertas — hoje em `store.ts` (`vehicleStatus`), `Monitoramento.tsx`, `engine.ts`, `critical.ts`, `Cercas.tsx`

| Chave | Camadas | Padrão | Mín | Máx | Aplicação |
|---|---|---|---|---|---|
| `monitor.sem_sinal_h` | P R C G | 6 h | 0,5 | 72 | recalcula |
| `monitor.bateria_baixa_v` | P R C G | 11,5 V | 9 | 26 | recalcula |
| `monitor.bloqueio_pendente_critico` | P R C | ligado | — | — | agora (liga/desliga; decidido em 18/10/2026) |
| `alertas.reaviso_regra_min` | P R C | 15 min | 1 | 240 | agora |
| `alertas.janela_tratativas_h` | C | 24 h | 1 | 168 | recalcula |
| `cercas.raio_padrao_m` | C | 200 m | 20 | 5.000 | agora |
| `monitor.passou_aqui_raio_m` | C | 200 m | 20 | 5.000 | agora |

O limite de bateria entra por grupo porque frotas misturam veículos de 12 V e 24 V: com 11,5 V, um caminhão de 24 V nunca alarma.

### 3.10 Checklist e multas

| Chave | Camadas | Padrão | Mín | Máx | Aplicação |
|---|---|---|---|---|---|
| `checklist.ciclo_padrao_dias` | C | 30 | 1 | 365 | agora |
| `checklist.escala_nota_padrao` | C | 1 a 5 | 1 a 5 · 1 a 10 | — | agora |
| `checklist.meta_adesao` | P R C (cliente ajusta; Locale e revenda definem o padrão) | 85 % | 50 % | 100 % | recalcula |
| `checklist.meta_tempo_min` | P R C (cliente ajusta; Locale e revenda definem o padrão) | 8 min | 1 min | 60 min | recalcula |
| `multas.vencimento_padrao_dias` | C | 30 | 1 | 120 | agora |

| `multas.indicacao_prazo_dias` | P R C | 30 | 1 | 30 (piso legal: só diminui) | agora |
| `multas.indicacao_aviso_dias` | C | 7 | 1 | 29 | agora |
| `multas.indicacao_critico_dias` | C | 3 | 1 | 29 (até o aviso) | agora |
| `multas.cnh_limite_2_gravissimas` | P R C | 20 | 5 | 20 (piso legal: só diminui) | recalcula |
| `multas.cnh_limite_1_gravissima` | P R C | 30 | 5 | 30 (piso legal: só diminui) | recalcula |
| `multas.cnh_limite_sem_gravissima` | P R C | 40 | 5 | 40 (piso legal: só diminui) | recalcula |
| `multas.cnh_limite_ear` | P R C | 40 | 5 | 40 (piso legal: só diminui) | recalcula |
| `multas.cnh_risco_pct` | C | 75 % | 30 % | 100 % | recalcula |

Regras conferidas em 18/10/2026 (hoje em `FINE_PARAMS`, `src/lib/fines.ts`): suspensão com 20, 30 ou 40 pontos em 12 meses conforme as gravíssimas (CTB art. 261, I, Lei 14.071/2020); 40 pontos para quem tem EAR na CNH, qualquer que seja a gravidade (§ 5º); 30 dias da notificação da autuação para indicar o condutor (art. 257, § 7º). Há projetos de lei em tramitação para o limite de quem tem EAR (ex.: PL 5101/2026): revisar se forem aprovados. O valor de cada parâmetro com piso legal pode ser mais rigoroso que a lei, nunca menos.

### 3.13 Viagens — hoje em `TRIP_PARAMS` (`src/lib/trips.ts`)

| Chave | Camadas | Padrão | Mín | Máx | Aplicação |
|---|---|---|---|---|---|
| `viagens.tolerancia_cumprimento_min` | P R C G | 30 min | 5 | 180 | recalcula |
| `viagens.rodando_sem_viagem_min` | P R C G | 10 min | 1 | 120 | agora |
| `viagens.hora_volta_padrao` | C G | 18 h | 0 | 23 | agora |
| `viagens.rodando_sem_viagem_prioridade` | P R C G | média | baixa | média | agora |

O aviso "Rodando sem viagem" nunca é crítico: a prioridade só vai até média e ele não entra na contagem do "Precisa de você" (decidido em 18/10/2026).

### 3.14 Acesso de suporte — hoje em `SUPPORT_PARAMS` (`src/lib/support.ts`)

| Chave | Camadas | Padrão | Mín | Máx | Aplicação |
|---|---|---|---|---|---|
| `suporte.exige_permissao_cliente` | P R C | desligado | — | — | agora (liga/desliga; decidido em 19/10/2026) |

Revenda e Locale não veem a operação da frota do cliente por padrão: veem os painéis de administração e números agregados. Para ver a operação, usam o acesso de suporte, que registra quem acessou, quando e o motivo informado. Com o parâmetro ligado, o acesso só abre se o cliente tiver liberado.

### 3.15 Gestão de ativos e motoristas — hoje em `DOC_PARAMS`, `DRIVER_DOC_PARAMS` (`src/lib/assetDocs.ts`) e `DRIVER_PARAMS` (`src/lib/driverLinks.ts`)

| Chave | Camadas | Padrão | Mín | Máx | Aplicação |
|---|---|---|---|---|---|
| `documentos.atencao_dias` | P R C | 30 | 1 | 120 | recalcula |
| `documentos.critico_dias` | P R C | 7 | 0 | 60 (até o aviso) | recalcula |
| `motoristas.cnh_atencao_dias` | P R C | 30 | 1 | 120 | recalcula |
| `motoristas.cnh_critico_dias` | P R C | 7 | 0 | 60 (até o aviso) | recalcula |
| `motoristas.origem_prioridade` | P R C | rastreador > app > escala | — | — | agora |

CNH e exame toxicológico (C, D, E): aviso em laranja a partir de `cnh_atencao_dias`; nos últimos `cnh_critico_dias` ou vencido, crítico no "Precisa de você" (aprovado em 19/10/2026).
Origem do motorista: vale a origem de maior prioridade vigente; duas origens com motoristas diferentes no mesmo período geram um conflito para conferência (Ativos › Motoristas). Padrão aprovado em 19/10/2026; a decisão final é do dono.

### 3.11 Integração (só Locale, camada P) — hoje em `src/lib/rastreioApi.ts`

| Chave | Padrão | Mín | Máx |
|---|---|---|---|
| `integracao.posicoes_intervalo_s` | 30 s | 10 | 600 |
| `integracao.eventos_intervalo_min` | 2 min | 1 | 60 |
| `integracao.retencao_eventos_dias` | 30 dias | 7 | 365 |
| `integracao.pontos_por_veiculo` | 120 | 20 | 2.000 |
| `integracao.odometro_consulta_min` | 3 min | 1 | 60 |

### 3.12 Cobrança e módulos (só Locale)

- Cobrança: continua em `tenant_billing` (modelo, preço R$ 2, mínimo 100, preço do excedente R$ 2, base). No Setup da Locale entra só o **padrão** para revenda nova; a edição por revenda segue no Painel da Locale.
- Módulos: ver a pergunta 2 da seção 8.

### Fora do inventário (simulação)

Itens que só existem porque o simulador gera os dados e somem com a API real:
- excesso de velocidade aos 80 km/h e ociosidade aos 10 min em `engine.ts`;
- tratativa automática após 6 h em `seed.ts`;
- vencimento SERPRO de 40 dias.

## 4. Modelo de dados (migration nova, sem alterar as existentes)

```sql
create type setting_scope as enum ('plataforma','revenda','cliente','grupo','modelo_rastreador');

-- definição: gerada a partir de src/lib/settings.ts (mesma fonte para tela e banco)
setting_defs (key pk, module, type, unit, default_value jsonb, min, max, options jsonb,
              layers setting_scope[], legal_limit numeric, harden text check (harden in ('up','down')),
              legal_ref text, apply text check (apply in ('agora','recalcula')),
              legacy text)                -- ex.: 'tire_settings.warn_mm'

-- valor atual por escopo
setting_values (key, scope, scope_id text null, value jsonb,
                bound_min, bound_max,     -- só na camada plataforma (limites para as camadas de baixo)
                updated_by, updated_at,   unique (key, scope, scope_id))

-- histórico (também usado para resolver "vale a partir de agora")
setting_history (id, key, scope, scope_id, old_value, new_value, valid_from, changed_by, reason, source)
                                          -- source: 'setup' | 'modelo:<segmento>' | 'tela_modulo'
```

Funções:
- `fn_resolve_settings(p_client, p_group default null, p_at default null) → jsonb`: para cada chave, devolve `{ value, source: 'plataforma'|'revenda'|'cliente'|'grupo'|'padrao', bounds }`. Com `p_at`, usa o histórico (é o que o espelho de ponto vai usar).
- `fn_set_setting(key, scope, scope_id, value, reason)`: um único ponto de escrita. Valida:
  - permissão da camada;
  - tipo e opções;
  - limites do registro e da Locale;
  - piso legal no sentido de endurecer;
  - regras cruzadas (RPM lenta < verde < amarela; alerta > retirada).
  
  Também grava o histórico e, para chaves com `legacy`, atualiza a tabela antiga.
- `fn_reset_setting(key, scope, scope_id)`: restaura o padrão (apaga o valor da camada e grava no histórico).

Permissões:
- Locale: `fn_is_platform_admin()`, que já existe.
- Revenda: nova claim `tenant_admin` + `tenant_id` no `app_metadata`. No estudo local, `dev_settings.tenant_admin_dev`.
- Cliente: `current_client_id()`.

**Tabelas atuais (pneus, ranking, CAN):** passam a guardar o **valor efetivo** do cliente. Assim `v_tire_overview`, `fn_driver_ranking` e `fn_can_report` continuam iguais e já respeitam o Setup sem nenhuma mudança nos módulos.
- Quando a tela do módulo grava direto na tabela antiga, um gatilho registra a mudança como valor da camada cliente, com `source = 'tela_modulo'`.
- Uma variável de sessão evita o laço com `fn_set_setting`.

## 5. Frontend (só arquivos novos)

| Arquivo | Conteúdo |
|---|---|
| `src/lib/settings.ts` | Registro (chave, módulo, tipo, unidade, padrão, mín., máx., camadas, piso legal, sentido, base legal, descrição, aplicação, regras cruzadas); `getSetting(chave, ctx)` e `resolveAll(ctx)`; `validate(chave, valor, ctx)`, que é a mesma regra da função do banco. No modo sem Supabase, um store Zustand **próprio** com chave de persistência própria (não mexe em `store.ts`). |
| `scripts/settings-sql.mjs` | Gera o `insert into setting_defs` a partir do registro (usa o esbuild que já vem com o Vite). Um teste compara as definições do banco com o registro para não divergirem. |
| `src/pages/Setup.tsx` | Tela gerada do registro. |
| `src/components/SettingField.tsx` | Linha de parâmetro. |

A tela:
- **Abas por módulo** (só os módulos ativos para o cliente) e busca.
- **Seletor de camada** conforme o perfil:
  - Locale: "Padrão da plataforma", "Calibração por modelo", "Integração".
  - Revenda: "Padrão dos meus clientes".
  - Cliente: "Empresa" ou um grupo.
- **Linha de parâmetro:**
  - nome, descrição e unidade;
  - controle (número, opções ou liga/desliga);
  - origem ("Herdado da revenda: 5,0 mm");
  - faixa permitida;
  - artigo da lei, quando há piso legal;
  - etiqueta "vale a partir de agora" ou "recalcula relatórios";
  - Restaurar padrão;
  - histórico (quem, quando, de/para, motivo).
- **Locale:** também define os limites mín./máx. para as camadas de baixo.
- **Salvar:** por aba, com resumo do que muda e motivo opcional. Erros de validação aparecem ao lado do campo, e o banco valida de novo.

Única mudança em arquivo da outra frente: uma linha de rota em `App.tsx` e uma de menu em `Layout.tsx`, combinadas antes.

## 6. Fases

**Fase 1 — agora, isolada**
1. Registro em `settings.ts` com o inventário da seção 3.
2. Migration nova: tipos, `setting_defs`, `setting_values`, `setting_history`, funções, permissão de revenda e gatilhos das tabelas atuais.
3. Tela Setup e `SettingField`, nos dois modos (local e Supabase).
4. Rota e menu, combinados com a outra frente.

Resultado: Setup funcionando, com pneus, ranking e CAN já obedecendo. Os demais parâmetros ficam gravados, mas os módulos ainda leem o valor fixo.

**Fase 2 — depois que a outra frente terminar: trocar os valores fixos por `getSetting`**

| Arquivo | O que troca |
|---|---|
| `jornada.ts`, `Jornada.tsx`, `FolhaPonto.tsx` | `LEGAL`, `maxExtra`, 6 h, 20 h; o espelho resolve na data |
| `Combustivel.tsx` | salto de 10.000 km e padrões das metas |
| `maintKpis.ts`, `needs.ts`, `insights.ts`, `Manutencao.tsx`, `ManutencaoRemote.tsx` | `GRACE`, -10, 24/48 h, 365 dias, padrões do plano |
| `pneus.ts`, `tireRepo.tsx` | `DEFAULT_TIRE_CFG`, 500 km |
| `can.ts`, `canRepo.ts`, `fn_can_report` | calibrações por modelo |
| `store.ts` (`vehicleStatus`), `Monitoramento.tsx` | 6 h, 11,5 V, 200 m |
| `engine.ts` | reaviso de 15 min |
| `critical.ts`, `Cercas.tsx`, `Checklist`, `Multas.tsx` | 24 h, raios, ciclo, escala, vencimento |
| `rastreioApi.ts` | intervalos e retenção |
| `fn_check_odometer` | 500 km / 3 % |

Para fechar a fase, uma busca garante que não sobrou número de operação nesses arquivos.

**Fase 3 — modelos por segmento**
- Modelos "Distribuidora urbana", "Transporte pesado", "Fretamento" e "Refrigerados", cada um com um conjunto de chaves e valores.
- Aplicar um modelo mostra a lista "de → para" antes de gravar e entra no histórico como `modelo:<segmento>`.
- Disponível para a revenda (padrão dos clientes) e na implantação do cliente.
- Os valores de cada segmento precisam ser definidos com a operação. Exemplo: em Fretamento, direção contínua de 4 h (regime passageiros) e limite de velocidade menor.

**Fase 4 — prévia de impacto**
- Ao mexer num parâmetro de alerta, a tela mostra "na última semana, este valor teria gerado X alertas em vez de Y".
- Começa pelo que já tem função que aceita parâmetro:
  - CAN: `fn_can_report` já recebe `p_cfg`;
  - ranking: limite;
  - pneus: quantos pneus mudam de faixa;
  - sem sinal e bateria: sobre o histórico de posições.

## 7. Divergências encontradas no levantamento

1. A antecedência padrão do plano é 15 dias no modo local e 30 no Supabase.
2. A meta de km/L da empresa tem padrão 5 no seed, 6 em Metas e 0 no BI.
3. Os 10 dias para crítico estão em três lugares, e o BI ignora o valor do plano.
4. Os padrões de CAN, pneus e cobrança estão duplicados entre o TypeScript e o SQL.
5. O salto de 10.000 km do combustível só é validado na tela.
6. O limite de bateria de 11,5 V não serve para veículos de 24 V.
7. O tempo de eventos repetidos (`debounceSec`) hoje é do cliente, mas é calibração do rastreador.

## 8. Decisões pendentes

0. **Multas no modo Supabase:** no modo Supabase, as indicações de condutor críticas não entram no "Precisa de você" (a lista vem pronta do banco). Depende da decisão sobre o modo Supabase, que deve ser descontinuado.

1. **Grupo no banco:** não existe tabela de grupos (os grupos só existem no navegador). Proposta: criar `asset_groups` e `assets.group_id` nesta migration, usados só pelo Setup até a fase 2.
2. **Módulos:** ~~hoje o Painel da revenda liga e desliga módulos por cliente~~. Adiado em 22/10/2026 junto com o painel da revenda (ver seção 0): por ora, módulos vêm direto do **contrato** do cliente (tela Contratos do Console da Locale), sem camada de revenda intermediária. A proposta original (Locale libera para a revenda, revenda distribui aos clientes) volta quando o Painel da revenda existir.
3. **Tabelas atuais com valor efetivo e gatilho** (seção 4), em vez de mudar as funções dos módulos agora. Confirma?
4. **Faixas mín./máx.:** são proposta técnica. Validar com a operação, principalmente sem sinal, bateria, faixas de RPM e salto de km.
