import { useEffect, useRef, useState } from 'react';
import type { ComponentType, SVGProps } from 'react';
import { Modal, Button, Progress, cx } from './ui';
import { Icon } from './icons';
import IconExcel from '~icons/vscode-icons/file-type-excel2';
import IconCsv from '~icons/vscode-icons/file-type-csv';
import IconPdf from '~icons/vscode-icons/file-type-pdf2';

// Modal padrão de exportação de relatório: formato (XLSX recomendado, CSV, PDF), resumo do que será
// incluído e uma animação de progresso enquanto "gera" o arquivo. Reutilizado por toda tela de relatório
// (Cercas, Velocidade, Posições, Passou por aqui, ...): só mudam título, período, itens e a exportação em si.
export type ExportFormat = 'xlsx' | 'csv' | 'pdf';

const FORMATOS: { key: ExportFormat; nome: string; ext: string; detalhe: string; icon: ComponentType<SVGProps<SVGSVGElement>>; tone: string; recomendado?: boolean }[] = [
  { key: 'xlsx', nome: 'Excel (.xlsx)', ext: 'XLSX', detalhe: 'Planilha formatada, com filtros e resumo por veículo.', icon: IconExcel, tone: 'bg-real-soft', recomendado: true },
  { key: 'csv', nome: 'CSV (.csv)', ext: 'CSV', detalhe: 'Dados tabulares para importar em outros sistemas.', icon: IconCsv, tone: 'bg-surface-muted' },
  { key: 'pdf', nome: 'PDF (.pdf)', ext: 'PDF', detalhe: 'Documento de apresentação com identificação da empresa.', icon: IconPdf, tone: 'bg-crit-soft' },
];

export function ExportReportModal({ open, onClose, titulo, periodo, itens, resumo, onExport }: {
  open: boolean;
  onClose: () => void;
  titulo: string;
  periodo: string;
  itens: string[];
  resumo: string;
  onExport: (format: ExportFormat) => void;
}) {
  const [formato, setFormato] = useState<ExportFormat>('xlsx');
  const [gerando, setGerando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const raf = useRef(0);

  useEffect(() => { if (!open) { setGerando(false); setProgresso(0); setFormato('xlsx'); cancelAnimationFrame(raf.current); } }, [open]);

  const gerar = () => {
    setGerando(true);
    setProgresso(0);
    const t0 = performance.now(), ms = 1100;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setProgresso(k);
      if (k < 1) { raf.current = requestAnimationFrame(step); return; }
      onExport(formato);
      onClose();
    };
    raf.current = requestAnimationFrame(step);
  };

  const atual = FORMATOS.find((f) => f.key === formato)!;

  return (
    <Modal open={open} onClose={gerando ? () => {} : onClose} title="Exportar relatório" width="max-w-md"
      footer={gerando ? undefined : (
        <>
          <span className="text-small text-ink-2 num mr-auto">{resumo}</span>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={gerar}>Gerar {atual.ext}</Button>
        </>
      )}>
      <p className="text-small text-ink-2 -mt-field">{titulo} · {periodo}</p>

      {gerando ? (
        <div className="flex flex-col items-center gap-stack py-card text-center">
          <span className={cx('w-12 h-12 rounded-pill flex items-center justify-center', atual.tone)}><atual.icon width={24} height={24} /></span>
          <p className="text-body font-semibold">Gerando relatório em {atual.ext}…</p>
          <p className="text-small text-ink-2">{resumo}</p>
          <Progress value={progresso} className="h-2 w-full max-w-[280px]" label={`Gerando relatório, ${Math.round(progresso * 100)}%`} />
          <span className="text-caption text-ink-3 num">{Math.round(progresso * 100)}%</span>
        </div>
      ) : (
        <>
          <div role="radiogroup" aria-label="Formato do relatório" className="flex flex-col gap-tight">
            {FORMATOS.map((f) => {
              const on = formato === f.key;
              return (
                <button key={f.key} type="button" role="radio" aria-checked={on} onClick={() => setFormato(f.key)}
                  className={cx('flex items-center gap-stack p-stack rounded-ctl border text-left transition-colors', on ? 'border-brand-fill bg-surface-selected' : 'border-line hover:bg-card-2')}>
                  <span className={cx('w-9 h-9 rounded-ctl flex items-center justify-center shrink-0', f.tone)}><f.icon width={18} height={18} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-tight flex-wrap"><span className="text-small font-semibold text-ink">{f.nome}</span>{f.recomendado && <span className="text-caption font-medium text-ink bg-real-soft px-2 py-[1px] rounded-pill">Recomendado</span>}</span>
                    <span className="block text-caption text-ink-2">{f.detalhe}</span>
                  </span>
                  <span aria-hidden="true" className={cx('w-5 h-5 rounded-pill border-2 shrink-0 flex items-center justify-center', on ? 'border-brand-fill' : 'border-line-strong')}>{on && <span className="w-2.5 h-2.5 rounded-pill bg-brand-fill" />}</span>
                </button>
              );
            })}
          </div>

          <div className="rounded-ctl bg-card-2 p-stack">
            <p className="text-small font-medium text-ink mb-tight">O relatório incluirá</p>
            <ul className="flex flex-col gap-hair">
              {itens.map((it) => <li key={it} className="flex items-center gap-icon text-small text-ink-2"><Icon name="ok" size={14} className="text-real shrink-0" />{it}</li>)}
            </ul>
          </div>
        </>
      )}
    </Modal>
  );
}
