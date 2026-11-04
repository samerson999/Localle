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

  async findDeviceByUniqueId(config: TraccarConfig, uniqueId: string): Promise<TraccarDevice | null> {
    const devices = await this.request<TraccarDevice[]>(
      config,
      'GET',
      `/api/devices?uniqueId=${encodeURIComponent(uniqueId)}`,
    );
    return devices.find((d) => d.uniqueId === uniqueId) ?? null;
  }

  /** Todos os devices (com `status` de conexão) — tela de saúde da plataforma. */
  async listDevices(config: TraccarConfig): Promise<TraccarDevice[]> {
    return this.request<TraccarDevice[]>(config, 'GET', '/api/devices');
  }

  /** `model`: modelo do catálogo, para aparecer também no painel do Traccar. */
  async createDevice(config: TraccarConfig, device: { name: string; uniqueId: string; model?: string }): Promise<TraccarDevice> {
    return this.request<TraccarDevice>(config, 'POST', '/api/devices', device);
  }

  /**
   * `POST /api/commands/send` (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 1.4): 200 = entregue ao socket do
   * aparelho agora; 202 = enfileirado no Traccar até o aparelho conectar. Nenhum dos dois é execução.
   */
  async sendCommand(config: TraccarConfig, command: { deviceId: number; type: string }): Promise<{ queued: boolean; id: number | null }> {
    const auth = Buffer.from(`${config.user}:${config.password}`).toString('base64');
    const response = await fetch(`${config.url}/api/commands/send`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: command.deviceId, type: command.type, attributes: {} }),
    });
    if (!response.ok) throw new Error(`Traccar POST /api/commands/send falhou: ${response.status} ${response.statusText}${await motivo(response)}`);
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

  private async request<T>(config: TraccarConfig, method: string, path: string, body?: unknown): Promise<T> {
    const auth = Buffer.from(`${config.user}:${config.password}`).toString('base64');
    const response = await fetch(`${config.url}${path}`, {
      method,
      // Accept explícito: os relatórios do Traccar respondem planilha ou JSON conforme o Accept
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      throw new Error(`Traccar ${method} ${path.split('?')[0]} falhou: ${response.status} ${response.statusText}${await motivo(response)}`);
    }
    return (await response.json()) as T;
  }
}
