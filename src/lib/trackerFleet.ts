// Console da Locale · Rastreadores e chips: estoque, custos, vínculos e instalações, no nível da plataforma
// (diferente de lib/store.ts `trackerStock`, que é o estoque só do cliente da simulação). Dados simulados.
export type TrackerStatus = 'instalado' | 'estoque' | 'manutencao' | 'avariado';
export interface TrackerRecord {
  imei: string; model: string; protocol: string; cost: number;
  chip: { operator: string; iccid: string } | null;
  client: string | null; vehicle: string | null;
  status: TrackerStatus; lastSignal: number | null; installedAt: number | null; technician: string | null;
}

export function seedTrackerFleet(now = Date.now()): TrackerRecord[] {
  const DAY = 86400000;
  const mk = (i: number, model: string, protocol: string, cost: number, client: string | null, vehicle: string | null, status: TrackerStatus, daysAgo: number | null, tech: string | null): TrackerRecord => ({
    imei: `86489303${String(1000000 + i).slice(1)}`, model, protocol, cost,
    chip: client ? { operator: ['Vivo M2M', 'Claro M2M', 'TIM M2M'][i % 3], iccid: `8955${String(10000000000 + i)}` } : null,
    client, vehicle, status, lastSignal: status === 'instalado' ? now - (i % 5) * 3600000 : null, installedAt: daysAgo != null ? now - daysAgo * DAY : null, technician: tech,
  });
  return [
    mk(1, 'Suntech ST310U', 'Suntech', 180, 'Transportes Litoral', 'ABC-1001', 'instalado', 320, 'Gilmar Souza'),
    mk(2, 'Suntech ST310U', 'Suntech', 180, 'Transportes Litoral', 'ABC-1002', 'instalado', 300, 'Gilmar Souza'),
    mk(3, 'Teltonika FMC130', 'Teltonika', 240, 'Frigorífico Agreste', 'PEX-2010', 'instalado', 280, 'Josenildo Melo'),
    mk(4, 'Teltonika FMC130', 'Teltonika', 240, 'Frigorífico Agreste', 'PEX-2011', 'instalado', 90, 'Josenildo Melo'),
    mk(5, 'GT06', 'GT06', 95, 'Construtora Mar', 'QRT-3005', 'instalado', 150, 'Gilmar Souza'),
    mk(6, 'Suntech ST310U', 'Suntech', 180, 'Rastreia Nordeste', 'KZM-4002', 'instalado', 400, 'Josenildo Melo'),
    mk(7, 'Teltonika FMC130', 'Teltonika', 240, 'Distribuidora Sertão', 'SNA-5001', 'instalado', 60, 'Gilmar Souza'),
    mk(8, 'GT06', 'GT06', 95, 'Expresso Caatinga', 'ABC-1050', 'avariado', 200, 'Josenildo Melo'),
    mk(9, 'Suntech ST310U', 'Suntech', 180, null, null, 'estoque', null, null),
    mk(10, 'Suntech ST310U', 'Suntech', 180, null, null, 'estoque', null, null),
    mk(11, 'Teltonika FMC130', 'Teltonika', 240, null, null, 'estoque', null, null),
    mk(12, 'GT06', 'GT06', 95, null, null, 'manutencao', null, null),
  ];
}
