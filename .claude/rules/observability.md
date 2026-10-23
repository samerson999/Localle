---
paths: apps/api/**
---

# Logs e observabilidade (apps/api)

A API é o sistema que vai rodar sem alguém olhando a tela — quando algo falhar (fila travada, rastreador
mudo, ingestão rejeitando posição), o log é a única forma de descobrir o quê, onde e quando. Log não é
depuração deixada para trás; é parte da implementação de qualquer caminho que pode falhar silenciosamente.

## Ferramenta

Usar o `Logger` do NestJS (`import { Logger } from '@nestjs/common'`), um por classe:
`private readonly logger = new Logger(NomeDaClasse.name)` — já é o padrão real em
`apps/api/src/queue/positions.worker.ts`. Não introduzir `console.log`/`console.error` direto em código
de aplicação, nem outra lib de log, sem decisão explícita do usuário.

## Níveis — quando usar cada um

- `logger.error(...)`: falha que impede a operação de completar e exige atenção (job que esgotou
  tentativas, query que falhou por motivo inesperado, violação de invariante que não deveria acontecer).
  Sempre inclui a mensagem de erro original (`err.message`), nunca só "deu erro".
- `logger.warn(...)`: situação anômala mas tratada — o sistema seguiu funcionando, mas o dado foi
  descartado, ignorado ou tratado por um caminho alternativo (ex.: "posição descartada: rastreador não
  cadastrado", já em `positions.worker.ts`). É o nível certo para sinalizar o que vira alerta de produto
  ("rastreador sem comunicação há X minutos", `docs/ARQUITETURA-BACKEND.md` § 5).
- `logger.log(...)`: evento de negócio relevante no fluxo normal (ingestão processou um lote, worker
  iniciou/parou, migration aplicada). Não logar toda requisição HTTP nem todo loop — isso é ruído, não
  observabilidade.
- `logger.debug(...)`: detalhe só útil durante investigação ativa; não deve ficar ligado por padrão em
  produção.

## O que logar sempre

- **Pontos de entrada externa que podem falhar de formas que o chamador não controla**: webhook/polling do
  Traccar, consumo de fila (`positions.worker.ts` já cobre o `failed` do BullMQ — siga esse padrão em
  qualquer novo worker).
- **Decisão de descarte de dado** (dedup rejeitou, rastreador desconhecido, validação de payload falhou) —
  sem isso, perda de posição ou evento é silenciosa e indetectável até o cliente reclamar.
- **Autenticação**: falha de login não loga credencial, mas pode logar que houve tentativa (sem PII
  sensível) se isso vier a importar para detectar abuso — não é urgente agora, não adicionar sem necessidade
  concreta.
- **Início/fim de processo de longa duração** (worker subindo, rotina de retenção por plano rodando,
  export para Parquet quando existir — `docs/ARQUITETURA-BACKEND.md` § 2.4).

## O que nunca vai para o log

- Senha, token JWT, `JWT_SECRET`, string de conexão com credencial (`DATABASE_URL` completa).
- Corpo bruto de payload com dado pessoal além do necessário para diagnosticar (ex.: não logar o payload
  inteiro do Traccar "por garantia" — logar os campos que identificam o problema: `deviceId`, id da
  posição/evento, motivo da rejeição).

## Contexto mínimo de cada log

Toda mensagem de log deve permitir responder "qual rastreador/cliente/job foi afetado" sem precisar
reproduzir o problema — inclua o identificador relevante na própria mensagem ou como segundo argumento do
logger (`traccar_device_id`, `rastreador_id`, `job.id`, `client_id` quando fizer sentido e não for dado
sensível). Mensagem genérica como "erro ao processar" sem identificador não serve para diagnosticar nada
num sistema com centenas de rastreadores.

## O que não fazer agora

- Não introduzir tracing distribuído, correlation ID entre serviços, ou exportador de métricas (Prometheus/
  Grafana/Loki) sem necessidade operacional concreta — `docs/ARQUITETURA-BACKEND.md` § 5 já registra isso
  como algo a resolver "antes de produção com cliente pagante", não agora. Até lá, log estruturado via
  `Logger` + leitura manual (`docker compose logs`) é suficiente e é o que já está em uso.
- Não adicionar log em todo método como reflexo — log existe para responder "o que aconteceu quando algo
  deu errado ou quando um alerta de produto depende disso", não para narrar o código linha a linha.
