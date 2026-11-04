# Pesquisa — como saber se um rastreador lê a rede CAN (e como fazer melhor que o mercado)

Pesquisa de 04/11/2026. Base para decidir a implementação de "suporte a CAN" no cadastro de rastreador e no
acompanhamento da 1ª transmissão. Nada aqui está implementado ainda.

## 1. Ponto de partida (o que a Traccar e o nosso sistema já dão)

- **A Traccar não informa a capacidade.** Um device tem nome, `uniqueId`, `model` (texto livre), categoria e
  atributos. Ela decodifica a CAN quando o dado chega, como atributos da posição: `rpm`, `obdSpeed`, `fuel`,
  `fuelUsed`, `fuelConsumption`, `engineLoad`, `coolantTemp`, `throttle`, `hours`, `vin`, `dtcs` e, na
  Teltonika, os `io*`. Dá para saber **depois** da transmissão, nunca antes.
- **O catálogo é nosso.** `rastreador_modelos` (migrations `1793110000000` e `1793160000000`) já guarda
  protocolo, porta e identificador por modelo. Ainda não tem campo de CAN.
- **A instalação já prevê CAN.** `instalacoes.papel` aceita `'can'`.
- **O veículo não tem dados técnicos.** `assets` só guarda a placa: não tem marca, modelo, ano nem chassi/VIN.
  Isso é pré-requisito para qualquer coisa que cruze rastreador × veículo (ver § 4).

## 2. Como os grandes fazem

| Player | Antes da instalação | Durante a instalação | Depois (operação) |
|---|---|---|---|
| **Samsara** | Pelo VIN (escaneado com a câmera ou digitado), o app do instalador diz qual cabo usar (OBD-II, J1939…). | O app "Samsara Fleet" pareia o gateway e confere alimentação e conexão de dados (leva até 10 min). | Evento de diagnóstico "Engine Synchronization" quando o gateway não consegue ler odômetro/horímetro. Para dado faltando, a KB manda conferir outro aparelho no mesmo barramento, tensão de 12 V na linha e limitação por marca/ano. Se nada resolver, o cliente abre chamado informando marca, modelo, ano, VIN e serial. |
| **Geotab** | Tela "Vehicle Eligibility" no MyAdmin (portal do revendedor): VIN(s) ou marca/modelo/ano + região. | — | O dado de motor depende do **plano** contratado (Base sem motor, Regulatory mínimo, Pro/ProPlus completo) e do que o veículo expõe. Se o dado não aparece, o suporte responde que é limitação do veículo. |
| **Teltonika** (fabricante) | Lista de veículos suportados (planilha XLSX por adaptador, 2.200+ modelos). Para veículo fora da lista, contato comercial com marca/modelo/ano. | **AutoScan** (FMx150/FMx250): o aparelho grava a CAN, manda para o FOTA WEB e recebe o perfil (OEM file) em 20–60 s com a ignição ligada. Usado em ~50% das instalações FMx150. Escolhe o "mais parecido" quando o modelo exato não existe, e aí não garante todos os parâmetros. | Veículo não suportado: engenharia reversa em campo (27 escritórios), entregue em menos de 1 mês e adicionada à lista global. |
| **Wialon** (Gurtam) | O catálogo de hardware marca cada modelo com recursos ("CAN-bus support", acelerômetro, ID de motorista…). | Cadastro técnico: tipo de aparelho, ID único, porta. | Os sensores (combustível, RPM etc.) são configurados à mão pelo usuário a partir dos parâmetros que chegam. |
| **Brasil** (Sascar/Michelin, Omnilink, Getrak) | Venda consultiva: telemetria é um produto/plano à parte (Omnitelemetria). A Getrak usa leitor sem contato (GCan) para preservar a garantia. | Instalador homologado. | Não achei material público sobre como avisam CAN faltando. Ao que parece é processo de suporte, não produto. |

### O padrão que se repete

1. **A capacidade fica em três lugares separados**: no catálogo do hardware (Wialon), na ferramenta de
   compatibilidade por VIN/modelo (Geotab, Samsara, Teltonika) e no plano comercial (Geotab, Omnilink).
   Quem cadastra precisa consultar cada um.
2. **A verificação na instalação é genérica**: confere energia e conexão, não "cada dado que você comprou chegou".
3. **A falha aparece tarde e em linguagem técnica**: "Engine Synchronization", "vehicle not supported",
   "limitação do veículo". O gestor descobre quando o relatório de combustível sai vazio.
4. **O aprendizado fica no fabricante**: o AutoScan da Teltonika aprende, mas só para hardware Teltonika. Uma
   plataforma multimarca (como a nossa, via Traccar) não tem isso pronto.

## 3. Modelo: cinco perguntas diferentes, não um campo

*(Revisão de 04/11/2026, que incorpora a avaliação externa do estudo.)* Um rastreador que suporta CAN não lê
necessariamente os dados de qualquer veículo. Misturar as perguntas abaixo gera falso problema de instalação:
a tela prometeria RPM e combustível e depois culparia o instalador.

| Dimensão | Pergunta | Onde mora | Quem responde |
|---|---|---|---|
| **Capacidade** | O equipamento lê CAN/OBD? Nativo ou com leitor? | `rastreador_modelos` (catálogo global) | Ficha do fabricante, preenchida pela Localle |
| **Compatibilidade** | Esta combinação de equipamento e veículo é suportada? | Futura base por modelo × marca/modelo/ano | Lista do fabricante + evidência das instalações (§ 4.6) |
| **Instalação** | O leitor, o perfil (OEM file) e a configuração estão corretos? | Instalação (`instalacoes`, com `papel = 'can'` quando há leitor) | Diagnóstico da 1ª transmissão (§ 4.2) |
| **Disponibilidade** | Quais sinais estão chegando de fato, e desde quando? | Por rastreador e por sinal | Ingestão (§ 4.1) |
| **Qualidade** | O valor é coerente? | Por rastreador e por sinal | Regras de plausibilidade (§ 4.7) |

- `suporte_can`: `nativo` | `com_acessorio` | `nao` | **`nao_informado`** (padrão). Ausência de informação não
  significa ausência de suporte. Modelo sem ficha conferida fica `nao_informado`, e a tela não promete nada.
- Além do campo, o catálogo lista os **sinais que o modelo consegue entregar** (RPM, odômetro, combustível,
  horímetro…). Isso é capacidade, não garantia. O AutoScan da Teltonika acha perfil para veículo fora da lista, mas
  não garante todos os parâmetros, e alguns parâmetros precisam ser habilitados à mão na configuração.

## 4. Onde a Localle pode se sobressair

### 4.1 Normalização dos sinais (base de tudo) — estender o que já existe
**Conferido no código:** a camada já existe em `apps/api/src/telemetria/leitura.ts`, só que para tensão, satélites,
sinal GSM e bloqueio. Ela lê as chaves padrão da Traccar, usa outra chave/escala só quando o modelo do catálogo diz
(decisão de 01/11: **mapeamento por modelo na tela do admin, nunca regra por protocolo em código**), normaliza
unidade pela faixa física (mV → V) e devolve `null` ("não informado") para valor impossível. O último valor de
cada atributo já fica em `rastreador_comunicacao.ultimos_atributos`.

O passo é estender esse mesmo padrão aos sinais de motor, não criar uma camada paralela:
- Sinal canônico (`rpm`, `odometro_km`, `combustivel_pct`, `horimetro_h`…) → atributo de origem por modelo
  (vazio = chave padrão da Traccar). Exemplo: na Teltonika parte chega normalizada (`rpm`) e parte como `ioNN`.
  O `ioNN` é sempre do modelo/configuração, nunca universal.
- Guardar a **origem** junto do valor (`can`, `gps`, `calculado`) e o atributo bruto, para o diagnóstico
  dizer de onde veio.
- **`0` ≠ `null` ≠ ausente.** RPM 0 com ignição desligada é leitura válida. Atributo ausente é "não chegou".
  Valor impossível é "chegou inválido". Esses três estados alimentam coisas diferentes no diagnóstico.
- **Prova concreta do risco de nome de atributo:** no JR12 o atributo `vin` é **tensão em mV**, não chassi
  (migration `1793130000000`). Ler `vin` como chassi sem passar pelo mapeamento do modelo daria um alarme falso
  de "rastreador no veículo errado" (§ 4.5).

### 4.2 Diagnóstico da instalação (1ª transmissão), com regra por sinal
O acompanhamento da 1ª transmissão (commit `438d6e1`) vira uma lista por sinal esperado:

> **Diagnóstico do rastreador** — FMC150 · ABC1D23
> Conexão recebida (há 8 s) · Localização ✓ · Ignição ✓ · RPM ✓ · Odômetro *aguardando validação* · Combustível *não verificado*
> *"O equipamento está conectado. Alguns sinais dependem de o veículo estar em funcionamento."*

**Sem prazo fixo de 5 minutos.** Cada sinal tem sua condição de teste:

| Sinal | Pode ser testado quando | "Falhou" só se |
|---|---|---|
| Localização, ignição | o rastreador conecta | conectou e não veio |
| RPM | ignição ligada (motor girando) | N posições com ignição ligada e atributo ausente |
| Odômetro | o veículo se desloca | GPS mostrou deslocamento e o atributo não veio ou não mudou |
| Combustível | ignição ligada | N posições com ignição e atributo ausente |
| Horímetro | motor ligado por tempo suficiente | o tempo passou e não houve incremento |

Estados por sinal: **recebido**, **aguardando condição** ("ligue o motor", "desloque o veículo"), **não verificado**,
**não recebido** (com causa provável: leitor, perfil/parâmetro desabilitado, veículo não expõe) e **fora do esperado**.
Só entra na lista o sinal que a capacidade do modelo promete. Modelo `nao_informado` mostra o que chegou, sem cobrar
o que não chegou.

### 4.3 Monitoramento contínuo: "dados do painel pararam"
Último instante em que cada sinal chegou, por rastreador. O alerta só dispara quando faltar o sinal **na condição
em que ele deveria vir**: ignição ligada, conectado, e com histórico de que chegava. Veículo parado ou sem sinal
de celular não é falha de CAN. A pendência fica assim: *"RPM e combustível não chegam desde 02/11 com o veículo em
operação"*. Isso cobre oficina, chicote mexido e outro aparelho no barramento.

### 4.4 Origem e confiança visíveis nos módulos
Combustível, manutenção por horímetro e ranking mostram de onde vem cada número: *painel do veículo*, *GPS* ou
*sem dado*. **Estimativa só onde existe método implementado e verificável.** Quilometragem pelo GPS é estimativa
honesta. RPM e nível real de tanque não se deduzem de GPS: sem CAN, o módulo diz "este veículo não informa" e não
mostra número. Isso segue a regra de não exibir dado fictício.

Aqui está a ideia de produto mais forte: o gestor não vê só o dado do veículo, mas **o que a plataforma sabe dele,
de onde veio e quanto pode confiar**. É o "DNA" do veículo, coerente com o nome Localle DNA.

### 4.5 Cadastro técnico do veículo e conferência por VIN
Pré-requisito: `assets` hoje só tem placa. Faltam marca, modelo, ano e chassi. Com o chassi, comparar com o VIN que
o aparelho manda, **apenas quando o mapeamento do modelo disser qual atributo é o chassi** (§ 4.1). Se não bater:
*"o rastreador X parece estar instalado em outro veículo"*.

### 4.6 Base de compatibilidade multimarca
Isso não é inédito: a Geotab tem verificação de elegibilidade por VIN ou marca/modelo/ano no MyAdmin e na API
(confirmei a API para elegibilidade de integração OEM; não confirmei que ela devolve disponibilidade por sinal
para o hardware GO). O diferencial da Localle está em **juntar a lista do fabricante com a evidência real das
instalações de uma plataforma multimarca, mostrar a confiança por sinal e orientar a correção**.
**Proteção entre clientes:** a base é global e expõe só agregados, com **amostra mínima** (ex.: pelo menos 5
instalações de pelo menos 3 clientes distintos) antes de mostrar qualquer número. Contagem pequena identifica
cliente. Passa por `security-review` e pelo agente `pentester-isolamento`.

### 4.7 Plausibilidade e recomendações
Odômetro do painel × distância GPS no dia, combustível que salta sem abastecimento, RPM alto com velocidade zero
por muito tempo. Resultado: *"odômetro do painel diverge 18% do GPS — conferir perfil do aparelho"*.

## 5. Sequência

**Antes de programar: prova de conceito** com payloads reais da HML. Pelo menos um equipamento com CAN e um só
com GPS (o GT06 da EVOO-X serve de "só GPS"). Do lado CAN, o FMC125 da HML é `com_acessorio`: lê CAN só com
adaptador externo (LV-CAN200/ALL-CAN300, programa configurado no Teltonika Configurator). O FMC150 tem CAN
integrado. O objetivo é ver os atributos crus, a frequência com que chegam e o comportamento com ignição ligada e
desligada, para fixar o mapeamento e as regras do § 4.2.

**JR12 na HML (conferido em 04/11/2026 no banco do Traccar):** o decoder `jmak` da Traccar lê CAN completo (RPM,
velocidade e odômetro OBD, combustível, consumo, carga do motor, temperatura e pressão do óleo, AdBlue…). Esses
dados vêm numa segunda parte da mensagem, depois do `|`, e o aparelho ainda manda um `canStatus` próprio. Nas
9.025 posições de 28/10 a 03/11, `canStatus` foi sempre `0` e nenhum atributo de CAN chegou, **o que é esperado:
o aparelho está em bancada, sem veículo**. Serve de referência do "conectado, sem CAN". O teste de verdade
precisa dele instalado num veículo com o fio da CAN ligado. Falta o manual da JMAK para saber o que significa cada
valor de `canStatus` e se a leitura CAN precisa ser habilitada por configuração.

| Etapa | Entrega | Prioridade |
|---|---|---|
| 1 | Catálogo: `suporte_can` com `nao_informado` + sinais que o modelo entrega | P0 |
| 2 | Normalização dos sinais de motor, estendendo `leitura.ts` e o mapeamento por modelo | P0 |
| 3 | Diagnóstico da 1ª transmissão com regra por sinal | P0 |
| 4 | Monitoramento de interrupção (ignição, conectividade, histórico) | P1 |
| 5 | Origem e confiança dos dados nos módulos | P1 |
| 6 | Cadastro técnico do veículo + conferência por VIN | P1 |
| 7 | Base de compatibilidade multimarca com amostra mínima | P2 |
| 8 | Plausibilidade e recomendações automáticas | P2 |

## 6. Regras fechadas para o P0 (segunda revisão, 04/11/2026)

### 6.1 "Recebido" é o que veio no pacote, nunca o último valor conhecido
Há duas fontes de valor "herdado", e as duas foram conferidas:
- **Na Traccar:** o `traccar.xml` da HML tem `processing.copyAttributes.enable = true` com
  `processing.copyAttributes = ignition`. Hoje só a **ignição** é copiada da posição anterior, não o RPM. Mas isso
  basta para que `ignition` presente numa posição não prove que o aparelho a transmitiu, e a regra do RPM depende
  da ignição. Alguém pode ampliar essa lista no futuro, então o diagnóstico não pode depender dela.
- **No nosso código:** `rastreador_comunicacao.ultimos_atributos` é, de propósito, um merge do último valor de cada
  atributo (`positions-ingest.service.ts`). Ele serve à tela de telemetria e **não pode alimentar o diagnóstico**.

Regra: o diagnóstico lê os atributos **de cada posição**, no momento da ingestão. Para a ignição, quando o modelo
manda um sinal próprio (ex.: `in1` no JR12), conferir se ele também veio. A decisão de desligar o `copyAttributes`
fica para depois da prova de conceito, porque hoje ele cobre aparelho que não manda ignição em todo pacote.

### 6.2 Estado por sinal em tabela própria
`rastreador_sinal_estado`, com uma linha por **instalação** e sinal (chave única), guardando só o estado atual:
`sinal`, `status`, `ultimo_valor`, `ultima_leitura_em` (horário do aparelho), `ultimo_recebimento_em`
(horário do servidor), `origem`, `atributo_origem`, `motivo`, `mapeamento_versao`. O histórico vai numa tabela
separada e só ganha linha quando o status muda.
- **Por instalação, e não por rastreador:** `rastreadores` não tem `client_id` (identidade física global). Se o
  estado ficasse no rastreador, o diagnóstico do cliente A iria junto quando o aparelho fosse reinstalado no
  cliente B. A instalação tem `client_id` e entra no `BaseRepository` como as demais tabelas de domínio.
- **Pacote atrasado:** só atualiza `ultimo_valor` e `ultima_leitura_em` se o horário do aparelho for mais novo que o
  guardado. É o mesmo padrão de `greatest(...)` que `rastreador_comunicacao` já usa. Pacote atrasado também não
  reabre alerta resolvido.
- `mapeamento_versao` exige versionar o mapeamento do modelo. Uma forma simples é guardar o `atualizado_em` do
  modelo no momento da leitura.

### 6.3 Condições refinadas
- **RPM:** ignição ligada não é motor girando. Se vier RPM > 0 numa posição, o sinal está confirmado. Se vier
  RPM = 0 com ignição ligada, o resultado é "recebido, motor possivelmente desligado", e não falha. "Não recebido"
  exige o atributo **ausente** em N posições com ignição ligada **e** deslocamento (velocidade > 0 garante motor).
- **Odômetro:** há aparelho que só incrementa em km inteiros. A validação exige deslocamento GPS acima de um
  limiar (ex.: 2 km) antes de cobrar mudança. Antes disso, basta o atributo estar presente.
- **Combustível:** nem todo pacote traz nível. Ausência pontual não é falha. Só cobrar depois de uma janela com
  ignição ligada, e com tolerância.
- **Comunicação antes de CAN:** sem pacote (GSM) ou sem posição válida (GPS), nenhum sinal CAN muda para falha. A
  causa fica "sem comunicação".
- **Evidência visível no admin:** atributo original, valor recebido, condição satisfeita (ou não) e o motivo da
  classificação.

### 6.4 Critérios de aceite do P0 (cada um vira teste)
1. RPM igual a zero é leitura válida.
2. Atributo ausente não reaproveita leitura antiga como nova (nem pelo `copyAttributes`, nem por `ultimos_atributos`).
3. Atributo presente com valor impossível vira "fora do esperado".
4. Ignição ligada sem motor girando não gera falso "RPM não recebido".
5. Posição atrasada não sobrescreve medição mais recente nem reabre alerta.
6. Modelo `nao_informado` não é cobrado por sinal não confirmado.
7. Mapeamento por modelo impede ler o `vin` do JR12 como chassi.
8. Falha de GPS/GSM não é diagnosticada como falha de CAN.
9. Reinstalação em outro cliente começa diagnóstico novo, sem herdar o estado anterior.

### 6.5 O que já está implementado (backend, 04/11/2026)
- Migration `1793180000000_sinais-motor`:
  - Campos no catálogo: `suporte_can`, com padrão `nao_informado`; `sinais_motor`, a lista de sinais que o modelo
    promete; e `atributo_rpm`, `atributo_odometro`, `atributo_combustivel` e `atributo_horimetro`.
  - Seed: FMC125 = `com_acessorio`, JR12 = `nativo`, ambos sem sinais prometidos até a prova de conceito.
  - Tabelas `instalacao_sinais` e `instalacao_sinais_historico`, com FK composta `(instalacao_id, client_id)`. O banco
    garante que o estado é do mesmo cliente da instalação.
- `src/telemetria/sinais-motor.ts`: leitura por posição e regras do § 6.3, como funções puras. Chaves padrão do
  Traccar: `rpm`, `obdOdometer` (odômetro do painel, não o `odometer` do aparelho) e `fuelLevel` (%). Horímetro só
  com mapeamento. "Em operação" = GPS válido e ≥ 5 km/h, sem depender da ignição copiada. N provisório: RPM 5,
  odômetro 5, combustível 15, horímetro 10.
- A ingestão (`positions-ingest.service.ts`) avalia os sinais na instalação principal vigente, e só quando há
  instalação. Mudança de status vai para o histórico e para o log (`warn` para "não recebido" e "fora do esperado").
- O diagnóstico do superadmin (`GET` do diagnóstico do rastreador) ganhou `sinaisMotor`: suporte, sinais
  prometidos e o estado de cada sinal. A mudança só acrescenta um campo; nenhum contrato existente foi quebrado.
- O catálogo aceita `suporteCan`, `sinaisMotor` e `atributoRpm`/`Odometro`/`Combustivel`/`Horimetro` no criar e no
  editar.
- Testes: `sinais-motor.spec.ts` (os critérios 1 a 8 do § 6.4), `instalacao-sinais.spec.ts` (integração: critérios
  2, 5 e 9, FK composta e checks do catálogo) e `parse-rastreador-modelo.spec.ts`.

- Front (Console › Rastreadores):
  - O modal do modelo ganhou a seção "Dados do painel (CAN)": leitura da rede CAN, os dados que o modelo entrega e
    o atributo de cada um (placeholder = chave padrão).
  - O diagnóstico do rastreador ganhou um item por sinal, com o que conferir quando não chega
    (`lib/diagnosticoRastreador.ts`, função `itensDosSinaisMotor`).
- Alerta para o gestor (P1): quando um dado que chegava passa a "não recebido" com o veículo em movimento, nasce um
  alerta `sinais_painel_pararam` (origem `aparelho`, prioridade média), um por transição. Exemplo: "RPM: sem
  leitura desde 04/11 às 09:00, com o veículo em movimento". "Nunca chegou" é problema de instalação e fica só no
  diagnóstico do admin.

Ainda não feito:
- Regra de odômetro "não mudou com deslocamento" (fica com a plausibilidade).
- Instalação com `papel = 'can'`: hoje só a principal é avaliada.
- Migration na HML: sobe com o deploy.

Decisões em aberto:
- Lista fechada de sinais canônicos da 1ª versão (proposta: RPM, odômetro, combustível, horímetro).
- O valor de N, o limiar do odômetro e a janela do combustível, a definir depois da prova de conceito.
- `com_acessorio` exige registrar uma instalação com `papel = 'can'`?
- Manter ou desligar o `processing.copyAttributes` da Traccar.

## Fontes

- Samsara — [VG55 datasheet](https://samsara.com/pdf/Datasheet-Vehicle-Gateway-VG55.pdf), [instalação pelo Fleet App](https://z3n-cab-workshop-9.zendesk.com/hc/en-us/articles/9651115784218-Streamline-Hardware-Installation-with-the-Samsara-Fleet-App), [cabo J1939 e VIN](https://z3n-cab-workshop-9.zendesk.com/hc/en-us/articles/9651156461466-VG55-Heavy-Duty-Vehicles-CBL-VG-CJ1939), [Malfunction and Diagnostic Events](https://kb.samsara.com/hc/en-us/articles/4423178493965-Malfunction-and-Diagnostic-Events), [Missing or Incorrect VG Diagnostic Data](https://kb.samsara.com/hc/en-us/articles/28395502051213-Missing-or-Incorrect-VG-Diagnostic-Data) (só o resumo da busca; a página bloqueou a leitura)
- Geotab — [API de elegibilidade por VIN](https://developers.geotab.com/myAdmin/apiReference/objects/ApiVinOemEligibilityBatchPublicVinResult), [GO9](https://geotab.com/au/vehicle-tracking-device), [comunidade: "vehicle not supported"](https://support.geotab.com/community/geotab-drive/1064/geotab-drive-app-shows-hos-in-gray-and-says-vehicle-not-supported-why-is-this-happening), [diagnóstico de veículos (Attrix)](https://support.attrix.ca/en/hc/en-ca/articles/4405380647579-vehicles-diagnostic-steps)
- Teltonika — [FMC125 CAN adapters](https://wiki.teltonika-gps.com/view/Template:FMC_CAN_adapters_FMC125), [CAN adapter supported vehicles](https://wiki.teltonika-gps.com/view/CAN_adapter_supported_vehicles), [AutoScan](https://www.teltonika-gps.com/newsroom/autoscan-feature-available-with-fmx150-and-fmx250-devices), [FMC150 AutoScan](https://wiki.teltonika-gps.com/view/FMC150_AutoScan), [suporte a veículos novos](https://www.teltonika-gps.com/blog/how-teltonika-turns-local-requests-into-global-can-vehicle-support), [problema de perfil OEM](https://community.teltonika.lt/t/ford-custom-2025-oem-profile-issue/20530)
- Wialon — [catálogo de hardware (ex.: CAN-WAY L)](https://wialon.com/en/gps-hardware/auto/can-way-l)
- Brasil — [Omnitelemetria](https://omnilink.com.br/omnitelemetria), [Omnilink/SETCESP](https://setcesp.org.br/noticias/omnilink-amplia-eficiencia-das-frotas-com-a-omnitelemetria-e-reforca-papel-estrategico-da-telemetria-no-transporte/), [Getrak GCan](https://ajuda.getrak.com.br/hc/article_attachments/20855076520603), [Michelin Connected Fleet](https://docs.connectedfleet.michelin.com/solution/overview)
- Traccar — [JmakProtocolDecoder](https://github.com/traccar/traccar/blob/master/src/main/java/org/traccar/protocol/JmakProtocolDecoder.java), [atributos de posição](https://deepwiki.com/traccar/traccar-web/7.2-position-attributes), [fórum: atributos OBD2](https://www.traccar.org/forums/topic/obd2-parameter-attributes/)
