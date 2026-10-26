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

  async createDevice(config: TraccarConfig, device: { name: string; uniqueId: string }): Promise<TraccarDevice> {
    return this.request<TraccarDevice>(config, 'POST', '/api/devices', device);
  }

  private async request<T>(config: TraccarConfig, method: string, path: string, body?: unknown): Promise<T> {
    const auth = Buffer.from(`${config.user}:${config.password}`).toString('base64');
    const response = await fetch(`${config.url}${path}`, {
      method,
      headers: { Authorization: `Basic ${auth}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      throw new Error(`Traccar ${method} ${path.split('?')[0]} falhou: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as T;
  }
}
