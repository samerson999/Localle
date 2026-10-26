import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { useStore } from '../lib/store';
import { GlideMarker, Address, TILE, ATTR } from '../components/MapBits';
import { categoryOf } from '../components/assetArt';
import { StatusDot, statusKind, Plate } from '../components/story';
import { EmptyState, DescList, DescRow } from '../components/ui';
import { vehicleStatus } from '../lib/store';
import { fmtDT, fmtT } from '@localle/shared/utils';
import { shareState, recordOpen } from '../lib/shares';
import { abrirLinkPublico, type LinkPublico } from '../lib/localleApi';

// Página pública do link de localização (sem login): só o veículo do link, sem motorista, histórico nem comandos.
// Link do backend (token "lc.…"): validado na API pública, que devolve só placa e posição atual enquanto o
// link vale e registra a abertura. Links antigos da simulação ("lk…") seguem abrindo só neste navegador.
function Follow({ pos }: { pos?: [number, number] }) { const m = useMap(); useEffect(() => { if (pos) m.panTo(pos, { animate: true }); }, [pos?.[0], pos?.[1]]); return null; }

export default function Compartilhar() {
  const { token } = useParams();
  const real = !!token?.startsWith('lc.');
  const share = useStore((s) => (real ? null : (s.shares || []).find((x: any) => x.token === token)));
  const assetLocal = useStore((s) => s.assets.find((a: any) => a.id === share?.assetId));
  const vLocal = useStore((s) => (share ? s.vehicles[share.assetId] : null));
  // link real: primeira chamada conta como abertura; depois atualiza a posição a cada 30 s
  const [pub, setPub] = useState<LinkPublico | { motivo: string } | null>(null);
  useEffect(() => {
    if (!real || !token) return;
    let vivo = true, primeira = true;
    const carregar = () => abrirLinkPublico(token, primeira).then((r) => { primeira = false; if (vivo) setPub(r); }).catch(() => {});
    carregar();
    const i = setInterval(carregar, 30000);
    return () => { vivo = false; clearInterval(i); };
  }, [token]);
  const dadosPub = pub && !('motivo' in pub) ? pub : null;
  const asset = real ? (dadosPub ? { name: dadosPub.placa } : null) : assetLocal;
  const v = real
    ? dadosPub?.posicao ? { pos: [dadosPub.posicao.lat, dadosPub.posicao.lon] as [number, number], heading: 0, lastUpdate: Date.parse(dadosPub.posicao.fixTime), moving: (dadosPub.posicao.speedKmh ?? 0) > 3, ignition: !!dadosPub.posicao.ignition } : null
    : vLocal;
  const expiresAt = real ? (dadosPub ? Date.parse(dadosPub.expiraEm) : 0) : share?.expiresAt;
  const brand = useStore((s) => s.revenda.branding);
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(i); }, []); // expira sozinho na tela
  // a simulação roda na aba do gestor: acompanha a posição que ela grava no navegador
  useEffect(() => { if (real) return; const f = () => (useStore as any).persist?.rehydrate(); window.addEventListener('storage', f); return () => window.removeEventListener('storage', f); }, []);
  const st = real ? (!pub ? 'carregando' : 'motivo' in pub ? pub.motivo : Date.now() > (expiresAt || 0) ? 'expirado' : 'ativo') : share ? shareState(share) : 'invalido';
  // uma abertura por carregamento da página, só enquanto o link vale
  useEffect(() => { if (share && shareState(share) === 'ativo') recordOpen(share.token); }, [share?.token]);

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <header className="flex items-center gap-3 px-4 sm:px-6 h-14 bg-card border-b border-line">
        {brand.logo ? <img src={brand.logo} alt={brand.name} className="h-7" /> : <span className="text-h3 font-semibold">{brand.name}</span>}
        <span className="text-small text-ink-2 ml-auto">Localização compartilhada</span>
      </header>
      {st !== 'ativo' || !asset || !v ? (
        <main className="flex-1 flex items-center justify-center p-6">
          <EmptyState illustration="ilu-link-expirado" size="page" title={st === 'carregando' ? 'Carregando a localização…' : st === 'expirado' ? 'Este link expirou' : st === 'revogado' ? 'Este link foi desativado' : st === 'ativo' ? 'O veículo ainda não enviou posição' : 'Link inválido'} detail="Peça um novo link a quem compartilhou a localização com você." />
        </main>
      ) : (
        <main className="flex-1 flex flex-col md:flex-row">
          <section aria-label="Mapa" className="flex-1 min-h-[60vh] relative">
            <MapContainer center={v.pos} zoom={15} className="absolute inset-0">
              <TileLayer url={TILE} attribution={ATTR} keepBuffer={6} updateWhenZooming={false} />
              <GlideMarker position={v.pos} heading={v.heading} kind={statusKind(vehicleStatus(v).key)} category={categoryOf(asset)} plate={asset.name} />
              <Follow pos={v.pos} />
            </MapContainer>
          </section>
          <aside className="md:w-[320px] bg-card border-t md:border-t-0 md:border-l border-line p-5 flex flex-col gap-3">
            <h1 className="sr-only">Localização de {asset.name}</h1>
            <Plate name={asset.name} size="lg" className="self-start" />
            <p className="text-small text-ink-2">{asset.brand} {asset.model}</p>
            <StatusDot kind={statusKind(vehicleStatus(v).key)} className="text-body" />
            <DescList>
              <DescRow label="Onde está" stacked><Address pos={v.pos} className="text-body" /></DescRow>
              <DescRow label="Atualizado" stacked><time className="num text-body">{fmtT(v.lastUpdate)}</time></DescRow>
            </DescList>
            <p className="text-caption text-ink-2 mt-auto">Link válido até {fmtDT(expiresAt)}.{brand.supportPhone ? ` Dúvidas: ${brand.supportPhone}.` : ''}</p>
          </aside>
        </main>
      )}
    </div>
  );
}
