import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Padrão da plataforma (PRODUCT.md › cores): ação destrutiva é sempre vermelha — Button variant="danger",
// TextButton tone="danger", IconButton tone="danger"/"danger-outline", item de menu `danger: true`, e a confirmação
// destrutiva nunca é marcada como tone 'primary'. Este teste varre o código e falha se uma ação nova nascer sem a cor.
const VERBO = '(?:Excluir|Remover|Apagar|Descartar|Desativar|Revogar|Desvincular|Bloquear)';
// "Remover filtro" só tira um filtro da tela; não apaga nada
const NAO_DESTRUTIVO = /^Remover filtro/;

type Achado = { onde: string; trecho: string };

export function acoesSemVermelho(fonte: string): string[] {
  const achados: string[] = [];
  const rotulo = (s: string) => s.trim().replace(/\s+/g, ' ').slice(0, 60);
  // item de menu: { label: 'Excluir…', … } sem danger
  for (const m of fonte.matchAll(new RegExp(`\\{\\s*label:\\s*['\`](${VERBO}[^'\`]*)['\`]([^{}]*?)\\}`, 'g')))
    if (!NAO_DESTRUTIVO.test(m[1]) && !/danger:\s*true/.test(m[2])) achados.push(`menu "${rotulo(m[1])}"`);
  // <TextButton …>Excluir / <Button …><Icon/>Excluir
  // variante escolhida por condição (variant={v} com v === 'danger', tone={ativo ? 'danger' : …}) também conta
  for (const [tag, cor] of [['TextButton', /tone="danger"|['"]danger['"]/], ['Button', /variant="danger"|['"]danger['"]/]] as const)
    for (const m of fonte.matchAll(new RegExp(`<${tag}\\b((?:(?!<\\/|<${tag}\\b)[\\s\\S]){0,1500}?)>\\s*(?:<Icon\\b[^>]*\\/>\\s*)?(${VERBO}[^<{]*)`, 'g')))
      if (!NAO_DESTRUTIVO.test(m[2]) && !cor.test(m[1])) achados.push(`${tag} "${rotulo(m[2])}"`);
  // <IconButton aria-label="Remover…"> sem tom destrutivo
  for (const m of fonte.matchAll(/<IconButton\b([^>]*?)aria-label=(?:"([^"]+)"|\{`([^`]+)`\})([^>]*)>/g)) {
    const nome = m[2] ?? m[3];
    if (new RegExp(`^${VERBO}`).test(nome) && !NAO_DESTRUTIVO.test(nome) && !/tone=["{][^>]*danger/.test(m[1] + m[4])) achados.push(`IconButton "${rotulo(nome)}"`);
  }
  // confirmação destrutiva marcada como ação comum
  for (const m of fonte.matchAll(new RegExp(`confirmLabel:\\s*['\`](${VERBO}[^'\`]*)['\`][^}]*tone:\\s*'primary'`, 'g'))) achados.push(`confirmação "${rotulo(m[1])}" com tone primary`);
  return achados;
}

const arquivos = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? arquivos(p) : /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
});

describe('ações destrutivas em vermelho', () => {
  it('o detector reconhece os casos certos e errados', () => {
    expect(acoesSemVermelho(`{ label: 'Excluir', icon: 'lixo', onClick: () => x() }`)).toEqual(['menu "Excluir"']);
    expect(acoesSemVermelho(`{ label: 'Excluir', danger: true, onClick: () => x() }`)).toEqual([]);
    expect(acoesSemVermelho(`<TextButton onClick={() => apagar(m)}>Excluir</TextButton>`)).toEqual(['TextButton "Excluir"']);
    expect(acoesSemVermelho(`<TextButton tone="danger" onClick={async () => { await x(); }}>Desativar</TextButton>`)).toEqual([]);
    expect(acoesSemVermelho(`<Button variant="secondary" onClick={rm}><Icon name="lixo" size={16} />Remover ativo</Button>`)).toEqual(['Button "Remover ativo"']);
    expect(acoesSemVermelho(`<Button variant="danger" onClick={rm}><Icon name="lixo" />Remover ativo</Button>`)).toEqual([]);
    expect(acoesSemVermelho(`<IconButton aria-label="Remover pergunta" tone="outline" onClick={rm}>`)).toEqual(['IconButton "Remover pergunta"']);
    expect(acoesSemVermelho(`<IconButton size="sm" tone="danger" aria-label={\`Remover \${x}\`} onClick={rm}>`)).toEqual([]);
    expect(acoesSemVermelho(`<IconButton aria-label="Remover filtro Ativos" onClick={rm}>`)).toEqual([]);
    expect(acoesSemVermelho(`confirmAction({ title: 'Excluir?', confirmLabel: 'Excluir', tone: 'primary' })`)).toEqual(['confirmação "Excluir" com tone primary']);
    expect(acoesSemVermelho(`<TextButton onClick={copiar}>Copiar</TextButton>`)).toEqual([]);
    expect(acoesSemVermelho(`<Button variant={v}>{v === 'danger' ? <><Icon name="excluir" />Excluir</> : l}</Button>`)).toEqual([]);
  });

  it('nenhuma ação destrutiva do app sem a cor', () => {
    const raiz = join(__dirname, '..');
    const achados: Achado[] = arquivos(raiz).flatMap((f) => acoesSemVermelho(readFileSync(f, 'utf8')).map((trecho) => ({ onde: relative(raiz, f), trecho })));
    expect(achados).toEqual([]);
  });
});
