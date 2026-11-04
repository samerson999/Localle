import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { TraccarClient, type TraccarConfig, type TraccarProtocolo } from '../ingest/traccar-client';
import { lerListaTraccar, separarNome } from './lista-traccar';
import { RastreadorModelosRepository } from './rastreador-modelos.repository';
import { RastreadorModelosService } from './rastreador-modelos.service';
import snapshot from './traccar-aparelhos.snapshot.json';
import { TraccarAparelhosRepository } from './traccar-aparelhos.repository';
import { TraccarAparelhosService } from './traccar-aparelhos.service';

const linha = (nome: string, protocolo: string, porta: number | string) => `<tr>\n  <td><a href="/x/">${nome}</a></td>\n  <td>${protocolo}</td>\n  <td>${porta}</td>\n</tr>`;
const pagina = (linhas: string[]) => `<table class="table"><thead><tr><th>Device</th><th>Protocol</th><th>Port</th></tr></thead><tbody>${linhas.join('\n')}</tbody></table>`;

describe('lerListaTraccar', () => {
  it('lê nome, protocolo e porta; tira o selo, decodifica entidade e ignora linha fora do formato e repetida', () => {
    const html = pagina([
      `<tr><td><a href="/freematics/">Freematics Traccar Edition</a> &nbsp;&nbsp;\n<span class="badge bg-success">RECOMMENDED</span></td><td>freematics</td><td>5170</td></tr>`,
      linha('JMAK JR12', 'jmak', 5259),
      linha('JMAK JR12', 'jmak', 5259),
      linha('A &amp; B Tracker', 'gt06', 5023),
      linha('Sem porta', 'gt06', 'x'),
      linha('Protocolo inválido', 'GT 06', 5023),
      '<tr><td>só duas</td><td>gt06</td></tr>',
    ]);
    expect(lerListaTraccar(html)).toEqual([
      { nome: 'Freematics Traccar Edition', protocolo: 'freematics', porta: 5170 },
      { nome: 'JMAK JR12', protocolo: 'jmak', porta: 5259 },
      { nome: 'A & B Tracker', protocolo: 'gt06', porta: 5023 },
    ]);
  });

  it('separarNome corta no primeiro espaço; uma palavra repete', () => {
    expect(separarNome('Jimi IoT JM-VL01')).toEqual({ fabricante: 'Jimi', nome: 'IoT JM-VL01' });
    expect(separarNome('ATL200')).toEqual({ fabricante: 'ATL200', nome: 'ATL200' });
  });

  it('a cópia salva tem a lista inteira, com os modelos da HML', () => {
    expect(snapshot.length).toBeGreaterThan(2000);
    expect(snapshot).toContainEqual(['JMAK JR12', 'jmak', 5259]);
    expect(snapshot).toContainEqual(['Teltonika FMC125', 'teltonika', 5027]);
  });
});

class FakeTraccar extends TraccarClient {
  cfg: TraccarConfig | null = { url: 'http://traccar.fake', user: 'u', password: 'p' };
  lista: TraccarProtocolo[] | null = [];
  config() {
    return this.cfg;
  }
  async protocols() {
    return this.lista;
  }
}

class ServicoComPagina extends TraccarAparelhosService {
  html: string | Error = '';
  protected async baixarPagina() {
    if (this.html instanceof Error) throw this.html;
    return this.html;
  }
}

describe('TraccarAparelhosService', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new TraccarAparelhosRepository(pool);
  const modelosRepo = new RastreadorModelosRepository(pool);
  const audit = new AuditLogRepository(pool);
  const superadminId = randomUUID();
  const sufixo = randomUUID().slice(0, 8);
  const modelosCriados: string[] = [];
  const novoServico = (traccar = new FakeTraccar()) => {
    const s = new ServicoComPagina(repo, modelosRepo, new RastreadorModelosService(modelosRepo, audit, traccar), traccar, audit);
    return s;
  };
  // lista de teste com nomes únicos desta execução; 600 linhas para passar do mínimo de sanidade
  const nome = (i: number) => `Zt${sufixo} M${i}`;
  const listaDeTeste = (n: number, porta = 5023) => pagina(Array.from({ length: n }, (_, i) => linha(nome(i), i % 2 ? 'gt06' : 'jmak', porta)));

  beforeAll(async () => {
    await novoServico().garantirCarga();
  });

  afterAll(async () => {
    // a lista real volta (o teste trocou a tabela inteira)
    await repo.substituir((snapshot as [string, string, number][]).map(([n, p, porta]) => ({ nome: n, protocolo: p, porta })));
    for (const id of modelosCriados) await pool.query('delete from rastreador_modelos where id = $1', [id]);
    await pool.query('delete from audit_log where actor_id = $1', [superadminId]);
    await pool.end();
  });

  it('carga inicial: tabela com a lista da cópia salva', async () => {
    expect((await repo.resumo()).total).toBeGreaterThan(2000);
    expect((await repo.buscar('JMAK JR12', 5)).map((a) => a.nome)).toContain('JMAK JR12');
  });

  it('atualizar: página fora do ar ou em formato diferente → 502 e a lista anterior continua', async () => {
    const s = novoServico();
    const antes = (await repo.resumo()).total;
    s.html = new Error('ECONNRESET');
    await expect(s.atualizar(superadminId)).rejects.toMatchObject({ status: 502 });
    s.html = listaDeTeste(10);
    await expect(s.atualizar(superadminId)).rejects.toThrow(/formato diferente \(10 aparelhos/);
    expect((await repo.resumo()).total).toBe(antes);
  });

  it('atualizar: troca a lista, mantém o id de quem continua e remove quem saiu; auditado', async () => {
    const s = novoServico();
    s.html = listaDeTeste(600);
    expect(await s.atualizar(superadminId)).toMatchObject({ total: 600 });
    const [m0] = await repo.buscar(nome(0), 1);
    expect(m0).toMatchObject({ nome: nome(0), protocolo: 'jmak', porta: 5023 });

    s.html = pagina([...Array.from({ length: 599 }, (_, i) => linha(nome(i), i % 2 ? 'gt06' : 'jmak', 6000))]);
    expect(await s.atualizar(superadminId)).toEqual({ total: 599, removidos: 1 });
    expect(await repo.findById(m0.id)).toMatchObject({ porta: 6000 }); // mesmo id, porta nova
    expect(await repo.buscar(nome(599), 1)).toEqual([]);
    const { rows } = await pool.query("select after from audit_log where actor_id = $1 and action = 'traccar_aparelhos.atualizar'", [superadminId]);
    expect(rows.at(-1).after).toEqual({ total: 599, removidos: 1 });
  });

  it('modelo a partir do aparelho: cria com nome do Traccar separado, protocolo/porta e identificador do protocolo; 2ª vez reaproveita', async () => {
    const s = novoServico();
    const [a] = await repo.buscar(nome(1), 1); // gt06
    const m = await s.modeloDoAparelho(superadminId, a.id);
    modelosCriados.push(m.id);
    expect(m).toMatchObject({ fabricante: `Zt${sufixo}`, nome: 'M1', protocolo: 'gt06', porta: 6000, origem: 'catalogo' });
    // há modelo gt06 com IMEI no catálogo (EVOO-X GT06): o palpite segue o protocolo
    expect(m.tipo_identificador).toBe(await modelosRepo.identificadorDoProtocolo('gt06'));
    expect((await s.modeloDoAparelho(superadminId, a.id)).id).toBe(m.id);
    await expect(s.modeloDoAparelho(superadminId, 999_999_999)).rejects.toMatchObject({ status: 404 });
  });

  it('modelo a partir do aparelho: nome já no catálogo com outro protocolo → 409; desativado → 409', async () => {
    const s = novoServico();
    const [a] = await repo.buscar(nome(2), 1); // jmak
    const outro = await modelosRepo.criar({ fabricante: `Zt${sufixo}`, nome: 'M2', protocolo: 'huabao', porta: 5015, tipo_identificador: 'imei' });
    modelosCriados.push(outro.id);
    await expect(s.modeloDoAparelho(superadminId, a.id)).rejects.toThrow(/protocolo huabao/);
    await pool.query("update rastreador_modelos set protocolo = 'jmak', ativo = false where id = $1", [outro.id]);
    await expect(s.modeloDoAparelho(superadminId, a.id)).rejects.toThrow(/desativado/);
  });

  it('busca: modelos em uso e aparelhos da lista, sem repetir o que já está no catálogo, com a situação do protocolo', async () => {
    const traccar = new FakeTraccar();
    traccar.lista = [{ protocolo: 'gt06', porta: 6000, transporte: 'ALL' }, { protocolo: 'jmak', porta: 5259, transporte: 'DISABLED' }];
    const r = await novoServico(traccar).buscar(`Zt${sufixo} M1`);
    expect(r.modelos.map((m) => m.nome)).toEqual(['M1']);
    expect(r.modelos[0].situacao).toEqual({ ativo: true, porta: 6000 });
    // M1 já virou modelo: não aparece de novo como aparelho; M10..M19 sim
    expect(r.aparelhos.map((a) => a.nome)).not.toContain(nome(1));
    expect(r.aparelhos.find((a) => a.nome === nome(10))?.situacao).toEqual({ ativo: false, porta: 5259 });
    // curinga digitado é literal
    expect((await novoServico(traccar).buscar('%')).aparelhos).toEqual([]);
    // Traccar sem /api/protocols: situação desconhecida
    const antigo = new FakeTraccar();
    antigo.lista = null;
    expect((await novoServico(antigo).buscar(`Zt${sufixo} M10`)).aparelhos[0].situacao).toBeNull();
  });
});
