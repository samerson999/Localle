import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { LEGAL_MIN_MM } from '@localle/shared/pneus';
import { withTransaction } from '../db/with-transaction';
import { SettingsService } from '../settings/settings.service';
import { type MovimentoInput, type MovimentoRow, type PneuRow, PneusRepository } from './pneus.repository';

export type NivelSulco = 'ok' | 'atencao' | 'retirar' | 'ilegal';

export function nivelSulco(sulcoMm: number, alertaMm: number, retiradaMm: number): NivelSulco {
  if (sulcoMm <= LEGAL_MIN_MM) return 'ilegal';
  if (sulcoMm <= retiradaMm) return 'retirar';
  if (sulcoMm <= alertaMm) return 'atencao';
  return 'ok';
}

/**
 * Máquina de estados do pneu (mesmas movimentações de `movesOf` em packages/shared/src/pneus.ts, mais
 * `medicao`): cada movimentação valida o estado atual e atualiza o pneu na mesma transação do registro.
 * O km rodado é acumulado nas saídas do veículo (rodízio/retirada) a partir do km de montagem.
 */
@Injectable()
export class PneusService {
  constructor(
    private readonly repo: PneusRepository,
    private readonly settings: SettingsService,
  ) {}

  async listarComNivel(clientId: string, status: PneuRow['status'] | null, assetId: string | null) {
    const [alerta, retirada, pneus] = await Promise.all([
      this.settings.resolve(clientId, 'pneus.sulco_alerta_mm'),
      this.settings.resolve(clientId, 'pneus.sulco_retirada_mm'),
      this.repo.listar(clientId, status, assetId),
    ]);
    return pneus.map((p) => ({ ...p, nivel: p.status === 'descartado' ? null : nivelSulco(Number(p.sulco_atual_mm), alerta, retirada) }));
  }

  async movimentar(clientId: string, pneuId: string, m: MovimentoInput, userId: string | null): Promise<{ pneu: PneuRow; movimento: MovimentoRow }> {
    return withTransaction(this.repo.pool, async (tx) => {
      const p = await this.repo.buscar(clientId, pneuId, tx, true);
      if (!p) throw new NotFoundException('Pneu não encontrado');
      const exige = (cond: boolean, msg: string) => {
        if (!cond) throw new ConflictException(msg);
      };
      const kmRodado = () => (m.kmVeiculo !== null && p.km_montagem !== null ? Math.max(0, m.kmVeiculo - Number(p.km_montagem)) : 0);
      let estado: Partial<Record<keyof PneuRow, unknown>> = {};
      switch (m.tipo) {
        case 'compra':
          throw new BadRequestException('Compra é o cadastro do pneu (POST /pneus)');
        case 'montagem': {
          exige(p.status === 'estoque', `Só pneu em estoque pode ser montado (está ${p.status})`);
          if (!m.assetId || !m.posicao) throw new BadRequestException('"assetId" e "posicao" são obrigatórios na montagem');
          if (m.kmVeiculo === null) throw new BadRequestException('"kmVeiculo" é obrigatório na montagem');
          if (!(await this.repo.ativoDoCliente(tx, clientId, m.assetId))) throw new BadRequestException('Ativo não encontrado');
          exige(!(await this.repo.posicaoOcupada(tx, clientId, m.assetId, m.posicao, p.id)), 'Já há um pneu montado nessa posição');
          estado = { status: 'montado', asset_id: m.assetId, posicao: m.posicao, km_montagem: m.kmVeiculo };
          break;
        }
        case 'rodizio': {
          exige(p.status === 'montado', 'Rodízio só de pneu montado');
          if (!m.posicao || m.kmVeiculo === null) throw new BadRequestException('"posicao" e "kmVeiculo" são obrigatórios no rodízio');
          exige(!(await this.repo.posicaoOcupada(tx, clientId, p.asset_id!, m.posicao, p.id)), 'Já há um pneu montado nessa posição');
          estado = { posicao: m.posicao, km_acumulado: Number(p.km_acumulado) + kmRodado(), km_montagem: m.kmVeiculo };
          m.assetId = p.asset_id;
          break;
        }
        case 'retirada': {
          exige(p.status === 'montado', 'Retirada só de pneu montado');
          if (m.kmVeiculo === null) throw new BadRequestException('"kmVeiculo" é obrigatório na retirada');
          m.assetId = p.asset_id;
          m.posicao = p.posicao;
          estado = { status: 'estoque', asset_id: null, posicao: null, km_montagem: null, km_acumulado: Number(p.km_acumulado) + kmRodado() };
          break;
        }
        case 'envio_recapagem':
          exige(p.status === 'estoque', 'Só pneu em estoque vai para recapagem');
          exige(p.vida_atual < p.vidas_max, 'Pneu sem vidas restantes: descarte');
          estado = { status: 'recapagem' };
          break;
        case 'recapagem': {
          exige(p.status === 'recapagem', 'Pneu não está na recapadora');
          if (m.sulcoMm === null) throw new BadRequestException('"sulcoMm" (sulco novo) é obrigatório na recapagem');
          const custo = m.custo ?? (await this.settings.resolve(clientId, 'pneus.custo_recapagem_padrao'));
          m.custo = custo;
          estado = { status: 'estoque', vida_atual: p.vida_atual + 1, sulco_inicial_mm: m.sulcoMm, sulco_atual_mm: m.sulcoMm, custo_total: Number(p.custo_total) + custo };
          break;
        }
        case 'descarte':
          exige(p.status !== 'montado', 'Retire o pneu do veículo antes de descartar');
          exige(p.status !== 'descartado', 'Pneu já descartado');
          estado = { status: 'descartado' };
          break;
        case 'medicao': {
          if (m.sulcoMm === null) throw new BadRequestException('"sulcoMm" é obrigatório na medição');
          exige(p.status !== 'descartado', 'Pneu descartado');
          exige(m.sulcoMm <= Number(p.sulco_inicial_mm), 'Sulco medido acima do inicial da vida');
          estado = { sulco_atual_mm: m.sulcoMm };
          break;
        }
      }
      const pneu = await this.repo.atualizarEstado(tx, clientId, p.id, estado);
      const movimento = await this.repo.registrarMovimento(tx, clientId, p.id, m, userId);
      return { pneu, movimento };
    });
  }
}
