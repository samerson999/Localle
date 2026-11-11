import { CATEGORIES, categoryOf } from '../components/assetArt';
import { useStore } from './store';
import { setDriver } from './driverLinks';
import { atualizarIdentificacaoAtivo, criarAtivo, criarMarca, criarModelo, definirGruposEmLote, definirMotoristaDoAtivo, isRealAsset, salvarFichaAtivo, salvarGrupo, salvarOperacao } from './localleApi';
import { CATALOGO_VAZIO, aplicarTipo, chaveCatalogo, mesmoNome, nomeDoTipo, parecidos, tiposDoCliente, type CatalogoAtivos, type OpcaoTipo } from './catalogoAtivos';
import { lifeOf, setLifecycle } from './assetLifecycle';
import { PNG_ICON_SUGGESTION } from './pngIcons';
import { nomeDoAtivo } from './localleMap';
import { auditEntry } from '@localle/shared/audit';

// Planilha de ativos (Ativos › Importar/Exportar): cadastro em massa para quem chega com centenas de ativos.
// Segue as mesmas regras do cadastro manual (backlog do teste da FD Locação, 09/11/2026, Sprint 3): tipo obrigatório e da
// lista do cliente; placa para veículo e carreta, placa ou código interno para o resto; marca e modelo pela lista
// (lib/catalogoAtivos) — o mesmo nome com outra grafia usa o que já existe, nome parecido vira aviso com escolha na prévia;
// linha amarela usa horímetro. O ativo é reconhecido pela placa, depois pelo código interno, depois pelo apelido:
// linha que bate com um cadastrado atualiza, a nova cria. Linha com erro não entra e não impede as outras.
// O IMEI sai na exportação só para conferência: vincular rastreador exige os dados da instalação (técnico, odômetro e
// foto do painel), então é feito na ficha do ativo, nunca pela planilha.
export const COLS = ['Tipo', 'Placa', 'Código interno / nº de série', 'Marca', 'Modelo', 'Ano', 'Chassi', 'Renavam', 'Medidor de uso', 'Situação', 'Apelido',
  'Grupos', 'Operação', 'Motorista (CPF)', 'Meta de consumo (km/L)', 'Teto mensal combustível (R$)', 'IMEI (só leitura)'] as const;
type Col = (typeof COLS)[number];
// nomes de coluna de planilhas antigas (modelo anterior a 11/2026) e variações comuns
const ALIAS: Partial<Record<Col, string[]>> = { 'Código interno / nº de série': ['Nº de série', 'Código interno', 'Identificador', 'Patrimônio'], Apelido: ['Nome'], Marca: ['Fabricante'], 'Medidor de uso': ['Medidor'] };

const MEDIDOR: Record<string, string> = { horimetro: 'Horímetro', km: 'Quilometragem', nenhum: 'Sem medidor' };
const SITUACAO_PLANILHA: Record<string, string> = { ativo: 'Ativo', inativo: 'Inativo', vendido: 'Vendido', baixa: 'Baixado' };

const norm = (x: any) => String(x ?? '').trim();
const key = (x: string) => x.toUpperCase().replace(/[^A-Z0-9]/g, '');
const fold = (x: string) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const digits = (x: string) => x.replace(/\D/g, '');
const catalogoDe = (s: any): CatalogoAtivos => s?.catalogoAtivos || CATALOGO_VAZIO;

export function exportRows(s: any): any[][] {
  const gname = (id: string) => s.groups.find((g: any) => g.id === id)?.name;
  const tipos = tiposDoCliente(catalogoDe(s).tipos);
  return [COLS as unknown as string[], ...s.assets.map((a: any) => [
    nomeDoTipo(a, tipos), a.plate || '', a.serial || '', a.brand || '', a.model || '', a.year || '', a.chassi || '', a.renavam || '',
    MEDIDOR[a.meter] || '', SITUACAO_PLANILHA[lifeOf(a)] || 'Ativo', a.apelido ?? (a.name && a.name !== a.plate && a.name !== a.serial ? a.name : ''),
    (a.groupIds || []).map(gname).filter(Boolean).join('; '),
    s.operations.find((o: any) => o.id === a.operationId)?.name || '',
    s.drivers.find((d: any) => d.id === a.driverId)?.cpf || '',
    a.fuelGoal || '', a.fuelBudget || '', a.tracker?.imei || '',
  ])];
}

// Modelo de importação (I2): todas as colunas do cadastro, linhas de exemplo e as instruções na própria planilha; os tipos
// aceitos e as marcas/modelos já cadastrados vão em abas próprias, para a pessoa copiar o nome em vez de digitar outro.
export const EXEMPLOS: any[][] = [
  ['Caminhão', 'ABC1D23', 'FROTA-015', 'Volkswagen', '13.190', 2022, '9BWZZZ377VT004251', '01234567890', 'Quilometragem', 'Ativo', '', 'Frota Recife', '', '', 4.5, 6000, ''],
  ['Retroescavadeira', '', 'RETRO-01', 'Caterpillar', '416F', 2019, '', '', 'Horímetro', 'Ativo', 'Retro do pátio', 'Linha amarela', '', '', '', '', ''],
  ['Carreta', 'QWE4R56', 'CAR-07', 'Randon', 'Graneleira 3 eixos', 2020, '', '', '', 'Inativo', '', '', '', '', '', '', ''],
];
const INSTRUCOES: [Col, string, string][] = [
  ['Tipo', 'Sim', 'Um dos nomes da aba "Tipos aceitos" (os da sua empresa entram junto).'],
  ['Placa', 'Veículo e carreta', 'Placa brasileira (ABC1D23 ou ABC-1234). Equipamento sem placa: deixe em branco e use o código interno.'],
  ['Código interno / nº de série', 'Sem placa', 'Código da frota, nº de série ou patrimônio. Obrigatório quando não há placa; até 60 caracteres.'],
  ['Marca', 'Sim', 'Use o nome da aba "Marcas e modelos" quando já existir. Nome novo é cadastrado na importação.'],
  ['Modelo', 'Sim', 'Modelo da marca. "13190" e "13.190" são o mesmo modelo; nome parecido aparece como aviso na prévia.'],
  ['Ano', 'Não', 'Quatro dígitos (ex.: 2022).'],
  ['Chassi', 'Não', '17 caracteres.'],
  ['Renavam', 'Não', '11 dígitos.'],
  ['Medidor de uso', 'Não', 'Horímetro, Quilometragem ou Sem medidor. Linha amarela usa horímetro; em branco, vale o padrão do tipo.'],
  ['Situação', 'Não', 'Ativo ou Inativo (parado temporariamente, mantém o rastreador). Venda e baixa só pela ficha do ativo.'],
  ['Apelido', 'Não', 'Com placa, a placa continua sendo a identificação e o apelido aparece junto. Sem placa, o apelido é o nome no mapa; em branco, vale o código interno.'],
  ['Grupos', 'Não', 'Separe por ";". Grupo que não existe é criado.'],
  ['Operação', 'Não', 'Operação que não existe é criada.'],
  ['Motorista (CPF)', 'Não', 'CPF de um motorista já cadastrado.'],
  ['Meta de consumo (km/L)', 'Não', 'Número (ex.: 4,5).'],
  ['Teto mensal combustível (R$)', 'Não', 'Número (ex.: 6000).'],
  ['IMEI (só leitura)', 'Não', 'Ignorado na importação: o rastreador é vinculado na ficha do ativo.'],
];

export async function downloadAssets(s: any, template = false) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(template ? [COLS as unknown as string[], ...EXEMPLOS] : exportRows(s));
  ws['!cols'] = COLS.map((c) => ({ wch: Math.max(12, c.length + 2) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Ativos');
  if (template) {
    const c = catalogoDe(s);
    const inst = XLSX.utils.aoa_to_sheet([['Coluna', 'Obrigatória', 'Como preencher'], ...INSTRUCOES,
      [], ['As linhas de exemplo da aba "Ativos" podem ser apagadas. Linha com erro não entra e não impede as outras; a prévia mostra o motivo antes de gravar.']]);
    inst['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 100 }];
    XLSX.utils.book_append_sheet(wb, inst, 'Instruções');
    const tipos = tiposDoCliente(c.tipos);
    const base: Record<string, string> = { veiculo: 'Veículo (placa obrigatória)', implemento: 'Carreta / implemento (placa obrigatória)', linha_amarela: 'Linha amarela (horímetro)', equipamento: 'Equipamento' };
    const wt = XLSX.utils.aoa_to_sheet([['Tipo', 'Grupo'], ...tipos.map((t) => [t.label, base[t.kind] || ''])]);
    wt['!cols'] = [{ wch: 34 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, wt, 'Tipos aceitos');
    const marca = (id: string) => c.marcas.find((m) => m.id === id)?.nome || '';
    const wm = XLSX.utils.aoa_to_sheet([['Marca', 'Modelo'], ...c.marcas.filter((m) => !c.modelos.some((x) => x.marcaId === m.id)).map((m) => [m.nome, '']),
      ...c.modelos.map((x) => [marca(x.marcaId), x.nome]).sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))]);
    wm['!cols'] = [{ wch: 28 }, { wch: 34 }];
    XLSX.utils.book_append_sheet(wb, wm, 'Marcas e modelos');
  }
  XLSX.writeFile(wb, template ? 'modelo-importacao-ativos.xlsx' : `ativos-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/** Item da lista resolvido na prévia: `id` = usar o que já existe; sem `id` = cadastrar com `nome`. */
export interface ItemDaLista { nome: string; id?: string; sugestoes?: { id: string; nome: string }[] }
export type ImportLine = { row: number; action: 'criar' | 'atualizar' | 'erro'; label: string; errors: string[]; warnings: string[]; data?: any; existingId?: string };
export type ImportPlan = { lines: ImportLine[]; newGroups: string[]; newOperations: string[]; rows: any[][] };

const decodeCsv = (buf: ArrayBuffer) => { const utf = new TextDecoder('utf-8').decode(buf); return utf.includes('�') ? new TextDecoder('windows-1252').decode(buf) : utf.replace(/^﻿/, ''); };
export async function readSheet(file: File): Promise<any[][]> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  // CSV: o Excel brasileiro salva em UTF-8 ou em Windows-1252; decodifica aqui (o leitor do xlsx assumiria Latin-1)
  const wb = /\.csv$/i.test(file.name) || file.type === 'text/csv' ? XLSX.read(decodeCsv(buf), { type: 'string', raw: false }) : XLSX.read(buf, { type: 'array', raw: false });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false }) as any[][];
}

/** Linhas com erro numa planilha própria (mesmas colunas + o motivo), para corrigir e importar de novo (I4). */
export async function downloadErros(plan: ImportPlan) {
  const XLSX = await import('xlsx');
  const erros = plan.lines.filter((l) => l.action === 'erro');
  const head = [...(plan.rows[0] || []), 'Erros (apague esta coluna ou deixe: é ignorada)'];
  const largura = head.length - 1;
  const ws = XLSX.utils.aoa_to_sheet([head, ...erros.map((l) => { const r = plan.rows[l.row - 1] || []; return [...Array.from({ length: largura }, (_, k) => r[k] ?? ''), l.errors.join(' ')]; })]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Ativos');
  XLSX.writeFile(wb, `ativos-com-erro-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/** Tipo da planilha: nome da lista do cliente (renomeado vale), a chave interna ou o nome da categoria antiga ("Linha amarela"). */
function tipoDaPlanilha(txt: string, tipos: OpcaoTipo[]): OpcaoTipo | undefined {
  const t = fold(txt);
  return tipos.find((o) => fold(o.label) === t || o.value === txt)
    ?? tipos.find((o) => { const c = CATEGORIES.find((x) => x.key === o.value); return !!c && (fold(c.label) === t || fold(c.plural) === t); });
}

/** Marca/modelo contra a lista: mesmo nome em outra grafia usa o existente; parecido vira sugestão (decisão na prévia). */
function daLista(nome: string, lista: { id: string; nome: string }[]): ItemDaLista {
  const igual = mesmoNome(nome, lista);
  if (igual) return { nome: igual.nome, id: igual.id };
  const sim = parecidos(nome, lista);
  return sim.length ? { nome, sugestoes: sim.map((x) => ({ id: x.id, nome: x.nome })) } : { nome };
}

// valida tudo antes de gravar: nada entra se o usuário não confirmar a prévia
export function planImport(rows: any[][], s: any): ImportPlan {
  const catalogo = catalogoDe(s);
  const tipos = tiposDoCliente(catalogo.tipos);
  const head = (rows[0] || []).map((h) => fold(norm(h)));
  const base = (n: string) => fold(n).split(' (')[0].split(' /')[0];
  const col = (c: Col) => head.findIndex((h) => [c, ...(ALIAS[c] || [])].some((n) => h.startsWith(base(n))));
  const ix = Object.fromEntries(COLS.map((c) => [c, col(c)])) as Record<Col, number>;
  if (ix['Placa'] < 0 && ix['Código interno / nº de série'] < 0 && ix['Apelido'] < 0) {
    return { rows, newGroups: [], newOperations: [], lines: [{ row: 1, action: 'erro', label: 'Cabeçalho', errors: ['A planilha precisa ter a coluna Placa ou Código interno. Baixe o modelo para ver o formato.'], warnings: [] }] };
  }
  const get = (r: any[], c: Col) => (ix[c] >= 0 ? norm(r[ix[c]]) : '');
  const porPlaca = new Map<string, any>(), porCodigo = new Map<string, any>(), porNome = new Map<string, any>();
  for (const a of s.assets) { if (a.plate) porPlaca.set(key(a.plate), a); if (a.serial) porCodigo.set(key(a.serial), a); if (a.name) porNome.set(key(a.name), a); if (a.apelido) porNome.set(key(a.apelido), a); }
  const placas = new Set<string>(), codigos = new Set<string>(), newGroups = new Set<string>(), newOps = new Set<string>();
  const lines: ImportLine[] = [];
  rows.slice(1).forEach((r, i) => {
    if (!r.some((x) => norm(x))) return;
    const errors: string[] = [], warnings: string[] = [];
    const plate = get(r, 'Placa').toUpperCase().replace(/[\s-]/g, '');
    const serial = get(r, 'Código interno / nº de série');
    const apelido = get(r, 'Apelido');
    const ex = (plate && porPlaca.get(key(plate))) || (serial && porCodigo.get(key(serial))) || (!plate && !serial && apelido ? porNome.get(key(apelido)) : undefined);
    if (plate && !/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(plate)) warnings.push(`Placa “${plate}” fora do padrão brasileiro.`);
    if (serial.length > 60) errors.push('Código interno com mais de 60 caracteres.');
    if (plate && placas.has(key(plate))) errors.push('Placa repetida na planilha.');
    if (serial && codigos.has(key(serial))) errors.push('Código interno repetido na planilha.');
    if (plate) placas.add(key(plate));
    if (serial) codigos.add(key(serial));

    // tipo: obrigatório para ativo novo; no existente, trocar a natureza (veículo ↔ máquina) só pela ficha
    const tipoTxt = get(r, 'Tipo');
    const tipo = tipoTxt ? tipoDaPlanilha(tipoTxt, tipos) : undefined;
    if (tipoTxt && !tipo) errors.push(`Tipo “${tipoTxt}” não existe. Veja a aba “Tipos aceitos” do modelo.`);
    if (!tipoTxt && !ex) errors.push('Informe o tipo do ativo.');
    if (ex && tipo && tipo.kind !== ex.kind) errors.push(`Já cadastrado como ${nomeDoTipo(ex, tipos)}; trocar a natureza do ativo só pela ficha.`);
    const kind = tipo?.kind ?? ex?.kind;
    const comPlaca = kind === 'veiculo' || kind === 'implemento';
    if (kind && comPlaca && !plate && !ex?.plate) errors.push(`${tipo?.label || 'Veículo'} precisa de placa.`);
    if (kind && !comPlaca && !plate && !serial && !ex) errors.push('Sem placa: informe o código interno ou nº de série.');

    // marca e modelo pela lista (obrigatórios no ativo novo, menos objeto pessoal)
    const marcaTxt = get(r, 'Marca'), modeloTxt = get(r, 'Modelo');
    const pessoal = (tipo?.category ?? (ex && categoryOf(ex))) === 'pessoal';
    if (!ex && !pessoal && (!marcaTxt || !modeloTxt)) errors.push('Informe marca e modelo.');
    if (modeloTxt && !marcaTxt && !ex?.brand) errors.push('Modelo sem marca.');
    if (marcaTxt && !chaveCatalogo(marcaTxt)) errors.push(`Marca “${marcaTxt}” precisa ter letra ou número.`);
    if (modeloTxt && !chaveCatalogo(modeloTxt)) errors.push(`Modelo “${modeloTxt}” precisa ter letra ou número.`);
    const marca = marcaTxt ? daLista(marcaTxt, catalogo.marcas) : ex?.brand ? daLista(ex.brand, catalogo.marcas) : undefined;
    const modelos = marca?.id ? catalogo.modelos.filter((m) => m.marcaId === marca.id) : [];
    const modelo = modeloTxt ? daLista(modeloTxt, modelos) : undefined;
    if (marca && marcaTxt && marca.id && marca.nome !== marcaTxt) warnings.push(`Marca “${marcaTxt}” é “${marca.nome}”, já cadastrada.`);
    if (modelo?.id && modelo.nome !== modeloTxt) warnings.push(`Modelo “${modeloTxt}” é “${modelo.nome}”, já cadastrado.`);

    // medidor: linha amarela usa horímetro; em branco no ativo novo, o padrão do tipo
    const medTxt = fold(get(r, 'Medidor de uso'));
    const meter = !medTxt ? undefined : medTxt.startsWith('hor') ? 'horimetro' : medTxt.startsWith('quilo') || medTxt === 'km' ? 'km' : medTxt.startsWith('sem') ? 'nenhum' : null;
    if (meter === null) errors.push(`Medidor “${get(r, 'Medidor de uso')}” inválido. Use Horímetro, Quilometragem ou Sem medidor.`);
    if (kind === 'linha_amarela' && meter && meter !== 'horimetro') errors.push('Linha amarela usa horímetro.');

    // situação (I5): ativo ou inativo; venda e baixa só pela ficha (retiram o rastreador e saem da frota)
    const sitTxt = fold(get(r, 'Situação'));
    const situacao = !sitTxt ? undefined : sitTxt === 'ativo' ? 'ativo' : sitTxt === 'inativo' || sitTxt.startsWith('parado') ? 'inativo' : sitTxt.startsWith('vendid') || sitTxt.startsWith('baixad') ? 'manter' : null;
    if (situacao === null) errors.push(`Situação “${get(r, 'Situação')}” inválida. Use Ativo ou Inativo.`);
    if (situacao === 'manter' && ex && !['vendido', 'baixa'].includes(lifeOf(ex))) warnings.push('Venda e baixa só pela ficha do ativo; a situação não muda.');

    const year = get(r, 'Ano');
    if (year && !/^(19|20)\d{2}$/.test(year)) errors.push(`Ano “${year}” inválido.`);
    const chassi = get(r, 'Chassi').toUpperCase().replace(/\s/g, '');
    if (chassi && chassi.length !== 17) warnings.push(`Chassi com ${chassi.length} caracteres (o padrão é 17).`);
    const renavam = digits(get(r, 'Renavam'));
    if (get(r, 'Renavam') && renavam.length !== 11) warnings.push(`Renavam com ${renavam.length} dígitos (o padrão é 11).`);
    const numOf = (c: Col) => { const v = get(r, c).replace(/\./g, '').replace(',', '.'); if (v && isNaN(+v)) errors.push(`${c}: “${get(r, c)}” não é número.`); return v ? +v : ''; };
    const fuelGoal = numOf('Meta de consumo (km/L)'), fuelBudget = numOf('Teto mensal combustível (R$)');
    const groupNames = get(r, 'Grupos').split(/[;,]/).map(norm).filter(Boolean);
    groupNames.forEach((g) => { if (!s.groups.some((x: any) => fold(x.name) === fold(g))) newGroups.add(g); });
    const op = get(r, 'Operação');
    if (op && !s.operations.some((x: any) => fold(x.name) === fold(op))) newOps.add(op);
    const cpf = digits(get(r, 'Motorista (CPF)'));
    const driver = cpf ? s.drivers.find((d: any) => digits(d.cpf || '') === cpf) : undefined;
    if (cpf && !driver) warnings.push(`Motorista com CPF ${get(r, 'Motorista (CPF)')} não cadastrado; o ativo fica sem motorista.`);
    const imei = get(r, 'IMEI (só leitura)');
    if (imei && imei !== (ex?.tracker?.imei || '')) warnings.push('IMEI ignorado: o vínculo com rastreador é feito na ficha do ativo, com os dados da instalação.');

    const data: any = {
      ...(plate && { plate }), ...(serial && { serial }), ...(apelido && { apelido }), name: nomeDoAtivo(plate || ex?.plate, apelido || ex?.apelido, serial || ex?.serial), ...(tipo && aplicarTipo(tipo)),
      ...(meter && { meter }), ...(!meter && !ex && kind && { meter: kind === 'veiculo' || kind === 'implemento' ? 'km' : kind === 'linha_amarela' ? 'horimetro' : 'nenhum' }),
      ...(year && { year }), ...(chassi && { chassi }), ...(renavam && { renavam }), ...(fuelGoal !== '' && { fuelGoal }), ...(fuelBudget !== '' && { fuelBudget }),
      // ativo novo já entra com o ícone do tipo (o cadastro manual exige foto ou ícone)
      ...(!ex && tipo && { icon: tipo.icone || PNG_ICON_SUGGESTION[tipo.category] || '' }),
      _marca: marcaTxt || modeloTxt ? marca : undefined, _modelo: modelo, _situacao: situacao === 'ativo' || situacao === 'inativo' ? situacao : undefined,
      _groups: groupNames, _op: op, ...(driver && { driverId: driver.id }),
    };
    lines.push({ row: i + 2, action: errors.length ? 'erro' : ex ? 'atualizar' : 'criar', label: plate || serial || apelido || `linha ${i + 2}`, errors, warnings, data, existingId: ex?.id });
  });
  return { lines, newGroups: [...newGroups], newOperations: [...newOps], rows };
}

/** Escolha feita na prévia para marca/modelo com sugestão: `id` usa o existente, `null` cadastra o nome da planilha. */
export function escolherNaLinha(plan: ImportPlan, row: number, campo: '_marca' | '_modelo', id: string | null): ImportPlan {
  return { ...plan, lines: plan.lines.map((l) => (l.row !== row || !l.data?.[campo] ? l : { ...l, data: { ...l.data, [campo]: { ...l.data[campo], id: id || undefined } } })) };
}

// grava as linhas válidas; grupos, operações, marcas e modelos novos são criados antes (na API, um por nome).
// Devolve [criados, atualizados]. Grupos são gravados no fim, uma vez por grupo alterado (não uma por ativo).
export async function applyImport(plan: ImportPlan, blank: (kind?: string) => any): Promise<[number, number]> {
  const s = useStore.getState();
  for (const name of plan.newGroups) await salvarGrupo({ name });
  for (const name of plan.newOperations) await salvarOperacao({ name });
  const { groups, operations: ops } = useStore.getState() as any;
  // marca/modelo novos: um cadastro por nome, mesmo que apareça em cem linhas (a API devolve o existente se já houver)
  const marcas = new Map<string, { id: string; nome: string }>(), modelos = new Map<string, { id: string; nome: string }>();
  const marcaDa = async (m: ItemDaLista) => {
    if (m.id) return { id: m.id, nome: catalogoDe(useStore.getState()).marcas.find((x) => x.id === m.id)?.nome || m.nome };
    const k = chaveCatalogo(m.nome);
    if (!marcas.has(k)) marcas.set(k, await criarMarca(m.nome));
    return marcas.get(k)!;
  };
  const modeloDo = async (marcaId: string, m: ItemDaLista) => {
    if (m.id) return { id: m.id, nome: catalogoDe(useStore.getState()).modelos.find((x) => x.id === m.id)?.nome || m.nome };
    const k = marcaId + '|' + chaveCatalogo(m.nome);
    if (!modelos.has(k)) modelos.set(k, await criarModelo(marcaId, m.nome));
    return modelos.get(k)!;
  };
  let c = 0, u = 0;
  const gruposNaApi: Record<string, string[]> = {};
  for (const l of plan.lines) {
    if (l.action === 'erro') continue;
    const { _groups, _op, _marca, _modelo, _situacao, driverId, ...d } = l.data;
    if (_marca) {
      const mc = await marcaDa(_marca);
      d.brand = mc.nome;
      if (_modelo) { const mo = await modeloDo(mc.id, _modelo); d.model = mo.nome; d.modeloId = mo.id; }
    }
    const groupIds = _groups.map((g: string) => groups.find((x: any) => fold(x.name) === fold(g))?.id).filter(Boolean);
    const operationId = _op ? ops.find((x: any) => fold(x.name) === fold(_op))?.id : undefined;
    let id = l.existingId;
    if (id) {
      const ex = useStore.getState().assets.find((a: any) => a.id === id);
      const plate = d.plate ?? ex?.plate ?? '', serial = d.serial ?? ex?.serial ?? '';
      if (isRealAsset(ex) && ((ex.plate || '') !== plate || (ex.serial || '') !== serial)) await atualizarIdentificacaoAtivo(id, plate, serial);
      s.upsert('assets', { id, ...d, ...(_groups.length && { groupIds }), ...(operationId && { operationId }) });
    } else {
      const real = d.plate || d.serial ? await criarAtivo(d.plate || '', d.serial || '') : undefined;
      id = s.upsert('assets', { ...blank(d.kind || 'veiculo'), ...d, ...(real && { id: real }), groupIds, operationId: operationId || '' }).id as string;
    }
    // situação antes da ficha: a mudança e o histórico dela vão junto na gravação
    const atual = useStore.getState().assets.find((a: any) => a.id === id);
    if (_situacao && atual && lifeOf(atual) !== _situacao) setLifecycle(id!, _situacao, 'Importação de planilha');
    if (isRealAsset({ id })) {
      await salvarFichaAtivo(id!);
      if (driverId) await definirMotoristaDoAtivo(id!, driverId);
      if (_groups.length || !l.existingId) gruposNaApi[id!] = groupIds;
    } else if (driverId) setDriver(id!, driverId, 'escala');
    if (l.existingId) u++; else c++;
  }
  await definirGruposEmLote(gruposNaApi);
  // resumo da importação no registro (cada linha também aparece individualmente como criou/alterou)
  s.patch((st: any) => auditEntry(st, { coll: 'assets', refId: '', label: 'Importação de planilha', action: `importou ${c + u} ativos em lote`, count: c + u, note: `${c} criados, ${u} atualizados, ${plan.lines.filter((l) => l.action === 'erro').length} recusados` }));
  return [c, u];
}
