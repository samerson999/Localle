import { useNavigate } from 'react-router-dom';
import { Card, Table, EmptyState, ErrorState, Stack, Grid, PageHeader } from '../components/ui';
import { listarRelatoriosGerados, useAdminQuery, type TipoRelatorio } from '../lib/localleApi';
import { fmtDT, num } from '@localle/shared/utils';
import { Icon } from '../components/icons';
import imgCerca from '../images/images-relatorios/cerca.png';
import imgVelocidade from '../images/images-relatorios/velocidade.png';
import imgPosicoes from '../images/images-relatorios/posições.png';
import imgPassouPorAqui from '../images/images-relatorios/passou-por-aqui.png';
import imgCercaWeb from '../images/images-relatorios/web/cerca.webp';
import imgVelocidadeWeb from '../images/images-relatorios/web/velocidade.webp';
import imgPosicoesWeb from '../images/images-relatorios/web/posições.webp';
import imgPassouPorAquiWeb from '../images/images-relatorios/web/passou-por-aqui.webp';

// Relatórios: hub com um atalho por tipo de relatório. Período, filtros e geração ficam
// na tela específica de cada tipo.
const TIPOS: { tipo: TipoRelatorio; icon: string; title: string; detail: string; img: string; webp: string; path: string }[] = [
  { tipo: 'cercas', icon: 'cerca', title: 'Cercas', detail: 'Veja as passagens da frota pelas cercas definidas e o tempo de permanência.', img: imgCerca, webp: imgCercaWeb, path: '/relatorios/cercas' },
  { tipo: 'velocidade', icon: 'velocimetro', title: 'Velocidade', detail: 'Identifique excessos de velocidade e analise os trechos mais críticos.', img: imgVelocidade, webp: imgVelocidadeWeb, path: '/relatorios/velocidade' },
  { tipo: 'posicoes', icon: 'rota', title: 'Posições', detail: 'Consulte o histórico de posições detalhado da sua frota.', img: imgPosicoes, webp: imgPosicoesWeb, path: '/relatorios/posicoes' },
  { tipo: 'passou_por_aqui', icon: 'alvo', title: 'Passou por aqui', detail: 'Verifique quais veículos passaram por um ponto específico no mapa.', img: imgPassouPorAqui, webp: imgPassouPorAquiWeb, path: '/relatorios/passou-por-aqui' },
  { tipo: 'uso', icon: 'odometro', title: 'Uso da frota', detail: 'Km rodado, motor ligado, ociosidade e paradas de cada veículo.', img: imgPosicoes, webp: imgPosicoesWeb, path: '/relatorios/uso' },
];

export default function Relatorios() {
  const navigate = useNavigate();
  const hist = useAdminQuery(listarRelatoriosGerados);
  const lista = hist.data || [];
  const tipoDe = (k: TipoRelatorio) => TIPOS.find((t) => t.tipo === k);
  return (
    <div>
      <PageHeader icon="relatorios" title="Relatórios" subtitle="Transforme os dados da sua frota em informações claras e acionáveis" />
      <Stack gap="grid">
        <Grid cols={4} equal>
          {TIPOS.map((t) => (
            <button key={t.title} type="button" onClick={() => t.path && navigate(t.path)} className="text-left min-w-0">
              <Card title={t.title} icon={t.icon} className="h-full hover:bg-card-2 transition-colors"
                footer={
                  <span className="flex w-full justify-end">
                    <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[var(--real)]" style={{ background: 'var(--real-soft)' }}>
                      <Icon name="chevron" size={16} />
                    </span>
                  </span>
                }>
                <Stack gap="field">
                  <div className="rounded-card overflow-hidden border border-line aspect-[4/3]">
                    <picture>
                      <source type="image/webp" srcSet={t.webp} />
                      <img src={t.img} alt="" loading="lazy" decoding="async" width={640} height={480} className="w-full h-full object-cover" />
                    </picture>
                  </div>
                  <p className="text-small text-ink-2">{t.detail}</p>
                </Stack>
              </Card>
            </button>
          ))}
        </Grid>

        {/* registrado pelo backend a cada exportação (reports/historico), da empresa toda; clique abre o tipo */}
        <Card title="Relatórios recentes" icon="relogio" subtitle="Os últimos 50 relatórios exportados pela empresa. Clique num deles para abrir o tipo e gerar de novo.">
          {hist.error ? <ErrorState detail={hist.error} onRetry={hist.reload} /> : (
            <Table loading={hist.loading} minWidth={900} onRow={(i) => { const t = tipoDe(lista[i].tipo); if (t) navigate(t.path); }}
              head={['Tipo', 'Período', 'Filtros aplicados', 'Gerado em', 'Por', 'Registros', 'Formato']}
              align={['left', 'left', 'left', 'left', 'left', 'right', 'left']}
              rows={lista.map((r) => {
                const t = tipoDe(r.tipo);
                return [
                  <span className="flex items-center gap-icon font-medium"><Icon name={t?.icon || 'relatorios'} size={16} className="text-ink-2 shrink-0" />{t?.title || r.tipo}</span>,
                  <span className="num whitespace-nowrap">{fmtDT(Date.parse(r.inicio))} → {fmtDT(Date.parse(r.fim))}</span>,
                  <span className="text-small text-ink-2">{r.filtros || '—'}</span>,
                  <span className="num whitespace-nowrap">{fmtDT(Date.parse(r.geradoEm))}</span>,
                  <span className="text-small">{r.geradoPor || '—'}</span>,
                  <span className="num">{num(r.registros)}</span>,
                  <span className="text-small font-medium">{r.formato.toUpperCase()}</span>,
                ];
              })}
              emptyState={<EmptyState illustration="ilu-relatorios" title="Nenhum relatório gerado ainda" detail="Abra um dos tipos acima e exporte em PDF, Excel ou CSV: ele aparece aqui." />}
            />
          )}
        </Card>
      </Stack>
    </div>
  );
}
