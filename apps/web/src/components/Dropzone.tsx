// Área para soltar ou escolher um arquivo (imagem), com prévia, troca, remoção e erro no próprio lugar.
// multiple: só adiciona (chama onChange uma vez por arquivo, sem prévia); a lista fica com a página.
import { useId, useRef, useState } from 'react';
import { fileToDataURL } from '@localle/shared/utils';
import { Icon } from './icons';
import { cx } from './ui';

export function Dropzone({ value, onChange, label, hint, accept = 'image/*', maxMB = 4, required, className = 'h-44', previewAlt, fileName, multiple, fit = 'cover' }: {
  value?: string; onChange: (data: string, file?: File) => void; label: string; hint?: string; fileName?: string;
  accept?: string; maxMB?: number; required?: boolean; className?: string; previewAlt?: string; multiple?: boolean; fit?: 'cover' | 'contain';
}) {
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [over, setOver] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const accepts = (f: File) => accept.split(',').some((a) => { a = a.trim(); return a.endsWith('/*') ? f.type.startsWith(a.slice(0, -1)) : a.startsWith('.') ? f.name.toLowerCase().endsWith(a) : f.type === a; });
  const take = async (files?: FileList | null) => {
    for (const f of Array.from(files || [])) await takeOne(f);
  };
  const takeOne = async (f: File) => {
    if (!accepts(f)) return setErr(accept === 'image/*' ? `"${f.name}" não é uma imagem. Envie JPG, PNG ou WebP.` : `"${f.name}" não é um formato aceito.`);
    if (f.size > maxMB * 1024 * 1024) return setErr(`"${f.name}" tem ${(f.size / 1048576).toFixed(1).replace('.', ',')} MB; o limite é ${maxMB} MB.`);
    setErr(''); setBusy(true);
    try { onChange(await fileToDataURL(f), f); } catch { setErr('Não foi possível ler o arquivo. Tente de novo.'); }
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-tight min-w-0">
      <span id={`${id}-l`} className="text-small font-medium text-ink-2">{label}{required && <span className="text-ink-3"> · obrigatório</span>}</span>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(multiple ? e.dataTransfer.files : e.dataTransfer.files?.length ? [e.dataTransfer.files[0]] as any : null); }}
        className={cx('relative rounded-ctl overflow-hidden transition-colors', className,
          value ? 'border border-line' : cx('border border-dashed', over ? 'border-ink bg-surface-muted' : err ? 'border-crit bg-card-2' : 'border-line-strong bg-card-2 hover:bg-surface-muted'))}>
        {value && !multiple ? (
          <>
            {value.startsWith('data:image') ? <img src={value} alt={previewAlt || label} className={cx('w-full h-full', fit === 'contain' ? 'object-contain p-2' : 'object-cover')} />
              : <span className="w-full h-full flex items-center gap-2 px-4 text-body bg-card-2"><Icon name="multas" size={20} className="text-ink-3 shrink-0" /><span className="truncate">{fileName || 'Arquivo anexado'}</span></span>}
            <div className="absolute bottom-2 right-2 flex gap-tight">
              <button type="button" onClick={() => input.current?.click()} className="h-8 px-3 rounded-btn bg-card text-caption font-medium shadow-float hover:bg-card-2">Trocar</button>
              <button type="button" onClick={() => { onChange(''); setErr(''); }} className="h-8 px-3 rounded-btn bg-card text-caption font-medium shadow-float hover:bg-card-2">Remover</button>
            </div>
          </>
        ) : (
          <button type="button" aria-labelledby={`${id}-l`} aria-describedby={`${id}-h`} onClick={() => input.current?.click()} className="w-full h-full flex flex-col items-center justify-center gap-tight px-4 text-center">
            <Icon name={busy ? 'reiniciar' : 'camera'} size={22} className={cx('text-ink-3', busy && 'animate-spin')} />
            <span className="text-body font-medium">{over ? 'Solte para enviar' : multiple ? <>Arraste os arquivos aqui ou <span className="underline underline-offset-[3px]">escolha</span></> : <>Arraste {accept === 'image/*' ? 'a imagem' : 'o arquivo'} aqui ou <span className="underline underline-offset-[3px]">escolha um arquivo</span></>}</span>
            <span id={`${id}-h`} className="text-caption text-ink-2">{hint || `JPG, PNG ou WebP até ${maxMB} MB`}</span>
          </button>
        )}
        <input ref={input} type="file" accept={accept} multiple={multiple} className="hidden" onChange={async (e) => { await take(e.target.files); e.target.value = ''; }} />
      </div>
      {err && <p role="alert" className="text-caption text-crit-ink">{err}</p>}
    </div>
  );
}
