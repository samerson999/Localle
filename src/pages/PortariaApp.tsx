// Perfil Portaria: só a tela de saída/entrada, pensada para o celular do porteiro (uma coluna, alvos grandes,
// placa digitada ou tocada). O próximo registro (saída ou entrada) é decidido pela sequência do veículo.
import { opAssets } from '../lib/assetLifecycle';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore, assetKm } from '../lib/store';
import { registerGate } from '../lib/gate';
import { TRIP_PARAMS, lastGate, nextGateKind } from '../lib/trips';
import { BrandMark } from '../components/Layout';
import { Button, Field, Input, Select, SearchSelect, IconButton, TimeInput, toast, EmptyState, Card, confirmAction } from '../components/ui';
import { Dropzone } from '../components/Dropzone';
import { StatusDot, Plate, AssetName } from '../components/story';
import { Icon } from '../components/icons';
import { fmtT, shortDT } from '../lib/utils';

export default function PortariaApp() {
  const nav = useNavigate();
  const s = useStore();
  const session = s.session;
  useEffect(() => { if (!session) nav('/login'); }, [session]);
  const [q, setQ] = useState('');
  const [aid, setAid] = useState('');
  const [f, setF] = useState<any>(null);
  if (!session) return null;
  const vehs = opAssets(s).filter((x: any) => x.kind === 'veiculo' && x.plate);
  const norm = (x: string) => x.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const found = q ? vehs.filter((x: any) => norm(x.plate).includes(norm(q)) || norm(x.name).includes(norm(q))) : vehs;
  const asset = vehs.find((x: any) => x.id === aid);
  const kind = aid ? nextGateKind(s, aid) : 'saida';
  const last = aid ? lastGate(s, aid) : null;
  const pick = (id: string) => { setAid(id); setF({ driverId: vehs.find((x: any) => x.id === id)?.driverId || '', km: String(Math.round(assetKm(s, id))), photo: '', returnBy: `${TRIP_PARAMS.returnHour}:00` }); };
  const back = () => { setAid(''); setQ(''); };
  const save = () => {
    const err = registerGate({ assetId: aid, kind, driverId: f.driverId, km: +f.km || 0, photo: f.photo, returnBy: kind === 'saida' ? f.returnBy : undefined, by: session.name });
    if (err) return toast(err, { tone: 'crit' });
    toast(`${kind === 'saida' ? 'Saída' : 'Entrada'} de ${asset?.name} registrada.`); back();
  };
  const mine = [...(s.gateLog || [])].sort((p: any, q: any) => q.ts - p.ts).slice(0, 8);
  const name = (id: string) => s.assets.find((x: any) => x.id === id)?.name || '—';
  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 px-4 h-14 bg-canvas border-b border-line">
        <BrandMark size={30} /><div className="flex flex-col min-w-0 mr-auto"><span className="font-semibold text-body truncate">Portaria</span><span className="text-caption text-ink-2 truncate">{session.name}</span></div>
        <IconButton aria-label="Sair" title="Sair" onClick={async () => { if (await confirmAction({ title: 'Sair do sistema?', detail: 'Você precisará entrar novamente para acessar a plataforma.' })) { s.patch(() => ({ session: null })); nav('/login'); } }}><Icon name="sair" /></IconButton>
      </header>
      <main className="flex-1 w-full max-w-[560px] mx-auto px-4 pt-4 pb-28 anim-page">
        {!asset ? (
          <>
            <label htmlFor="placa" className="text-small font-medium text-ink-2">Placa do veículo</label>
            <div className="relative mt-tight mb-4">
              <Icon name="busca" size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-3" />
              <Input id="placa" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Digite parte da placa" autoCapitalize="characters" autoComplete="off" className="h-14 pl-12 text-h3 font-mono font-semibold uppercase placeholder:normal-case placeholder:font-sans placeholder:font-normal placeholder:text-body" />
            </div>
            <ul className="flex flex-col gap-2">
              {found.map((x: any) => { const out = nextGateKind(s, x.id) === 'entrada'; return (
                <li key={x.id}><button type="button" onClick={() => pick(x.id)} className="w-full min-h-[64px] flex items-center gap-3 px-4 py-3 bg-card border border-line rounded-card text-left transition-colors hover:bg-card-2 hover:border-line-strong active:bg-surface-hover">
                  <span className="flex flex-col items-start gap-1 mr-auto min-w-0"><Plate name={x.plate} /><span className="text-small text-ink-2 truncate max-w-full">{x.brand} {x.model}</span></span>
                  <StatusDot kind={out ? 'mov' : 'off'} label={out ? 'Na rua' : 'No pátio'} className="text-small text-ink-2 shrink-0" />
                  <Icon name="chevron" size={18} className="text-ink-3 shrink-0" />
                </button></li>); })}
              {!found.length && <li><EmptyState illustration="ilu-busca-veiculo" title="Nenhum veículo com essa placa" detail="Confira a placa digitada ou chame a central." /></li>}
            </ul>
            <h2 className="text-small font-medium text-ink-2 mt-8 mb-2">Últimos registros</h2>
            <ul className="flex flex-col">{mine.map((g: any) => <li key={g.id} className="flex items-center gap-3 py-stack border-t border-line first:border-t-0 text-body"><AssetName name={name(g.assetId)} /><span className="text-ink-2 mr-auto">{g.kind === 'saida' ? 'Saída' : 'Entrada'}</span><span className="num text-ink-2">{shortDT(g.ts)}</span></li>)}</ul>
          </>
        ) : (
          <div className="flex flex-col gap-4">
            <button type="button" onClick={back} className="self-start inline-flex items-center gap-1 h-11 -ml-2 px-2 rounded-btn text-body text-ink-2 hover:text-ink hover:bg-surface-hover"><Icon name="voltar" size={18} />Trocar veículo</button>
            <Card dense>
              <Plate name={asset.plate} size="lg" />
              <p className="text-body text-ink-2 mt-2">{asset.brand} {asset.model}</p>
              <p className="text-body mt-2">Registrar <span className="font-semibold">{kind === 'saida' ? 'saída' : 'entrada'}</span>{last && <span className="text-ink-2"> · último: {last.kind === 'saida' ? 'saída' : 'entrada'} <span className="num">{shortDT(last.ts)}</span>{last.kind === 'saida' && last.returnBy ? <>, volta prevista <span className="num">{fmtT(last.returnBy)}</span></> : ''}</span>}</p>
            </Card>
            <Field label="Motorista"><SearchSelect value={f.driverId} onChange={(v) => setF({ ...f, driverId: v })} placeholder="Escolha o motorista" options={s.drivers.map((d: any) => ({ value: d.id, label: d.name }))} /></Field>
            <Field label="Odômetro do painel (km)" hint="Já vem com o km do rastreador; corrija se o painel mostrar outro valor."><Input type="number" inputMode="numeric" value={f.km} onChange={(e) => setF({ ...f, km: e.target.value })} className="h-12 text-h3 num" /></Field>
            {kind === 'saida' && <Field label="Volta prevista"><TimeInput value={f.returnBy} onChange={(e) => setF({ ...f, returnBy: e.target.value })} /></Field>}
            <Dropzone label="Foto do veículo ou do painel" className="h-36" value={f.photo || undefined} onChange={(d: string) => setF({ ...f, photo: d })} />
          </div>
        )}
      </main>
      {asset && (
        <div className="fixed inset-x-0 bottom-0 bg-canvas border-t border-line px-4 py-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          <div className="max-w-[560px] mx-auto"><Button size="lg" className="w-full !h-14" variant={kind === 'saida' ? 'primary' : 'dark'} disabled={!f.driverId} onClick={save}>{kind === 'saida' ? 'Registrar saída' : 'Registrar entrada'}</Button>
            {!f.driverId && <p className="text-caption text-ink-2 text-center mt-tight">Escolha o motorista para registrar.</p>}</div>
        </div>
      )}
    </div>
  );
}
