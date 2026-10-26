import { CATEGORIES, categoryOf, categoryLabel } from '../components/assetArt';
import { useStore } from './store';
import { setDriver } from './driverLinks';
import { auditEntry } from '@localle/shared/audit';

// Planilha de ativos (Ativos › Importar/Exportar): cadastro em massa para quem chega com centenas de placas.
// A chave é a placa (ou o nome, para ativo sem placa): linha com chave já cadastrada atualiza, nova cria.
// O IMEI sai na exportação só para conferência: vincular rastreador exige os dados da instalação (técnico,
// odômetro e foto do painel), então é feito na ficha do ativo, nunca pela planilha.
export const COLS = ['Placa', 'Nome', 'Tipo', 'Marca', 'Modelo', 'Ano', 'Nº de série / patrimônio', 'Grupos', 'Operação', 'Motorista (CPF)', 'Meta de consumo (km/L)', 'Teto mensal combustível (R$)', 'IMEI (só leitura)'] as const;

const norm = (x: any) => String(x ?? '').trim();
const key = (x: string) => x.toUpperCase().replace(/[^A-Z0-9]/g, '');
const fold = (x: string) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const digits = (x: string) => x.replace(/\D/g, '');

export function exportRows(s: any): any[][] {
  const gname = (id: string) => s.groups.find((g: any) => g.id === id)?.name;
  return [COLS as unknown as string[], ...s.assets.map((a: any) => [
    a.plate || '', a.name, categoryLabel(categoryOf(a)), a.brand || '', a.model || '', a.year || '', a.serial || '',
    (a.groupIds || []).map(gname).filter(Boolean).join('; '),
    s.operations.find((o: any) => o.id === a.operationId)?.name || '',
    s.drivers.find((d: any) => d.id === a.driverId)?.cpf || '',
    a.fuelGoal || '', a.fuelBudget || '', a.tracker?.imei || '',
  ])];
}

export async function downloadAssets(s: any, template = false) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet(template ? [COLS as unknown as string[], ['ABC1D23', 'ABC1D23', 'Caminhão', 'Volvo', 'VM 270', 2022, '', 'Frota Recife', '', '', 4.5, 6000, '']] : exportRows(s));
  ws['!cols'] = COLS.map((c) => ({ wch: Math.max(12, c.length + 2) }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Ativos');
  XLSX.writeFile(wb, template ? 'modelo-importacao-ativos.xlsx' : `ativos-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export type ImportLine = { row: number; action: 'criar' | 'atualizar' | 'erro'; label: string; errors: string[]; warnings: string[]; data?: any; existingId?: string };
export type ImportPlan = { lines: ImportLine[]; newGroups: string[]; newOperations: string[] };

const decodeCsv = (buf: ArrayBuffer) => { const utf = new TextDecoder('utf-8').decode(buf); return utf.includes('�') ? new TextDecoder('windows-1252').decode(buf) : utf.replace(/^﻿/, ''); };
export async function readSheet(file: File): Promise<any[][]> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  // CSV: o Excel brasileiro salva em UTF-8 ou em Windows-1252; decodifica aqui (o leitor do xlsx assumiria Latin-1)
  const wb = /\.csv$/i.test(file.name) || file.type === 'text/csv' ? XLSX.read(decodeCsv(buf), { type: 'string', raw: false }) : XLSX.read(buf, { type: 'array', raw: false });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false }) as any[][];
}

// valida tudo antes de gravar: nada entra se o usuário não confirmar a prévia
export function planImport(rows: any[][], s: any): ImportPlan {
  const head = (rows[0] || []).map((h) => fold(norm(h)));
  const col = (name: string) => head.findIndex((h) => h.startsWith(fold(name).split(' (')[0].split(' /')[0]));
  const ix = Object.fromEntries(COLS.map((c) => [c, col(c)])) as Record<(typeof COLS)[number], number>;
  if (ix['Placa'] < 0 && ix['Nome'] < 0) return { lines: [{ row: 1, action: 'erro', label: 'Cabeçalho', errors: ['A planilha precisa ter a coluna Placa ou Nome. Baixe o modelo para ver o formato.'], warnings: [] }], newGroups: [], newOperations: [] };
  const get = (r: any[], c: (typeof COLS)[number]) => (ix[c] >= 0 ? norm(r[ix[c]]) : '');
  const byKey = new Map<string, any>(); s.assets.forEach((a: any) => byKey.set(key(a.plate || a.name), a));
  const seen = new Set<string>(), newGroups = new Set<string>(), newOps = new Set<string>();
  const lines: ImportLine[] = [];
  rows.slice(1).forEach((r, i) => {
    if (!r.some((x) => norm(x))) return;
    const errors: string[] = [], warnings: string[] = [];
    const plate = get(r, 'Placa').toUpperCase().replace(/[\s-]/g, ''), name = get(r, 'Nome') || plate;
    const k = key(plate || name);
    if (!k) errors.push('Sem placa e sem nome.');
    if (plate && !/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(plate)) warnings.push(`Placa “${plate}” fora do padrão brasileiro.`);
    if (k && seen.has(k)) errors.push('Placa ou nome repetido na planilha.');
    seen.add(k);
    const tipo = fold(get(r, 'Tipo')), cat = tipo ? CATEGORIES.find((c) => fold(c.label) === tipo || fold(c.plural) === tipo || c.key === tipo) : undefined;
    if (tipo && !cat) errors.push(`Tipo “${get(r, 'Tipo')}” não existe. Use: ${CATEGORIES.map((c) => c.label).join(', ')}.`);
    const year = get(r, 'Ano');
    if (year && !/^(19|20)\d{2}$/.test(year)) errors.push(`Ano “${year}” inválido.`);
    const numOf = (c: (typeof COLS)[number]) => { const v = get(r, c).replace(/\./g, '').replace(',', '.'); if (v && isNaN(+v)) errors.push(`${c}: “${get(r, c)}” não é número.`); return v ? +v : ''; };
    const fuelGoal = numOf('Meta de consumo (km/L)'), fuelBudget = numOf('Teto mensal combustível (R$)');
    const groupNames = get(r, 'Grupos').split(/[;,]/).map(norm).filter(Boolean);
    groupNames.forEach((g) => { if (!s.groups.some((x: any) => fold(x.name) === fold(g))) newGroups.add(g); });
    const op = get(r, 'Operação');
    if (op && !s.operations.some((x: any) => fold(x.name) === fold(op))) newOps.add(op);
    const cpf = digits(get(r, 'Motorista (CPF)'));
    const driver = cpf ? s.drivers.find((d: any) => digits(d.cpf || '') === cpf) : undefined;
    if (cpf && !driver) warnings.push(`Motorista com CPF ${get(r, 'Motorista (CPF)')} não cadastrado; o ativo fica sem motorista.`);
    const ex = byKey.get(k);
    if (ex && cat && categoryOf(ex) !== cat.key && cat.kind !== ex.kind) errors.push(`Já cadastrado como ${categoryLabel(categoryOf(ex))}; trocar a natureza do ativo só pela ficha.`);
    const imei = get(r, 'IMEI (só leitura)');
    if (imei && imei !== (ex?.tracker?.imei || '')) warnings.push('IMEI ignorado: o vínculo com rastreador é feito na ficha do ativo, com os dados da instalação.');
    const data: any = { plate, name, ...(cat && { category: cat.key, kind: cat.kind }), ...(get(r, 'Marca') && { brand: get(r, 'Marca') }), ...(get(r, 'Modelo') && { model: get(r, 'Modelo') }),
      ...(year && { year }), ...(get(r, 'Nº de série / patrimônio') && { serial: get(r, 'Nº de série / patrimônio') }), ...(fuelGoal !== '' && { fuelGoal }), ...(fuelBudget !== '' && { fuelBudget }),
      _groups: groupNames, _op: op, ...(driver && { driverId: driver.id }) };
    lines.push({ row: i + 2, action: errors.length ? 'erro' : ex ? 'atualizar' : 'criar', label: plate || name || `linha ${i + 2}`, errors, warnings, data, existingId: ex?.id });
  });
  return { lines, newGroups: [...newGroups], newOperations: [...newOps] };
}

// grava as linhas válidas; grupos e operações novos são criados antes. Devolve [criados, atualizados].
export function applyImport(plan: ImportPlan, blank: (kind?: string) => any): [number, number] {
  const s = useStore.getState();
  plan.newGroups.forEach((name) => s.upsert('groups', { name })); // importação em lote continua local; grupos reais são criados na tela de Grupos
  plan.newOperations.forEach((name) => s.upsert('operations', { name }));
  const { groups, operations: ops } = useStore.getState() as any;
  let c = 0, u = 0;
  for (const l of plan.lines) {
    if (l.action === 'erro') continue;
    const { _groups, _op, driverId, ...d } = l.data;
    const groupIds = _groups.map((g: string) => groups.find((x: any) => fold(x.name) === fold(g))?.id).filter(Boolean);
    const operationId = _op ? ops.find((x: any) => fold(x.name) === fold(_op))?.id : undefined;
    if (l.existingId) { s.upsert('assets', { id: l.existingId, ...d, ...(_groups.length && { groupIds }), ...(operationId && { operationId }) }); if (driverId) setDriver(l.existingId, driverId, 'escala'); u++; }
    else { const it = s.upsert('assets', { ...blank(d.kind || 'veiculo'), ...d, groupIds, operationId: operationId || '' }); if (driverId) setDriver(it.id, driverId, 'escala'); c++; }
  }
  // resumo da importação no registro (cada linha também aparece individualmente como criou/alterou)
  s.patch((st: any) => auditEntry(st, { coll: 'assets', refId: '', label: 'Importação de planilha', action: `importou ${c + u} ativos em lote`, count: c + u, note: `${c} criados, ${u} atualizados, ${plan.lines.filter((l) => l.action === 'erro').length} recusados` }));
  return [c, u];
}
