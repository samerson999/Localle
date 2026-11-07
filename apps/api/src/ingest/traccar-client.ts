import { Injectable } from '@nestjs/common';
import type { TraccarPositionPayload } from './traccar-position.mapper';

export interface TraccarConfig {
  url: string;
  user: string;
  password: string;
}

export function readTraccarConfig(): TraccarConfig | null {
  const url = process.env.TRACCAR_URL;
  const user = process.env.TRACCAR_USER;
  const password = process.env.TRACCAR_PASSWORD;
  if (!url || !user || !password) return null;
  return { url, user, password };
}

/** Campos de `GET/POST /api/devices` que o backend usa. */
export interface TraccarDevice {
  id: number;
  uniqueId: string;
  name: string;
  /** 'online' | 'offline' | 'unknown' — conexão do aparelho com o Traccar agora. */
  status?: string;
  /** Último pacote recebido do aparelho (qualquer mensagem, não só posição); null se nunca falou. */
  lastUpdate?: string | null;
}

/**
 * Motivo que o Traccar devolve no corpo de um erro (ex.: "Duplicate entry" ao criar device com uniqueId já usado):
 * uma linha, curto. Não tem credencial — é a mensagem de erro do próprio Traccar.
 */
async function motivo(response: Response): Promise<string> {
  const texto = (await response.text().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 300);
  return texto ? ` — ${texto}` : '';
}

/** Protocolo de `GET /api/protocols`: transporte 'DISABLED' | 'TCP' | 'UDP' | 'ALL'. */
export interface TraccarProtocolo {
  protocolo: string;
  porta: number | null;
  transporte: string | null;
}

/** Campos de um evento de `GET /api/reports/events` usados na conciliação de comandos. */
export interface TraccarEventoComando {
  id: number;
  deviceId: number;
  type: string;
  eventTime: string;
  attributes?: Record<string, unknown>;
}

/**
 * Cliente HTTP para a API REST do Traccar (docs/PLANO-ADAPTADOR-TRACCAR.md § 2) — só o backend fala com
 * o Traccar, nunca o front. Primeira versão: polling em `GET /api/positions`
 * (docs/ARQUITETURA-BACKEND.md § 4, opção 2); trocar por webhook/WebSocket é um passo isolado depois.
 */
@Injectable()
export class TraccarClient {
  /** Lido a cada chamada (não no construtor) para o teste conseguir trocar o ambiente. */
  config(): TraccarConfig | null {
    return readTraccarConfig();
  }

  async fetchPositions(config: TraccarConfig): Promise<TraccarPositionPayload[]> {
    return this.request<TraccarPositionPayload[]>(config, 'GET', '/api/positions');
  }

  /**
   * Histórico de um device (`GET /api/positions?deviceId&from&to`) para a conciliação. O Traccar filtra por **fixTime**,
   * não pela hora em que recebeu: posição muito atrasada só aparece na janela da hora dela. Datas voltam em ISO com
   * fuso — ao contrário de `tc_positions`, que guarda a hora local do container sem fuso (HML: America/Recife).
   */
  async positionsBetween(config: TraccarConfig, deviceId: number, from: Date, to: Date, timeoutMs = 30_000): Promise<TraccarPositionPayload[]> {
    const qs = new URLSearchParams({ deviceId: String(deviceId), from: from.toISOString(), to: to.toISOString() });
    return this.request<TraccarPositionPayload[]>(config, 'GET', `/api/positions?${qs}`, undefined, timeoutMs);
  }

  async findDeviceByUniqueId(config: TraccarConfig, uniqueId: string): Promise<TraccarDevice | null> {
    const devices = await this.request<TraccarDevice[]>(
      config,
      'GET',
      `/api/devices?uniqueId=${encodeURIComponent(uniqueId)}`,
    );
    return devices.find((d) => d.uniqueId === uniqueId) ?? null;
  }

  /** Todos os devices (com `status` de conexão) — tela de saúde da plataforma. */
  async listDevices(config: TraccarConfig, timeoutMs?: number): Promise<TraccarDevice[]> {
    return this.request<TraccarDevice[]>(config, 'GET', '/api/devices', undefined, timeoutMs);
  }

  /** `model`: modelo do catálogo, para aparecer também no painel do Traccar. */
  async createDevice(config: TraccarConfig, device: { name: string; uniqueId: string; model?: string }): Promise<TraccarDevice> {
    return this.request<TraccarDevice>(config, 'POST', '/api/devices', device);
  }

  /** `DELETE /api/devices/:id` (responde sem corpo). Device que já não existe (404) conta como apagado. */
  async deleteDevice(config: TraccarConfig, deviceId: number): Promise<void> {
    await this.chamar(config, 'DELETE', `/api/devices/${deviceId}`, { aceitar404: true });
  }

  /**
   * `POST /api/commands/send` (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 1.4): 200 = entregue ao socket do
   * aparelho agora; 202 = enfileirado no Traccar até o aparelho conectar. Nenhum dos dois é execução.
   */
  async sendCommand(config: TraccarConfig, command: { deviceId: number; type: string }): Promise<{ queued: boolean; id: number | null }> {
    const response = await this.chamar(config, 'POST', '/api/commands/send', {
      body: { deviceId: command.deviceId, type: command.type, attributes: {} },
    });
    const body = (await response.json().catch(() => null)) as { id?: number } | null;
    return { queued: response.status === 202, id: typeof body?.id === 'number' ? body.id : null };
  }

  /** Tipos de comando que o Traccar sabe codificar para o protocolo do device (varia por aparelho; ex.: só `custom`). */
  async commandTypes(config: TraccarConfig, deviceId: number): Promise<string[]> {
    const tipos = await this.request<{ type?: unknown }[]>(config, 'GET', `/api/commands/types?deviceId=${deviceId}`);
    return tipos.map((t) => t.type).filter((t): t is string => typeof t === 'string');
  }

  /** Versão do servidor (`GET /api/server`); null se o Traccar não informar. */
  async serverVersion(config: TraccarConfig): Promise<string | null> {
    const s = await this.request<{ version?: unknown }>(config, 'GET', '/api/server');
    return typeof s.version === 'string' ? s.version : null;
  }

  /**
   * Protocolos ativos no servidor, com porta e transporte (`GET /api/protocols`, Traccar 6.17+). null = versão sem
   * esse endpoint (404) — os protocolos ficam só no traccar.xml/default.xml dele.
   */
  async protocols(config: TraccarConfig): Promise<TraccarProtocolo[] | null> {
    try {
      const lista = await this.request<{ protocol?: unknown; port?: unknown; transport?: unknown }[]>(config, 'GET', '/api/protocols');
      return lista
        .filter((p) => typeof p.protocol === 'string')
        .map((p) => ({ protocolo: p.protocol as string, porta: typeof p.port === 'number' ? p.port : null, transporte: typeof p.transport === 'string' ? p.transport : null }));
    } catch (err) {
      if (/falhou: 404\b/.test((err as Error).message)) return null;
      throw err;
    }
  }

  /** Situação da conexão do device no Traccar (`online` = socket aberto agora); null se o device não existe. */
  async deviceStatus(config: TraccarConfig, deviceId: number): Promise<string | null> {
    const [d] = await this.request<{ status?: unknown }[]>(config, 'GET', `/api/devices?id=${deviceId}`);
    return typeof d?.status === 'string' ? d.status : null;
  }

  /**
   * Eventos `commandResult` gravados no Traccar para o device no intervalo (`GET /api/reports/events`).
   * Conciliação dos comandos (comandos.service.ts): não depende de o Forwarding ter entregado o evento.
   */
  async commandResults(config: TraccarConfig, deviceId: number, from: Date, to: Date): Promise<TraccarEventoComando[]> {
    const qs = new URLSearchParams({ deviceId: String(deviceId), type: 'commandResult', from: from.toISOString(), to: to.toISOString() });
    return this.request<TraccarEventoComando[]>(config, 'GET', `/api/reports/events?${qs}`);
  }

  private async request<T>(config: TraccarConfig, method: string, path: string, body?: unknown, timeoutMs?: number): Promise<T> {
    const response = await this.chamar(config, method, path, { body, timeoutMs });
    return (await response.json()) as T;
  }

  /**
   * Único caminho até o Traccar: autenticação, tempo limite e mensagem de erro com o motivo. Sem tempo limite, um
   * Traccar travado (socket aberto, sem resposta) prendia quem chamou indefinidamente — o poller, a conciliação, uma
   * requisição do usuário. `aceitar404`: para quem trata "não existe" como resultado (apagar device já apagado).
   */
  private async chamar(
    config: TraccarConfig,
    method: string,
    path: string,
    opcoes: { body?: unknown; timeoutMs?: number; aceitar404?: boolean } = {},
  ): Promise<Response> {
    const auth = Buffer.from(`${config.user}:${config.password}`).toString('base64');
    const timeoutMs = opcoes.timeoutMs ?? traccarTimeoutMs();
    const rota = `${method} ${path.split('?')[0]}`;
    let response: Response;
    try {
      response = await fetch(`${config.url}${path}`, {
        method,
        // Accept explícito: os relatórios do Traccar respondem planilha ou JSON conforme o Accept
        headers: { Authorization: `Basic ${auth}`, Accept: 'application/json', ...(opcoes.body ? { 'Content-Type': 'application/json' } : {}) },
        body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if ((err as Error).name === 'TimeoutError') throw new Error(`Traccar ${rota} sem resposta em ${timeoutMs} ms`);
      throw new Error(`Traccar ${rota} inacessível: ${(err as Error).message}`);
    }
    if (!response.ok && !(opcoes.aceitar404 && response.status === 404)) {
      throw new Error(`Traccar ${rota} falhou: ${response.status} ${response.statusText}${await motivo(response)}`);
    }
    return response;
  }
}

/** Tempo limite padrão de cada chamada ao Traccar (`TRACCAR_TIMEOUT_MS`, padrão 15 s). */
export function traccarTimeoutMs(): number {
  const v = Number(process.env.TRACCAR_TIMEOUT_MS);
  return Number.isFinite(v) && v > 0 ? v : 15_000;
}
