import { TIPOS_IDENTIFICADOR } from '@localle/shared/rastreadorModelos';
import { booleano, erro, numero, opcao, texto } from '../../common/validar';
import type { ModeloDados } from '../rastreador-modelos.repository';

const protocolo = (v: unknown) => {
  const p = texto(v, 'protocolo', 30, 2).toLowerCase();
  // nome do protocolo como o Traccar usa (gt06, teltonika, jt808…): é o que a ingestão compara com o detectado
  if (!/^[a-z0-9]+$/.test(p)) erro('"protocolo" é o nome usado pelo Traccar: só letras minúsculas e números (ex.: gt06, teltonika, huabao)');
  return p;
};

export function parseCriarModelo(body: unknown): ModeloDados {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    fabricante: texto(b.fabricante, 'fabricante', 60),
    nome: texto(b.nome, 'nome', 60),
    protocolo: protocolo(b.protocolo),
    porta: numero(b.porta, 'porta', 1, 65535, true),
    tipo_identificador: opcao(b.tipoIdentificador, 'tipoIdentificador', TIPOS_IDENTIFICADOR),
  };
}

export function parseAtualizarModelo(body: unknown): Partial<ModeloDados & { ativo: boolean }> {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: Partial<ModeloDados & { ativo: boolean }> = {};
  if (b.fabricante !== undefined) out.fabricante = texto(b.fabricante, 'fabricante', 60);
  if (b.nome !== undefined) out.nome = texto(b.nome, 'nome', 60);
  if (b.protocolo !== undefined) out.protocolo = protocolo(b.protocolo);
  if (b.porta !== undefined) out.porta = numero(b.porta, 'porta', 1, 65535, true);
  if (b.tipoIdentificador !== undefined) out.tipo_identificador = opcao(b.tipoIdentificador, 'tipoIdentificador', TIPOS_IDENTIFICADOR);
  if (b.ativo !== undefined) out.ativo = booleano(b.ativo, 'ativo');
  if (!Object.keys(out).length) erro('Nada para atualizar');
  return out;
}
