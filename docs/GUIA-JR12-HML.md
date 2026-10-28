# JMAK JR12 não conecta no Traccar da HML — roteiro de diagnóstico

Sprint de monitoramento (28/10/2026), melhoria 7. O JR12 não aparece no Traccar da HML (`~/servidor-traccar`, Traccar
6.16.0), mas funciona em outra plataforma com Traccar. Estado conhecido: cadastrado no Traccar em 3 formatos de
identificador, nunca conectou; firewall da Hostinger com 5023 e 5027 liberadas (GT06 e Teltonika).

**Hipótese principal:** o JR12 fala **JT808** (comum em aparelhos JMAK), que no Traccar se chama **`huabao`** e usa a porta **5015** — não liberada
no firewall da Hostinger e possivelmente não publicada no `docker-compose.yml` do Traccar antigo. No JT808 o aparelho se
identifica pelo **número do terminal** (12 dígitos, em geral derivado do número do chip ou do IMEI), não pelo IMEI
inteiro — o que explicaria nenhum dos 3 cadastros bater. Os passos abaixo confirmam ou descartam isso, do que só lê
para o que muda alguma coisa.

**Resultado em 28/10/2026 (passos 2 e 4):** o Docker publica a 5015 (e 5001, 5002, 5004, 5011, 5013, 5015, 5023, 5027
tcp/udp, 5046, 5055, 5093, 8082); nenhuma linha `Unknown device` no log do Traccar em 24 h (o JT808 aparece no log como `huabao`, não `jt808`; a busca por `Unknown device` vale de qualquer forma) — nenhum
aparelho não cadastrado chegou ao Traccar por porta alguma, então o JR12 não está chegando. Suspeita: firewall da
Hostinger, que libera 5023/5027 mas não 5015 (bloqueio fora da VPS não aparece em log nem no `tcpdump`). Pendente:
porta usada na outra plataforma, `ufw status`, liberar 5015 na Hostinger (sincronizar) e repetir os passos 3 e 4.

Regras: não derrubar os 2 aparelhos que já funcionam (GT06 e FMC125); não rodar `iniciar.sh` (regenera o `traccar.xml`,
ver `docs/GUIA-FORWARDING-TRACCAR-HML.md`); colar um comando por vez no terminal web da Hostinger.

## 1. Perguntar à outra plataforma (onde o JR12 funciona)

- Versão do Traccar deles (`/api/server` ou rodapé do painel).
- **Porta e protocolo** para onde o JR12 aponta lá (ex.: 5015/jt808, 5023/gt06).
- Como o aparelho está cadastrado lá (o **identificador** exato).

Se a porta deles for outra, é ela que o JR12 usa — o restante do roteiro vale trocando 5015 pela porta informada.

## 2. VPS — o Traccar escuta a porta? (só leitura)

```sh
cd ~/servidor-traccar && grep -n "5015\|ports" docker-compose.yml
docker port traccar | grep -E "5015|5023|5027"
ss -lntup | grep -E ":5015|:5023|:5027"
```

Esperado para o JT808: uma linha `5015` em `docker port` e em `ss`. Se só aparecem 5023/5027, a porta do JR12 não está
publicada — o pacote nem chega ao Traccar.

## 3. VPS — o JR12 chega até a máquina? (só leitura, ~2 min)

Com o JR12 ligado e com sinal:

```sh
timeout 120 tcpdump -ni any 'tcp port 5015 or udp port 5015' -c 20
```

- Nada em 2 minutos: o pacote não chega — firewall da Hostinger (porta não liberada **ou** regra não sincronizada),
  ou o aparelho aponta para outro IP/porta (passo 5).
- Pacotes chegando: a rede está certa; o problema é publicação da porta no Docker (passo 2) ou cadastro (passo 4).

## 4. VPS — o Traccar recebe e reconhece? (só leitura)

```sh
docker logs --since 30m traccar 2>&1 | grep -i -E "unknown device|huabao" | tail -20
```

- `Unknown device - 0123456789AB` (ou parecido): o Traccar recebeu e decodificou, mas **o identificador não bate com
  nenhum cadastro**. O valor depois do hífen é o identificador certo: cadastrar o JR12 com ele exatamente e apagar os 3
  cadastros antigos.
- Linhas `huabao` com hexadecimal e sem "Unknown device": está chegando e gravando — conferir no painel do Traccar.
- Nada: volta ao passo 3.

## 5. Aparelho — IP, porta e APN

Pela documentação/app da JMAK para o JR12 (a sintaxe de SMS varia por modelo; não chutar comando), conferir:

- IP `200.141.18.98` e a porta do passo 1/2 (5015 para JT808);
- APN da operadora do chip;
- se o chip tem dados e sinal (a outra plataforma funcionar com o **mesmo chip** descarta o chip).

## 6. Correção (só depois do diagnóstico, com janela combinada)

Conforme o que os passos mostrarem — um item por vez, conferindo o GT06 e o FMC125 depois de cada um:

1. **Firewall da Hostinger:** liberar a porta (TCP e UDP) e **sincronizar** a regra (sem sincronizar não vale — já
   causou bloqueio total, ver memória da HML).
2. **Docker:** acrescentar `- '5015:5015'` (e `'5015:5015/udp'`) em `ports` do serviço `traccar` no
   `~/servidor-traccar/docker-compose.yml` e recriar o container: `docker compose up -d traccar`. **Recriar o container
   desfaz o `docker network connect coolify traccar`** do Forwarding: rodar de novo logo depois, ou declarar a rede
   `coolify` como externa no compose (permanente) — ver `docs/GUIA-FORWARDING-TRACCAR-HML.md`, etapa 1.
3. **Cadastro:** identificador exatamente como no `Unknown device` do passo 4; um cadastro só.
4. **Versão do Traccar:** só se, com porta e cadastro certos, o log mostrar erro de decodificação do `huabao` (JT808) e a outra
   plataforma estiver numa versão mais nova — atualizar o Traccar é mudança maior (backup antes, reinicia os aparelhos).

Pronto quando: o JR12 aparece **online** no Traccar e as posições dele chegam à plataforma (cadastrado em Rastreadores e
vinculado ao cliente, como o GT06).
