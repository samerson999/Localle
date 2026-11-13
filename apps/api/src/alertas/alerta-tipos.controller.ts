import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, Injectable, Logger, NotFoundException, Param, Patch, Post, Put, UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { SuperadminGuard } from '../auth/superadmin.guard';
import { ClientId } from '../clients/client-id.decorator';
import { CurrentUserId } from '../clients/current-role.decorator';
import { isPgError, PG_UNIQUE_VIOLATION } from '../db/pg-errors';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { CAMPOS, CAMPOS_PLATAFORMA, type CampoRegra, type Condicao } from '../regras/avaliar-regra';
import { type AjusteCliente, type AlertaTipoDados, AlertaTiposRepository } from './alerta-tipos.repository';

const PRIORIDADES = ['alta', 'media', 'baixa'];
// mesma regra do check da migration: chave de alarme do Traccar (`attributes.alarm`); "regra" e "cerca_*" são da plataforma
const CHAVE = /^[A-Za-z][A-Za-z0-9_]{1,59}$/;
const ATRIBUTO = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const MAX_CONDICOES = 10;
const MAX_MIN = 1440;

function erro(msg: string): never {
  throw new BadRequestException(msg);
}

function minutos(v: unknown, campo: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > MAX_MIN) erro(`"${campo}" precisa ser um número inteiro de 0 a ${MAX_MIN} (minutos)`);
  return v;
}

function bool(v: unknown, campo: string): boolean {
  if (typeof v !== 'boolean') erro(`"${campo}" precisa ser true ou false`);
  return v;
}

/** Condição sobre o estado do rastreador: só os campos de CAMPOS_PLATAFORMA (cerca e horário do cliente não). */
function condicao(v: unknown, i: number): Condicao {
  const c = (v ?? {}) as Record<string, unknown>;
  const field = c.field as CampoRegra;
  if (typeof c.field !== 'string' || !CAMPOS_PLATAFORMA.includes(field)) erro(`condicoes[${i}].field precisa ser um de: ${CAMPOS_PLATAFORMA.join(', ')}`);
  const campo = CAMPOS[field];
  if (typeof c.op !== 'string' || !campo.ops.includes(c.op)) erro(`condicoes[${i}].op precisa ser um de: ${campo.ops.join(', ')}`);
  if (typeof c.value !== 'string' || c.value.length === 0 || c.value.length > 40) erro(`condicoes[${i}].value inválido`);
  if (campo.values && !campo.values.includes(c.value)) erro(`condicoes[${i}].value precisa ser um de: ${campo.values.join(', ')}`);
  const numerico = campo.numerico || (field === 'atributo' && (c.op === '>' || c.op === '<'));
  if (numerico && !/^-?\d+(\.\d+)?$/.test(c.value)) erro(`condicoes[${i}].value precisa ser número`);
  if (campo.hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(c.value)) erro(`condicoes[${i}].value precisa ser HH:MM`);
  if (field !== 'atributo') return { field, op: c.op, value: c.value };
  if (typeof c.attr !== 'string' || !ATRIBUTO.test(c.attr)) erro(`condicoes[${i}].attr precisa ser o nome do atributo do Traccar (ex.: in1, io239)`);
  return { field, op: c.op, value: c.value, attr: c.attr };
}

/** Sem class-validator no projeto: validação explícita. `parcial` = PATCH (só os campos enviados). */
export function parseAlertaTipo(body: unknown, parcial: boolean): Partial<AlertaTipoDados> {
  const b = (body ?? {}) as Record<string, unknown>;
  const d: Partial<AlertaTipoDados> = {};
  const veio = (k: string) => b[k] !== undefined || !parcial;
  if (veio('nome')) {
    const nome = typeof b.nome === 'string' ? b.nome.trim() : '';
    if (!nome || nome.length > 120) erro('"nome" precisa ter de 1 a 120 caracteres');
    d.nome = nome;
  }
  if (veio('prioridade')) {
    if (!PRIORIDADES.includes(b.prioridade as string)) erro('"prioridade" precisa ser alta, media ou baixa');
    d.prioridade = b.prioridade as AlertaTipoDados['prioridade'];
  }
  if (veio('exigeTratamento')) {
    const v = b.exigeTratamento ?? null; // criar sem informar = pela prioridade
    if (v !== null && typeof v !== 'boolean') erro('"exigeTratamento" precisa ser true, false ou null (pela prioridade)');
    d.exigeTratamento = v as boolean | null;
  }
  // criar sem informar: gera alerta e notifica no celular (todos nascem ligados)
  if (veio('geraAlerta')) d.geraAlerta = b.geraAlerta === undefined ? true : bool(b.geraAlerta, 'geraAlerta');
  if (veio('notificaPush')) d.notificaPush = b.notificaPush === undefined ? true : bool(b.notificaPush, 'notificaPush');
  if (veio('repetirMin')) d.repetirMin = b.repetirMin === undefined ? 15 : minutos(b.repetirMin, 'repetirMin');
  if (veio('duracaoMin')) d.duracaoMin = b.duracaoMin === undefined ? 0 : minutos(b.duracaoMin, 'duracaoMin');
  if (veio('encerraSozinho')) d.encerraSozinho = b.encerraSozinho === undefined ? false : bool(b.encerraSozinho, 'encerraSozinho');
  if (b.condicoes !== undefined) {
    if (!Array.isArray(b.condicoes) || b.condicoes.length === 0 || b.condicoes.length > MAX_CONDICOES) erro(`"condicoes" precisa ter de 1 a ${MAX_CONDICOES} itens`);
    d.condicoes = b.condicoes.map(condicao);
  }
  return d;
}

/** Toda alteração do catálogo vai para a auditoria: muda o que todos os clientes passam a receber. */
@Injectable()
export class AlertaTiposService {
  private readonly logger = new Logger(AlertaTiposService.name);

  constructor(
    private readonly repo: AlertaTiposRepository,
    private readonly audit: AuditLogRepository,
  ) {}

  listar() {
    return this.repo.listar();
  }

  /**
   * `disparo: 'alarme'` (padrão): `chave` é o nome do alarme no Traccar. `disparo: 'condicao'`: `condicoes` obrigatórias,
   * a chave é gerada (é o `tipo` gravado nos alertas e nunca muda).
   */
  async criar(superadminId: string, body: unknown) {
    const b = (body ?? {}) as Record<string, unknown>;
    const disparo = b.disparo === undefined ? 'alarme' : b.disparo;
    if (disparo !== 'alarme' && disparo !== 'condicao') erro('"disparo" precisa ser alarme ou condicao');
    let chave: string;
    if (disparo === 'alarme') {
      chave = typeof b.chave === 'string' ? b.chave.trim() : '';
      if (!CHAVE.test(chave) || chave === 'regra' || chave.startsWith('cerca_')) {
        erro('"chave" é o nome do alarme no Traccar (letras, números e _; "regra" e "cerca_…" são reservados)');
      }
      if (b.condicoes !== undefined) erro('"condicoes" só existe no alerta por condição');
    } else {
      if (b.condicoes === undefined) erro('Alerta por condição precisa de "condicoes"');
      chave = `cond_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    }
    const d = parseAlertaTipo(body, false) as AlertaTipoDados;
    try {
      const criado = await this.repo.criar(chave, disparo, d);
      await this.audit.record({ actorType: 'superadmin', actorId: superadminId, clientId: null, action: 'alerta_tipo.criar', target: chave, after: { disparo, ...d } });
      this.logger.log(`Tipo de alerta ${chave} (${disparo}) criado por ${superadminId}`);
      return criado;
    } catch (err) {
      if (isPgError(err, PG_UNIQUE_VIOLATION)) throw new ConflictException(`Já existe o tipo de alerta "${chave}"`);
      throw err;
    }
  }

  async atualizar(superadminId: string, chave: string, body: unknown) {
    const antes = await this.repo.buscar(chave);
    if (!antes) throw new NotFoundException('Tipo de alerta não encontrado');
    const d = parseAlertaTipo(body, true);
    if (d.condicoes && antes.disparo !== 'condicao') erro('"condicoes" só existe no alerta por condição');
    // tipo padrão: o que ele mede é fixo; só o limite (valor) muda
    if (d.condicoes && antes.padrao) {
      const igual = d.condicoes.length === antes.condicoes!.length
        && d.condicoes.every((c, i) => c.field === antes.condicoes![i].field && c.op === antes.condicoes![i].op && c.attr === antes.condicoes![i].attr);
      if (!igual) erro('Alerta padrão: só o limite e a duração mudam, não o que ele mede');
    }
    const depois = await this.repo.atualizar(chave, d);
    await this.audit.record({
      actorType: 'superadmin', actorId: superadminId, clientId: null, action: 'alerta_tipo.atualizar', target: chave,
      before: Object.fromEntries(Object.keys(d).map((k) => [k, (antes as any)[k]])), after: d,
    });
    return depois!;
  }

  async excluir(superadminId: string, chave: string) {
    const antes = await this.repo.buscar(chave);
    if (!antes) throw new NotFoundException('Tipo de alerta não encontrado');
    if (antes.sistema) throw new ConflictException('Tipo de sistema não se exclui: é gerado por rotina da plataforma');
    if (antes.padrao) throw new ConflictException('Alerta padrão da plataforma não se exclui: desligue em "Ligado na plataforma"');
    await this.repo.excluir(chave);
    await this.audit.record({ actorType: 'superadmin', actorId: superadminId, clientId: null, action: 'alerta_tipo.excluir', target: chave, before: antes });
    this.logger.log(`Tipo de alerta ${chave} excluído do catálogo por ${superadminId}`);
  }

  doCliente(clientId: string) {
    return this.repo.doCliente(clientId);
  }

  /** `{ ligado?, valor?, duracaoMin? }`: só o que vier muda; `null` em valor/duração volta ao padrão da plataforma. */
  async definirDoCliente(clientId: string, userId: string, chave: string, body: unknown) {
    const b = (body ?? {}) as Record<string, unknown>;
    const a: AjusteCliente = {};
    if (b.ligado !== undefined) a.ligado = bool(b.ligado, 'ligado');
    if (b.valor !== undefined) {
      if (b.valor !== null && (typeof b.valor !== 'number' || !Number.isFinite(b.valor) || Math.abs(b.valor) > 100_000)) erro('"valor" precisa ser um número ou null (padrão)');
      a.valor = b.valor as number | null;
    }
    if (b.duracaoMin !== undefined) a.duracaoMin = b.duracaoMin === null ? null : minutos(b.duracaoMin, 'duracaoMin');
    if (Object.keys(a).length === 0) erro('Informe "ligado", "valor" ou "duracaoMin"');
    if (!(await this.repo.definirDoCliente(clientId, chave, a, userId))) throw new NotFoundException('Tipo de alerta não encontrado');
    await this.audit.record({ actorType: 'user', actorId: userId, clientId, action: 'alerta_tipo.cliente', target: chave, after: a });
    return (await this.repo.doCliente(clientId)).find((t) => t.chave === chave)!;
  }
}

/** Catálogo de tipos de alerta da plataforma: Console da Locale › Tipos de alerta — rota exclusiva de superadmin. */
@Controller('superadmin/alerta-tipos')
@UseGuards(SuperadminGuard)
export class AlertaTiposController {
  constructor(private readonly service: AlertaTiposService) {}

  @Get()
  listar() {
    return this.service.listar();
  }

  @Post()
  criar(@CurrentUserId() superadminId: string, @Body() body: unknown) {
    return this.service.criar(superadminId, body);
  }

  @Patch(':chave')
  atualizar(@CurrentUserId() superadminId: string, @Param('chave') chave: string, @Body() body: unknown) {
    return this.service.atualizar(superadminId, chave, body);
  }

  @Delete(':chave')
  @HttpCode(204)
  async excluir(@CurrentUserId() superadminId: string, @Param('chave') chave: string) {
    await this.service.excluir(superadminId, chave);
  }
}

/** Setup do gestor: quais alertas da plataforma disparam para a operação dele (todos ligados por padrão). */
@Controller('alerta-tipos')
@UseGuards(PermissionsGuard)
export class AlertaTiposClienteController {
  constructor(private readonly service: AlertaTiposService) {}

  @Get()
  listar(@ClientId() clientId: string) {
    return this.service.doCliente(clientId);
  }

  @Put(':chave')
  @RequirePermission('setup.configurar')
  definir(@ClientId() clientId: string, @CurrentUserId() userId: string, @Param('chave') chave: string, @Body() body: unknown) {
    return this.service.definirDoCliente(clientId, userId, chave, body);
  }
}
