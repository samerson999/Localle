import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// "Precisa de você" separa aviso de ocorrência (12/11/2026): ocorrência é o alerta que exige tratamento — fica aberta
// até alguém encerrar com o desfecho; aviso só informa e sai com "lido".
//
// `alerta_tipos`: catálogo da PLATAFORMA (sem client_id, só o superadmin escreve, Console da Locale › Tipos de alerta)
// dos alertas que nascem do aparelho ou de rotina do sistema. Para alarme do aparelho (`attributes.alarm` do Traccar),
// `nome`/`prioridade` viram o título/prioridade do alerta e `gera_alerta = false` deixa o alarme só como evento.
// `sistema` = tipo gerado por rotina da plataforma (sem posição, sinais do painel): título e prioridade são calculados
// lá (sobem de nível), o catálogo só decide o tratamento, e o tipo não pode ser excluído.
// `exige_tratamento` null = segue a prioridade do alerta (alta exige).
//
// `alertas.exige_tratamento`: gravado quando o alerta nasce (mudar o catálogo ou a regra não reclassifica o passado).
// Regra do cliente decide pelo próprio formulário (`regras.acoes.tratamento`); cerca segue a prioridade.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    create table public.alerta_tipos (
      chave text primary key check (chave ~ '^[A-Za-z][A-Za-z0-9_]{1,59}$' and chave <> 'regra' and chave not like 'cerca\\_%'),
      nome text not null check (length(nome) between 1 and 120),
      prioridade text check (prioridade in ('alta', 'media', 'baixa')),
      exige_tratamento boolean,
      gera_alerta boolean not null default true,
      sistema boolean not null default false,
      criado_em timestamptz not null default now(),
      atualizado_em timestamptz not null default now(),
      constraint alerta_tipos_aparelho_com_prioridade check (sistema or prioridade is not null)
    );
  `);
  // mesmo catálogo que estava no código (src/alertas/alarmes-aparelho.ts); direção brusca é insumo do ranking, não alerta
  pgm.sql(`
    insert into public.alerta_tipos (chave, nome, prioridade, exige_tratamento, gera_alerta, sistema) values
      ('sos', 'Pânico (SOS) acionado', 'alta', true, true, false),
      ('powerCut', 'Alimentação do rastreador cortada', 'alta', true, true, false),
      ('tamper', 'Violação do rastreador', 'alta', true, true, false),
      ('jamming', 'Bloqueador de sinal (jammer) detectado', 'alta', true, true, false),
      ('accident', 'Possível colisão', 'alta', true, true, false),
      ('lowBattery', 'Bateria do rastreador baixa', 'media', false, true, false),
      ('lowPower', 'Tensão de alimentação baixa', 'media', false, true, false),
      ('fault', 'Falha no rastreador', 'media', false, true, false),
      ('gpsAntennaCut', 'Antena GPS desconectada', 'media', false, true, false),
      ('door', 'Porta aberta', 'baixa', false, true, false),
      ('hardBraking', 'Frenagem brusca', 'baixa', false, false, false),
      ('hardAcceleration', 'Aceleração brusca', 'baixa', false, false, false),
      ('hardCornering', 'Curva brusca', 'baixa', false, false, false),
      ('sem_posicao', 'Rastreador sem enviar posição', null, null, true, true),
      ('sinais_painel_pararam', 'Dados do painel pararam de chegar', null, false, true, true);
  `);

  pgm.sql('alter table public.alertas add column exige_tratamento boolean;');
  pgm.sql(`
    update public.alertas a set exige_tratamento = case
      when a.origem = 'aparelho' then coalesce((select t.exige_tratamento from public.alerta_tipos t where t.chave = a.tipo), a.prioridade = 'alta')
      else a.prioridade = 'alta' end;
  `);
  pgm.sql('alter table public.alertas alter column exige_tratamento set default false, alter column exige_tratamento set not null;');
  // "Precisa de você": ocorrências abertas do cliente
  pgm.sql('drop index if exists public.alertas_client_id_idx;');
  pgm.sql('create index alertas_ocorrencias_abertas_idx on public.alertas (client_id) where exige_tratamento and tratado_em is null;');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('drop index public.alertas_ocorrencias_abertas_idx;');
  pgm.sql('create index on public.alertas (client_id) where tratado_em is null;');
  pgm.sql('alter table public.alertas drop column exige_tratamento;');
  pgm.dropTable('alerta_tipos');
}
