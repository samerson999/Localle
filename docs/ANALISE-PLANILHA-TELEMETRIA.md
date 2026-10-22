# Análise da planilha "RELATÓRIO DE TELEMETRIA - BASE"

Cliente: OVOS TAMAGO · período: 01 a 08/12/2023 · 13 abas.

## O que tem em cada aba

| Aba | Conteúdo |
|---|---|
| BASE VEICULOS | Cadastro: ID, descrição, placa, modelo do equipamento (Telemetria / Sem telemetria), status |
| DADOS BASE - JAG-7E94_ATUAL, DADOS BASE - JBL-6C73_ATUAL | Exportação bruta com CAN, uma linha a cada ~5 s (47.797 e 27.708 linhas). Os valores vêm com prefixo: `ODO:225695975`, `HRMT:521727`, `TFL:444400`, `VPWR:281]42` |
| DADOS BASE - JAG-7E94, DADOS BASE - JBL-6C73 | Versões anteriores com CAN já em colunas numéricas, só alguns dias |
| DADOS BASE - JBL-6C72, JBL-6C74, PDQ-4638 | Só GPS, tensão e horímetro a cada ~30 min, **sem CAN** |
| BD GERAL | Tabela única dos dois veículos com CAN, com colunas calculadas: Odômetro Metros, Odômetro KM (÷1000) e Consumo L (diferença ÷10) |
| EVT BD GERAL | 2.745 eventos do rastreador por sigla |
| SIGLAS EVT | Dicionário de siglas (ACP, ACN, VMX, VCH, RPX, OCS e BGL, com _IN e _OUT) |
| TABELAS / DASHBOARD | Tabelas dinâmicas: km por dia, consumo por dia e rendimento. KPIs: 2.718,56 km · 596,5 L · 4,56 km/L |

## Unidades dos campos CAN (conferidas com os próprios dados)

| Campo | Unidade | Como conferi |
|---|---|---|
| ODO | metros | Mesma conversão da planilha (÷1000) |
| HRMT | **minutos** de motor | Sobe cerca de 61 por hora de motor ligado, medido pelas amostras com RPM > 300 |
| TFL (consumo total) | décimos de litro | Mesma conversão da planilha (÷10). Dá 4,3 a 4,9 km/L, coerente para caminhão |
| NFL | % do tanque | Oscila muito (ex.: 70 → 92 → 62 em 10 s): sensor de boia, não serve para consumo |
| TENGh | °C do motor | 27 a 102 °C |
| APOS | % do pedal do acelerador | 0 a 100 |
| GEAR | marcha atual | `N` = neutro; valores como `r119` e `99` são lixo e foram descartados |
| TRBP | pressão do turbo | 0 a 172 (unidade a confirmar com o fabricante) |
| VPWR | tensão ×10 + checksum | `281]42` = 28,1 V |
| POILh | pressão do óleo | **Sempre 300**: o veículo não transmite este dado |
| Latitude/Longitude | graus sem o ponto decimal | `-7855663` = -7,855663 · `-34958503` = -34,958503. Em algumas linhas falta um dígito no fim |

## Problemas de dados encontrados

- Valores truncados (`DO:225956705`, `O:58522985`) e traço `-` no lugar de vazio.
- Leituras do odômetro fora de sequência: cerca de 1.300 a 1.700 por veículo na semana. O cálculo ignora essas leituras e segue a partir da última válida.
- Os eventos chegam quase só com `_IN`. Não há `VMX_OUT` nem `OCS_OUT`, e só 2 `BGL_OUT`. Por isso, não dá para medir duração pelos eventos. Os tempos de ociosidade, banguela e excesso de velocidade são medidos pelas amostras CAN.
- O campo "Valores" é fixo em OCS (65), BGL (73) e VMX (79). Ele funciona como código, não como medida. Em ACN e ACP varia de 6 a 18, o que parece ser intensidade.
- Eventos repetidos no mesmo segundo. O relatório conta uma vez só a mesma sigla em menos de 5 s (parâmetro ajustável).
- As datas não têm fuso. O relatório trata como horário de Recife.

## Resultado do relatório com estes dados

| Veículo | Km | Litros | km/L | Motor | Ocioso | Faixa verde | Faixa vermelha | > 80 km/h | Vel. máx. |
|---|---|---|---|---|---|---|---|---|---|
| JAG-7E94 | 1.476 | 346,5 | 4,26 | 64,7 h | 43% (46,5 L parado) | 26% | 8% | 5,0 h | 128 km/h |
| JBL-6C73 | 1.257 | 256,0 | 4,91 | 36,6 h | 29% (14,5 L parado) | 26% | 7% | 3,7 h | 124 km/h |

Os totais da frota (2.733 km, 602,5 L, 4,54 km/L) fecham com o DASHBOARD (2.718,56 km, 596,5 L, 4,56 km/L). A diferença vem do tratamento das leituras fora de sequência.
