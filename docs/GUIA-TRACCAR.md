# Guia: subir o servidor Traccar (Docker)

21/10/2026. Passo a passo para colocar o Traccar no ar, em Docker, localmente (desenvolvimento) ou numa VPS (homologação/produção). Baseado no trabalho já feito na VPS da Hostinger (IP e credenciais reais ficam só no documento compartilhado por e-mail/Share, nunca neste repositório) e generalizado para qualquer ambiente novo.

Decisão de arquitetura por trás deste guia: `docs/ARQUITETURA-BACKEND.md` › seção 6 (Traccar como gateway de rastreadores, não um gateway próprio).

Os arquivos citados aqui estão em `infra/traccar/`.

---

## 1. O que é o Traccar aqui dentro

Três peças, sempre as mesmas:

1. **Rastreador** (GT06, Teltonika, Suntech etc.): manda posição pela rede celular para o IP do servidor, na porta do protocolo dele.
2. **Servidor Traccar**: recebe os rastreadores e grava tudo num PostgreSQL próprio (schema `tc_*`). Roda em Docker.
3. **Plataforma**: lê o Traccar (hoje, em desenvolvimento, por um adaptador no Vite; em produção, pela API NestJS via webhook — `docs/ARQUITETURA-BACKEND.md` › seção 4).

Importante sobre **CGNAT**: se o Traccar for testado na rede de um escritório comum, é comum a operadora não entregar um IP público de verdade (CGNAT). Nesse caso, abrir porta no roteador não funciona, e o Traccar precisa estar numa VPS com IP público — não há solução client-side para isso.

---

## 2. Rodando localmente (desenvolvimento)

```bash
cd infra/traccar
cp .env.example .env
# editar .env: trocar as duas senhas (banco e administrador) por valores próprios
docker compose up -d
```

O compose sobe dois containers:

- `traccar-db` — `postgres:16-alpine`, só para o Traccar (schema isolado do Postgres da plataforma).
- `traccar` — `traccar/traccar:latest`, painel em `http://localhost:8082`.

Primeiro acesso: `http://localhost:8082`, login com o e-mail e senha de administrador definidos no `.env`.

Cadastrar um rastreador de teste manualmente só é necessário em desenvolvimento manual — na plataforma real, o cadastro nasce em Gestão de ativos e a API cria o dispositivo no Traccar sozinha (fluxo já descrito no documento de integração do Rafael, seção "Etapa 6").

Para testar sem rastreador físico, o protocolo **OsmAnd** (porta 5055) aceita um `POST`/`GET` HTTP simples — é o mais fácil de simular com `curl`:

```bash
curl "http://localhost:5055?id=TESTE123&lat=-8.0631&lon=-34.8711&speed=36&timestamp=$(date +%s)"
```

---

## 3. Subindo numa VPS

### 3.1 Criar a VPS

1. Contratar a VPS (Hostinger ou equivalente) com imagem **Ubuntu com Docker pré-instalado** (evita instalar Docker manualmente).
2. Anotar: IP público, senha de root, acesso SSH.
3. Se a VPS fizer parte da topologia de 2 servidores (`docs/ARQUITETURA-BACKEND.md` › seção 7), o Traccar vai no **VPS-APP**, nunca no VPS-DB — ele só precisa falar com a internet (rastreadores) e com o Postgres do VPS-DB pela rede privada.

### 3.2 Enviar o kit

```bash
scp -r infra/traccar root@SEU-IP:/root/servidor-traccar
```

Na primeira conexão SSH, responder `yes` ao aviso de fingerprint.

### 3.3 Subir dentro da VPS

```bash
ssh root@SEU-IP
cd /root/servidor-traccar
sed -i 's/\r$//' .env docker-compose.yml   # só se o .env foi editado no Windows (Bloco de notas)
docker compose up -d
docker compose logs -f traccar             # confirmar "Servidor Traccar no ar."
```

### 3.4 Firewall

Liberar só o necessário — nunca a faixa inteira "por garantia":

```bash
ufw allow 22/tcp          # SSH
ufw allow 8082/tcp        # painel (fechar depois que o reverse proxy com HTTPS estiver no ar — seção 5)
ufw allow 5023/tcp        # GT06/Concox — exemplo; liberar só os protocolos realmente em uso
ufw --force enable
```

Se o painel de firewall do provedor (Hostinger, por exemplo) tiver uma camada própria além do `ufw`, as mesmas portas precisam ser liberadas lá também — os dois firewalls são independentes.

### 3.5 Backup

```bash
cd /root/servidor-traccar
./backup.sh   # salva um dump do Postgres do Traccar em backups/
```

Para produção com cliente pagante, isso não é suficiente sozinho — ver `docs/ARQUITETURA-BACKEND.md` › seção 5 (WAL archiving / PITR).

---

## 4. Portas por protocolo (as mais usadas no Brasil)

| Marca / modelo | Protocolo (Traccar) | Porta |
|---|---|---|
| Concox/Jimi GT06, genérico GT06, J16/J14 | `gt06` | 5023 |
| Coban TK103/TK102/GPS303 | `gps103` | 5001 |
| SinoTrack ST-9xx | `h02` | 5013 |
| Teltonika FMB/FMC (toda a linha) | `teltonika` | 5027 (TCP e UDP) |
| Suntech ST3xx/ST4xx/ST8xx | `suntech` | 5011 |
| Queclink GV/GL | `gl200` | 5004 |
| Meitrack T3xx/MVT380 | `meitrack` | 5020 |
| Ruptela FM-Eco4/FM-Pro4 | `ruptela` | 5046 |
| JT808 genérico | `jt808` | 5015 |
| Relógio/pessoal (Watch) | `watch` | 5093 |
| Celular (Traccar Client / OsmAnd) | `osmand` | 5055 |

Lista completa (266 protocolos) disponível dentro do próprio Traccar; a plataforma expõe um catálogo reduzido aos modelos usados no Brasil em `src/lib/trackerModels.ts`.

---

## 5. Antes de usar com cliente real (checklist)

- [ ] Trocar as senhas padrão do kit (`.env`) — nunca subir em produção com `TroqueEstaSenha123`/`TroqueEstaSenha456` ou equivalente.
- [ ] Colocar o painel/API do Traccar atrás de um reverse proxy com HTTPS (Nginx/Coolify + Let's Encrypt); fechar a porta direta (8082) para a internet depois disso.
- [ ] Confirmar que o VPS do banco (se for o mesmo Postgres da plataforma, schema separado) não está exposto além da rede privada.
- [ ] Rodar o backup com WAL archiving, não só `pg_dump` periódico (`docs/ARQUITETURA-BACKEND.md` › seção 5).
- [ ] Webhook do Traccar configurado para a API (em vez de polling) antes de vender módulos que dependem de alerta em tempo real.
- [ ] Documento com as credenciais reais (IP, senhas, acessos) compartilhado só com quem precisa, fora do controle de versão.

---

## 6. Configurar um rastreador (comandos por SMS)

O rastreador precisa saber o IP/domínio e a porta do servidor, e o APN do chip. Comandos variam por fabricante; os mais comuns:

| Marca | Comando de servidor | Comando de APN |
|---|---|---|
| GT06/Concox | `SERVER,0,IP,PORTA,0#` | `APN,apn-da-operadora#` (depois `RESET#`) |
| Coban | `adminip123456 IP PORTA` | `apn123456 apn-da-operadora` (depois `gprs123456`) |
| SinoTrack | `8040000 IP PORTA` | `8030000 apn-da-operadora` (senha padrão `0000`) |
| Teltonika | via Teltonika Configurator (GPRS › Server Settings) | GPRS › SIM1 (APN/usuário/senha) |

Acompanhar a chegada do rastreador nos logs:

```bash
docker compose logs --tail 300 traccar | grep -i SEU-IMEI
```

- Linha com `Unknown device`: o pacote está chegando, mas o IMEI não está cadastrado no Traccar.
- Linha com o nome do protocolo (`gt06`, `teltonika`...): está gravando normalmente.
- Nenhuma linha: não está chegando — conferir porta aberta externamente (`portchecker.co`, ou `nc -zv IP PORTA` de outra máquina) e, se a rede de origem tiver CGNAT, usar uma VPS em vez de rede local.

---

## 8. Testar protocolos e equipamentos sem hardware real

Pergunta frequente: **não existe uma API pública que simule rastreadores de verdade** contra qualquer servidor Traccar — seria um serviço perigoso de se oferecer (qualquer um poderia usar para atacar servidor alheio). O que existe, e já validamos aqui, são dois caminhos legítimos e gratuitos:

### 8.1 OsmAnd (HTTP) — o mais fácil, dá para testar com `curl`

A porta 5055 aceita um `GET`/`POST` HTTP simples (protocolo OsmAnd), ótimo para simular "um equipamento qualquer" sem se preocupar com formato binário:

```bash
curl "http://localhost:5055?id=TESTE123&lat=-8.0631&lon=-34.8711&speed=36&timestamp=$(date +%s)"
```

Isso não testa o protocolo de um fabricante específico (GT06, Teltonika etc.), só a cadeia "Traccar recebe → grava → plataforma lê".

### 8.1.1 Bateria de testes já rodada (21/10/2026)

Testamos, contra o Traccar local deste repositório, 11 protocolos com pacotes reais de equipamento (fonte: testes públicos do próprio Traccar, seção 8.2) — todos decodificaram e gravaram posição corretamente:

| Protocolo | Porta | Fabricantes cobertos | Observação |
|---|---|---|---|
| `gt06` | 5023 | Concox, genérico GT06, J16/J14 | login + posição, dois pacotes |
| `teltonika` | 5027 | Toda linha FMB/FMC | handshake: pacote de IMEI (ASCII, length-prefixed) → AVL binário |
| `h02` | 5013 | SinoTrack | texto `*HQ,...#`, auto-contido |
| `jt808` | 5015 | Genérico JT808 | binário com `0x7e` de início/fim |
| `ruptela` | 5046 | FM-Eco4/FM-Pro4 | binário, multi-registro num pacote só |
| `meitrack` | 5020 | T3xx/MVT380 | binário com cabeçalho `$$` |
| `gps103` (Coban) | 5001 | TK103/TK102/GPS303 | texto `imei:...;`, auto-contido |
| `gl200` (Queclink) | 5004 | GV/GL | texto `+RESP:GTxxx,...$` |
| `watch` | 5093 | Relógio GPS | texto `[3G*IMEI*...]`, Traccar respondeu ACK |
| `osmand` | 5055 | Celular/testes | HTTP simples, `curl` já basta |
| `suntech` | 5011 | ST3xx/ST4xx/ST8xx | texto `ST.../STT;...`, **precisa terminar com `\r` puro — `\r\n` trava o frame decoder** (`SuntechFrameDecoder` só corta o quadro num `\r` que não seja seguido de `\n`) |

Script usado: `infra/traccar/testar-protocolo.mjs` (aceita hex por padrão, ou `text:...` para protocolos em ASCII). Confirmação em cada caso: dispositivo criado em `tc_devices` com o identificador do pacote, posição gravada em `tc_positions` com o `protocol` certo — consultado direto no Postgres do Traccar.

Os dispositivos de teste foram apagados do banco local depois (`delete from tc_positions; delete from tc_devices;`) para não sujar o ambiente de desenvolvimento.

**Não testado ainda** (dos ~270 que o Traccar suporta): tudo fora da tabela acima. A metodologia da seção 8.2 serve para qualquer um deles — é só repetir o processo com o arquivo de teste do protocolo desejado.

### 8.2 Pacotes binários reais de cada protocolo — o jeito de testar o protocolo do fabricante de verdade

O próprio Traccar é open source e cada decoder (`Gt06ProtocolDecoder`, `TeltonikaProtocolDecoder`, `SuntechProtocolDecoder` etc.) tem, no repositório público do projeto, um arquivo de teste com **pacotes reais capturados de equipamento físico**, em hexadecimal — são a fonte mais confiável que existe, porque são os mesmos bytes que um rastreador de verdade manda.

```
https://github.com/traccar/traccar/tree/master/src/test/java/org/traccar/protocol
```

Procure o arquivo `<Protocolo>ProtocolDecoderTest.java` do fabricante que você quer testar e copie o hex de dentro de `binary("...")`.

Script pronto em `infra/traccar/testar-protocolo.mjs` (Node, sem dependência):

```bash
node infra/traccar/testar-protocolo.mjs 5023 \
  78780D01086471700328358100093F040D0A \
  7878131340b2fa000201040000000000011c00400e550d0a
```

**Testado nesta sessão:** os dois frames acima (login + posição, GT06) foram enviados ao container local, o Traccar respondeu com ACK nas duas mensagens, criou o dispositivo (`uniqueid 864717003283581`) e gravou a posição com `protocol = gt06` — confirmado direto no Postgres do Traccar (`tc_devices`, `tc_positions`).

Para o Traccar aceitar um IMEI que não está cadastrado (só em ambiente de teste — `conf/traccar.xml` já traz a chave comentada):

```xml
<entry key='database.registerUnknown'>true</entry>
```

Religar o container (`docker compose restart traccar`), testar, e **voltar para `false`** depois — nunca deixar ligado em homologação/produção, porque qualquer IMEI desconhecido passaria a criar um veículo sozinho.

### 8.3 Sobre RS232

RS232 não é um protocolo que o Traccar "escuta" — é a interface serial **entre o rastreador e um periférico** (leitor de CAN bus, sensor de combustível, antena), não entre o rastreador e o servidor. O rastreador sempre fala com o Traccar pela rede (celular → internet → TCP/UDP numa das portas da seção 4), nunca por serial direto com o servidor. Se o equipamento tem uma saída RS232/CAN, ela alimenta dados (temperatura, combustível, odômetro do CAN) que o próprio rastreador decodifica e manda embutidos no protocolo dele (ex.: os atributos `tag1Temp`, `fuel`, `odometer` que já aparecem nos pacotes GT06/Teltonika de teste) — é esse canal (rastreador → Traccar) que dá para testar, pelo método da seção 8.2, não a porta serial em si.

### 8.4 App de celular como "rastreador de mentira"

O **Traccar Client** (app Android/iOS gratuito, do próprio projeto Traccar) fala o protocolo OsmAnd/Traccar e pode apontar para `SEU-IP:5055`. É o jeito mais rápido de gerar posições reais em movimento (andando ou dirigindo com o celular) sem rastreador físico algum, útil para testar o mapa ao vivo e o replay da plataforma de ponta a ponta.

---

## 9. Problemas comuns

| Problema | Causa | Solução |
|---|---|---|
| `duplicate key value violates unique constraint "tc_devices_uniqueid_key"` | IMEI já cadastrado | Procurar o dispositivo existente em Dispositivos e editar, em vez de criar outro |
| Porta fecha no `portchecker.co` mesmo com `ufw allow` | CGNAT na rede de origem, ou firewall do painel do provedor além do `ufw` | Usar VPS com IP público; liberar a porta também no painel do provedor |
| `.env` com senha errada só na VPS (funcionava local) | Quebra de linha do Windows (`\r`) no arquivo editado no Bloco de notas | `sed -i 's/\r$//' .env docker-compose.yml` antes de subir |
| `scp` copiando milhares de arquivos pequenos | Pasta de dados de um Postgres local foi junto no envio | Nunca copiar a pasta de dados do Postgres entre ambientes; deixar o `docker compose up` criar um banco novo |
| `POST /api/users` dá erro 500 (`NullPointerException` em `checkAdmin`) ao criar o 1º administrador | Bug do Traccar 6.16: mandar `"administrator": true` no corpo quebra o endpoint de bootstrap | Não mandar o campo `administrator` na criação do 1º usuário — o Traccar promove o primeiro usuário criado a administrador sozinho (é o que `setup.sh` já faz) |
