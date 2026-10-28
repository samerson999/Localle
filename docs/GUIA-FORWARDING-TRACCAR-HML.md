# Ligar o Forwarding do Traccar na HML (VPS 200.141.18.98)

Objetivo: o Traccar antigo (`~/servidor-traccar`, fora do Coolify) passa a **empurrar** cada posição e cada evento para a
API (`POST /ingest/traccar/positions` e `/events`), em vez de a API consultar `GET /api/positions` a cada 30 s — que só
devolve a última posição de cada aparelho e perde os pontos do meio. Arquitetura e chaves: `docs/ARQUITETURA-INTEGRACAO-TRACCAR.md`
§ 1.1 e § 5.1; modelo de configuração: `infra/traccar/traccar.xml.template`.

Regras desta mudança:

- **Não derrubar os 2 aparelhos** (EVOO-X GT06 e FMC125). O Traccar só reinicia uma vez (etapa 5), alguns segundos; os
  aparelhos reconectam sozinhos.
- **Polling continua ligado durante o teste.** A API deduplica pela chave `(rastreador_id, traccar_position_id)`, então os
  dois caminhos convivem sem duplicar posição. O polling só é desligado na etapa 7, depois de conferido.
- **A chave de ingestão é segredo**: não colar no chat, não commitar.
- O terminal web da Hostinger quebra comando longo colado: rodar um comando por vez, ou usar SSH.

## Etapa 0 — Reconhecimento (só leitura)

```sh
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}'
cd ~/servidor-traccar && ls -la && ls -la conf 2>/dev/null
cat docker-compose.yml
grep -n "forward\|database.url\|registerUnknown" conf/traccar.xml
curl -s http://localhost:8082/api/server | grep -o '"version":"[^"]*"'
```

O que se tira daqui: nome do container do Traccar e do banco da plataforma, como o `traccar.xml` está montado
(arquivo ou pasta), versão do Traccar e se já existe alguma chave `forward.*`.

Resultado em 28/10/2026: Traccar **6.16.0** (`forward.type` vale), container `traccar` (banco `traccar-db`), compose em
`~/servidor-traccar` sem `name:` nem rede declarada, `conf/traccar.xml` montado **sozinho** e `:ro`, nenhuma chave `forward.*`,
`database.url` aponta para o host **`db`**. Banco da plataforma: `db-6zwwvtepgbgg1esgqutnfjlo-<data>` (o sufixo muda a cada
deploy).

**Risco do nome `db`:** o banco da plataforma no Coolify também é o serviço `db` do compose dele. Se o Traccar entrar numa rede
onde `db` já é apelido desse banco, o Traccar pode resolver `db` para o Postgres errado ao reiniciar. Por isso a etapa 4 troca
`database.url` para `traccar-db` (nome único do container), no mesmo reinício.

**Confirmado em 28/10/2026:** a API está só na rede `coolify`; o Traccar só em `servidor-traccar_default`; o banco da
plataforma tem o apelido `db` **também na rede `coolify`**. Consequência: o `docker network connect coolify traccar` só pode
acontecer **depois** de o Traccar reiniciar com `database.url` apontando para `traccar-db` — senão o pool de conexões dele pode
abrir conexão nova no Postgres da plataforma. Ordem efetiva: teste da rota (1, com container descartável) → chave (2) →
Coolify (3) → `traccar.xml` (4) → reinício (5) → **só então** `docker network connect coolify traccar` → conferir (6).

## Etapa 1 — Rede: o Traccar precisa alcançar a API

A API não tem domínio; só responde pelo nome interno `q2e84fcowbpmffbuxuet83kf` (porta 3000) na rede do Coolify.

```sh
docker inspect q2e84fcowbpmffbuxuet83kf --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
```

Ligar o container do Traccar a essa rede (sem reiniciar nada):

```sh
docker network connect <REDE> <CONTAINER_TRACCAR>
```

Testar a rota (um container descartável na mesma rede; **401 é o resultado esperado** — chegou na API e ela recusou por
falta de chave):

```sh
docker run --rm --network <REDE> curlimages/curl -s -o /dev/null -w '%{http_code}\n' -X POST http://q2e84fcowbpmffbuxuet83kf:3000/ingest/traccar/positions
```

`docker network connect` sobrevive a `docker restart`, mas **não** a recriar o container (`docker compose up` depois de
mudar o compose). Para deixar permanente, a etapa 5 também acrescenta a rede no `docker-compose.yml`.

## Etapa 2 — Gerar a chave de ingestão (na VPS)

```sh
openssl rand -hex 32
```

Guardar o valor (gerenciador de senhas). Ele vai em dois lugares: Coolify (etapa 3) e `traccar.xml` (etapa 4).

## Etapa 3 — API: configurar a chave no Coolify

Coolify → projeto `localle` → Resource da API → **Environment Variables**:

- `TRACCAR_INGEST_KEY` = a chave da etapa 2
- **não** mexer em `TRACCAR_URL`/`TRACCAR_USER`/`TRACCAR_PASSWORD` (comandos e cadastro de device continuam usando)
- **não** colocar `TRACCAR_POLL_ENABLED=false` ainda

Salvar e **Restart** (ou Redeploy) da API. Repetir o teste da etapa 1: continua **401** (agora porque o teste não manda a
chave). Se der 503, o banco da plataforma está fora.

## Etapa 4 — Traccar: acrescentar o forwarding no `traccar.xml`

Backup primeiro:

```sh
cd ~/servidor-traccar && cp conf/traccar.xml conf/traccar.xml.bak-$(date +%F)
```

Editar com `nano conf/traccar.xml` (não usar `sed -i`: se o arquivo estiver montado sozinho no container, o `sed -i` troca o
arquivo e o container continua vendo o antigo). Trocar o host do banco do Traccar de `db` para `traccar-db` (ver o risco acima):

```xml
    <entry key='database.url'>jdbc:postgresql://traccar-db:5432/traccar</entry>
```

Antes do `</properties>`, acrescentar (trocando `CHAVE`):

```xml
    <entry key='forward.url'>http://q2e84fcowbpmffbuxuet83kf:3000/ingest/traccar/positions</entry>
    <entry key='forward.type'>json</entry>
    <entry key='forward.header'>X-Traccar-Ingest-Key: CHAVE</entry>
    <entry key='forward.retry.enable'>true</entry>
    <entry key='event.forward.url'>http://q2e84fcowbpmffbuxuet83kf:3000/ingest/traccar/events</entry>
    <entry key='event.forward.type'>json</entry>
    <entry key='event.forward.header'>X-Traccar-Ingest-Key: CHAVE</entry>
```

Se a etapa 0 mostrar Traccar anterior à série 5, `forward.type` pode não existir (era `forward.json=true`) — conferir antes.

## Etapa 5 — Aplicar (único reinício do Traccar)

Se o compose ganhou a rede (permanente), `docker compose up -d traccar`; se não, `docker restart <CONTAINER_TRACCAR>`.
Os aparelhos ficam desconectados alguns segundos e reconectam.

## Etapa 6 — Conferir

```sh
docker logs --since 10m <CONTAINER_TRACCAR> 2>&1 | grep -i -E "forward|error" | tail -20
docker logs --since 10m q2e84fcowbpmffbuxuet83kf 2>&1 | grep -i -E "inbox|ingest|descartad" | tail -20
docker exec <CONTAINER_BANCO> psql -U <USUARIO> -d <BANCO> -c "select tipo, count(*), max(recebido_em), count(*) filter (where erro is not null) as com_erro from ingest_inbox group by tipo;"
```

Esperado: linhas de `posicao` chegando na `ingest_inbox` a cada envio dos aparelhos, sem erro, e o log da API sem 401/400.
Se aparecer 400 ("Posição inválida"), o formato do JSON desta versão do Traccar difere do esperado — me mandar uma linha
do log para ajustar a validação (`apps/api/src/ingest/dto/traccar-forward.dto.ts`). Se eventos derem 401 e posições não,
a versão não lê `event.forward.header`.

Comparar a densidade de pontos (deve subir em relação ao polling):

```sh
docker exec <CONTAINER_BANCO> psql -U <USUARIO> -d <BANCO> -c "select rastreador_id, date_trunc('hour', fix_time) h, count(*) from posicoes where fix_time > now() - interval '6 hours' group by 1,2 order by 2 desc, 1;"
```

## Etapa 7 — Desligar o polling (depois de ~24 h estável)

Coolify → API → `TRACCAR_POLL_ENABLED=false` → Restart. O log da API passa a mostrar
"Polling do Traccar desligado por TRACCAR_POLL_ENABLED=false.".

## Voltar atrás

```sh
cd ~/servidor-traccar && cp conf/traccar.xml.bak-AAAA-MM-DD conf/traccar.xml && docker restart <CONTAINER_TRACCAR>
```

e remover `TRACCAR_POLL_ENABLED=false` no Coolify, se já tiver sido colocado. O polling volta a ser o único caminho.
