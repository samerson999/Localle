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

/**
 * Cliente HTTP para a API REST do Traccar (docs/PLANO-ADAPTADOR-TRACCAR.md § 2) — só o backend fala com
 * o Traccar, nunca o front. Primeira versão: polling em `GET /api/positions`
 * (docs/ARQUITETURA-BACKEND.md § 4, opção 2); trocar por webhook/WebSocket é um passo isolado depois.
 */
@Injectable()
export class TraccarClient {
  async fetchPositions(config: TraccarConfig): Promise<TraccarPositionPayload[]> {
    const auth = Buffer.from(`${config.user}:${config.password}`).toString('base64');
    const response = await fetch(`${config.url}/api/positions`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!response.ok) {
      throw new Error(`Traccar GET /api/positions falhou: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as TraccarPositionPayload[];
  }
}
