// Console da Locale · Saúde da plataforma: dados simulados de infraestrutura (sem fonte real nesta simulação).
export interface PlatformHealth {
  gateway: { connected: number; total: number; messagesPerSecond: number; decodeFailuresByProtocol: { protocol: string; failures: number }[] };
  queue: { delaySec: number };
  database: { sizeGb: number; dailyGrowthGb: number; diskUsedPct: number };
  integrations: { name: string; status: 'ok' | 'degradado' | 'fora' }[];
  geocoding: { status: 'ok' | 'degradado' | 'fora' };
  lastBackupAt: number;
  lastRestoreTestAt: number;
}

export function seedPlatformHealth(now = Date.now()): PlatformHealth {
  return {
    gateway: { connected: 598, total: 612, messagesPerSecond: 342, decodeFailuresByProtocol: [
      { protocol: 'Suntech', failures: 12 }, { protocol: 'Teltonika', failures: 4 }, { protocol: 'GT06', failures: 1 },
    ] },
    queue: { delaySec: 2.4 },
    database: { sizeGb: 148, dailyGrowthGb: 1.1, diskUsedPct: 58 },
    integrations: [
      { name: 'SEFAZ (NF-e)', status: 'ok' }, { name: 'SERPRO (CNH/multas)', status: 'ok' },
      { name: 'E-mail', status: 'ok' }, { name: 'WhatsApp', status: 'degradado' },
    ],
    geocoding: { status: 'ok' },
    lastBackupAt: now - 6 * 3600000,
    lastRestoreTestAt: now - 11 * 86400000,
  };
}

// dias até o disco chegar a um percentual-alvo, no ritmo atual de crescimento
export const daysUntilDiskPct = (h: PlatformHealth, targetPct: number) => {
  const growthPctPerDay = (h.database.dailyGrowthGb / h.database.sizeGb) * 100;
  return growthPctPerDay > 0 && targetPct > h.database.diskUsedPct ? Math.round((targetPct - h.database.diskUsedPct) / growthPctPerDay) : null;
};
