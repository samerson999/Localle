// Diálogo de tratamento: motivo rápido em chips (obrigatório) e observação opcional.
import { useEffect, useState } from 'react';
import { Button, Field, Modal, Pills, Textarea, cx } from './ui';
import { TREAT_REASONS, type Treatment } from '../lib/critical';

export function TreatDialog({ subject, detail, onConfirm, onClose }: { subject: string | null; detail?: string; onConfirm: (t: Treatment) => void; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => { if (subject) { setReason(''); setNote(''); } }, [subject]);
  const needNote = reason === 'Outro' && !note.trim();
  return (
    <Modal open={!!subject} onClose={onClose} title="Tratar pendência" width="max-w-lg"
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button disabled={!reason || needNote} onClick={() => { onConfirm({ reason, note }); onClose(); }}>Confirmar tratamento</Button></>}>
      <div>
        <p className="text-h3 font-medium">{subject}</p>
        {detail && <p className="text-small text-ink-2 mt-hair">{detail}</p>}
      </div>
      <div role="group" aria-label="Motivo">
        <Pills value={reason} onChange={setReason} options={TREAT_REASONS.map((r) => ({ key: r, label: r }))} />
      </div>
      <Field label="Observação" hint={reason === 'Outro' ? 'Obrigatória quando o motivo é "Outro".' : 'Opcional.'}>
        <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: motorista confirmou parada para descarga." />
      </Field>
    </Modal>
  );
}

// "Tratado por Ana às 14:32 · Contato com o motorista · obs."
export function TreatedLine({ by, at, reason, note, className = '' }: { by: string; at: number; reason?: string; note?: string; className?: string }) {
  const t = new Date(at);
  const hh = t.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const day = t.toDateString() === new Date().toDateString() ? '' : `${t.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} `;
  return (
    <p className={cx('text-caption text-ink-2', className)}>
      Tratado por {by} às <time className="num">{day}{hh}</time>{reason && <> · <span className="text-ink">{reason}</span></>}{note && <> · “{note}”</>}
    </p>
  );
}
