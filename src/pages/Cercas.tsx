import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Circle, Polygon, CircleMarker, useMapEvents, useMap } from 'react-leaflet';
import { useSearchParams } from 'react-router-dom';
import { useStore, useStoreData } from '../lib/store';
import { Button, Card, Field, Input, Select, Table, Check, cx, TextButton, Slider, confirmAction, toast, Pills, Tabs, Panel, EmptyState, PageBody } from '../components/ui';
import { MonitorHeader } from '../components/MonitorTabs';
import { FenceShapes, fenceColor, TILE, ATTR, MapControls } from '../components/MapBits';
import { tv } from '../lib/tokens';
import { FENCE_TYPES } from '../lib/catalog';
import { inFence } from '../lib/utils';
import { fencePriority } from '../lib/engine';

const blank = () => ({ id: '', name: '', type: 'Cliente', shape: 'circle', center: null as any, radius: 200, points: [] as any[], startsTrip: false, endsTrip: false, porteiro: false, alertIn: false, alertOut: false, speedLimit: '', maxStayMin: '' });
function Clicks({ onClick }: any) { useMapEvents({ click: (e) => onClick([e.latlng.lat, e.latlng.lng]) }); return null; }
function Center({ c }: any) { const m = useMap(); useEffect(() => { if (c) m.setView(c, 15); }, [c?.[0]]); return null; }

export default function Cercas() {
  const [sp] = useSearchParams();
  const fences = useStore((s) => s.fences);
  const vehicles = useStoreData(10000).vehicles; // contagem "veículos dentro" a cada 10 s, sem redesenhar o mapa a cada passo
  const { upsert, remove } = useStore.getState();
  const [f, setF] = useState<any>(blank());
  const [drawing, setDrawing] = useState(false);
  const [map, setMap] = useState<any>(null);
  useEffect(() => { const lat = sp.get('lat'), lng = sp.get('lng'); if (lat && lng) { setF({ ...blank(), center: [+lat, +lng] }); } }, []);
  const onMap = (p: [number, number]) => {
    if (f.shape === 'circle') setF({ ...f, center: p });
    else if (drawing) setF({ ...f, points: [...f.points, p] });
  };
  const valid = f.name.trim() && (f.shape === 'circle' ? f.center : f.points.length >= 3);
  const save = () => { upsert('fences', { ...f, id: f.id || undefined, radius: +f.radius, speedLimit: +f.speedLimit || 0, maxStayMin: +f.maxStayMin || 0 }); toast(f.id ? 'Cerca salva.' : 'Cerca incluída.'); setF(blank()); setDrawing(false); };
  const others = fences.filter((x: any) => x.id !== f.id);
  const color = fenceColor(f.type);
  const inside = (fe: any) => Object.values<any>(vehicles).filter((v) => inFence(v.pos, fe)).length;

  return (
    <div>
      <MonitorHeader title="Cercas" subtitle="Áreas que geram alertas de entrada e saída." />
      <PageBody>
      <div className="flex flex-wrap items-stretch gap-grid">
        <section className="flex-[999_1_520px] min-w-0 min-h-[640px] rounded-card overflow-hidden border border-line relative">
          <MapContainer ref={setMap} center={[-8.1, -34.92]} zoom={12} className={cx('w-full h-full', (f.shape === 'circle' || drawing) && 'cursor-crosshair')} zoomControl={false}>
            <TileLayer url={TILE} attribution={ATTR} keepBuffer={6} updateWhenZooming={false} />
            <FenceShapes fences={others} />
            {f.shape === 'circle' && f.center && <Circle center={f.center} radius={+f.radius} pathOptions={{ color, weight: 3, fillOpacity: 0.15 }} />}
            {f.shape === 'polygon' && f.points.length > 0 && <Polygon positions={f.points} pathOptions={{ color, weight: 3, fillOpacity: 0.15 }} />}
            {f.shape === 'polygon' && f.points.map((p: any, i: number) => <CircleMarker key={i} center={p} radius={5} pathOptions={{ color, fillColor: tv('--card'), fillOpacity: 1 }} />)}
            <Clicks onClick={onMap} />
            <Center c={sp.get('lat') ? [+sp.get('lat')!, +sp.get('lng')!] : null} />
          </MapContainer>
          <div className="absolute z-[400] top-3 left-3 flex flex-wrap items-center gap-tight">
            <Tabs className="border border-line shadow-float" value={f.shape} onChange={(k) => { if (k === 'polygon') { setF({ ...f, shape: 'polygon', points: [] }); setDrawing(true); } else { setF({ ...f, shape: 'circle' }); setDrawing(false); } }} tabs={[{ key: 'circle', label: 'Círculo' }, { key: 'polygon', label: 'Polígono' }]} />
            {f.shape === 'polygon' && drawing && <><Button variant="secondary" className="shadow-float" disabled={!f.points.length} onClick={() => setF({ ...f, points: f.points.slice(0, -1) })}>Desfazer ponto</Button><Button variant="dark" className="shadow-float" disabled={f.points.length < 3} onClick={() => setDrawing(false)}>Concluir polígono</Button></>}
          </div>
          <div className="absolute z-[400] top-14 left-3">
            <MapControls items={[{ icon: 'zoom-mais', label: 'Aproximar', onClick: () => map?.zoomIn() }, { icon: 'zoom-menos', label: 'Afastar', onClick: () => map?.zoomOut() }]} />
          </div>
          <div className="absolute z-[400] bottom-3 left-3 right-3 sm:right-auto bg-card border border-line shadow-float rounded-btn px-3 py-2 text-caption font-medium text-ink-2">
            {f.shape === 'circle' ? 'Clique no mapa para posicionar o centro do círculo.' : drawing ? `Clique para adicionar vértices (${f.points.length}). Conclua com 3 ou mais.` : 'Polígono pronto. Clique em "Polígono" para redesenhar.'}
          </div>
        </section>
        <Card title={f.id ? 'Editar cerca' : 'Nova cerca'} className="flex-[1_1_340px] max-w-[440px] self-stretch"
          footer={<div className="flex gap-tight w-full"><Button size="lg" disabled={!valid} onClick={save} className="flex-1">Salvar cerca</Button>{f.id && <Button size="lg" variant="quiet" onClick={() => setF(blank())}>Cancelar</Button>}</div>}>
          <div className="flex flex-col gap-field">
            <Field label="Nome"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Cliente Atacadão" /></Field>
            <div className="flex flex-col gap-field-label"><span className="text-small font-medium text-ink-2">O que é este local</span>
              <Pills value={f.type} onChange={(t) => setF({ ...f, type: t })} options={FENCE_TYPES.map((t) => ({ key: t, label: t }))} />
            </div>
            {f.shape === 'circle' && <Field label={`Raio: ${f.radius} m`}><Slider min={50} max={2000} step={10} value={f.radius} onChange={(e) => setF({ ...f, radius: +e.target.value })} /></Field>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-field">
              <Field label="Velocidade máx. interna"><Input type="number" value={f.speedLimit} onChange={(e) => setF({ ...f, speedLimit: e.target.value })} placeholder="km/h" /></Field>
              <Field label="Permanência máx."><Input type="number" value={f.maxStayMin} onChange={(e) => setF({ ...f, maxStayMin: e.target.value })} placeholder="min" /></Field>
            </div>
            <Panel dense tone="muted" className="flex flex-col gap-tight">
              <span className="text-small font-medium text-ink-2">Uso em viagens</span>
              <Check label="Saída desta cerca inicia viagem de pátio" checked={f.startsTrip} onChange={(v) => setF({ ...f, startsTrip: v })} />
              <Check label="Entrada nesta cerca encerra a viagem de pátio" checked={f.endsTrip} onChange={(v) => setF({ ...f, endsTrip: v })} />
            </Panel>
            <div className="flex flex-col gap-tight"><span className="text-small font-medium text-ink-2">Alertar quando</span>
              <Check label="Entrar" checked={f.alertIn} onChange={(v) => setF({ ...f, alertIn: v })} /><Check label="Sair" checked={f.alertOut} onChange={(v) => setF({ ...f, alertOut: v })} />
              {(f.alertIn || f.alertOut) && <Field label="Prioridade do alerta" hint="Alta deixa o veículo crítico até alguém tratar."><Select value={fencePriority(f)} onChange={(e) => setF({ ...f, alertPriority: e.target.value })} options={[{ value: 'alta', label: 'Alta (crítico)' }, { value: 'media', label: 'Média' }, { value: 'baixa', label: 'Baixa' }]} /></Field>}
            </div>
          </div>
        </Card>
      </div>
      <Card title="Cercas cadastradas" icon="cerca">
        <Table align={['left', 'left', 'left', 'left', 'left', 'right', 'right']} emptyState={<EmptyState illustration="ilu-cercas" layout="row" title="Nenhuma cerca cadastrada" detail="Clique no mapa acima para posicionar a primeira cerca." />}
          head={['Cerca', 'Tipo', 'Formato', 'Viagem de pátio', 'Alertas', 'Veículos dentro', '']} rows={fences.map((x: any) => [<span className="font-medium">{x.name}</span>, <span className="inline-flex items-center gap-tight text-small"><span aria-hidden="true" className="w-2.5 h-2.5 rounded-swatch shrink-0" style={{ background: fenceColor(x.type) }} />{x.type}</span>, <span className="num">{x.shape === 'circle' ? `Círculo ${x.radius} m` : `Polígono (${x.points.length} pontos)`}</span>, x.startsTrip || x.endsTrip ? [x.startsTrip && 'inicia', x.endsTrip && 'encerra'].filter(Boolean).join(' e ') : '—', [x.alertIn && 'entrada', x.alertOut && 'saída'].filter(Boolean).join(', ') || '—', inside(x),
          <div className="flex gap-stack"><TextButton onClick={() => { setF({ ...blank(), ...x, speedLimit: x.speedLimit || '', maxStayMin: x.maxStayMin || '' }); setDrawing(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Editar</TextButton><TextButton tone="danger" onClick={async () => { if (await confirmAction({ title: `Excluir a cerca "${x.name}"?`, detail: 'Ela deixa de gerar alertas de entrada, saída e permanência.' })) { remove('fences', x.id); toast('Cerca excluída.'); } }}>Excluir</TextButton></div>])} />
      </Card>
      </PageBody>
    </div>
  );
}
