// Imprime só o documento: o conteúdo vai para um portal fora do app e o resto da tela some na impressão.
import { useEffect, useState, ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function usePrint() {
  const [content, setContent] = useState<ReactNode>(null);
  useEffect(() => {
    if (!content) return;
    document.body.classList.add('printing-doc');
    const done = () => { document.body.classList.remove('printing-doc'); setContent(null); };
    window.addEventListener('afterprint', done, { once: true });
    const t = setTimeout(() => window.print(), 150);
    return () => { clearTimeout(t); window.removeEventListener('afterprint', done); };
  }, [content]);
  const portal = content ? createPortal(<div className="print-portal">{content}</div>, document.body) : null;
  return { print: (node: ReactNode) => setContent(node), portal };
}
