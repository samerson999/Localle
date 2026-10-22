// /design › Espaçamento e hierarquia: a tabela de tokens semânticos e cada regra com um exemplo certo e um errado.
// Os exemplos "errado" usam valores soltos de propósito (são a demonstração do erro); nenhuma tela faz isso.
import type { ReactNode } from 'react';
import { tv } from '../lib/tokens';
import { Card, Grid, Stack, Field, FormGroup, FormActions, Input, Select, Button, Table, cx } from '../components/ui';
import { Icon } from '../components/icons';
import { Num, DeltaChip, StatusDot } from '../components/story';

// tokens de espaçamento: nome, onde usar (lidos em tempo real de styles/tokens.css)
const TOKENS: [string, string, string][] = [
  ['--page-x', 'px-page', 'margem lateral da página no celular'],
  ['--page-x-md', 'md:px-page-md', 'margem lateral a partir de md'],
  ['--page-top-md', 'md:pt-page-top-md', 'topo do conteúdo; o título fica na linha do "Precisa de você"'],
  ['--page-head', 'mb-page-head', 'cabeçalho da página → conteúdo'],
  ['--gap-section', 'PageBody · Stack gap="section"', 'entre seções'],
  ['--gap-grid', 'Grid · Stack gap="grid"', 'entre cards'],
  ['--page-end', 'pb-page-end', 'fim da página: respiro para o simulador e os avisos'],
  ['--pad-card', 'Card', 'padding do card'],
  ['--pad-card-sm', 'Card dense', 'padding do card compacto'],
  ['--card-head', 'CardHeader', 'cabeçalho do card → conteúdo'],
  ['--card-foot', 'CardFooter', 'acima e abaixo do divisor do rodapé'],
  ['--gap-stack', 'Stack gap="stack"', 'entre blocos dentro do card'],
  ['--gap-tight', 'Cluster', 'chips, botões, ícone e texto na mesma linha'],
  ['--gap-hair', 'Stack gap="hair"', 'título e apoio de um mesmo item'],
  ['--kpi-title', 'KpiCard · KpiTile', 'título → número'],
  ['--kpi-meta', 'KpiCard · KpiTile', 'número → linha de apoio (chip, meta)'],
  ['--kpi-chart', 'KpiCard', 'apoio → gráfico'],
  ['--h-row', 'Table', 'linha de tabela e de lista'],
  ['--h-row-sm', 'Table dense', 'linha compacta'],
  ['--cell-x', 'Table', 'entre colunas (1ª e última recuam pelo padding do card)'],
  ['--field-label', 'FormField', 'rótulo → campo'],
  ['--gap-field', 'FormGroup', 'entre campos'],
  ['--gap-group', 'Form', 'entre grupos de campos'],
  ['--form-actions', 'FormActions', 'último campo → ações'],
  ['--gap-icon', 'Button, item de lista', 'ícone → texto'],
  ['--gap-icon-head', 'CardHeader', 'ícone → título do card'],
];

function Verdict({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div className={cx('rounded-ctl border p-card-sm flex flex-col gap-stack min-w-0', ok ? 'border-line bg-card' : 'border-dashed border-line-strong bg-card-2')}>
      <p className={cx('text-small font-medium flex items-center gap-icon', ok ? 'text-ink' : 'text-crit-ink')}><Icon name={ok ? 'sucesso' : 'erro'} size={16} className={ok ? 'text-mov' : ''} />{ok ? 'Certo' : 'Errado'}</p>
      {children}
    </div>
  );
}
function Rule({ n, title, note, ok, bad }: { n: number; title: string; note: ReactNode; ok: ReactNode; bad: ReactNode }) {
  return (
    <Card title={`${n}. ${title}`} subtitle={note}>
      <Grid split="6/6" equal><Verdict ok>{ok}</Verdict><Verdict ok={false}>{bad}</Verdict></Grid>
    </Card>
  );
}
// caixinha de exemplo (bloco cinza)
const B = ({ className = '' }: { className?: string }) => <span className={cx('block h-3 rounded-chip bg-track', className)} />;

export function SpacingRules() {
  return (
    <Stack gap="grid">
      <Card title="Tokens de espaçamento" subtitle="Escala de 4 px; cada nome diz onde usar. As telas usam as primitivas (Stack, Cluster, Grid, Section, Card, FormField…), não os valores.">
        <Table minWidth={640} dense align={['left', 'left', 'right', 'left']} head={['Token', 'Quem aplica', 'Valor', 'Uso']}
          rows={TOKENS.map(([t, who, use]) => [<span className="font-mono text-caption text-ink-2">{t}</span>, <span className="text-small">{who}</span>, <span className="num">{tv(t)}</span>, <span className="text-small text-ink-2">{use}</span>])} />
      </Card>

      <Rule n={1} title="Proximidade" note="O espaço dentro de um grupo é sempre menor que o espaço entre grupos."
        ok={<Stack gap="grid"><Stack gap="hair"><span className="text-body font-medium">Troca de óleo</span><span className="text-small text-ink-2">KOZ5H91 · vence em 3 dias</span></Stack><Stack gap="hair"><span className="text-body font-medium">Revisão de freios</span><span className="text-small text-ink-2">PEW1A33 · vence em 9 dias</span></Stack></Stack>}
        bad={<div className="flex flex-col gap-3"><span className="text-body font-medium">Troca de óleo</span><span className="text-small text-ink-2">KOZ5H91 · vence em 3 dias</span><span className="text-body font-medium">Revisão de freios</span><span className="text-small text-ink-2">PEW1A33 · vence em 9 dias</span></div>} />

      <Rule n={2} title="Ritmo" note="Só valores da escala, pelos nomes dos tokens. Nada de margem avulsa para acertar um caso."
        ok={<Stack gap="stack"><B className="w-2/3" /><B className="w-1/2" /><B className="w-3/4" /><p className="text-caption text-ink-2">Stack gap="stack": 12, 12</p></Stack>}
        bad={<div><B className="w-2/3" /><B className="w-1/2 mt-[7px]" /><B className="w-3/4 mt-[15px]" /><p className="text-caption text-ink-2 mt-[11px]">mt-[7px], mt-[15px]: cada bloco num ritmo</p></div>} />

      <Rule n={3} title="Um protagonista" note="Um número principal por card (text-kpi) e no máximo um por tela (text-display). O resto é visivelmente secundário."
        ok={<div className="[container-type:inline-size] flex flex-col"><span className="text-h3 font-semibold">Disponibilidade</span><span className="mt-kpi-title"><Num value={96.2} unit="%" digits={1} size="kpi" /></span><span className="mt-kpi-meta flex items-center gap-tight"><DeltaChip value={1.4} /><span className="text-caption text-ink-2">vs. set</span></span></div>}
        bad={<div className="flex flex-col gap-tight"><span className="text-h3 font-semibold">Disponibilidade</span><span className="flex gap-grid"><Num value={96.2} unit="%" digits={1} size="kpi" /><Num value={42} unit="h" size="kpi" /></span><span className="text-h2 font-semibold">3 paradas por pane</span></div>} />

      <Rule n={4} title="Três níveis de texto por card" note="Título (text-h3, ink), conteúdo e apoio (text-small/caption, ink-2). Negrito só no título e no número principal."
        ok={<Stack gap="tight"><span className="text-h3 font-semibold">Custo com combustível</span><span className="text-body">No ritmo atual, o mês fecha em R$ 50.900.</span><span className="text-small text-ink-2">Atualizado às 14:32</span></Stack>}
        bad={<div className="flex flex-col gap-tight"><span className="text-h2 font-bold">Custo com combustível</span><span className="text-[15px] font-semibold">No ritmo atual,</span><span className="text-body font-bold">o mês fecha em R$ 50.900.</span><span className="text-[13px] font-semibold text-ink-3">Atualizado às 14:32</span></div>} />

      <Rule n={5} title="Alinhamento" note="Texto à esquerda; números de tabela à direita com algarismos tabulares; ícone alinhado à primeira linha do texto."
        ok={<table className="w-full text-body"><tbody>{[[48320.4, 'Oficina'], [3680, 'Pneus'], [12580, 'Peças']].map(([v, l]) => <tr key={l as string} className="border-t border-line first:border-t-0"><td className="py-tight">{l}</td><td className="py-tight text-right"><Num value={v as number} prefix="R$" digits={2} size="body" /></td></tr>)}</tbody></table>}
        bad={<table className="w-full text-body"><tbody>{[['48320.4', 'Oficina'], ['3680', 'Pneus'], ['12580', 'Peças']].map(([v, l]) => <tr key={l} className="border-t border-line first:border-t-0"><td className="py-tight text-center">{l}</td><td className="py-tight">R$ {v}</td></tr>)}</tbody></table>} />

      <Rule n={6} title="Densidade pelo contexto" note="Listas e tabelas operacionais compactas (linha de 40–48); cards de BI e painéis com respiro (padding 24)."
        ok={<Stack gap="stack"><div className="border border-line rounded-ctl">{['KOZ5H91', 'PEW1A33', 'QWE4R56'].map((p) => <div key={p} className="h-row-sm px-stack flex items-center justify-between border-t border-line first:border-t-0 text-body"><span className="font-mono">{p}</span><StatusDot kind="mov" /></div>)}</div><p className="text-caption text-ink-2">Lista operacional: linhas de 40, sem respiro extra.</p></Stack>}
        bad={<div className="border border-line rounded-ctl">{['KOZ5H91', 'PEW1A33'].map((p) => <div key={p} className="py-6 px-stack flex items-center justify-between border-t border-line first:border-t-0 text-body"><span className="font-mono">{p}</span><StatusDot kind="mov" /></div>)}</div>} />

      <Rule n={7} title="Cards da linha" note="Cards da mesma linha começam e terminam nas mesmas colunas. Altura igual só com conteúdo equivalente; senão, alinhados ao topo, sem vão vazio."
        ok={<Grid split="6/6"><div className="border border-line rounded-ctl p-stack flex flex-col gap-tight"><B className="w-1/2" /><B className="h-12" /></div><div className="border border-line rounded-ctl p-stack flex flex-col gap-tight"><B className="w-1/2" /><B /><B /><B /><B /></div></Grid>}
        bad={<div className="grid grid-cols-2 gap-3 items-stretch"><div className="border border-line rounded-ctl p-stack flex flex-col gap-tight"><B className="w-1/2" /><B className="h-12" /><span className="flex-1 rounded-chip border border-dashed border-line-strong text-caption text-ink-3 flex items-center justify-center">vão vazio</span></div><div className="border border-line rounded-ctl p-stack flex flex-col gap-tight"><B className="w-1/2" /><B /><B /><B /><B /><B /><B /></div></div>} />

      <Rule n={8} title="Formulários" note="Rótulo → campo 6; entre campos 16; entre grupos 32; ações a 24 do último campo."
        ok={<div><FormGroup title="Veículo" cols={2}><Field label="Placa"><Input defaultValue="KOZ5H91" /></Field><Field label="Grupo"><Select value="a" options={[{ value: 'a', label: 'Frota Recife' }]} /></Field></FormGroup><FormActions><Button variant="quiet" size="sm">Cancelar</Button><Button size="sm">Salvar</Button></FormActions></div>}
        bad={<div className="flex flex-col gap-1"><span className="text-small text-ink-2">Placa</span><Input defaultValue="KOZ5H91" /><span className="text-small text-ink-2 mt-5">Grupo</span><Select value="a" options={[{ value: 'a', label: 'Frota Recife' }]} /><div className="flex justify-end gap-1 mt-1"><Button variant="quiet" size="sm">Cancelar</Button><Button size="sm">Salvar</Button></div></div>} />
    </Stack>
  );
}
