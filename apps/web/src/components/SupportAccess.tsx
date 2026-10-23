// Cartão "Acesso de suporte" dos painéis da revenda e da Locale: números agregados do cliente, entrada com motivo
// e o registro de quem acessou.
import { opAssets } from '../lib/assetLifecycle';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStoreData } from '../lib/store';
import { useNeedsYou } from '../lib/needs';
import { startSupport, supportBlock, SUPPORT_PARAMS } from '../lib/support';
import { Button, Card, Field, Table, Textarea, Callout, toast, EmptyState } from './ui';
import { KpiTile } from './story';
import { fmtDT, hm } from '@localle/shared/utils';

export default function SupportAccess() {
  const s = useStoreData(15000); // contagem de veículos comunicando a cada 15 s
  const nav = useNavigate();
  const needs = useNeedsYou();
  const [reason, setReason] = useState('');
  const vehicles = opAssets(s).filter((a: any) => a.kind === 'veiculo');
  const online = vehicles.filter((a: any) => s.vehicles[a.id] && !s.vehicles[a.id].noSignal).length;
  const mods = Object.values(s.revenda.modules).filter(Boolean).length;
  const blocked = supportBlock(s);
  const enter = () => {
    const err = startSupport(reason);
    if (err) return toast(err, { tone: 'crit' });
    toast(`Acesso de suporte a ${s.revenda.clientName} registrado.`, { detail: 'Tudo o que você abrir fica no registro deste acesso.' });
    nav('/monitoramento');
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile label="Veículos do cliente" value={vehicles.length} sub={`${online} comunicando agora`} />
        <KpiTile label="Itens críticos" value={needs.length} status={needs.length ? 'crit' : undefined} sub="Só a contagem; o detalhe exige acesso de suporte" />
        <KpiTile label="Módulos contratados" value={mods} />
        <KpiTile label="Acessos de suporte (30 dias)" value={(s.supportLog || []).filter((x: any) => x.at > Date.now() - 30 * 86400000).length} />
      </div>
      <div className="grid xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] gap-4 items-start">
        <Card title={`Entrar como ${s.revenda.clientName}`} icon="cadeado">
          <div className="flex flex-col gap-3">
            <p className="text-small text-ink-2">A operação da frota é do cliente. Para vê-la, informe o motivo: o acesso fica registrado com o seu nome, a data e o motivo.{SUPPORT_PARAMS.requireConsent && ' Este cliente exige liberação prévia.'}</p>
            {blocked && <Callout>{blocked}</Callout>}
            <Field label="Motivo do acesso" hint="Ex.: chamado 4821, cliente pediu ajuda para configurar uma cerca"><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            <Button disabled={!!blocked || reason.trim().length < SUPPORT_PARAMS.minReason} onClick={enter}>Entrar como cliente</Button>
          </div>
        </Card>
        <Card title="Registro de acessos de suporte" icon="historico">
          <Table minWidth={680} emptyState={<EmptyState icon="cadeado" title="Nenhum acesso de suporte registrado" detail="Cada entrada como cliente fica aqui com quem, quando e o motivo." />} head={['Início', 'Quem', 'Cliente', 'Motivo', 'Duração']} rows={(s.supportLog || []).map((x: any) => [<span className="num">{fmtDT(x.at)}</span>, x.by, x.client, <span className="text-small">{x.reason}</span>, x.endedAt ? <span className="num">{hm(x.endedAt - x.at)}</span> : <span className="text-ink-2">em andamento</span>])} />
        </Card>
      </div>
    </div>
  );
}
