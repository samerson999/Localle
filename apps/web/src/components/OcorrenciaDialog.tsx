// Detalhe da ocorrência (alerta que exige tratamento, ou bloqueio pendente): o que aconteceu, cada repetição enquanto
// aberta, e o encerramento com desfecho na própria janela — sem precisar ir ao Monitoramento para resolver.
// Padrão de central de monitoramento: ocorrência aberta → encerrada com motivo obrigatório (e observação), registrada
// com quem encerrou e quando (POST /alertas/:id/tratar, para cada alerta agrupado).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fmtDT, shortDT } from '@localle/shared/utils';
import { Button, Field, Modal, Pills, Textarea, toast } from './ui';
import { AssetName } from './story';
import { Icon } from './icons';
import { useStore } from '../lib/store';
import { needAge, type NeedItem } from '../lib/needs';
import { resolveReasons, TREAT_REASONS } from '../lib/critical';

export function OcorrenciaDialog({ item, onClose }: { item: NeedItem | null; onClose: () => void }) {
  const alerts = useStore((s) => s.alerts);
  const assets = useStore((s) => s.assets);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => { setReason(''); setNote(''); }, [item?.id]);
  const occ = item?.occ;
  const r = occ?.reason;
  const asset = occ ? assets.find((a: any) => a.id === occ.assetId) : null;
  const ids = new Set(r?.alertIds || []);
  // repetições do mesmo alerta enquanto a ocorrência está aberta, da mais recente para a mais antiga
  const vezes = alerts.filter((a: any) => ids.has(a.id)).sort((a: any, b: any) => b.ts - a.ts);
  const needNote = reason === 'Outro' && !note.trim();
  const encerrar = () => {
    if (!occ || !r) return;
    resolveReasons(occ.assetId, [r], { reason, note });
    toast('Ocorrência encerrada.');
    onClose();
  };
  return (
    <Modal open={!!occ} onClose={onClose} title="Ocorrência" width="max-w-lg"
      footer={<>
        {occ && <Link to={`/monitoramento?ativo=${occ.assetId}`} className="mr-auto self-center inline-flex items-center gap-tight text-small font-medium text-ink-2 hover:text-ink"><Icon name="monitoramento" size={16} />Ver no mapa</Link>}
        <Button variant="ghost" onClick={onClose}>Fechar</Button>
        <Button disabled={!reason || needNote} onClick={encerrar}>Encerrar ocorrência</Button>
      </>}>
      {r && (
        <>
          <div className="flex flex-col gap-hair">
            <p className="text-h3 font-medium">{r.title}</p>
            <p className="text-small text-ink-2">
              {asset && <><AssetName name={asset.name} /> · </>}
              <span title={`desde ${fmtDT(r.since)}`}>aberta {needAge(r.since)}</span>
            </p>
          </div>
          {r.kind === 'comando'
            ? <p className="text-body">{r.detail}</p>
            : vezes.length > 0 && (
              <section aria-label="Registros desta ocorrência">
                <p className="text-small text-ink-2 mb-tight">{vezes.length === 1 ? '1 registro' : `${vezes.length} registros enquanto aberta`}</p>
                <ol className="flex flex-col divide-y divide-line border-y border-line max-h-48 overflow-y-auto">
                  {vezes.map((a: any) => (
                    <li key={a.id} className="flex items-baseline gap-stack py-tight text-small">
                      <time className="num text-ink-2 whitespace-nowrap">{shortDT(a.ts)}</time>
                      <span className="min-w-0">{a.detail || a.title}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          <div role="group" aria-label="Desfecho" className="flex flex-col gap-tight">
            <p className="text-small font-medium">Desfecho</p>
            <Pills value={reason} onChange={setReason} options={TREAT_REASONS.map((x) => ({ key: x, label: x }))} />
          </div>
          <Field label="Observação" hint={reason === 'Outro' ? 'Obrigatória quando o desfecho é "Outro".' : 'Opcional. Fica no histórico com quem encerrou e quando.'}>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: motorista confirmou parada para descarga." />
          </Field>
        </>
      )}
    </Modal>
  );
}
