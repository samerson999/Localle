import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GRUPO_APLICADO, listDefinitions, SEM_EFEITO } from './setting-definitions';

/**
 * AUD-13 (AUDITORIA_KPIS_TELEMETRIA.md): o Setup oferecia parâmetros que nenhum código lia — o cliente mudava o
 * valor e nada acontecia. `SEM_EFEITO` marca esses na tela; este teste a mantém fiel ao código: varre a API, o
 * front e packages/shared atrás da chave como literal, e falha se a lista diverge (nos dois sentidos).
 */
const RAIZ = resolve(__dirname, '../../../..');
const PASTAS = ['apps/api/src', 'apps/web/src', 'packages/shared/src'];
// a própria definição, a tela que lista todas e os testes citam todas as chaves sem usá-las
const IGNORAR = /setting-definitions\.ts$|\.spec\.ts$|\.test\.tsx?$|pages[\\/]Setup\.tsx$/;

function arquivos(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return arquivos(p);
    return /\.tsx?$/.test(e.name) && !IGNORAR.test(p) ? [p] : [];
  });
}

// comentário que cita a chave (mesmo entre aspas) não é leitura: sai antes da busca. `//` só no começo da linha ou
// depois de espaço, para não cortar URL dentro de string.
const semComentarios = (txt: string) => txt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
const codigo = PASTAS.flatMap((d) => arquivos(join(RAIZ, d))).map((p) => ({ p: relative(RAIZ, p), txt: semComentarios(readFileSync(p, 'utf8')) }));
// literal entre aspas (simples, duplas ou crase)
const lidoEm = (key: string) => codigo.filter(({ txt }) => ['\'', '"', '`'].some((q) => txt.includes(`${q}${key}${q}`))).map(({ p }) => p);

describe('registro de parâmetros do Setup', () => {
  const chaves = listDefinitions().map((d) => d.key);

  it('todo parâmetro marcado "sem efeito" existe e nenhum código o lê', () => {
    for (const key of SEM_EFEITO) {
      expect(chaves, `${key} não está no registro`).toContain(key);
      expect(lidoEm(key), `${key} passou a ser lido — tire-o de SEM_EFEITO`).toEqual([]);
    }
  });

  it('todo parâmetro fora de "sem efeito" é lido por algum código', () => {
    const semLeitor = chaves.filter((k) => !SEM_EFEITO.has(k) && lidoEm(k).length === 0);
    expect(semLeitor, 'parâmetros sem leitor: marque em SEM_EFEITO ou implemente a leitura').toEqual([]);
  });

  it('só parâmetro por grupo pode estar em GRUPO_APLICADO', () => {
    const porGrupo = new Set(listDefinitions().filter((d) => d.porGrupo).map((d) => d.key));
    for (const key of GRUPO_APLICADO) expect(porGrupo.has(key), key).toBe(true);
  });
});
