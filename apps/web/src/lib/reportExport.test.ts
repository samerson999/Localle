import { describe, expect, it, vi } from 'vitest';
import { fmtCoord } from './reportExport';

// jsPDF sem download: guarda o conteúdo gerado para o teste ler
vi.mock('jspdf', async (orig) => {
  const m: any = await orig();
  class SemDownload extends m.default {
    constructor(...a: any[]) { super(...a); (this as any).save = () => { (globalThis as any).__pdf = (this as any).output(); return this; }; }
  }
  return { ...m, default: SemDownload };
});

// Sprint de monitoramento 28/10/2026, bug 4: coordenada exportada com casas variáveis/mal lida no Excel.
describe('fmtCoord', () => {
  it('6 casas fixas, ponto decimal, sinal preservado', () => {
    expect(fmtCoord(-8.0512345678)).toBe('-8.051235');
    expect(fmtCoord(-34.9)).toBe('-34.900000');
    expect(fmtCoord('-8.05')).toBe('-8.050000'); // a API devolve numeric como texto
    expect(fmtCoord(0)).toBe('0.000000');
  });

  it('sem valor válido sai vazio, nunca "NaN"', () => {
    expect(fmtCoord(null)).toBe('');
    expect(fmtCoord(undefined)).toBe('');
    expect(fmtCoord('')).toBe('');
    expect(fmtCoord('abc')).toBe('');
  });
});

// Sprint de monitoramento 28/10/2026, melhoria 5: identidade da revenda no cabeçalho e paginação "N de M".
describe('PDF dos relatórios', () => {
  it('cor da marca: usa a da revenda; cor clara pede texto escuro; inválida cai no azul da Localle', async () => {
    const { corDaMarca } = await import('./reportExport');
    expect(corDaMarca('#2251E6')).toEqual({ rgb: [34, 81, 230], textoEscuro: false });
    expect(corDaMarca('#FACC15').textoEscuro).toBe(true);
    expect(corDaMarca('azul').rgb).toEqual([34, 81, 230]);
    expect(corDaMarca(undefined).rgb).toEqual([34, 81, 230]);
  });

  it('várias páginas: rodapé com "Página N de M" preenchido e nome da marca no cabeçalho', async () => {
    const { pdf } = await import('./reportExport');
    const rows = Array.from({ length: 120 }, (_, i) => [`linha ${i}`, i]);
    pdf({ file: 't.pdf', titulo: 'Teste', cliente: 'Cliente X', usuario: 'Ana', role: 'gestor', meta: [{ label: 'Período', value: 'hoje' }],
      sections: [{ title: 'Seção', head: ['A', 'B'], rows }], marca: { name: 'Revenda Exemplo', tagline: 'Rastreamento', color: '#0F766E' } });
    const saida: string = (globalThis as any).__pdf;
    const paginas = (saida.match(/\/Type \/Page\b/g) || []).length;
    expect(paginas).toBeGreaterThan(1);
    expect(saida).toContain(`de ${paginas}`);
    expect(saida).not.toContain('{total}');
    expect(saida).toContain('Revenda Exemplo');
  });
});
