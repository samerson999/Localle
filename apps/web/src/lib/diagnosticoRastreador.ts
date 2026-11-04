// Checklist do rastreador (Console › Rastreadores › Diagnóstico) e sugestões de mapeamento da telemetria, a partir do
// que a API devolve em /superadmin/rastreadores/:id/diagnostico. Só leitura: nada aqui é aplicado sem o admin confirmar.
import type { DiagnosticoRastreador, SinaisMotorDiagnostico, SinalMotor, SuporteCan } from './localleApi';

export type Tom = 'ok' | 'warn' | 'crit' | 'info';
export interface ItemChecklist { etapa: string; tom: Tom; texto: string }

const COMANDO_ROTULO: Record<string, string> = { engineStop: 'bloqueio', engineResume: 'desbloqueio', positionSingle: 'pedir posição' };

/** Firmware e hardware nas chaves padrão do Traccar (`versionFw`/`versionHw`), quando o protocolo manda. */
export function firmwareDe(a: Record<string, unknown>): { fw: string | null; hw: string | null } {
  const txt = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, 60) : null);
  return { fw: txt(a.versionFw), hw: txt(a.versionHw) };
}

export const haQuanto = (iso: string, agora: number) => {
  const min = Math.round((agora - Date.parse(iso)) / 60_000);
  if (min < 1) return 'menos de 1 min';
  if (min < 60) return `${min} min`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h`;
  return `${Math.round(min / 1440)} dias`;
};

/** Valor guardado há mais que isso é "antigo": a tela mostra a idade (o aparelho pode ter deixado de mandar o dado). */
export const LEITURA_ANTIGA_MIN = 60;

/** "há 2 dias" quando a leitura é antiga; null quando é recente ou a idade é desconhecida. */
export function leituraAntiga(iso: string | null | undefined, agora = Date.now()): string | null {
  if (!iso || !(agora - Date.parse(iso) > LEITURA_ANTIGA_MIN * 60_000)) return null;
  return `há ${haQuanto(iso, agora)}`;
}

export function itensDoDiagnostico(
  d: DiagnosticoRastreador,
  modelo: { nome: string; protocolo: string; porta: number } | null,
  agora = Date.now(),
): ItemChecklist[] {
  const itens: ItemChecklist[] = [];
  if (!modelo) return [{ etapa: 'Modelo', tom: 'crit', texto: 'Sem modelo do catálogo: defina o modelo para a plataforma saber protocolo e porta.' }];
  itens.push({ etapa: 'Modelo', tom: 'ok', texto: `${modelo.nome}: protocolo ${modelo.protocolo}, porta ${modelo.porta}.` });

  const f = d.ficha;
  if (!f?.traccar.configurado) itens.push({ etapa: 'Traccar', tom: 'info', texto: 'Traccar não configurado nesta API: não há o que consultar.' });
  else if (f.traccar.erro) itens.push({ etapa: 'Traccar', tom: 'crit', texto: f.traccar.erro });
  else if (!d.traccarDeviceId) itens.push({ etapa: 'Traccar', tom: 'crit', texto: 'Rastreador sem device no Traccar: a posição dele nunca chega. Recadastre o rastreador.' });
  else if (!f.protocolo) itens.push({ etapa: 'Traccar', tom: 'info', texto: `Traccar ${f.traccar.versao ?? ''} não informa os protocolos ativos (só a partir da 6.17).`.replace('  ', ' ') });
  else if (!f.protocolo.ativo) itens.push({ etapa: 'Traccar', tom: 'crit', texto: `Protocolo ${modelo.protocolo} não está ativo no Traccar: o aparelho não consegue conectar.` });
  else if (f.protocolo.porta !== modelo.porta) itens.push({ etapa: 'Traccar', tom: 'warn', texto: `O Traccar escuta ${modelo.protocolo} na porta ${f.protocolo.porta ?? '?'}, mas o modelo diz ${modelo.porta}.` });
  else itens.push({ etapa: 'Traccar', tom: 'ok', texto: `Protocolo ${modelo.protocolo} ativo na porta ${f.protocolo.porta}.` });

  if (!d.ultimoPacoteEm) {
    itens.push({ etapa: 'Conexão', tom: 'crit', texto: `Nunca mandou pacote. Confira no aparelho o IP do servidor e a porta ${modelo.porta}, o APN do chip e se a porta está liberada no firewall da VPS.` });
  } else if (d.online) {
    itens.push({ etapa: 'Conexão', tom: 'ok', texto: `Conectado agora; último pacote há ${haQuanto(d.ultimoPacoteEm, agora)}.` });
  } else {
    itens.push({ etapa: 'Conexão', tom: 'warn', texto: `${d.online === false ? 'Desconectado' : 'Conexão não consultada'}; último pacote há ${haQuanto(d.ultimoPacoteEm, agora)}. Veja alimentação, chip e sinal no local.` });
  }

  if (d.ultimoPacoteEm) {
    const p = d.ultimaPosicao;
    itens.push(p
      ? semFixDeGps(d.ultimoPacoteEm, p.em)
        ? { etapa: 'GPS', tom: 'warn', texto: `Comunica, mas a última posição com GPS é de há ${haQuanto(p.em, agora)}. Veja a antena do GPS e se o aparelho está coberto por metal.` }
        : { etapa: 'GPS', tom: 'ok', texto: `Posição de há ${haQuanto(p.em, agora)}: ${coordenadas(p)}.` }
      : { etapa: 'GPS', tom: 'warn', texto: 'Comunica, mas ainda sem posição com GPS. Em local fechado é normal: leve o veículo a céu aberto.' });
  }

  if (!d.protocoloDetectado) itens.push({ etapa: 'Protocolo', tom: 'info', texto: 'Aguardando a primeira posição para confirmar o protocolo.' });
  else if (d.protocoloDetectado !== modelo.protocolo) itens.push({ etapa: 'Protocolo', tom: 'crit', texto: `O aparelho conectou como ${d.protocoloDetectado}, mas o modelo espera ${modelo.protocolo}: modelo errado ou aparelho na porta errada.` });
  else itens.push({ etapa: 'Protocolo', tom: 'ok', texto: `Confirmado na posição: ${d.protocoloDetectado}.` });

  if (!d.atributosEm) itens.push({ etapa: 'Telemetria', tom: 'info', texto: 'Nenhum atributo recebido ainda.' });
  else {
    const t = d.telemetria;
    const faltam = [t.tensaoV === null && 'tensão', t.sinalGsm === null && 'sinal', t.bloqueado === null && 'estado de bloqueio'].filter(Boolean) as string[];
    const lidos = [t.tensaoV !== null && `${t.tensaoV} V`, t.sinalGsm !== null && `sinal ${t.sinalGsm}/5`, t.bloqueado !== null && (t.bloqueado ? 'bloqueado' : 'desbloqueado')].filter(Boolean);
    // valor antigo comparado ao último pacote: o aparelho manda pacotes, mas não esse dado (ex.: chave mudou no decoder)
    const ref = Date.parse(d.atributosEm);
    const antigos = ([['tensão', t.tensaoV, t.lidaEm?.tensaoV], ['sinal', t.sinalGsm, t.lidaEm?.sinalGsm], ['estado de bloqueio', t.bloqueado, t.lidaEm?.bloqueado]] as const)
      .filter(([, valor, em]) => valor !== null && leituraAntiga(em, ref))
      .map(([nome, , em]) => `${nome} (lido há ${haQuanto(em!, agora)})`);
    if (antigos.length) {
      itens.push({ etapa: 'Telemetria', tom: 'warn', texto: `Valor antigo: ${antigos.join(', ')}. O aparelho continua mandando pacotes, mas não esse dado: confira nos dados recebidos se ele passou a vir em outro atributo e ajuste o mapeamento do modelo.` });
    } else itens.push(faltam.length
      ? { etapa: 'Telemetria', tom: 'warn', texto: `Não lido: ${faltam.join(', ')}${lidos.length ? ` (lido: ${lidos.join(', ')})` : ''}. Veja as sugestões de mapeamento no modelo.` }
      : { etapa: 'Telemetria', tom: 'ok', texto: `Lido: ${lidos.join(', ')}.` });
  }

  if (!d.comandos) itens.push({ etapa: 'Comandos', tom: 'info', texto: 'Os comandos aceitos aparecem depois da primeira posição.' });
  else {
    const aceitos = Object.keys(COMANDO_ROTULO).filter((c) => d.comandos!.includes(c)).map((c) => COMANDO_ROTULO[c]);
    const bloqueia = d.comandos.includes('engineStop') && d.comandos.includes('engineResume');
    itens.push({ etapa: 'Comandos', tom: bloqueia ? 'ok' : 'warn', texto: bloqueia
      ? `Aceita ${aceitos.join(', ')}.`
      : `${aceitos.length ? `Aceita só ${aceitos.join(', ')}` : 'Não aceita nenhum comando da plataforma'}: o Traccar ${f?.traccar.versao ?? ''} não sabe enviar bloqueio por ${modelo.protocolo}.`.replace('  ', ' ') });
  }

  const { fw, hw } = firmwareDe(d.atributos);
  itens.push({ etapa: 'Firmware', tom: 'info', texto: fw || hw ? [fw && `firmware ${fw}`, hw && `hardware ${hw}`].filter(Boolean).join(' · ') : 'O aparelho não informa firmware pelo protocolo.' });
  return itens;
}

export const coordenadas = (p: { latitude: number; longitude: number }) => `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`;

// Aba Transmissão: "está transmitindo?" é pergunta de minutos (instalação, teste de bancada), não o "sem sinal" em horas
// do monitoramento do cliente (monitoramento.sem_sinal_h). Parado e desligado, aparelho comum manda pacote a cada 5–30 min.
export const TRANSMITINDO_MIN = 10;
export const PAROU_H = 24;
export type SituacaoTransmissao = 'agora' | 'recente' | 'parou' | 'nunca';

export function situacaoTransmissao(ultimoPacoteEm: string | null, agora: number): SituacaoTransmissao {
  if (!ultimoPacoteEm) return 'nunca';
  const ms = agora - Date.parse(ultimoPacoteEm);
  if (ms <= TRANSMITINDO_MIN * 60_000) return 'agora';
  return ms <= PAROU_H * 3600_000 ? 'recente' : 'parou';
}

/** Pacotes chegando, mas a última posição com fix de GPS ficou para trás (ou nunca houve). */
export function semFixDeGps(ultimoPacoteEm: string | null, posicaoEm: string | null): boolean {
  if (!ultimoPacoteEm) return false;
  return !posicaoEm || Date.parse(ultimoPacoteEm) - Date.parse(posicaoEm) > TRANSMITINDO_MIN * 60_000;
}

export interface SugestaoMapeamento { campo: 'atributoTensao' | 'sinalMax' | 'atributoBloqueio'; valor: string; motivo: string }

const NOME_TENSAO = /^(adc\d*|vin|voltage|externalPower|extPower|mainVoltage|power\d+)$/i;
const NOME_SAIDA = /^(out|output)\d*$/i;
const volts = (v: unknown) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = v > 100 && v <= 60_000 ? v / 1000 : v;
  return n >= 6 && n <= 60 ? n : null;
};

/**
 * Sugestões de mapeamento a partir dos atributos reais, só onde a chave padrão do Traccar não veio e o modelo ainda não
 * tem mapeamento. Heurística por nome e faixa física: é sugestão para conferir com o aparelho, nunca aplicada sozinha.
 */
export function sugerirMapeamento(
  a: Record<string, unknown>,
  atual: { atributo_tensao: string | null; sinal_max: number | null; atributo_bloqueio: string | null },
): SugestaoMapeamento[] {
  const out: SugestaoMapeamento[] = [];
  if (!atual.atributo_tensao && volts(a.power) === null) {
    const k = Object.keys(a).find((x) => NOME_TENSAO.test(x) && volts(a[x]) !== null);
    if (k) out.push({ campo: 'atributoTensao', valor: k, motivo: `o aparelho não manda "power"; "${k}" = ${String(a[k])}, faixa de tensão de veículo` });
  }
  const rssi = a.rssi;
  if (!atual.sinal_max && typeof rssi === 'number' && Number.isInteger(rssi) && rssi > 5 && rssi <= 31) {
    out.push({ campo: 'sinalMax', valor: '31', motivo: `"rssi" = ${rssi}, acima de 5: escala CSQ (0 a 31)` });
  }
  if (!atual.atributo_bloqueio && !('blocked' in a)) {
    const k = Object.keys(a).find((x) => NOME_SAIDA.test(x) && (typeof a[x] === 'boolean' || a[x] === 0 || a[x] === 1));
    if (k) out.push({ campo: 'atributoBloqueio', valor: k, motivo: `o aparelho não manda "blocked"; "${k}" é saída digital: confirme bloqueando e vendo o valor mudar` });
  }
  return out;
}

// Dados do painel (rede CAN): o estado de cada sinal na instalação vigente vem da API (regras em
// apps/api/src/telemetria/sinais-motor.ts); aqui só vira texto com o que conferir. Docs: docs/PESQUISA-REDE-CAN.md § 4.2.
export const SINAIS_MOTOR: SinalMotor[] = ['rpm', 'odometro', 'combustivel', 'horimetro'];
export const ROTULO_SINAL: Record<SinalMotor, string> = { rpm: 'RPM', odometro: 'Odômetro do painel', combustivel: 'Combustível', horimetro: 'Horímetro' };
export const ROTULO_SUPORTE_CAN: Record<SuporteCan, string> = {
  nativo: 'Lê a rede CAN direto',
  com_acessorio: 'Lê a rede CAN com adaptador',
  nao: 'Não lê a rede CAN',
  nao_informado: 'Não informado',
};

/** Valor na unidade do Traccar convertido para leitura: odômetro em metros, horímetro `hours` em ms. */
export function valorDoSinal(sinal: SinalMotor, valor: number, atributo: string | null): string {
  const n = (v: number, casas = 0) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas });
  if (sinal === 'rpm') return `${n(valor)} rpm`;
  if (sinal === 'odometro') return `${n(valor / 1000, 1)} km`;
  if (sinal === 'combustivel') return atributo === 'fuel' ? `${n(valor, 1)} L` : atributo === 'fuelLevel' ? `${n(valor, 1)}%` : n(valor, 1);
  return atributo === 'hours' ? `${n(valor / 3_600_000, 1)} h` : n(valor, 1);
}

function dicaNaoRecebido(suporte: SuporteCan, parou: boolean): string {
  if (parou) return 'Veja se o chicote ou o adaptador foi mexido (oficina) ou se outro aparelho entrou na rede CAN.';
  if (suporte === 'com_acessorio') return 'Confira se o adaptador CAN está ligado ao aparelho e com o programa do veículo configurado.';
  if (suporte === 'nativo') return 'Confira a ligação do fio CAN no chicote e se a leitura deste dado está habilitada na configuração do aparelho.';
  return 'O veículo pode não expor este dado na rede CAN.';
}

/**
 * Um item por sinal prometido pelo modelo ou já avaliado na instalação. Sinal prometido sem avaliação = "não verificado"
 * (a conferência só começa instalado e com o veículo em movimento); nada é cobrado de modelo sem ficha.
 */
export function itensDosSinaisMotor(s: SinaisMotorDiagnostico, agora = Date.now()): ItemChecklist[] {
  const avaliados = new Map(s.sinais.map((x) => [x.sinal, x]));
  return SINAIS_MOTOR.filter((sinal) => s.esperados.includes(sinal) || avaliados.has(sinal)).map((sinal) => {
    const etapa = ROTULO_SINAL[sinal];
    const x = avaliados.get(sinal);
    if (!x) return { etapa, tom: 'info', texto: 'Não verificado: a conferência começa com o rastreador instalado e o veículo em movimento.' };
    const ultimo = x.ultimoValor !== null && x.ultimaLeituraEm
      ? `${valorDoSinal(sinal, x.ultimoValor, x.atributo)} há ${haQuanto(x.ultimaLeituraEm, agora)}${x.atributo ? ` (${x.atributo})` : ''}`
      : null;
    if (x.status === 'recebido') return { etapa, tom: 'ok', texto: `Recebido: ${ultimo ?? x.motivo}.` };
    if (x.status === 'aguardando') return { etapa, tom: 'info', texto: `${x.motivo}.` };
    if (x.status === 'fora_do_esperado') {
      return { etapa, tom: 'warn', texto: `${x.motivo}. Confira o perfil do aparelho para este veículo.${ultimo ? ` Última leitura válida: ${ultimo}.` : ''}` };
    }
    return { etapa, tom: 'crit', texto: `${x.motivo}. ${dicaNaoRecebido(s.suporteCan, !!x.ultimaLeituraEm)}${ultimo ? ` Última leitura: ${ultimo}.` : ''}` };
  });
}
