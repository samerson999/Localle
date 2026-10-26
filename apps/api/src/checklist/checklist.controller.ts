import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { isFlagged } from '@localle/shared/checklist';
import { ClientId } from '../clients/client-id.decorator';
import { booleano, dataOpcional, erro, instante, listaUuids, numeroOpcional, opcao, periodo, texto, textoOpcional, uuid, uuidOpcional } from '../common/validar';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { type Agenda, ChecklistRepository, type ModeloInput, type ModeloRow, type Pergunta, type RespostaInput, type RespostaRow, TIPOS_AGENDA, TIPOS_PERGUNTA } from './checklist.repository';

function parseAgenda(v: unknown): Agenda {
  const a = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
  const type = opcao(a.type, 'agenda.type', TIPOS_AGENDA);
  const out: Agenda = { type };
  if (type === 'semanal') out.weekday = numeroOpcional(a.weekday, 'agenda.weekday', 0, 6, true) ?? 1;
  if (type === 'mensal') out.monthDay = numeroOpcional(a.monthDay, 'agenda.monthDay', 1, 28, true) ?? 1;
  if (type === 'ciclo') {
    out.cycleDays = numeroOpcional(a.cycleDays, 'agenda.cycleDays', 1, 365, true) ?? 30;
    out.startDate = dataOpcional(a.startDate, 'agenda.startDate') ?? new Date().toISOString().slice(0, 10);
  }
  if (type === 'datas') {
    if (!Array.isArray(a.dates) || a.dates.length === 0 || a.dates.length > 366) erro('"agenda.dates" precisa ter de 1 a 366 datas');
    out.dates = a.dates.map((d, i) => dataOpcional(d, `agenda.dates[${i}]`)!);
  }
  if (type === 'diario') out.sundays = booleano(a.sundays, 'agenda.sundays');
  return out;
}

function parsePerguntas(v: unknown): Pergunta[] {
  if (!Array.isArray(v) || v.length === 0 || v.length > 100) erro('"perguntas" precisa ter de 1 a 100 itens');
  const ids = new Set<string>();
  return v.map((q, i) => {
    const p = (typeof q === 'object' && q !== null ? q : {}) as Record<string, unknown>;
    const id = texto(p.id, `perguntas[${i}].id`, 40);
    if (ids.has(id)) erro(`perguntas[${i}].id repetido`);
    ids.add(id);
    const type = opcao(p.type, `perguntas[${i}].type`, TIPOS_PERGUNTA);
    const out: Pergunta = { id, label: texto(p.label, `perguntas[${i}].label`, 200), type, required: booleano(p.required, `perguntas[${i}].required`), requirePhoto: booleano(p.requirePhoto, `perguntas[${i}].requirePhoto`) };
    if (type === 'multipla') {
      if (!Array.isArray(p.options) || p.options.length < 2 || p.options.some((o) => typeof o !== 'string' || !o || o.length > 80)) erro(`perguntas[${i}].options precisa ter 2+ opções`);
      out.options = p.options as string[];
    }
    if (type === 'nota') {
      out.scaleMax = numeroOpcional(p.scaleMax, `perguntas[${i}].scaleMax`, 2, 10, true) ?? 5;
      out.flagBelow = numeroOpcional(p.flagBelow, `perguntas[${i}].flagBelow`, 0, out.scaleMax, true) ?? undefined;
    }
    if (p.flagValues !== undefined) {
      if (!Array.isArray(p.flagValues) || p.flagValues.some((f) => typeof f !== 'string' || f.length > 80)) erro(`perguntas[${i}].flagValues inválido`);
      out.flagValues = p.flagValues as string[];
    }
    return out;
  });
}

export function parseModelo(body: unknown): ModeloInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const alvos = (typeof b.alvos === 'object' && b.alvos !== null ? b.alvos : {}) as Record<string, unknown>;
  return {
    nome: texto(b.nome, 'nome', 120),
    ativo: booleano(b.ativo, 'ativo', true),
    agenda: parseAgenda(b.agenda),
    alvos: { groupIds: listaUuids(alvos.groupIds, 'alvos.groupIds'), personIds: listaUuids(alvos.personIds, 'alvos.personIds') },
    perguntas: parsePerguntas(b.perguntas),
  };
}

export function parseResposta(body: unknown): RespostaInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const iniciadoEm = instante(b.iniciadoEm, 'iniciadoEm');
  const finalizadoEm = b.finalizadoEm === undefined ? new Date() : instante(b.finalizadoEm, 'finalizadoEm');
  if (finalizadoEm < iniciadoEm) erro('"finalizadoEm" não pode ser anterior a "iniciadoEm"');
  if (typeof b.respostas !== 'object' || b.respostas === null || Array.isArray(b.respostas)) erro('"respostas" precisa ser um objeto pergunta → { value }');
  const respostas: Record<string, { value: unknown; photo?: string }> = {};
  for (const [k, v] of Object.entries(b.respostas as Record<string, unknown>)) {
    if (k.length > 40) erro('"respostas": id de pergunta inválido');
    const r = (typeof v === 'object' && v !== null ? v : { value: v }) as Record<string, unknown>;
    if (typeof r.value === 'string' && r.value.length > 2000) erro(`"respostas.${k}.value" muito longo`);
    respostas[k] = { value: r.value ?? null, ...(typeof r.photo === 'string' && r.photo ? { photo: r.photo.slice(0, 500) } : {}) };
  }
  return {
    modeloId: uuid(b.modeloId, 'modeloId'),
    motoristaId: uuidOpcional(b.motoristaId, 'motoristaId'),
    assetId: uuidOpcional(b.assetId, 'assetId'),
    respondente: textoOpcional(b.respondente, 'respondente', 120),
    iniciadoEm,
    finalizadoEm,
    respostas,
  };
}

/** Obrigatórias respondidas e contagem de não conformidades pela regra compartilhada (`isFlagged`). */
export function conferir(modelo: ModeloRow, r: RespostaInput): number {
  let flags = 0;
  for (const q of modelo.perguntas) {
    const v = r.respostas[q.id]?.value;
    if (q.required && (v === null || v === undefined || v === '')) erro(`Pergunta obrigatória sem resposta: ${q.label}`);
    if (q.type === 'multipla' && v !== null && v !== undefined && v !== '' && !q.options!.includes(String(v))) erro(`Resposta fora das opções: ${q.label}`);
    if (isFlagged(q, v)) flags += 1;
  }
  return flags;
}

@Controller('checklist')
@UseGuards(PermissionsGuard)
export class ChecklistController {
  constructor(private readonly repo: ChecklistRepository) {}

  @Get('modelos')
  listarModelos(@ClientId() clientId: string) {
    return this.repo.listarModelos(clientId);
  }

  @Post('modelos')
  @RequirePermission('checklist.editar')
  criarModelo(@ClientId() clientId: string, @Body() body: unknown) {
    return this.repo.salvarModelo(clientId, parseModelo(body), null);
  }

  @Put('modelos/:id')
  @RequirePermission('checklist.editar')
  async atualizarModelo(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const m = await this.repo.salvarModelo(clientId, parseModelo(body), id);
    if (!m) throw new NotFoundException('Modelo não encontrado');
    return m;
  }

  @Delete('modelos/:id')
  @RequirePermission('checklist.editar')
  @HttpCode(204)
  async removerModelo(@ClientId() clientId: string, @Param('id', ParseUUIDPipe) id: string) {
    if (!(await this.repo.removerModelo(clientId, id))) throw new NotFoundException('Modelo não encontrado');
  }

  @Get('respostas')
  listarRespostas(@ClientId() clientId: string, @Query('de') de?: string, @Query('ate') ate?: string, @Query('modeloId') modeloId?: string) {
    const [inicio, fim] = periodo(de, ate, 30, 366);
    return this.repo.listarRespostas(clientId, inicio, fim, uuidOpcional(modeloId, 'modeloId'));
  }

  /** Responder não exige `checklist.editar`: motorista (operador) responde o próprio checklist. */
  @Post('respostas')
  async responder(@ClientId() clientId: string, @Body() body: unknown): Promise<RespostaRow> {
    const r = parseResposta(body);
    const modelo = await this.repo.buscarModelo(clientId, r.modeloId);
    if (!modelo) throw new NotFoundException('Modelo não encontrado');
    const out = await this.repo.criarResposta(clientId, r, conferir(modelo, r));
    if (out === 'modelo_invalido') throw new NotFoundException('Modelo não encontrado');
    if (out === 'motorista_invalido') throw new BadRequestException('Motorista não encontrado');
    if (out === 'ativo_invalido') throw new BadRequestException('Ativo não encontrado');
    return out;
  }
}
