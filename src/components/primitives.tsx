// Primitivas de layout: aplicam as regras de espaçamento (tokens.css › espaçamento) sem classes soltas nas telas.
// Proximidade: o espaço dentro de um grupo é sempre menor que o espaço entre grupos.
//   página → seções: Stack gap="section" (40) · seção → cards: Grid (16) · dentro do card: Stack gap="stack" (12)
//   item com título e apoio: Stack gap="hair" (4) · chips e botões em linha: Cluster (8)
// Os nomes das classes estão por extenso nos mapas para o Tailwind encontrá-los.
import React, { createContext, useContext } from 'react';

const cx = (...a: any[]) => a.filter(Boolean).join(' ');

export type Gap = 'section' | 'group' | 'grid' | 'field' | 'card-head' | 'stack' | 'tight' | 'hair' | 'none';
const GAP: Record<Gap, string> = { section: 'gap-section', group: 'gap-group', grid: 'gap-grid', field: 'gap-field', 'card-head': 'gap-card-head', stack: 'gap-stack', tight: 'gap-tight', hair: 'gap-hair', none: '' };
const GAP_X: Record<Gap, string> = { section: 'gap-x-section', group: 'gap-x-group', grid: 'gap-x-grid', field: 'gap-x-field', 'card-head': 'gap-x-card-head', stack: 'gap-x-stack', tight: 'gap-x-tight', hair: 'gap-x-hair', none: '' };
const GAP_Y: Record<Gap, string> = { section: 'gap-y-section', group: 'gap-y-group', grid: 'gap-y-grid', field: 'gap-y-field', 'card-head': 'gap-y-card-head', stack: 'gap-y-stack', tight: 'gap-y-tight', hair: 'gap-y-hair', none: '' };

type Box = { as?: keyof JSX.IntrinsicElements; className?: string; children?: React.ReactNode } & Omit<React.HTMLAttributes<HTMLElement>, 'className' | 'children'>;

// Empilhamento vertical. align stretch (padrão) = filhos na largura toda; start = cada um na sua largura.
export function Stack({ gap = 'stack', align = 'stretch', as = 'div', className = '', children, ...p }: Box & { gap?: Gap; align?: 'stretch' | 'start' | 'center' | 'end' }) {
  const Tag = as as any;
  return <Tag {...p} className={cx('flex flex-col min-w-0', GAP[gap], { stretch: '', start: 'items-start', center: 'items-center', end: 'items-end' }[align], className)}>{children}</Tag>;
}

// Itens em linha, com quebra (chips, botões, filtros, ícone + texto). rowGap = espaço entre linhas quando quebra.
export function Cluster({ gap = 'tight', rowGap, align = 'center', justify = 'start', wrap = true, as = 'div', className = '', children, ...p }: Box & { gap?: Gap; rowGap?: Gap; align?: 'center' | 'start' | 'end' | 'baseline' | 'stretch'; justify?: 'start' | 'between' | 'end'; wrap?: boolean }) {
  const Tag = as as any;
  return <Tag {...p} className={cx('flex min-w-0', wrap && 'flex-wrap', rowGap ? cx(GAP_X[gap], GAP_Y[rowGap]) : GAP[gap],
    { center: 'items-center', start: 'items-start', end: 'items-end', baseline: 'items-baseline', stretch: 'items-stretch' }[align],
    { start: '', between: 'justify-between', end: 'justify-end' }[justify], className)}>{children}</Tag>;
}

// Grade de 12 colunas. Todos os cards de uma tela começam e terminam nas mesmas linhas da grade.
//   cols: colunas iguais, com a progressão por largura já decidida (2 → md; 3 → md 2, lg 3; 4 → sm 2, lg 4; 6 → 2, sm 3, lg 6).
//   split: duas colunas desiguais a partir de lg, em doze avos ("5/7" = 5 + 7 colunas); os filhos se alternam.
//   5 colunas não cabem em 12: cols={5} usa uma grade própria (2, md 3, xl 5) e só deve formar a linha inteira de KPIs.
//   equal: cards da linha com a mesma altura. Só quando o conteúdo é equivalente (mesma anatomia); senão alinham ao topo.
type Cols = 1 | 2 | 3 | 4 | 5 | 6;
const COLS: Record<Cols, string> = {
  1: 'grid-cols-12 [&>*]:col-span-12',
  2: 'grid-cols-12 [&>*]:col-span-12 md:[&>*]:col-span-6',
  3: 'grid-cols-12 [&>*]:col-span-12 md:[&>*]:col-span-6 lg:[&>*]:col-span-4',
  4: 'grid-cols-12 [&>*]:col-span-12 sm:[&>*]:col-span-6 lg:[&>*]:col-span-3',
  5: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-5',
  6: 'grid-cols-12 [&>*]:col-span-6 sm:[&>*]:col-span-4 lg:[&>*]:col-span-2',
};
export type Split = '3/9' | '4/8' | '5/7' | '6/6' | '7/5' | '8/4' | '9/3';
const SPLIT: Record<Split, string> = {
  '3/9': 'grid-cols-12 [&>*]:col-span-12 lg:[&>*:nth-child(odd)]:col-span-3 lg:[&>*:nth-child(even)]:col-span-9',
  '4/8': 'grid-cols-12 [&>*]:col-span-12 lg:[&>*:nth-child(odd)]:col-span-4 lg:[&>*:nth-child(even)]:col-span-8',
  '5/7': 'grid-cols-12 [&>*]:col-span-12 lg:[&>*:nth-child(odd)]:col-span-5 lg:[&>*:nth-child(even)]:col-span-7',
  '6/6': 'grid-cols-12 [&>*]:col-span-12 lg:[&>*]:col-span-6',
  '7/5': 'grid-cols-12 [&>*]:col-span-12 lg:[&>*:nth-child(odd)]:col-span-7 lg:[&>*:nth-child(even)]:col-span-5',
  '8/4': 'grid-cols-12 [&>*]:col-span-12 lg:[&>*:nth-child(odd)]:col-span-8 lg:[&>*:nth-child(even)]:col-span-4',
  '9/3': 'grid-cols-12 [&>*]:col-span-12 lg:[&>*:nth-child(odd)]:col-span-9 lg:[&>*:nth-child(even)]:col-span-3',
};
// wide: a divisão só acontece a partir de xl (gráficos lado a lado precisam de largura); vale para cols={2} e split.
const WIDE: Partial<Record<Split | '2', string>> = {
  '2': 'grid-cols-12 [&>*]:col-span-12 xl:[&>*]:col-span-6',
  '6/6': 'grid-cols-12 [&>*]:col-span-12 xl:[&>*]:col-span-6',
  '4/8': 'grid-cols-12 [&>*]:col-span-12 xl:[&>*:nth-child(odd)]:col-span-4 xl:[&>*:nth-child(even)]:col-span-8',
  '5/7': 'grid-cols-12 [&>*]:col-span-12 xl:[&>*:nth-child(odd)]:col-span-5 xl:[&>*:nth-child(even)]:col-span-7',
  '7/5': 'grid-cols-12 [&>*]:col-span-12 xl:[&>*:nth-child(odd)]:col-span-7 xl:[&>*:nth-child(even)]:col-span-5',
  '8/4': 'grid-cols-12 [&>*]:col-span-12 xl:[&>*:nth-child(odd)]:col-span-8 xl:[&>*:nth-child(even)]:col-span-4',
};
export function Grid({ cols, split, wide = false, gap = 'grid', equal = false, as = 'div', className = '', children, ...p }: Box & { cols?: Cols; split?: Split; wide?: boolean; gap?: Gap; equal?: boolean }) {
  const Tag = as as any;
  const key = split ?? (cols === 2 ? '2' : undefined);
  const tpl = wide && key && WIDE[key as Split] ? WIDE[key as Split] : split ? SPLIT[split] : COLS[cols ?? 1];
  return <Tag {...p} className={cx('grid min-w-0', tpl, GAP[gap], equal ? 'items-stretch' : 'items-start', className)}>{children}</Tag>;
}
// Filho de Grid que ocupa outra largura que a da grade (ex.: um card largo numa grade de 3). span em doze avos a partir de lg.
const SPAN: Record<number, string> = { 3: 'lg:!col-span-3', 4: 'lg:!col-span-4', 5: 'lg:!col-span-5', 6: 'lg:!col-span-6', 7: 'lg:!col-span-7', 8: 'lg:!col-span-8', 9: 'lg:!col-span-9', 12: '!col-span-12' };
export function GridItem({ span, className = '', children }: { span: 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12; className?: string; children: React.ReactNode }) {
  return <div className={cx('min-w-0 flex flex-col', SPAN[span], className)}>{children}</div>;
}

// Nível de título: a página é h1; seção h2; card h3 dentro de seção, h2 direto na página. Nunca pula nível.
const Level = createContext(2);
export const useHeadingLevel = () => useContext(Level);
export function HeadingLevel({ level, children }: { level: number; children: React.ReactNode }) {
  return <Level.Provider value={Math.min(6, level)}>{children}</Level.Provider>;
}
export function Heading({ className = '', children, id }: { className?: string; children: React.ReactNode; id?: string }) {
  const Tag = `h${useHeadingLevel()}` as any;
  return <Tag id={id} className={className}>{children}</Tag>;
}

// Seção da página: título (text-h2), descrição e ações; cabeçalho → conteúdo 16; conteúdo empilhado com o espaço entre cards.
// As seções ficam num Stack gap="section" (40) — ou use <Page>, que já faz isso.
export function Section({ id, title, description, actions, gap = 'grid', className = '', children }: { id?: string; title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; gap?: Gap; className?: string; children: React.ReactNode }) {
  const level = useHeadingLevel();
  return (
    <section id={id} className={cx('flex flex-col min-w-0 gap-card-head', id && 'scroll-mt-24', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-end gap-x-grid gap-y-tight">
          <div className="mr-auto min-w-0 flex flex-col gap-hair">
            {title && <Heading className="text-h2 font-semibold">{title}</Heading>}
            {description && <p className="text-body text-ink-2 max-w-[70ch]">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-tight">{actions}</div>}
        </header>
      )}
      <HeadingLevel level={title ? level + 1 : level}><div className={cx('flex flex-col min-w-0', GAP[gap])}>{children}</div></HeadingLevel>
    </section>
  );
}

// Conteúdo de uma tela: blocos (seções, grades, cards) separados pelo espaço entre seções.
export function PageBody({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <div className={cx('flex flex-col min-w-0 gap-section', className)}>{children}</div>;
}
