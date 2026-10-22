# Inventário de assets

Levantamento feito no código em 20/10/2026, rota por rota, antes da Fase A da migração visual.
Prioridade segue a fase em que o asset é necessário: **A** fundamentos, **B** componentes base, **C** telas, **D** revisão.

## Decisões (20/10/2026)

- **Mapa:** disco com seta em qualquer zoom; o marcador 3D isométrico (`png-tight`) sai do mapa. O visual do veículo aparece no card ou popup da seleção, com a silhueta. Com isso, o `dolly` 3D deixa de ser necessário.
- **Ônibus:** vira categoria `onibus`, com silhueta e glifo de mapa. O glifo de `reboque` também será criado.
- **Logo da Locale:** a Locale vai fornecer. Até lá, marcador de posição com "Locale" em texto.
- **Ilustrações 3D:** cor de destaque fixa (o azul de dado), nunca a cor da revenda. As 18 das Fases B e C serão geradas pelo time e salvas em `src/images/ilustracoes/` com os identificadores abaixo (`ilu-*.png`).
- **Documentos impressos:** espelho de ponto, termos e medidas usam o logo do cliente final (novo campo "logo da empresa" no cadastro do cliente); a fatura usa o logo da Locale; relatórios do cliente usam a marca da revenda e o nome do cliente.
- **Aprovados:** 3D só em vazio e erro de página; avatares neutros; favicon gerado em código; referências movidas para `docs/referencias/` (feito).

Regra que orientou a lista (PRODUCT.md › Brand Commitments): ilustração 3D só em estado vazio, erro e onboarding, e só
no nível de página ou painel principal. Vazio pequeno dentro de tabela, card de BI ou lista curta fica com texto e
ícone de linha; se cada card de um painel tivesse uma ilustração, o painel inteiro viraria ruído.

## O que já existe

| Arquivo | Uso | Tamanho | Situação |
|---|---|---|---|
| `src/images/png-tight/01…62-*.png` | Marcador 3D isométrico no mapa e seletor "Ícone no mapa" (`lib/vehicleIcons.ts`, `IconPicker.tsx`) | 65–223 px, RGBA | 62 objetos. Falta **dolly**. Pequenos demais para ilustração de vazio (o cone tem 89 px) |
| `src/images/Caminhão-trator branco em render 3D.png` | **Não é usado** | 1774×887, 1,1 MB | Estilo fotográfico, diferente do conjunto isométrico. Candidato à imagem padrão do login ou remoção |
| `assetArt.tsx` › `ART` | Silhueta de traço 64×28 na lista de ativos e no /design | SVG em código | 10 categorias; carro, moto e pessoal são o glifo do mapa ampliado, não silhueta própria |
| `assetArt.tsx` › `MAP_GLYPH` | Glifo 24 px dentro do disco do marcador | SVG em código | 10 categorias |
| `icons.tsx` | Ícones da interface | SVG em código, grade 24, traço 1,5 | 43 ícones |
| Ilustrações 3D aprovadas (pino sobre mapa, cone com "!") | Só nas imagens de referência | — | **Não há arquivo**: precisam ser geradas |

## 1. Ilustrações 3D (vazio, erro, onboarding)

**Entregues em 20/10/2026** (18, Fases B e C) como `src/images/ilustracoes/NN-nome.png`. A interface usa os
`ilu-<id>.png` gerados por `python scripts/ilustracoes.py` (precisa de `pip install pillow`): recorta a margem
transparente, descarta pontos soltos, reposiciona o objeto com 70% da altura útil num canvas de 640×512 e limpa a
franja. Rode de novo ao substituir um `NN-nome.png` (a 03 e a 18 serão trocadas). Galeria no /design › Estados.

Especificação comum: PNG com fundo transparente, **640×512**, objeto centralizado com respiro de 10%, mesma câmera (3/4
levemente de cima), luz de cima à esquerda, sombra de contato suave embutida, material fosco branco e cinza frio.
Cor de destaque fixa no azul de dado (`--real`, #1D5BEA); cor própria só no objeto que pede (cone laranja, selo vermelho só em erro). **Nunca a cor da revenda**: a ilustração precisa
servir a qualquer marca. Exibição: 160×128 em página, 96×77 em painel. Pasta: `src/images/ilustracoes/`.
Até o arquivo existir, o componente mostra um marcador neutro do mesmo tamanho.

| Id | Tela e situação exata (arquivo:linha) | Objeto | Exibição | Existe? | Prior. |
|---|---|---|---|---|---|
| `ilu-erro` | Erro genérico: "O servidor não respondeu a tempo" (`story.tsx:85`), "Não conseguimos calcular este indicador agora" (`story.tsx:107`), "Não foi possível calcular os indicadores" (`Manutencao.tsx:60`, `BIManut.tsx:166`), "…o BI" (`Checklist.tsx:111`), "…o ranking" (`Ranking.tsx:87`); mapa que não carrega (ainda não tratado) | Cone de sinalização com selo vermelho "!" | página e painel | Na referência, sem arquivo (`60-cone` tem 89 px e não tem selo) | **B** |
| `ilu-busca-veiculo` | "Nenhum veículo com esses filtros." (`Monitoramento.tsx:96`), "Nenhum ativo com esses filtros." (`Ativos.tsx:132`), "Nenhum veículo com essa placa." (`PortariaApp.tsx:61`), "Nenhum veículo passou por este ponto no período." (`Monitoramento.tsx:283`) | Pino de localização sobre mapa dobrado | página e painel | Na referência, sem arquivo | **B** |
| `ilu-tudo-em-dia` | Vazio que é boa notícia: "Nenhum alerta crítico agora." (`NeedsPanel.tsx:43`), "Nenhuma OS em Crítico ou Alerta." (`Manutencao.tsx:110`), "Ninguém atrasado" (`Viagens.tsx:177`), "Ninguém acima do limite" (`Ranking.tsx:132`), "Todos os checklists previstos foram preenchidos." (`Checklist.tsx:227`), "Nenhuma indicação perto do prazo." (`Multas.tsx:113`), "Nenhum veículo na oficina" (`BIManut.tsx:115`) | Escudo com check (sem verde de status: branco com detalhe cinza) | painel | Não | **B** |
| `ilu-link-expirado` | Página pública: "Este link expirou" / "Este link foi desativado" / "Link inválido" (`Compartilhar.tsx:41`); quem vê é um terceiro, fora do sistema | Pino de localização com relógio | página | Não | **C** |
| `ilu-sem-acesso` | "Este módulo não está contratado…" e "A operação da frota é do cliente…" (`App.tsx:34-35`), "Acesso restrito a este perfil." (`App.tsx:41`) | Cadeado sobre pasta | página | Não | **C** |
| `ilu-cercas` | Cercas sem nenhuma cadastrada: hoje cai no padrão "Nada por aqui ainda." (`Cercas.tsx:81`) | Área demarcada com estacas e pino | painel | Não | **C** |
| `ilu-checklist` | "Nenhum checklist no banco" (`Checklist.tsx:30`), "Nenhum modelo atribuído a grupos" (`Checklist.tsx:163`), "Nenhum checklist atribuído a esta pessoa." (`Checklist.tsx:361`, visão do motorista) | Prancheta com lista marcada e caneta | página | Não | **C** |
| `ilu-pneus` | "Nenhum pneu no banco ainda" (`Pneus.tsx:31`), "Nenhum pneu em estoque ou na recapadora." (`Pneus.tsx:456`) | Pneu em pé | página e painel | Parecido em `62-pneu` (98 px), precisa refazer em 640 | **C** |
| `ilu-manutencao` | "Nenhuma OS com esses filtros." (`Manutencao.tsx:174`) | Chave inglesa sobre ordem de serviço | painel | Não | **C** |
| `ilu-combustivel` | "Nenhum abastecimento nesta lista." (`Combustivel.tsx:156`) | Bomba de combustível | painel | Não | **C** |
| `ilu-viagens` | "Nenhuma viagem nesta lista." (`Viagens.tsx:213`), "Nenhum registro ainda." (`Viagens.tsx:144`, log da portaria) | Cancela de portaria | painel | Não | **C** |
| `ilu-multas` | "Nenhuma multa no período." (`Multas.tsx:118`, `:133`), "Nenhuma multa nesta lista." (`Multas.tsx:158`) | Notificação de trânsito (envelope com auto) | painel | Não | **C** |
| `ilu-jornada` | "Ninguém iniciou jornada hoje" (`Jornada.tsx:89`) | Relógio de ponto | painel | Não | **C** |
| `ilu-campanhas` | "Nenhuma campanha" (`Ranking.tsx:236`) | Troféu | painel | Não | **C** |
| `ilu-telemetria` | "Nenhum dado de telemetria ainda" (`Telemetria.tsx:224`) | Módulo rastreador com chicote e ondas de sinal | página | Não | **C** |
| `ilu-replay` | "Sem posições no período escolhido." (`Replay.tsx:107`) | Rota tracejada com bandeira de chegada | painel | Não | **C** |
| `ilu-documentos` | "Nenhum documento. Cadastre CRLV, IPVA, seguro…" (`Ativos.tsx:471`, ficha do ativo) | Pasta com documento e etiqueta de vencimento | painel | Não | **C** |
| `ilu-estoque` | "Nenhum rastreador em estoque." (`Revenda.tsx:118`), estoque no Painel da Locale | Caixa aberta com rastreadores | painel | Não | **C** |
| `ilu-onboarding-frota` | **Não existe onboarding hoje.** Primeiro acesso do gestor: frota vazia | Veículos sobre mapa | página | Não | **D** |
| `ilu-onboarding-importar` | Primeiro acesso: importar ativos por planilha | Planilha virando veículos | página | Não | **D** |
| `ilu-onboarding-marca` | Primeiro acesso da revenda: configurar logo, cor e foto | Paleta e cartão de marca | página | Não | **D** |

Ficam **sem 3D** (texto e ícone de linha): vazios de gráfico e card de BI ("Sem dados no período" em `story.tsx:86`,
"Ainda sem dados suficientes" em `story.tsx:108`, os `empty={{…}}` de Combustível, Checklist, Jornada, Telemetria,
Pneus e Manutenção), tabelas secundárias (histórico de alterações, engates, e-mails, comandos) e o "Nada encontrado"
da paleta de comandos.

## 2. Silhuetas de veículos

Hoje são de **traço**; as referências pedem **silhueta cheia** em cinza, vista lateral, frente para a direita, com as
janelas em tom mais claro. Formato: SVG em código, em `assetArt.tsx`, com cor `currentColor` e janelas por opacidade.
Moldura única de 64×28 com a linha do chão alinhada, para todas as silhuetas se alinharem em tabela. Tamanhos de uso:
40×18 em tabela e lista, 64×28 em card compacto, 160×70 no card de destaque.

| Id | Categoria no catálogo | Onde aparece | Situação | Prior. |
|---|---|---|---|---|
| `sil-carro` | `carro` (hatch e sedã) | Tabelas, cards, ficha | Hoje é o glifo do mapa ampliado | **B** |
| `sil-utilitario` | `utilitario` (van, furgão) | idem | Redesenhar cheia | **B** |
| `sil-picape` | `picape` | idem | Redesenhar cheia | **B** |
| `sil-moto` | `moto` | idem | Hoje é o glifo do mapa | **B** |
| `sil-caminhao` | `caminhao` (toco, truck, baú) | idem | Redesenhar cheia | **B** |
| `sil-cavalo` | `cavalo` | idem e composições | Redesenhar cheia | **B** |
| `sil-onibus` | **Não existe categoria**: ônibus cai em `caminhao` (`categoryOf`), apesar dos 3D 31–33 | idem | Criar a categoria `onibus` e a silhueta | **B** |
| `sil-semirreboque` | `carreta` com `trailerType: semirreboque` (`couplings.ts:7`) | Ativos, engates | Hoje uma só "carreta" | **B** |
| `sil-dolly` | `carreta` com `trailerType: dolly` | Engates (rodotrem) | Não existe | **B** |
| `sil-reboque` | `carreta` com `trailerType: reboque` | Engates (Romeu e Julieta) | Não existe | **B** |
| `sil-linha-amarela` | `linha_amarela` (retroescavadeira como padrão) | Tabelas, cards | Redesenhar cheia | **B** |
| `sil-equipamento` | `equipamento` (gerador como padrão) | idem | Redesenhar cheia | **B** |
| `sil-pessoal` | `pessoal` (mochila) | idem | Hoje é o glifo do mapa | **B** |
| Composições | Bitrem, rodotrem, tritrem, Romeu e Julieta (`couplings.ts:24`) | Painel de engates | **Montadas em código** juntando cavalo e implementos; sem asset novo | **C** |
| Subtipos | SUV, sedã, furgão grande, VUC, bitruck, micro-ônibus, ônibus rodoviário, escavadeira, pá carregadeira, empilhadeira, trator | Ficha e lista de ativos | Opcional: só onde o formato muda muito | **C** |

Glifos de mapa (24 px, SVG em código, `MAP_GLYPH`): faltam `onibus` e `reboque` (o semirreboque usa o glifo atual
de carreta; o dolly raramente tem rastreador próprio e usa o mesmo). **Prioridade B.**

3D isométrico do mapa (`png-tight`): falta `dolly` (PNG transparente na escala do conjunto, cerca de 90×100).
**Prioridade C**, e só se o marcador 3D continuar no mapa. A referência usa disco com seta; o 3D ou vira opção de
zoom alto ou sai do mapa. Essa decisão é da Fase B.

## 3. Imagens de marca

| Id | Onde | Situação hoje | Tamanho e formato | Como fazer | Prior. |
|---|---|---|---|---|---|
| `marca-login-padrao` | Login de revenda sem foto (`Login.tsx:23`) e prévia no Painel da revenda (`Revenda.tsx:53`) | Curvas SVG na cor da revenda sobre fundo escuro | 2400×1600 WebP (≈250 KB) + versão 1200 para celular; ponto focal à esquerda, para o título ficar legível | Imagem gerada, neutra, sem cor de marca (frota em pátio ou rodovia ao entardecer). O render do cavalo, que hoje não é usado, pode servir de base | **C** |
| `marca-locale` | Painel da Locale, barra lateral do perfil Locale, prévia de fatura, /design | **Não existe.** O perfil Locale vê a marca da revenda (`BrandMark`, `Layout.tsx:29`) | SVG horizontal e símbolo quadrado | Precisa vir da Locale: não dá para inventar uma marca real. Até lá, um marcador em texto | **C** |
| `favicon` | Aba do navegador | **Não existe** no `index.html`; o título é fixo | SVG + PNG 32 e 180 (apple-touch) | Em código: gerado em tempo de execução com o logo da revenda ou as iniciais sobre `--brand`; um neutro como padrão | **D** |
| `pwa-icones` | Portaria no celular (adicionar à tela inicial) | Não existe manifest | 192 e 512, maskable | Em código. Ícone por revenda exige manifest dinâmico: decidir | **D** |
| `og-compartilhar` | Prévia do link de localização no WhatsApp | Não existe; a SPA com HashRouter não tem como variar a prévia por revenda | 1200×630 PNG | Imagem neutra e fixa | **D** |

Sem asset novo: logo da revenda sem imagem já cai nas iniciais sobre a cor da marca (`Layout.tsx:33`), e isso
continua valendo.

## 4. Outros assets encontrados

| Id | Onde | Achado | Formato | Prior. |
|---|---|---|---|---|
| `icones-faltantes` | Toda a interface | O conjunto tem 43 ícones; as referências usam por volta de 90. Faltam, entre outros: velocímetro, RPM, odômetro, ignição, motor, bateria, óleo, filtro, freio, suspensão, sinistro, destino (bandeira), centralizar, zoom, camadas, satélite, trânsito, cerca, usuário, equipe, permissões, importar, editar, visualizar, duplicar, excluir, imprimir, compartilhar, enviar, mais opções, ordenar, recarregar, informação, mensagem, e-mail, anexo, link, temperatura, online/offline, troféu, escudo, oficina, posto, medir, tela cheia | SVG em código no padrão atual (grade 24, traço 1,5) | **A** (os da Fase B) e **C** (o restante) |
| `avatar` | Barra lateral (`Layout.tsx:170`), tabela de usuários | Iniciais sobre cinza. A referência usa avatares coloridos, e o verde se confundiria com status | Em código; manter neutro ou usar a paleta de zonas | **B** |
| `mapa-estilos` | Seletor de estilo do mapa (referência: Padrão, Escuro, Satélite, Relevo) | Não existe. Satélite e relevo dependem de provedor de tiles e de licença | Miniaturas 120×80 geradas dos próprios tiles | **B**, se o seletor entrar |
| `mapa-poi` | Oficina e posto no mapa (referência) | Não existe | Ícone de linha em disco neutro, em código | **C** |
| `doc-cabecalho` | Espelho de ponto, termos e medidas (`FolhaPonto.tsx`, `JornadaDocs.tsx`), prévia de fatura, relatório de telemetria | **Nenhum documento impresso tem logo.** Os documentos jurídicos precisam do empregador | Espaço para o logo do cliente (cadastro) e, na fatura, da Locale; em código | **C** |
| `foto-placeholder` | Dropzone de foto (checklist, portaria, nota de combustível, OS) | Já usa ícone de linha | Nenhum asset novo | — |
| `referencias` | `docs/referencias/` (10 PNG, 16 MB) | Movidas da raiz (`Nova pasta/`) | Feito | **A** |
