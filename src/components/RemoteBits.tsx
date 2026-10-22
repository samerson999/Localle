import { useStore } from '../lib/store';
import { useOdoAsk, applyOdometerCorrection } from '../lib/odometer';
import { Button, Modal, toast } from './ui';

// Pergunta, uma única vez, se o odômetro real deve ser corrigido após a instalação
export function OdometerAsk() {
  const ask = useOdoAsk((x) => x.ask);
  const asset = useStore((s) => s.assets.find((a: any) => a.id === ask?.assetId));
  if (!ask) return null;
  const close = () => useOdoAsk.setState({ ask: null });
  const diff = ask.informed - ask.expected;
  const fmt = (v: number) => v.toLocaleString('pt-BR');
  return (
    <Modal open onClose={close} title="Conferir odômetro" footer={<><Button variant="quiet" onClick={close}>Manter o km calculado</Button><Button onClick={() => { applyOdometerCorrection(ask.assetId, ask.informed); toast(`Odômetro de ${asset?.name} corrigido para ${fmt(ask.informed)} km.`); close(); }}>Corrigir para {fmt(ask.informed)} km</Button></>}>
      <p className="text-body leading-relaxed">O km informado agora para <span className="font-semibold">{asset?.name}</span> (<span className="font-semibold num">{fmt(ask.informed)} km</span>) está {diff > 0 ? 'acima' : 'abaixo'} do km calculado desde a instalação (<span className="font-semibold num">{fmt(ask.expected)} km</span>), uma diferença de <span className="num">{fmt(Math.abs(diff))} km</span>.</p>
      <p className="text-body text-ink-2 leading-relaxed">Deseja corrigir o odômetro real do veículo? {asset?.kmCalculated ? 'Este veículo está marcado como "km calculado". ' : ''}Esta pergunta aparece só uma vez por instalação.</p>
    </Modal>
  );
}
