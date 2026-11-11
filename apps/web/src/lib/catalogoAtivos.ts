// Listas do cadastro de ativos (apps/api/src/catalogo-ativos): marca → modelo e tipos do cliente. Puro, testado em
// catalogoAtivos.test.ts. A unicidade é do banco (fn_chave_catalogo); aqui é só a ajuda da tela: achar o que já
// existe com outra grafia antes de cadastrar ("13190" quando já há "13.190").
import { CATEGORIES, categoryOf, type Category } from '../components/assetArt';

export interface Marca { id: string; nome: string }
export interface Modelo { id: string; marcaId: string; nome: string }
export interface TipoCliente { id: string; nome: string; base: string; padrao: string | null; icone: string | null }
export interface CatalogoAtivos { marcas: Marca[]; modelos: Modelo[]; tipos: TipoCliente[] }
export const CATALOGO_VAZIO: CatalogoAtivos = { marcas: [], modelos: [], tipos: [] };

/** Mesma regra de `fn_chave_catalogo` no banco: sem acento, pontuação, espaço e maiúsculas. */
export const chaveCatalogo = (nome: string) => (nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Item com o mesmo nome em outra grafia: o banco recusaria criar outro. */
export const mesmoNome = <T extends { nome: string }>(nome: string, lista: T[]) => {
  const k = chaveCatalogo(nome);
  return k ? lista.find((x) => chaveCatalogo(x.nome) === k) : undefined;
};

// distância de edição limitada a 1 (troca, falta ou sobra de uma letra): "Volksvagen" × "Volkswagen"
function umaLetra(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, dif = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++dif > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return dif + (a.length - i) + (b.length - j) <= 1;
}

/** "Você quis dizer…": mesmo nome em outra grafia, um começando pelo outro ("13.190" × "13.190 CR 4x2") ou uma letra de diferença. */
export function parecidos<T extends { nome: string }>(nome: string, lista: T[]): T[] {
  const k = chaveCatalogo(nome);
  if (!k) return [];
  return lista.filter((x) => {
    const c = chaveCatalogo(x.nome);
    return c === k || (Math.min(c.length, k.length) >= 3 && (c.startsWith(k) || k.startsWith(c))) || (k.length >= 4 && umaLetra(c, k));
  });
}

// ---------- tipos ----------
// Tipos prontos: as categorias do front (que decidem silhueta e glifo do mapa) e, dentro da linha amarela, os nomes que
// o mercado usa. O tipo é o que a pessoa escolhe; a categoria continua decidindo o desenho.
export interface TipoPronto { key: string; label: string; category: Category; kind: string; icone?: string }
const LINHA_AMARELA: TipoPronto[] = [
  { key: 'escavadeira', label: 'Escavadeira', category: 'linha_amarela', kind: 'linha_amarela', icone: '39-escavadeira' },
  { key: 'retroescavadeira', label: 'Retroescavadeira', category: 'linha_amarela', kind: 'linha_amarela', icone: '34-retroescavadeira' },
  { key: 'pa_carregadeira', label: 'Pá carregadeira', category: 'linha_amarela', kind: 'linha_amarela', icone: '35-pa-carregadeira' },
  // sem arte própria ainda: usa a da escavadeira até chegar o PNG do trator de esteira
  { key: 'trator_esteira', label: 'Trator de esteira', category: 'linha_amarela', kind: 'linha_amarela', icone: '39-escavadeira' },
  { key: 'rolo_compactador', label: 'Rolo compactador', category: 'linha_amarela', kind: 'linha_amarela', icone: '40-rolo-compactador' },
  { key: 'trator_agricola', label: 'Trator agrícola', category: 'linha_amarela', kind: 'linha_amarela', icone: '37-trator-agricola' },
  { key: 'colheitadeira', label: 'Colheitadeira', category: 'linha_amarela', kind: 'linha_amarela', icone: '38-colheitadeira' },
  { key: 'empilhadeira', label: 'Empilhadeira', category: 'linha_amarela', kind: 'linha_amarela', icone: '36-empilhadeira' },
  { key: 'linha_amarela', label: 'Outra máquina (linha amarela)', category: 'linha_amarela', kind: 'linha_amarela' },
];
export const TIPOS_PRONTOS: TipoPronto[] = CATEGORIES.flatMap((c) =>
  c.key === 'linha_amarela' ? LINHA_AMARELA : [{ key: c.key, label: c.label, category: c.key, kind: c.kind }]);

/** Categoria (desenho) de um tipo criado pelo cliente: a genérica da base. */
const CATEGORIA_DA_BASE: Record<string, Category> = { veiculo: 'caminhao', implemento: 'carreta', linha_amarela: 'linha_amarela', equipamento: 'equipamento' };

export interface OpcaoTipo { value: string; label: string; category: Category; kind: string; icone?: string; tipoId?: string }
const VALOR_CLIENTE = 't:';

/** Tipos que a tela oferece: os prontos (com o nome/ícone que o cliente deu, se renomeou) e os criados pelo cliente. */
export function tiposDoCliente(tipos: TipoCliente[]): OpcaoTipo[] {
  const renomeado = new Map(tipos.filter((t) => t.padrao).map((t) => [t.padrao!, t]));
  const prontos = TIPOS_PRONTOS.map((p): OpcaoTipo => {
    const r = renomeado.get(p.key);
    return { value: p.key, label: r?.nome || p.label, category: p.category, kind: p.kind, icone: r?.icone || p.icone, ...(r && { tipoId: r.id }) };
  });
  const proprios = tipos.filter((t) => !t.padrao).map((t): OpcaoTipo => ({
    value: VALOR_CLIENTE + t.id, label: t.nome, category: CATEGORIA_DA_BASE[t.base] || 'equipamento', kind: t.base, icone: t.icone || undefined, tipoId: t.id,
  }));
  return [...prontos, ...proprios];
}

/** Valor do tipo no ativo: o escolhido (`tipo` na ficha) ou, em ativo antigo, o deduzido da categoria. */
export const tipoDoAtivo = (a: any): string => a?.tipo || categoryOf(a);

/** Campos do ativo ao escolher um tipo (categoria e kind vêm dele; `tipo` guarda a escolha). */
export function aplicarTipo(op: OpcaoTipo) {
  return { tipo: op.value, category: op.category, kind: op.kind };
}

export function nomeDoTipo(a: any, opcoes: OpcaoTipo[]): string {
  const v = tipoDoAtivo(a);
  return opcoes.find((o) => o.value === v)?.label || CATEGORIES.find((c) => c.key === a?.category)?.label || 'Equipamento';
}

/** Marca e modelo do ativo vindos da lista (quando aponta para um modelo); senão, o texto que estava na ficha. */
export function marcaModeloDoAtivo(modeloId: string | null | undefined, c: CatalogoAtivos): { brand: string; model: string; marcaId: string } | null {
  const mo = modeloId ? c.modelos.find((m) => m.id === modeloId) : undefined;
  if (!mo) return null;
  return { brand: c.marcas.find((m) => m.id === mo.marcaId)?.nome || '', model: mo.nome, marcaId: mo.marcaId };
}
