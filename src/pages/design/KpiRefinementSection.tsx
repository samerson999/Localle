// DEMONSTRAÇÃO ISOLADA — conteúdo da seção "Refinamento de KPIs e gráficos" em /design.
// Nada aqui é consumido por telas de produto. Ver docs/design-audit/07-refinamento-kpi.md para a
// documentação completa (anatomia, gramática, contrato de polaridade, tokens citados, lacunas).
import React from 'react';
import { Card, Grid, Skeleton, ErrorState, EmptyState, cx } from '../../components/ui';
import { KpiTile, KpiCard, DeltaChip, Num, type LoadState } from '../../components/story';
import { brandVars } from '../../lib/brand';
import { KpiHeroDestaque } from './KpiHeroDestaque';
import { DivergentBars, type DivergentBarRow } from './DivergentBar';
import { evaluateMetric, DEMO_VOLUME, DEMO_EFICIENCIA_META_MINIMA, DEMO_CUSTO_META_MAXIMA, type MetricContract } from './metricPolarity';

const fmtFor = (c: MetricContract) => (v: number) => `${c.unit === 'R$' ? 'R$ ' : ''}${v.toLocaleString('pt-BR', { minimumFractionDigits: c.digits, maximumFractionDigits: c.digits })}${c.unit && c.unit !== 'R$' ? ` ${c.unit}` : ''}`;

// leitura (chip de variação) derivada do contrato — nunca hardcoded por tela
function metricDelta(contract: MetricContract, value: number, goal: number | null) {
  const ev = evaluateMetric(contract, { value, goal });
  if (ev.polarity === 'neutro' || goal == null) return undefined;
  return { value: ev.deviationPct ?? 0, unit: '%', good: (contract.direction === 'up' ? 'up' : 'down') as 'up' | 'down' };
}

const RANKING_ROWS: Record<'consumo-kml' | 'custo-km', DivergentBarRow[]> = {
  'consumo-kml': [
    { key: 'abc1', label: 'ABC-1234', value: 6.1, goal: 7.5 },  // abaixo da meta → esquerda, rosa
    { key: 'xyz9', label: 'XYZ-9876', value: 8.6, goal: 7.5 },  // acima da meta → direita, azul
    { key: 'qrt4', label: 'QRT-4455', value: 7.5, goal: 7.5 },  // exatamente na meta → centro
  ],
  'custo-km': [
    { key: 'abc1', label: 'ABC-1234', value: 1.1, goal: 1.6 },  // custo abaixo da meta → esquerda, azul
    { key: 'xyz9', label: 'XYZ-9876', value: 2.3, goal: 1.6 },  // custo acima da meta → direita, rosa
  ],
};

function StateWrap({ st, loading, empty, error, children }: { st: LoadState; loading: React.ReactNode; empty: React.ReactNode; error: React.ReactNode; children: React.ReactNode }) {
  if (st === 'loading') return <>{loading}</>;
  if (st === 'empty') return <>{empty}</>;
  if (st === 'error') return <>{error}</>;
  return <>{children}</>;
}

export function KpiRefinementSection({ st }: { st: LoadState }) {
  const ok = st === 'ready';
  const volumeValue = ok ? 1284 : null;
  const kmlValue = ok ? 6.1 : null; // abaixo da meta mínima → desfavorável
  const custoValue = ok ? 1.12 : null; // abaixo do teto → favorável

  return (
    <div className="flex flex-col gap-section">
      {/* ---------- 6 e 7: compacto (sem rodapé de leitura) e analítico (leitura neutra) ---------- */}
      <Card title="Compacto × analítico: mesma métrica, duas densidades" icon="grafico">
        <p className="text-caption text-ink-3 mb-4">O compacto (<code>KpiTile</code>) não tem rodapé de leitura — só rótulo, número e, quando há meta, o chip de variação. O analítico (<code>KpiCard</code>) acrescenta a leitura, sempre neutra quando a métrica é de volume ou não tem meta configurada.</p>
        <p className="text-small font-medium text-ink-2 mb-2">Compacto</p>
        <Grid cols={3}>
          <StateWrap st={st} loading={<Skeleton className="h-24 w-full" />} empty={<EmptyState icon="relogio" title="Sem dados" />} error={<ErrorState detail="Falha ao calcular." />}>
            <KpiTile label={DEMO_VOLUME.label} value={volumeValue} sub="Volume — neutro por padrão, sem meta" />
          </StateWrap>
          <StateWrap st={st} loading={<Skeleton className="h-24 w-full" />} empty={<EmptyState icon="relogio" title="Sem dados" />} error={<ErrorState detail="Falha ao calcular." />}>
            <KpiTile label={DEMO_EFICIENCIA_META_MINIMA.label} value={kmlValue} unit={DEMO_EFICIENCIA_META_MINIMA.unit} digits={1} delta={metricDelta(DEMO_EFICIENCIA_META_MINIMA, kmlValue ?? 0, 7.5)} sub="Meta mínima 7,5 km/L" />
          </StateWrap>
          <StateWrap st={st} loading={<Skeleton className="h-24 w-full" />} empty={<EmptyState icon="relogio" title="Sem dados" />} error={<ErrorState detail="Falha ao calcular." />}>
            <KpiTile label={DEMO_CUSTO_META_MAXIMA.label} value={custoValue} unit={DEMO_CUSTO_META_MAXIMA.unit} digits={2} delta={metricDelta(DEMO_CUSTO_META_MAXIMA, custoValue ?? 0, 1.6)} sub="Teto 1,60/km" />
          </StateWrap>
        </Grid>
        <p className="text-small font-medium text-ink-2 mt-6 mb-2">Analítico (leitura neutra quando não há meta ou é volume)</p>
        <Grid cols={3}>
          <KpiCard state={st} icon="relogio" title={DEMO_VOLUME.label} value={volumeValue} sub="Total do mês" insight={evaluateMetric(DEMO_VOLUME, { value: volumeValue, goal: null }).reason} />
          <KpiCard state={st} icon="grafico" title={DEMO_EFICIENCIA_META_MINIMA.label} value={kmlValue} unit="km/L" digits={1} sub="Meta mínima 7,5 km/L" delta={metricDelta(DEMO_EFICIENCIA_META_MINIMA, kmlValue ?? 0, 7.5)} insight={evaluateMetric(DEMO_EFICIENCIA_META_MINIMA, { value: kmlValue, goal: 7.5 }).reason} />
          <KpiCard state={st} icon="banco" title={DEMO_CUSTO_META_MAXIMA.label} value={custoValue} prefix="R$" digits={2} sub="Teto 1,60/km" delta={metricDelta(DEMO_CUSTO_META_MAXIMA, custoValue ?? 0, 1.6)} insight={evaluateMetric(DEMO_CUSTO_META_MAXIMA, { value: custoValue, goal: 1.6 }).reason} />
        </Grid>
      </Card>

      {/* ---------- 5: três situações do contrato de polaridade ---------- */}
      <Card title="Contrato de polaridade — três situações" icon="design">
        <p className="text-caption text-ink-3 mb-4">A classificação vem de <code>src/pages/design/metricPolarity.ts</code> (demonstração), não do componente visual. A existência de meta não decide sozinha o resultado: o tipo de meta (<code>goalKind</code>: mínima, máxima ou faixa) e a direção desejável (<code>direction</code>) é que decidem.</p>
        <dl className="grid sm:grid-cols-3 gap-4 text-small">
          <div className="border border-line rounded-ctl p-card-sm"><dt className="font-semibold text-ink mb-1">Volume sem meta</dt><dd className="text-ink-2">{DEMO_VOLUME.label}: {evaluateMetric(DEMO_VOLUME, { value: 1284, goal: null }).reason}</dd></div>
          <div className="border border-line rounded-ctl p-card-sm"><dt className="font-semibold text-ink mb-1">Meta mínima (quanto maior, melhor)</dt><dd className="text-ink-2">{DEMO_EFICIENCIA_META_MINIMA.label} 6,1 km/L, meta 7,5: {evaluateMetric(DEMO_EFICIENCIA_META_MINIMA, { value: 6.1, goal: 7.5 }).reason}</dd></div>
          <div className="border border-line rounded-ctl p-card-sm"><dt className="font-semibold text-ink mb-1">Meta máxima / teto (quanto menor, melhor)</dt><dd className="text-ink-2">{DEMO_CUSTO_META_MAXIMA.label} R$ 1,12, teto R$ 1,60: {evaluateMetric(DEMO_CUSTO_META_MAXIMA, { value: 1.12, goal: 1.6 }).reason}</dd></div>
        </dl>
      </Card>

      {/* ---------- 8: KpiHero com superfície de marca e fallback grafite (variantes, nunca 2 destaques juntos) ---------- */}
      <Card title="Card de destaque — superfície de marca na “Leitura da frota”" icon="alvo">
        <p className="text-caption text-ink-3 mb-4">Duas variantes do <b>mesmo componente</b> (não dois destaques numa mesma tela — o produto permite no máximo um <code>KpiHero</code> de destaque por tela). A área analítica (número, meta) permanece branca; só a leitura usa <code>--brand-tip</code>/<code>--brand-tip-line</code>, os mesmos tokens do card de dica.</p>
        <Grid split="6/6">
          <div>
            <p className="text-small font-medium text-ink-2 mb-2">Variante: cor da revenda pinta</p>
            <div style={brandVars('#1D5BEA') as React.CSSProperties}>
              <KpiHeroDestaque title="Disponibilidade da frota" period="últimos 30 dias" value={96.2} unit="%" digits={1}
                delta={{ value: 2.1, unit: 'p.p.', good: 'up' }} goal={{ value: 95, label: 'Meta 95,0%' }} scale={[85, 100]}
                leituraDaFrota="A frota está 1,2 p.p. acima da meta há 14 dias seguidos — nenhuma ação necessária." />
            </div>
          </div>
          <div>
            <p className="text-small font-medium text-ink-2 mb-2">Variante: fallback grafite (ex.: revenda vermelha)</p>
            <div style={brandVars('#D42A1E') as React.CSSProperties}>
              <KpiHeroDestaque title="Disponibilidade da frota" period="últimos 30 dias" value={96.2} unit="%" digits={1}
                delta={{ value: 2.1, unit: 'p.p.', good: 'up' }} goal={{ value: 95, label: 'Meta 95,0%' }} scale={[85, 100]}
                leituraDaFrota="A frota está 1,2 p.p. acima da meta há 14 dias seguidos — nenhuma ação necessária." />
            </div>
          </div>
        </Grid>
      </Card>

      {/* ---------- 9: ranking divergente com polaridade contextual ---------- */}
      <Card title="Ranking divergente — posição ≠ cor" icon="grafico">
        <p className="text-caption text-ink-3 mb-4">Posição geométrica = relação com a meta (esquerda abaixo, centro na meta, direita acima). Cor = desempenho (azul <code>var(--real)</code> favorável, rosa <code>var(--loss)</code> desfavorável), segundo o contrato de cada métrica — nunca a mesma regra (ex.: "direita = ruim") para as duas.</p>
        <Grid split="6/6">
          <div>
            <p className="text-small font-medium text-ink-2 mb-2">{DEMO_EFICIENCIA_META_MINIMA.label} — quanto maior, melhor</p>
            <DivergentBars contract={DEMO_EFICIENCIA_META_MINIMA} rows={RANKING_ROWS['consumo-kml']} format={fmtFor(DEMO_EFICIENCIA_META_MINIMA)} />
          </div>
          <div>
            <p className="text-small font-medium text-ink-2 mb-2">{DEMO_CUSTO_META_MAXIMA.label} — quanto menor, melhor</p>
            <DivergentBars contract={DEMO_CUSTO_META_MAXIMA} rows={RANKING_ROWS['custo-km']} format={fmtFor(DEMO_CUSTO_META_MAXIMA)} />
          </div>
        </Grid>
      </Card>

      <p className="text-caption text-ink-3">Use o seletor <b>Dados</b> no topo da página para ver os estados de carregando, vazio e erro nos cards acima; a grade acompanha o tamanho do card (container query) do mesmo jeito que os demais KPIs da plataforma.</p>
    </div>
  );
}
