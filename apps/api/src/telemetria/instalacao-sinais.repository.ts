import type { Queryable } from '../db/queryable';
import {
  avaliarSinal, lerSinal, SINAIS_MOTOR,
  type ContextoPosicao, type EstadoSinal, type MapeamentoSinais, type SinalMotor, type StatusSinal,
} from './sinais-motor';

/** Linha de `instalacao_sinais` (migration 1793180000000). */
export interface InstalacaoSinalEntity {
  id: string;
  client_id: string;
  instalacao_id: string;
  rastreador_id: string;
  sinal: SinalMotor;
  status: StatusSinal;
  motivo: string;
  ultimo_valor: number | null;
  ultima_leitura_em: Date | null;
  ultimo_recebimento_em: Date | null;
  atributo_origem: string | null;
  sem_sinal_em_operacao: number;
  avaliado_ate: Date;
  mapeamento_versao: Date | null;
  atualizado_em: Date;
}

export interface TransicaoSinal {
  sinal: SinalMotor;
  de: StatusSinal | null;
  para: StatusSinal;
  motivo: string;
  /** Instante da última leitura válida: não nulo = o sinal chegava e parou (não é falha de instalação). */
  ultimaLeituraEm: Date | null;
}

const estadoDaLinha = (r: InstalacaoSinalEntity): EstadoSinal => ({
  status: r.status,
  motivo: r.motivo,
  ultimoValor: r.ultimo_valor,
  ultimaLeituraEm: r.ultima_leitura_em,
  ultimoRecebimentoEm: r.ultimo_recebimento_em,
  atributoOrigem: r.atributo_origem,
  semSinalEmOperacao: r.sem_sinal_em_operacao,
  avaliadoAte: r.avaliado_ate,
});

/**
 * Avalia os sinais de motor de uma posição e grava o estado na instalação (dentro da transação da ingestão).
 * Só a instalação principal vigente no instante da posição (a mesma que recebe a posição). Devolve as mudanças de
 * status, para a ingestão logar. A gravação repete a guarda de pacote atrasado no `where` do upsert: dois workers
 * com posições do mesmo rastreador não regridem o estado um do outro.
 */
export async function atualizarSinaisMotor(
  executor: Queryable,
  p: {
    clientId: string;
    instalacaoId: string;
    rastreadorId: string;
    attributes: Record<string, unknown>;
    ctx: ContextoPosicao;
    mapeamento: MapeamentoSinais;
    mapeamentoVersao: Date | null;
  },
): Promise<TransicaoSinal[]> {
  const { rows } = await executor.query<InstalacaoSinalEntity>(
    'select * from instalacao_sinais where instalacao_id = $1 and client_id = $2 for update',
    [p.instalacaoId, p.clientId],
  );
  const anteriores = new Map(rows.map((r) => [r.sinal, r]));
  const transicoes: TransicaoSinal[] = [];

  for (const sinal of SINAIS_MOTOR) {
    const linha = anteriores.get(sinal) ?? null;
    const anterior = linha ? estadoDaLinha(linha) : null;
    const novo = avaliarSinal(sinal, anterior, lerSinal(p.attributes, sinal, p.mapeamento), p.ctx, p.mapeamento.sinaisMotor.includes(sinal));
    if (!novo) continue;

    const { rowCount } = await executor.query(
      `insert into instalacao_sinais
         (client_id, instalacao_id, rastreador_id, sinal, status, motivo, ultimo_valor, ultima_leitura_em,
          ultimo_recebimento_em, atributo_origem, sem_sinal_em_operacao, avaliado_ate, mapeamento_versao)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       on conflict (instalacao_id, sinal) do update set
         status = excluded.status, motivo = excluded.motivo, ultimo_valor = excluded.ultimo_valor,
         ultima_leitura_em = excluded.ultima_leitura_em, ultimo_recebimento_em = excluded.ultimo_recebimento_em,
         atributo_origem = excluded.atributo_origem, sem_sinal_em_operacao = excluded.sem_sinal_em_operacao,
         avaliado_ate = excluded.avaliado_ate, mapeamento_versao = excluded.mapeamento_versao, atualizado_em = now()
       where instalacao_sinais.avaliado_ate < excluded.avaliado_ate`,
      [
        p.clientId, p.instalacaoId, p.rastreadorId, sinal, novo.status, novo.motivo, novo.ultimoValor, novo.ultimaLeituraEm,
        novo.ultimoRecebimentoEm, novo.atributoOrigem, novo.semSinalEmOperacao, novo.avaliadoAte, p.mapeamentoVersao,
      ],
    );
    if (!rowCount) continue;

    const de = anterior?.status ?? null;
    if (de !== novo.status) {
      await executor.query(
        `insert into instalacao_sinais_historico (client_id, instalacao_id, sinal, status_anterior, status, motivo, em)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [p.clientId, p.instalacaoId, sinal, de, novo.status, novo.motivo, p.ctx.fixTime],
      );
      transicoes.push({ sinal, de, para: novo.status, motivo: novo.motivo, ultimaLeituraEm: novo.ultimaLeituraEm });
    }
  }
  return transicoes;
}
