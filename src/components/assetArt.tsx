// Categorias de ativo, silhuetas cheias (vista lateral, frente para a direita, moldura 64×28, chão em y = 26)
// e glifos de mapa (traço, grade 24). A cor vem do texto (currentColor): carroceria a 70%, rodas a 100%,
// janelas e detalhes vazados em --card. Assim a silhueta segue os tokens de quem usa.

export const CATEGORIES = [
  { key: 'cavalo', label: 'Cavalo mecânico', plural: 'cavalos mecânicos', kind: 'veiculo' },
  { key: 'caminhao', label: 'Caminhão', plural: 'caminhões', kind: 'veiculo' },
  { key: 'onibus', label: 'Ônibus', plural: 'ônibus', kind: 'veiculo' },
  { key: 'utilitario', label: 'Utilitário', plural: 'utilitários', kind: 'veiculo' },
  { key: 'picape', label: 'Picape', plural: 'picapes', kind: 'veiculo' },
  { key: 'carro', label: 'Carro', plural: 'carros', kind: 'veiculo' },
  { key: 'moto', label: 'Moto', plural: 'motos', kind: 'veiculo' },
  { key: 'carreta', label: 'Carreta', plural: 'carretas', kind: 'implemento' },
  { key: 'linha_amarela', label: 'Linha amarela', plural: 'linha amarela', kind: 'linha_amarela' },
  { key: 'equipamento', label: 'Equipamento', plural: 'equipamentos', kind: 'equipamento' },
  { key: 'pessoal', label: 'Objeto pessoal', plural: 'objetos pessoais', kind: 'equipamento' },
] as const;
export type Category = (typeof CATEGORIES)[number]['key'];
export const categoryLabel = (k: string) => CATEGORIES.find((c) => c.key === k)?.label || 'Equipamento';

// Categoria salva no ativo ou, se não houver, deduzida do tipo e do modelo
export function categoryOf(a: any): Category {
  if (a?.category && CATEGORIES.some((c) => c.key === a.category)) return a.category;
  if (a?.kind === 'linha_amarela') return 'linha_amarela';
  if (a?.kind === 'implemento') return 'carreta';
  if (a?.kind !== 'veiculo') return 'equipamento';
  const m = `${a.brand || ''} ${a.model || ''}`;
  if (/Marcopolo|Volare|Busscar|\bCaio\b|Comil|Neobus|Mascarello|Irizar|\bOF[- ]?\d{4}|\bO ?500|[ÔO]nibus|Micro-?[ôo]nibus/i.test(m)) return 'onibus';
  if (/\b(4x2|6x2|6x4|8x4)\b|\bFH\b|\bR\s?\d{3}\b|Actros|Axor|Constellation \d{2}\.\d{3}/i.test(m)) return 'cavalo';
  if (/Hilux|S10|Ranger|Amarok|Toro|Strada|L200|Frontier|Saveiro|Montana/i.test(m)) return 'picape';
  if (/\b(CG|Titan|Fan|Biz|Pop|Bros|XRE|Factor|Fazer|Lander|Crosser|NMax|PCX|Elite|Neo)\b/i.test(m)) return 'moto';
  if (/Onix|HB20|\bGol\b|Polo|Virtus|Voyage|Argo|Cronos|Mobi|\bUno\b|Kwid|Sandero|Logan|Corolla|Yaris|Etios|\bCity\b|Civic|\bFit\b|Prisma|Cobalt|\bKa\b|Fiesta|Versa|March|Sentra|Cruze|Jetta/i.test(m)) return 'carro';
  if (/Fiorino|Kangoo|Partner|Ducato|Master|Sprinter|Daily|Doblò?|Expert|Jumpy/i.test(m)) return 'utilitario';
  return 'caminhao';
}

// Silhueta: a categoria, e na carreta o tipo de implemento (lib/couplings: semirreboque, dolly, reboque)
export type SilhouetteKey = Exclude<Category, 'carreta'> | 'semirreboque' | 'dolly' | 'reboque';
export const silhouetteOf = (a: any): SilhouetteKey => {
  const c = categoryOf(a);
  if (c !== 'carreta') return c;
  return a?.trailerType === 'dolly' ? 'dolly' : a?.trailerType === 'reboque' ? 'reboque' : 'semirreboque';
};
export const SILHOUETTES: { key: SilhouetteKey; label: string }[] = [
  { key: 'carro', label: 'Carro' }, { key: 'utilitario', label: 'Utilitário' }, { key: 'picape', label: 'Picape' }, { key: 'moto', label: 'Moto' },
  { key: 'caminhao', label: 'Caminhão' }, { key: 'cavalo', label: 'Cavalo mecânico' }, { key: 'onibus', label: 'Ônibus' },
  { key: 'semirreboque', label: 'Semirreboque' }, { key: 'dolly', label: 'Dolly' }, { key: 'reboque', label: 'Reboque' },
  { key: 'linha_amarela', label: 'Linha amarela' }, { key: 'equipamento', label: 'Equipamento' }, { key: 'pessoal', label: 'Objeto pessoal' },
];

// Glifos de mapa: grade de 24 px, traço 1,5, vistos de lado (frente para a direita). Precisam ler a 16 px
// dentro do disco do marcador, então são mais simples que as silhuetas.
export const MAP_GLYPH: Record<Category | 'reboque', string> = {
  cavalo: 'M4.75 16.25h-1.5v-7.5l2.5-3.5h5.5v8 M11.25 13.25h9.5v3h-.5 M8.75 16.25h8 M5.5 9.25h4.25 M14.5 11.25h4.5 M7 18a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5z M18.5 18a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5z',
  caminhao: 'M2.75 16.25V7.75h11v8.5 M13.75 10.25h4l3.5 3.5v2.5h-1.5 M2.75 16.25h1.5 M9.25 16.25h6 M6.75 18.25a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M17.75 18.25a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  onibus: 'M4.75 16.25h-1.5V7.25a1.5 1.5 0 0 1 1.5-1.5h14l2 3.5v7h-1.5 M8.75 16.25h7 M3.25 11.25h17.5 M6.75 18.25a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M17.75 18.25a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  utilitario: 'M5.25 16.25h-2v-5l4-4.5h13.5v9.5h-1 M8.75 16.25h7.5 M3.75 11.25h5.5v-4.5 M7 18a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5z M18 18a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5z',
  picape: 'M5.25 16.25h-2v-3.5l2.5-.75 2.75-3.75h5.5v4.5h7.25v3.5h-1.5 M8.75 16.25h7.5 M7 18a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5z M18 18a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5z',
  carro: 'M5.75 16.25h-2.5v-3.5l2.25-.75 2.5-3.75h6.5l3.25 3.75 2.75.5v3.75h-2.25 M9.25 16.25h5.5 M8.25 12h9 M7.5 18a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5z M16.5 18a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5z',
  moto: 'M6 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M18 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 16l3.5-4.5h5L18 16 M15.75 7.75h1.5l.75 3.75 M8 9.5h3.25',
  linha_amarela: 'M4.25 19.25h9.5a1.75 1.75 0 0 0 0-3.5h-9.5a1.75 1.75 0 0 0 0 3.5z M5.25 15.75v-5.5h5.5v5.5 M10.75 11.25l5-5.5 4.5 5 M20.25 10.75l-1.75 4h3z',
  carreta: 'M3.25 6.75h18v8.5h-18z M3.25 15.25h-1v1.5 M6.75 15.25v3.5 M5.5 18.75h2.5 M14 18.25a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5z M19 18.25a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5z',
  reboque: 'M2.75 6.75h13.5v8.5H2.75z M16.25 13.75h4.5 M21.25 12.75v2 M6.25 18.25a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5z M12.75 18.25a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5z',
  equipamento: 'M4.25 7.75h15.5v9.5H4.25z M4.25 10.75h15.5 M8.75 14h6.5 M7.25 17.25v2 M16.75 17.25v2',
  pessoal: 'M8.25 7.25h7.5a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2h-7.5a2 2 0 0 1-2-2v-9.5a2 2 0 0 1 2-2z M10 7.25V5.5a2 2 0 0 1 4 0v1.75 M9.25 12.75h5.5',
};
// glifo do marcador: reboque tem glifo próprio; semirreboque e dolly usam o de carreta
export const glyphOf = (a: any): Category | 'reboque' => (silhouetteOf(a) === 'reboque' ? 'reboque' : categoryOf(a));

// ---------- silhuetas cheias ----------
// Rodas: disco cheio com aro em --card (separa da carroceria) e cubo vazado.
const Wheel = ({ x, r = 3.75, y }: { x: number; r?: number; y?: number }) => {
  const cy = y ?? 26 - r;
  return <g><circle cx={x} cy={cy} r={r} fill="currentColor" stroke="var(--card)" strokeWidth="1.25" /><circle cx={x} cy={cy} r={r * 0.38} fill="var(--card)" fillOpacity="0.75" /></g>;
};
// corpo (carroceria a 70%) e vazados (janelas, detalhes) em --card
const Body = ({ d }: { d: string }) => <path d={d} fill="currentColor" fillOpacity="0.7" />;
const Solid = ({ d }: { d: string }) => <path d={d} fill="currentColor" />;
const Cut = ({ d, o = 0.7 }: { d: string; o?: number }) => <path d={d} fill="var(--card)" fillOpacity={o} />;

const ART: Record<SilhouetteKey, JSX.Element> = {
  carro: <>
    <Body d="M4.5 21.75v-4.25c0-1.2.8-2 2-2.3l8.25-1.7 6-5c.8-.65 1.6-1 2.7-1H38c1.1 0 2 .35 2.7 1l6.3 5.1 9.75 1.35c1.75.25 2.75 1.4 2.75 3v3.8c0 .6-.4 1-1 1H5.5c-.6 0-1-.4-1-1z" />
    <Cut d="M22.5 9.25h7.75v4.75H16.6zM32 9.25h5.9l5.65 4.75H32z" />
    <Wheel x={15} /><Wheel x={48.5} />
  </>,
  utilitario: <>
    <Body d="M4 21.75V8.5c0-1.65 1.35-3 3-3h38c1.2 0 2.2.4 3.05 1.2l7.2 6.8 2.15.55c1.5.4 2.6 1.6 2.6 3.2v4.5c0 .6-.4 1-1 1H5c-.6 0-1-.4-1-1z" />
    <Cut d="M45.5 7.75l7.25 6.25H45.5zM34.5 7.75h9v6.25h-9z" />
    <Cut d="M30.5 7.75h.75V21h-.75z" o={0.5} />
    <Wheel x={14} /><Wheel x={49} />
  </>,
  picape: <>
    <Body d="M4 21.75V14.5c0-.55.45-1 1-1h24.5V9.25c0-1.25 1-2.25 2.25-2.25H42c1 0 1.9.4 2.6 1.1l4.9 5 7.25 1.3c1.75.3 2.75 1.5 2.75 3.1v4.25c0 .6-.4 1-1 1H5c-.6 0-1-.4-1-1z" />
    <Cut d="M32 9h6v5h-6zM39.5 9h3.1l4.75 5H39.5z" />
    <Wheel x={14} /><Wheel x={49} />
  </>,
  moto: <>
    <Body d="M14.5 18.75l5.75-5.25c.6-.55 1.35-.85 2.15-.85h7.85l3.4-2.35c.6-.4 1.3-.6 2-.55l6 .55 2.9 3.6 5.2 4.65-1.55 1.1-4.55-3.95h-5.1l-3.05 3.85H24.6l-5.1 1.15z" />
    <Solid d="M20.75 12.65c1.6-2.1 4.5-2.65 8.75-2.4h2.4l-1.6 2.4z" />
    <Solid d="M44 7.25l2.1-.5 5.75 13.4-1.55.75zM42.25 6.6h5.5v1.4h-5.5z" />
    <Cut d="M26.25 15.25h7.25v2.75h-7.25z" o={0.5} />
    <Wheel x={12} r={5.25} /><Wheel x={51} r={5.25} />
  </>,
  caminhao: <>
    <Body d="M3 20.25V4.5c0-.85.65-1.5 1.5-1.5h35.75c.85 0 1.5.65 1.5 1.5v15.75z" />
    <Body d="M42.75 21.25V8.5c0-1.1.9-2 2-2h7.4c1 0 1.9.45 2.5 1.25l4.55 6.05c.55.75.8 1.6.8 2.5v4.95c0 .55-.45 1-1 1z" />
    <Solid d="M3 19.5h57.75v2.25H3z" />
    <Cut d="M45.25 8.75h6.5l4.4 5.75H45.25z" />
    <Wheel x={10.5} /><Wheel x={19} /><Wheel x={52} />
  </>,
  cavalo: <>
    <Solid d="M6 18.25h54v3.5H6z" />
    <Solid d="M11.5 15.75h14.5v2.5H11.5z" />
    <Solid d="M31 2.5h1.75v12H31z" />
    <Body d="M34 21V6.25c0-1.5 1.25-2.75 2.75-2.75H48c1.2 0 2.3.5 3.1 1.4l6.75 7.6c.75.85 1.15 1.9 1.15 3V21z" />
    <Cut d="M37.75 6h10.1l5.9 7H37.75z" />
    <Wheel x={13} /><Wheel x={21.5} /><Wheel x={51} />
  </>,
  onibus: <>
    <Body d="M3 21V5.25C3 4 4 3 5.25 3H55c1.4 0 2.6.9 3.05 2.25L60.5 12.5v8.5c0 .8-.7 1.5-1.5 1.5H4.5C3.7 22.5 3 21.8 3 21z" />
    <Cut d="M6.5 5.75h9v6.5h-9zM17.75 5.75h9v6.5h-9zM29 5.75h9v6.5h-9zM40.25 5.75h9v6.5h-9zM51.5 5.75h4.25l2.25 6.5h-6.5z" />
    <Cut d="M3 14.25h57.5v.75H3z" o={0.45} />
    <Wheel x={13} /><Wheel x={49.5} />
  </>,
  semirreboque: <>
    <Body d="M3.5 18V4.5c0-.85.65-1.5 1.5-1.5h54c.85 0 1.5.65 1.5 1.5V18z" />
    <Solid d="M3.5 17.5h57v2.25h-57z" />
    <Solid d="M49.5 19.75h1.5v4.5h-1.5zM47.75 24h5v1.5h-5z" />
    <Wheel x={9} /><Wheel x={17} /><Wheel x={25} />
  </>,
  dolly: <>
    <Solid d="M18 17.25h28v2.75H18zM46 18h12.5v1.25H46z" />
    <Body d="M25 14.25h14v3H25z" />
    <circle cx="59.5" cy="18.6" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.25" />
    <Wheel x={27.5} /><Wheel x={36.5} />
  </>,
  reboque: <>
    <Body d="M3.5 18V5c0-.85.65-1.5 1.5-1.5h43c.85 0 1.5.65 1.5 1.5v13z" />
    <Solid d="M3.5 17.5h46v2.25h-46zM49.5 18h11v1.25h-11z" />
    <circle cx="61" cy="18.6" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.25" />
    <Wheel x={10} /><Wheel x={18} /><Wheel x={41.5} />
  </>,
  linha_amarela: <>
    <Body d="M17.5 20.5v-8h8V5c0-.85.65-1.5 1.5-1.5h9c.85 0 1.5.65 1.5 1.5v7.5h6.5v8z" />
    <Cut d="M28 5.75h7.5v5.5H28z" />
    <Solid d="M44 12.75l8-2 4 3.25-1 1.25-3.5-2.5-7.5 2.75z" />
    <Solid d="M53.75 13.25l6.75-.25-1 6H54.5z" />
    <Solid d="M18 13.25l-8-7.25-6 6 1 1.25 5-4.25 7.25 6.5z" />
    <Solid d="M2.5 11.75l4.5 1-1 4.25-3.75-.75z" />
    <Wheel x={24} r={5.25} /><Wheel x={41} />
  </>,
  equipamento: <>
    <Body d="M8 21V7c0-.85.65-1.5 1.5-1.5h45c.85 0 1.5.65 1.5 1.5v14z" />
    <Cut d="M13.5 9.5h16v1.25h-16zM13.5 12.75h16V14h-16zM13.5 16h16v1.25h-16z" o={0.6} />
    <Cut d="M37.5 9h12.5v8H37.5z" />
    <Solid d="M11 21h5.5v3.5H11zM47.5 21H53v3.5h-5.5z" />
  </>,
  pessoal: <>
    <Body d="M25.5 24V10.5c0-2.5 2-4.5 4.5-4.5h4c2.5 0 4.5 2 4.5 4.5V24z" />
    <Solid d="M29 6.25V4.25c0-1.1.9-2 2-2h2c1.1 0 2 .9 2 2v2h-1.4V4.4c0-.45-.35-.8-.8-.8h-1.6c-.45 0-.8.35-.8.8v1.85z" />
    <Cut d="M28 15h8v6h-8z" o={0.55} />
  </>,
};

// aceita a chave da silhueta ou a categoria (carreta = semirreboque)
export function AssetSilhouette({ category, className = 'w-16 h-7', label }: { category: SilhouetteKey | Category; className?: string; label?: string }) {
  const k: SilhouetteKey = category === 'carreta' ? 'semirreboque' : category;
  return (
    <svg viewBox="0 0 64 28" className={className} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {ART[k] || ART.equipamento}
    </svg>
  );
}
