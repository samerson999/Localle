import { useEffect, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Circle, Polygon, Marker, useMapEvents, useMap } from 'react-leaflet';
import { useSearchParams } from 'react-router-dom';
import { useStore, useStoreData } from '../lib/store';
import { Button, Card, Field, FormGroup, Input, Select, Table, Check, cx, TextButton, Slider, confirmAction, toast, Pills, Tabs, EmptyState, PageBody } from '../components/ui';
import { MonitorHeader } from '../components/MonitorTabs';
import { FenceShapes, fenceColor, TILE, ATTR, MapControls } from '../components/MapBits';
import { tv } from '../lib/tokens';
import { searchAddress } from '../lib/geocode';
import { FENCE_TYPES } from '@localle/shared/catalog';
import { inFence } from '@localle/shared/utils';
import { fencePriority } from '@localle/shared/engine';
import { removerCerca, salvarCerca } from '../lib/localleApi';

const blank = () => ({ id: '', name: '', type: 'Cliente', shape: 'circle', center: null as any, radius: 200, points: [] as any[], startsTrip: false, endsTrip: false, alertIn: false, alertOut: false, speedLimit: '', maxStayMin: '' });
// alça arrastável do centro do círculo e dos vértices do polígono
const handle = (color: string, big = false) => L.divIcon({ className: '', iconSize: big ? [18, 18] : [12, 12], iconAnchor: big ? [9, 9] : [6, 6], html: `<span style="display:block;width:100%;height:100%;border-radius:50%;background:${tv('--card')};border:3px solid ${color};box-shadow:0 1px 3px rgba(0,0,0,.35);cursor:grab"></span>` });
const fenceBounds = (x: any) => (x.shape === 'circle' ? L.latLng(x.center).toBounds(x.radius * 2) : L.latLngBounds(x.points));
function Clicks({ onClick }: any) { useMapEvents({ click: (e) => onClick([e.latlng.lat, e.latlng.lng]) }); return null; }
function Center({ c }: any) { const m = useMap(); useEffect(() => { if (c) m.setView(c, 15); }, [c?.[0]]); return null; }

export default function Cercas() {
  const [sp] = useSearchParams();
  const fences = useStore((s) => s.fences);
  const vehicles = useStoreData(10000).vehicles; // contagem "veículos dentro" a cada 10 s, sem redesenhar o mapa a cada passo
  const [f, setF] = useState<any>(blank());
  const [drawing, setDrawing] = useState(false);
  const [map, setMap] = useState<any>(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  useEffect(() => { const lat = sp.get('lat'), lng = sp.get('lng'); if (lat && lng) { setF({ ...blank(), center: [+lat, +lng] }); } }, []);

  const hasShape = f.shape === 'circle' ? !!f.center : f.points.length > 0;
  // clique no mapa só posiciona o círculo enquanto ele não existe; depois disso, move-se arrastando o centro
  const onMap = (p: [number, number]) => {
    if (f.shape === 'circle') { if (!f.center) setF({ ...f, center: p }); }
    else if (drawing) setF({ ...f, points: [...f.points, p] });
  };
  const setShape = async (k: string) => {
    if (k === f.shape) return;
    if (hasShape && !(await confirmAction({ title: 'Trocar o formato da cerca?', detail: 'O desenho atual será apagado.', confirmLabel: 'Trocar formato' }))) return;
    if (k === 'polygon') { setF({ ...f, shape: 'polygon', points: [] }); setDrawing(true); } else { setF({ ...f, shape: 'circle', center: null }); setDrawing(false); }
  };
  const redraw = () => { if (f.shape === 'polygon') { setF({ ...f, points: [] }); setDrawing(true); } else setF({ ...f, center: null }); };
  const find = async () => {
    setSearching(true);
    const p = await searchAddress(query);
    setSearching(false);
    if (!p) { toast('Endereço não encontrado. Tente incluir cidade e estado.'); return; }
    map?.setView(p, 16);
    if (f.shape === 'circle') setF({ ...f, center: p });
  };

  const missing = [!f.name.trim() && 'nome da cerca', f.shape === 'circle' ? !f.center && 'posição no mapa' : f.points.length < 3 && `${3 - f.points.length} ponto(s) no mapa`].filter(Boolean) as string[];
  const valid = missing.length === 0;
  const dirty = !!(f.name || hasShape);
  const reset = () => { setF(blank()); setDrawing(false); setQuery(''); };
  // cadastro no backend: a entrada/saída é calculada lá sobre cada posição, com a tela aberta ou não
  const save = async () => {
    try { await salvarCerca(f); toast(f.id ? 'Cerca salva.' : 'Cerca incluída.'); reset(); }
    catch (e: any) { toast('Não foi possível salvar: ' + (e.message || e)); }
  };
  const edit = (x: any) => { setF({ ...blank(), ...x, speedLimit: x.speedLimit || '', maxStayMin: x.maxStayMin || '' }); setDrawing(false); window.scrollTo({ top: 0, behavior: 'smooth' }); map?.fitBounds(fenceBounds(x), { padding: [40, 40], maxZoom: 16 }); };
  const others = fences.filter((x: any) => x.id !== f.id);
  const color = fenceColor(f.type);
  const inside = (fe: any) => Object.values<any>(vehicles).filter((v) => inFence(v.pos, fe)).length;
  const tip = f.shape === 'circle'
    ? (f.center ? 'Arraste o ponto central para mover a cerca.' : 'Clique no mapa onde fica o centro da cerca.')
    : drawing ? `Clique no mapa para marcar os cantos da área (${f.points.length} marcado${f.points.length === 1 ? '' : 's'}; mínimo 3).` : 'Arraste os pontos para ajustar o contorno.';

  return (
    <div>
      <MonitorHeader title="Cercas" subtitle="Áreas que geram alertas de entrada e saída." />
      <PageBody>
      <div className="flex flex-wrap items-stretch gap-grid">
        <section className="flex-[999_1_520px] min-w-0 min-h-[640px] rounded-card overflow-hidden border border-line relative">
          <MapContainer ref={setMap} center={[-8.1, -34.92]} zoom={12} className={cx('w-full h-full', ((f.shape === 'circle' && !f.center) || drawing) && 'cursor-crosshair')} zoomControl={false}>
            <TileLayer url={TILE} attribution={ATTR} keepBuffer={6} updateWhenZooming={false} />
            <FenceShapes fences={others} />
            {f.shape === 'circle' && f.center && <><Circle center={f.center} radius={+f.radius} pathOptions={{ color, weight: 3, fillOpacity: 0.15 }} />
              <Marker position={f.center} draggable icon={handle(color, true)} eventHandlers={{ dragend: (e: any) => { const p = e.target.getLatLng(); setF((s: any) => ({ ...s, center: [p.lat, p.lng] })); } }} /></>}
            {f.shape === 'polygon' && f.points.length > 0 && <Polygon positions={f.points} pathOptions={{ color, weight: 3, fillOpacity: 0.15 }} />}
            {f.shape === 'polygon' && f.points.map((p: any, i: number) => <Marker key={i} position={p} draggable icon={handle(color)} eventHandlers={{ dragend: (e: any) => { const q = e.target.getLatLng(); setF((s: any) => ({ ...s, points: s.points.map((o: any, j: number) => (j === i ? [q.lat, q.lng] : o)) })); } }} />)}
            <Clicks onClick={onMap} />
            <Center c={sp.get('lat') ? [+sp.get('lat')!, +sp.get('lng')!] : null} />
          </MapContainer>
          <div className="absolute z-[400] top-3 left-3">
            <MapControls items={[{ icon: 'zoom-mais', label: 'Aproximar', onClick: () => map?.zoomIn() }, { icon: 'zoom-menos', label: 'Afastar', onClick: () => map?.zoomOut() }]} />
          </div>
          <div className="absolute z-[400] bottom-3 left-3 right-3 sm:right-auto bg-card border border-line shadow-float rounded-btn px-3 py-2 text-caption font-medium text-ink-2">{tip}</div>
        </section>
        <Card title={f.id ? 'Editar cerca' : 'Nova cerca'} className="flex-[1_1_340px] max-w-[440px] self-stretch"
          footer={<div className="flex flex-col gap-tight w-full">
            {!valid && <span className="text-caption text-ink-2">Para salvar, falta: {missing.join(' e ')}.</span>}
            <div className="flex gap-tight w-full"><Button size="lg" disabled={!valid} onClick={save} className="flex-1">Salvar cerca</Button>{(f.id || dirty) && <Button size="lg" variant="quiet" onClick={reset}>{f.id ? 'Cancelar' : 'Limpar'}</Button>}</div>
          </div>}>
          <div className="flex flex-col gap-group">
            <FormGroup title="1. Onde fica">
              <form className="flex gap-tight" onSubmit={(e) => { e.preventDefault(); find(); }}>
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar endereço ou local" aria-label="Buscar endereço" className="flex-1" />
                <Button type="submit" variant="secondary" loading={searching} disabled={!query.trim()}>Buscar</Button>
              </form>
              <Tabs value={f.shape} onChange={setShape} tabs={[{ key: 'circle', label: 'Círculo' }, { key: 'polygon', label: 'Área desenhada' }]} />
              {f.shape === 'circle' && <Field label={`Tamanho (raio): ${f.radius} m`}><Slider min={50} max={2000} step={10} value={f.radius} onChange={(e) => setF({ ...f, radius: +e.target.value })} /></Field>}
              <div className="flex flex-wrap gap-tight">
                {f.shape === 'polygon' && drawing && <><Button variant="secondary" disabled={!f.points.length} onClick={() => setF({ ...f, points: f.points.slice(0, -1) })}>Desfazer ponto</Button><Button variant="dark" disabled={f.points.length < 3} onClick={() => setDrawing(false)}>Concluir área</Button></>}
                {hasShape && !drawing && <Button variant="secondary" onClick={redraw}>Redesenhar</Button>}
              </div>
            </FormGroup>
            <FormGroup title="2. Identificação">
              <Field label="Nome"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Cliente Atacadão" /></Field>
              <div className="flex flex-col gap-field-label"><span className="text-small font-medium text-ink-2">O que é este local</span>
                <Pills value={f.type} onChange={(t) => setF({ ...f, type: t })} options={FENCE_TYPES.map((t) => ({ key: t, label: t }))} />
                <span className="text-caption text-ink-2">Define a cor da cerca no mapa.</span>
              </div>
            </FormGroup>
            <FormGroup title="3. Avisos" description="Escolha quando o monitoramento deve ser avisado.">
              <div className="flex flex-col gap-tight">
                <Check label="Quando um veículo entrar" checked={f.alertIn} onChange={(v) => setF({ ...f, alertIn: v })} />
                <Check label="Quando um veículo sair" checked={f.alertOut} onChange={(v) => setF({ ...f, alertOut: v })} />
              </div>
              {(f.alertIn || f.alertOut) && <Field label="Prioridade do aviso" hint="Alta deixa o veículo crítico até alguém tratar."><Select value={fencePriority(f)} onChange={(e) => setF({ ...f, alertPriority: e.target.value })} options={[{ value: 'alta', label: 'Alta (crítico)' }, { value: 'media', label: 'Média' }, { value: 'baixa', label: 'Baixa' }]} /></Field>}
            </FormGroup>
            <FormGroup title="4. Base da frota" description="Marque se este local é uma garagem ou pátio de onde os veículos saem e para onde voltam. O sistema conta a viagem da saída até a volta.">
              <div className="flex flex-col gap-tight">
                <Check label="Sair daqui inicia uma viagem" checked={f.startsTrip} onChange={(v) => setF({ ...f, startsTrip: v })} />
                <Check label="Chegar aqui encerra a viagem" checked={f.endsTrip} onChange={(v) => setF({ ...f, endsTrip: v })} />
              </div>
            </FormGroup>
            <FormGroup title="Limites (opcional)" description="Ficam registrados na cerca, mas ainda não geram aviso." cols={2}>
              <Field label="Velocidade máx. dentro"><Input type="number" value={f.speedLimit} onChange={(e) => setF({ ...f, speedLimit: e.target.value })} placeholder="km/h" /></Field>
              <Field label="Tempo máx. parado"><Input type="number" value={f.maxStayMin} onChange={(e) => setF({ ...f, maxStayMin: e.target.value })} placeholder="min" /></Field>
            </FormGroup>
          </div>
        </Card>
      </div>
      <Card title="Cercas cadastradas" icon="cerca">
        <Table align={['left', 'left', 'left', 'left', 'left', 'right', 'right']} emptyState={<EmptyState illustration="ilu-cercas" layout="row" title="Nenhuma cerca cadastrada" detail="Busque um endereço ou clique no mapa acima, dê um nome e salve." />}
          head={['Cerca', 'Tipo', 'Formato', 'Viagem', 'Avisos', 'Veículos dentro', '']} rows={fences.map((x: any) => [<span className="font-medium">{x.name}</span>, <span className="inline-flex items-center gap-tight text-small"><span aria-hidden="true" className="w-2.5 h-2.5 rounded-swatch shrink-0" style={{ background: fenceColor(x.type) }} />{x.type}</span>, <span className="num">{x.shape === 'circle' ? `Círculo ${x.radius} m` : `Área (${x.points.length} pontos)`}</span>, x.startsTrip || x.endsTrip ? [x.startsTrip && 'inicia', x.endsTrip && 'encerra'].filter(Boolean).join(' e ') : '—', [x.alertIn && 'entrada', x.alertOut && 'saída'].filter(Boolean).join(', ') || '—', inside(x),
          <div className="flex gap-stack"><TextButton onClick={() => edit(x)}>Editar</TextButton><TextButton tone="danger" onClick={async () => { if (await confirmAction({ title: `Excluir a cerca "${x.name}"?`, detail: 'Ela deixa de gerar alertas de entrada e saída.' })) { try { await removerCerca(x.id); toast('Cerca excluída.'); } catch (e: any) { toast('Não foi possível excluir: ' + (e.message || e)); } } }}>Excluir</TextButton></div>])} />
      </Card>
      </PageBody>
    </div>
  );
}
