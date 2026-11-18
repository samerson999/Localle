import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Aviso de veículo parado há X horas (18/11/2026): parado é "sem se mover", não "sem comunicar" — o rastreador segue
// mandando pacote; quem calou é o sem_posicao. `ultima_posicao.movimento_em`: hora (do aparelho) da última posição
// acima de 5 km/h, mantida pela ingestão. Preenchida aqui a partir de `posicoes`; rastreador que nunca andou fica null
// e o worker conta da instalação. Um aviso por parada: índice único por (ativo, início da parada), como o backup_sem_sinal.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    alter table public.ultima_posicao add column movimento_em timestamptz;
    update public.ultima_posicao up set movimento_em = (
      select max(p.fix_time) from public.posicoes p where p.rastreador_id = up.rastreador_id and p.speed_kmh > 5 and p.fix_time <= up.fix_time
    );

    insert into public.alerta_tipos (chave, nome, prioridade, exige_tratamento, gera_alerta, sistema, disparo, notifica_push)
    values ('veiculo_parado', 'Veículo parado há muito tempo', 'baixa', false, true, true, 'sistema', false)
    on conflict (chave) do nothing;
    create unique index alertas_veiculo_parado_parada_uniq on public.alertas (asset_id, ts) where tipo = 'veiculo_parado';
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    drop index public.alertas_veiculo_parado_parada_uniq;
    delete from public.alertas where tipo = 'veiculo_parado';
    delete from public.alerta_tipos where chave = 'veiculo_parado';
    alter table public.ultima_posicao drop column movimento_em;
  `);
}
