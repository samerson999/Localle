import { useNavigate } from 'react-router-dom';
import { Card, Table, EmptyState, Stack, Grid, PageHeader } from '../components/ui';
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
const TIPOS: { icon: string; title: string; detail: string; img: string; webp: string; path: string }[] = [
  { icon: 'cerca', title: 'Cercas', detail: 'Veja as passagens da frota pelas cercas definidas e o tempo de permanência.', img: imgCerca, webp: imgCercaWeb, path: '/relatorios/cercas' },
  { icon: 'velocimetro', title: 'Velocidade', detail: 'Identifique excessos de velocidade e analise os trechos mais críticos.', img: imgVelocidade, webp: imgVelocidadeWeb, path: '/relatorios/velocidade' },
  { icon: 'rota', title: 'Posições', detail: 'Consulte o histórico de posições detalhado da sua frota.', img: imgPosicoes, webp: imgPosicoesWeb, path: '/relatorios/posicoes' },
  { icon: 'alvo', title: 'Passou por aqui', detail: 'Verifique quais veículos passaram por um ponto específico no mapa.', img: imgPassouPorAqui, webp: imgPassouPorAquiWeb, path: '/relatorios/passou-por-aqui' },
  { icon: 'odometro', title: 'Uso da frota', detail: 'Km rodado, motor ligado, ociosidade e paradas de cada veículo.', img: imgPosicoes, webp: imgPosicoesWeb, path: '/relatorios/uso' },
];

export default function Relatorios() {
  const navigate = useNavigate();
  return (
    <div>
      <PageHeader icon="relatorios" title="Relatórios" subtitle="Transforme os dados da sua frota em informações claras e acionáveis" />
      <Stack gap="grid">
        <Grid cols={4} equal>
          {TIPOS.map((t) => (
            <button key={t.title} type="button" aria-label={`Abrir ${t.title.toLowerCase()}`} onClick={() => t.path && navigate(t.path)} className="text-left min-w-0">
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

        <Card title="Relatórios recentes" icon="relogio" subtitle="Seus últimos relatórios gerados. Acesse um dos tipos acima para gerar um novo.">
          <Table
            head={['Tipo', 'Período', 'Filtros aplicados', 'Gerado em', 'Registros', 'Formato']}
            rows={[]}
            emptyState={<EmptyState icon="relogio" title="Nenhum relatório gerado ainda" detail="Abra um dos tipos acima para gerar o primeiro relatório do período." />}
          />
        </Card>
      </Stack>
    </div>
  );
}
