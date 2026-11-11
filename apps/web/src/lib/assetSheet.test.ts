import { describe, expect, it } from 'vitest';
import { COLS, EXEMPLOS, escolherNaLinha, planImport } from './assetSheet';

// estado mínimo do store que a prévia lê
const store = (o: any = {}) => ({
  assets: [], groups: [], operations: [], drivers: [],
  catalogoAtivos: {
    marcas: [{ id: 'vw', nome: 'Volkswagen' }, { id: 'cat', nome: 'Caterpillar' }],
    modelos: [{ id: 'm13190', marcaId: 'vw', nome: '13.190' }, { id: 'm416', marcaId: 'cat', nome: '416F' }],
    tipos: [],
  },
  ...o,
});
// monta uma linha pelo nome da coluna do modelo
const linha = (v: Partial<Record<(typeof COLS)[number], any>>) => COLS.map((c) => v[c] ?? '');
const plano = (linhas: any[][], s = store()) => planImport([COLS as unknown as string[], ...linhas], s);

// critério de aceite da Sprint 3: o modelo baixado importa sem erro, com ou sem marcas cadastradas
it('as linhas de exemplo do modelo importam sem erro', () => {
  for (const s of [store(), store({ catalogoAtivos: { marcas: [], modelos: [], tipos: [] } })]) {
    const p = planImport([COLS as unknown as string[], ...EXEMPLOS], s);
    expect(p.lines.map((l) => [l.action, l.errors])).toEqual(EXEMPLOS.map(() => ['criar', []]));
  }
});

describe('planImport: mesmas regras do cadastro manual', () => {
  // critério de aceite da Sprint 1 aplicado à planilha: vários equipamentos sem placa seguidos
  it('linha amarela sem placa entra pelo código interno, várias seguidas', () => {
    const p = plano([
      linha({ Tipo: 'Retroescavadeira', 'Código interno / nº de série': 'RETRO-01', Marca: 'Caterpillar', Modelo: '416F' }),
      linha({ Tipo: 'Escavadeira', 'Código interno / nº de série': 'ESC-02', Marca: 'Caterpillar', Modelo: '320' }),
      linha({ Tipo: 'Pá carregadeira', 'Código interno / nº de série': 'PA-03', Marca: 'Caterpillar', Modelo: '924K' }),
    ]);
    expect(p.lines.map((l) => [l.action, l.errors])).toEqual([['criar', []], ['criar', []], ['criar', []]]);
    expect(p.lines[0].data).toMatchObject({ serial: 'RETRO-01', tipo: 'retroescavadeira', kind: 'linha_amarela', meter: 'horimetro', icon: '34-retroescavadeira' });
    expect(p.lines[0].data.plate).toBeUndefined();
  });

  it('tipo obrigatório e da lista; veículo exige placa; sem placa, exige código; marca e modelo obrigatórios', () => {
    const p = plano([
      linha({ Placa: 'ABC1D23', Marca: 'Volkswagen', Modelo: '13.190' }),
      linha({ Tipo: 'Avião', Placa: 'ABC1D24', Marca: 'Volkswagen', Modelo: '13.190' }),
      linha({ Tipo: 'Caminhão', 'Código interno / nº de série': 'FROTA-1', Marca: 'Volkswagen', Modelo: '13.190' }),
      linha({ Tipo: 'Escavadeira', Marca: 'Caterpillar', Modelo: '416F', Apelido: 'Escavadeira do pátio' }),
      linha({ Tipo: 'Caminhão', Placa: 'ABC1D25' }),
    ]);
    const erros = p.lines.map((l) => l.errors.join(' '));
    expect(erros[0]).toMatch(/Informe o tipo/);
    expect(erros[1]).toMatch(/Tipo “Avião” não existe/);
    expect(erros[2]).toMatch(/precisa de placa/);
    expect(erros[3]).toMatch(/informe o código interno/);
    expect(erros[4]).toMatch(/Informe marca e modelo/);
    expect(p.lines.every((l) => l.action === 'erro')).toBe(true);
  });

  it('linha amarela usa horímetro; medidor e situação fora da lista são erro', () => {
    const p = plano([
      linha({ Tipo: 'Escavadeira', 'Código interno / nº de série': 'E1', Marca: 'Caterpillar', Modelo: '416F', 'Medidor de uso': 'Quilometragem' }),
      linha({ Tipo: 'Caminhão', Placa: 'ABC1D23', Marca: 'Volkswagen', Modelo: '13.190', 'Medidor de uso': 'Litros' }),
      linha({ Tipo: 'Caminhão', Placa: 'ABC1D24', Marca: 'Volkswagen', Modelo: '13.190', Situação: 'Quebrado' }),
    ]);
    expect(p.lines[0].errors).toContain('Linha amarela usa horímetro.');
    expect(p.lines[1].errors.join()).toMatch(/Medidor “Litros” inválido/);
    expect(p.lines[2].errors.join()).toMatch(/Situação “Quebrado” inválida/);
  });

  // I5: ativo/inativo; venda e baixa só pela ficha
  it('situação Ativo/Inativo vai para a linha; Vendido não muda a situação', () => {
    const p = plano([
      linha({ Tipo: 'Caminhão', Placa: 'ABC1D23', Marca: 'Volkswagen', Modelo: '13.190', Situação: 'Inativo' }),
      linha({ Tipo: 'Caminhão', Placa: 'ABC1D24', Marca: 'Volkswagen', Modelo: '13.190', Situação: 'ativo' }),
      linha({ Tipo: 'Caminhão', Placa: 'ABC1D25', Marca: 'Volkswagen', Modelo: '13.190', Situação: 'Vendido' }),
    ]);
    expect(p.lines.map((l) => l.data._situacao)).toEqual(['inativo', 'ativo', undefined]);
    expect(p.lines.every((l) => l.action === 'criar')).toBe(true);
  });
});

describe('planImport: marca e modelo pela lista (I3)', () => {
  // caso do áudio: "13190" com "13.190" já cadastrado
  it('mesmo nome com outra grafia usa o existente; parecido vira sugestão; nome novo é cadastrado', () => {
    const p = plano([
      linha({ Tipo: 'Caminhão', Placa: 'ABC1D23', Marca: 'VOLKSWAGEN', Modelo: '13190' }),
      linha({ Tipo: 'Caminhão', Placa: 'ABC1D24', Marca: 'Volkswagen', Modelo: '13.190 CR 4x2' }),
      linha({ Tipo: 'Caminhão', Placa: 'ABC1D25', Marca: 'Scania', Modelo: 'R450' }),
    ]);
    expect(p.lines[0].data._marca).toEqual({ nome: 'Volkswagen', id: 'vw' });
    expect(p.lines[0].data._modelo).toEqual({ nome: '13.190', id: 'm13190' });
    expect(p.lines[0].warnings.join()).toMatch(/Modelo “13190” é “13.190”/);
    expect(p.lines[1].data._modelo).toEqual({ nome: '13.190 CR 4x2', sugestoes: [{ id: 'm13190', nome: '13.190' }] });
    expect(p.lines[2].data._marca).toEqual({ nome: 'Scania' });
    expect(p.lines[2].data._modelo).toEqual({ nome: 'R450' });
  });

  it('a escolha na prévia passa a usar o existente só naquela linha', () => {
    const p = plano([
      linha({ Tipo: 'Caminhão', Placa: 'ABC1D24', Marca: 'Volkswagen', Modelo: '13.190 CR 4x2' }),
      linha({ Tipo: 'Caminhão', Placa: 'ABC1D25', Marca: 'Volkswagen', Modelo: '13.190 CR 4x2' }),
    ]);
    const e = escolherNaLinha(p, 2, '_modelo', 'm13190');
    expect(e.lines.map((l) => l.data._modelo.id)).toEqual(['m13190', undefined]);
    expect(escolherNaLinha(e, 2, '_modelo', null).lines[0].data._modelo.id).toBeUndefined();
  });
});

describe('planImport: ativo existente e planilha antiga', () => {
  const existente = { id: 'a1', plate: '', serial: 'RETRO-01', name: 'RETRO-01', kind: 'linha_amarela', category: 'linha_amarela', tipo: 'retroescavadeira', brand: 'Caterpillar', model: '416F' };

  it('reconhece pelo código interno e atualiza; campo em branco não vira obrigatório; trocar a natureza é erro', () => {
    const p = plano([
      linha({ 'Código interno / nº de série': 'RETRO-01', Ano: '2019' }),
      linha({ Tipo: 'Caminhão', 'Código interno / nº de série': 'retro-01', Placa: '' }),
    ], store({ assets: [existente] }));
    expect(p.lines[0]).toMatchObject({ action: 'atualizar', existingId: 'a1', errors: [] });
    expect(p.lines[0].data).toMatchObject({ year: '2019' });
    expect(p.lines[1].errors.join()).toMatch(/trocar a natureza/);
  });

  it('placa ou código repetidos na planilha são erro só na linha repetida; as outras seguem', () => {
    const p = plano([
      linha({ Tipo: 'Escavadeira', 'Código interno / nº de série': 'E1', Marca: 'Caterpillar', Modelo: '416F' }),
      linha({ Tipo: 'Escavadeira', 'Código interno / nº de série': 'e-1', Marca: 'Caterpillar', Modelo: '416F' }),
      linha({ Tipo: 'Caminhão', Placa: 'ABC1D23', Marca: 'Volkswagen', Modelo: '13.190' }),
    ]);
    expect(p.lines.map((l) => l.action)).toEqual(['criar', 'erro', 'criar']);
  });

  it('cabeçalho do modelo antigo ("Nome", "Nº de série / patrimônio") continua lido', () => {
    const p = planImport([['Placa', 'Nome', 'Tipo', 'Marca', 'Modelo', 'Nº de série / patrimônio'], ['', 'Retro', 'Retroescavadeira', 'Caterpillar', '416F', 'RETRO-09']], store());
    expect(p.lines[0]).toMatchObject({ action: 'criar', errors: [] });
    expect(p.lines[0].data).toMatchObject({ serial: 'RETRO-09', name: 'Retro' });
  });

  it('sem coluna de placa nem de código, recusa o arquivo inteiro', () => {
    expect(planImport([['Tipo', 'Marca'], ['Caminhão', 'Volvo']], store()).lines[0].errors.join()).toMatch(/coluna Placa ou Código interno/);
  });
});
