import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { parseCreateClient } from '../clients/dto/create-client.dto';
import { parseCreateSimCard } from '../rastreadores/dto/create-sim-card.dto';
import { parseMotorista } from '../motoristas/motoristas.controller';
import { parseAbastecimento } from '../combustivel/combustivel.controller';

// Rotas que recebiam o corpo sem conferir o tipo: valor errado virava 500 do Postgres ou dado sujo gravado.
describe('parseCreateSimCard', () => {
  it('aceita ICCID com espaços e número formatado', () => {
    expect(parseCreateSimCard({ iccid: '8955 0123 4567 8901 2345', operadora: ' Vivo ', numero: '(11) 98765-4321' }))
      .toEqual({ iccid: '89550123456789012345', operadora: 'Vivo', numero: '(11) 98765-4321' });
    expect(parseCreateSimCard({ iccid: '895501234567890123' })).toEqual({ iccid: '895501234567890123' });
  });

  it('rejeita ICCID ausente, curto, com letra ou de outro tipo', () => {
    for (const iccid of [undefined, '', '12345', '8955012345678901234X', 89550123456789012345, { a: 1 }]) {
      expect(() => parseCreateSimCard({ iccid })).toThrow(BadRequestException);
    }
  });

  it('rejeita número sem DDD e operadora que não é texto', () => {
    expect(() => parseCreateSimCard({ iccid: '89550123456789012345', numero: '98765-4321' })).toThrow(BadRequestException);
    expect(() => parseCreateSimCard({ iccid: '89550123456789012345', operadora: 123 })).toThrow(BadRequestException);
  });
});

describe('parseCreateClient', () => {
  it('nome obrigatório de 1 a 200 caracteres; revenda opcional em UUID', () => {
    expect(parseCreateClient({ name: '  Frota X ' })).toEqual({ name: 'Frota X', revendaId: null });
    const revendaId = '0b9a4f4e-6a43-4d36-9a1a-2f5a2f0c1b11';
    expect(parseCreateClient({ name: 'Frota X', revendaId })).toEqual({ name: 'Frota X', revendaId });
  });

  it('rejeita nome vazio, longo ou não texto e revendaId que não é UUID', () => {
    for (const body of [{}, { name: '   ' }, { name: 'x'.repeat(201) }, { name: 42 }, { name: 'Frota', revendaId: 'abc' }, null]) {
      expect(() => parseCreateClient(body)).toThrow(BadRequestException);
    }
  });
});

// CPF, CNPJ e telefone: mesma regra do front (packages/shared/documentos), para chamada direta à API não gravar lixo.
describe('documentos na entrada da API', () => {
  const motorista = { nome: 'Fulano' };

  it('motorista: telefone com DDD e CPF com dígito verificador', () => {
    expect(parseMotorista({ ...motorista, telefone: '(81) 98765-4321', dados: { cpf: '529.982.247-25' } })).toMatchObject({ telefone: '(81) 98765-4321', dados: { cpf: '529.982.247-25' } });
    expect(() => parseMotorista({ ...motorista, telefone: '98765-4321' })).toThrow(BadRequestException);
    expect(() => parseMotorista({ ...motorista, dados: { cpf: '529.982.247-24' } })).toThrow(BadRequestException);
    expect(parseMotorista({ ...motorista, dados: { cpf: '', registration: 'M1' } }).dados).toEqual({ registration: 'M1' });
  });

  it('abastecimento: CNPJ do posto e da nota com dígito verificador', () => {
    const base = { assetId: '0b9a4f4e-6a43-4d36-9a1a-2f5a2f0c1b11', ts: '2026-10-10T08:00:00Z', odometro: 1000, litros: 10, total: 60, combustivel: 'Diesel S10' };
    expect(parseAbastecimento({ ...base, postoCnpj: '11.222.333/0001-81', nf: { cnpj: '11444777000161' } })).toMatchObject({ postoCnpj: '11.222.333/0001-81', nf: { cnpj: '11444777000161' } });
    expect(() => parseAbastecimento({ ...base, postoCnpj: '11.111.111/0001-11' })).toThrow(BadRequestException);
    expect(() => parseAbastecimento({ ...base, nf: { cnpj: '11.222.333/0001-80' } })).toThrow(BadRequestException);
  });
});
