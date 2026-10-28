// Exportação dos relatórios: CSV, Excel (XLSX) e PDF, todos baixados direto pelo navegador (sem passar
// pela caixa de diálogo de impressão). NO PRODUTO REAL o backend pode gerar os três formatos sob demanda,
// mas o conteúdo e as colunas são os mesmos.
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export { fmtCoord } from './geocode';

export type ReportMeta = { empresa: string; periodo: string; filtros: string; emitidoEm: string };

export function csv(name: string, head: string[], rows: (string | number)[][]) {
  const esc = (x: any) => { const s = String(x ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const blob = new Blob(['﻿' + [head, ...rows].map((r) => r.map(esc).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
}

export function xlsx(name: string, meta: ReportMeta, head: string[], rows: (string | number)[][]) {
  const aoa = [[meta.empresa], [meta.periodo], [meta.filtros], [`Emitido em ${meta.emitidoEm}`], [], head, ...rows];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Relatório');
  XLSX.writeFile(wb, name);
}

// Nome de arquivo no padrão Localle: Relatorio_<Titulo>_<placa ou intervalo de dias>.pdf
export function pdfFileName(titulo: string, from: number, to: number, filtro?: string) {
  const slug = titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_');
  const d2 = (n: number) => String(n).padStart(2, '0');
  const partsOf = (ms: number) => { const d = new Date(ms); return { day: d2(d.getDate()), month: d2(d.getMonth() + 1), year: d.getFullYear() }; };
  const a = partsOf(from), b = partsOf(to);
  const datePart = filtro
    ? `${filtro}_${b.day}-${b.month}-${b.year}`
    : a.day === b.day && a.month === b.month && a.year === b.year ? `${a.day}-${a.month}-${a.year}`
    : a.month === b.month && a.year === b.year ? `${a.day}-${b.day}-${a.month}-${a.year}`
    : `${a.day}-${a.month}-${a.year}_a_${b.day}-${b.month}-${b.year}`;
  return `Relatorio_${slug}_${datePart}.pdf`;
}

export type PdfMetaItem = { label: string; value: string };
export type PdfSection = { title: string; head: string[]; rows: (string | number)[][] };

const ROLE_LABEL: Record<string, string> = { gestor: 'gestor', revenda: 'revenda', locale: 'administrador', portaria: 'portaria' };

// A fonte padrão do jsPDF (helvetica/WinAnsi) não tem glifo para →/–/— etc.: sem isso o texto não quebra
// certo (splitTextToSize erra a largura) e uma coluna invade a outra. Troca por equivalentes em ASCII.
const clean = (s: unknown) => String(s ?? '').replace(/[→➝➔↦]/g, '-').replace(/[–—]/g, '-');

// PDF no padrão visual da Localle: faixa azul com logo e título no cabeçalho, caixa de metadados do
// filtro, seções com tabela de cabeçalho escuro, e rodapé com emissor/usuário/página em todas as páginas.
export function pdf(opts: { file: string; titulo: string; cliente: string; usuario: string; role: string; meta: PdfMetaItem[]; sections: PdfSection[]; nota?: string }) {
  const { file, titulo, cliente, usuario, role, meta, sections, nota } = opts;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 28;
  const emitidoEm = new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const header = () => {
    doc.setFillColor(29, 78, 216);
    doc.rect(0, 0, W, 50, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text('LOCALLE', M, 21);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    doc.text('Soluções em Rastreamento', M, 33);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text(clean(titulo), W - M, 21, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    doc.text(clean(`Cliente: ${cliente} · Emitido em ${emitidoEm}`), W - M, 33, { align: 'right' });
  };

  const footer = () => {
    const n = (doc as any).getCurrentPageInfo().pageNumber;
    doc.setDrawColor(224); doc.setLineWidth(0.5);
    doc.line(M, H - 28, W - M, H - 28);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(130);
    doc.text(clean(`Gerado por Plataforma Localle · Usuário: ${usuario} (${ROLE_LABEL[role] || role}) · Horários em America/Recife (UTC-3) · Dados de exemplo`), M, H - 16);
    doc.text(`Página ${n}`, W - M, H - 16, { align: 'right' });
  };

  const metaBox = (y: number) => {
    const colW = (W - 2 * M) / meta.length;
    const boxH = 36;
    doc.setFillColor(246, 248, 251);
    doc.rect(M, y, W - 2 * M, boxH, 'F');
    meta.forEach((m, i) => {
      const x = M + 10 + i * colW;
      doc.setTextColor(120); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
      doc.text(clean(m.label), x, y + 13);
      doc.setTextColor(30); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
      doc.text(doc.splitTextToSize(clean(m.value), colW - 18), x, y + 24);
    });
    return y + boxH + 16;
  };

  sections.forEach((s, i) => {
    const startY = i === 0 ? metaBox(62) : (doc as any).lastAutoTable.finalY + 24;
    doc.setTextColor(20); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text(clean(s.title), M, startY);
    autoTable(doc, {
      head: [s.head.map(clean)],
      body: s.rows.length ? s.rows.map((r) => r.map(clean)) : [[clean('Nada para exportar neste período.')]],
      startY: startY + 8,
      margin: { left: M, right: M, top: 62, bottom: 34 },
      styles: { fontSize: 7.5, cellPadding: 4, textColor: 40 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
      didParseCell: (data) => { if (data.row.section === 'body' && String(data.row.raw?.[0]).trim() === 'Total') data.cell.styles.fontStyle = 'bold'; },
      didDrawPage: () => { header(); footer(); },
    });
  });

  if (nota) {
    const y = (doc as any).lastAutoTable.finalY + 16;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120);
    doc.text(doc.splitTextToSize(clean(nota), W - 2 * M), M, y);
  }

  doc.save(file);
}
