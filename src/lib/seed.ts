import { uid, DAY, HOUR, MIN, startOfDay } from './utils';
import { SPECS_DB, CTB } from './catalog';
import { processTick, VState } from './engine';
import { seedTires, DEFAULT_TIRE_CFG } from './pneus';
import { seedPlatform } from './billing';
import { seedPlans } from './plans';
import { seedClients } from './clients';
import { DEFAULT_RECIPIENTS } from './escalation';
import { enrichFuelings } from './fuel';
import { trailerKm } from './couplings';
import { seedTripHistory } from './trips';

const R = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export function buildSeed(now = Date.now()) {
  const groups = [
    { id: 'g1', name: 'Frota Recife' }, { id: 'g2', name: 'Cavalos mecânicos' },
    { id: 'g3', name: 'Refrigerados' }, { id: 'g4', name: 'Linha amarela' },
  ];
  const operations = [{ id: 'op1', name: 'Distribuição RMR' }, { id: 'op2', name: 'Transferência Suape' }, { id: 'op3', name: 'Obra Suape' }];
  const drivers = [
    { id: 'd1', name: 'Anderson Silva', cnh: '04512378901', cnhCat: 'E', phone: '(81) 90000-0001', regime: 'cargas', ear: true },
    { id: 'd2', name: 'Luciano Barros', cnh: '03321456789', cnhCat: 'E', phone: '(81) 90000-0002', regime: 'cargas', ear: true },
    { id: 'd3', name: 'Márcia Lima', cnh: '05698741230', cnhCat: 'B', phone: '(81) 90000-0003', regime: 'cargas' },
    { id: 'd4', name: 'Ricardo Souza', cnh: '02145698730', cnhCat: 'B', phone: '(81) 90000-0004', regime: 'cargas' },
    { id: 'd5', name: 'Paulo Henrique', cnh: '07789456123', cnhCat: 'C', phone: '(81) 90000-0005', regime: 'cargas' },
    { id: 'd6', name: 'Josué Ferreira', cnh: '06654123987', cnhCat: 'D', phone: '(81) 90000-0006', regime: 'cargas' },
    { id: 'd7', name: 'Carla Nunes', cnh: '08874512396', cnhCat: 'D', phone: '(81) 90000-0007', regime: 'cargas' },
  ];
  const veh = (o: any) => ({ kind: 'veiculo', meter: 'km', kmSource: 'mescla', kmOffset: 0, customFields: [], groupIds: [], active: true, photo: '', journeySource: 'teclado', fuelBudget: 0, ...o, specs: o.specs ?? SPECS_DB[o.model] ?? {} });
  const tr = (imei: string, model: string, daysAgo: number) => ({ imei, model, iccid: '8955' + imei.slice(-12), linkedAt: now - daysAgo * DAY });
  const assets = [
    veh({ id: 'a1', name: 'KOZ5H91', plate: 'KOZ5H91', brand: 'Scania', model: 'R450 6x2', year: '2021/2021', can: true, driverId: 'd1', groupIds: ['g1', 'g2'], operationId: 'op2', fuelGoal: 2.4, fuelBudget: 26000, tracker: tr('868120244591032', 'Teltonika FMC130', 420) }),
    veh({ id: 'a2', name: 'PEW1A33', plate: 'PEW1A33', brand: 'Volvo', model: 'FH 540 6x4', year: '2020/2020', can: true, driverId: 'd2', groupIds: ['g2'], operationId: 'op2', fuelGoal: 2.2, fuelBudget: 28000, tracker: tr('868120244591040', 'Teltonika FMC130', 380) }),
    veh({ id: 'a3', name: 'QYZ6G44', plate: 'QYZ6G44', brand: 'Fiat', model: 'Fiorino Endurance 1.4', year: '2022/2023', driverId: 'd3', groupIds: ['g1', 'g3'], operationId: 'op1', fuelGoal: 10.5, fuelBudget: 1900, tracker: tr('358657103344521', 'GT06', 300) }),
    veh({ id: 'a4', name: 'KHP4G42', plate: 'KHP4G42', brand: 'Mercedes-Benz', model: 'Atego 2430', year: '2019/2019', groupIds: ['g1'], operationId: 'op1', fuelGoal: 3.8, fuelBudget: 9000, tracker: tr('358657103344539', 'GT06', 250) }),
    veh({ id: 'a5', name: 'SNN9C28', plate: 'SNN9C28', brand: 'Toyota', model: 'Hilux SRV 2.8', year: '2024/2025', driverId: 'd4', groupIds: ['g1'], operationId: 'op1', fuelGoal: 9, fuelBudget: 2600, tracker: tr('864893030911223', 'Suntech ST310U', 120) }),
    veh({ id: 'a6', name: 'RZM9I22', plate: 'RZM9I22', brand: 'Volkswagen', model: 'Delivery Express 4.150', year: '2023/2024', driverId: 'd5', groupIds: ['g1'], operationId: 'op1', fuelGoal: 7.5, fuelBudget: 3200, tracker: tr('864893030911231', 'Suntech ST310U', 40) }),
    veh({ id: 'a7', name: 'PET4211', plate: 'PET4211', brand: 'Volkswagen', model: 'Delivery Express 4.150', year: '2018/2018', groupIds: ['g1'], operationId: 'op1', fuelGoal: 7, tracker: tr('358657103344547', 'GT06', 600) }),
    veh({ id: 'a8', name: 'Retroescavadeira 01', plate: '', kind: 'linha_amarela', brand: 'JCB', model: '3CX', year: '2020', meter: 'horimetro', kmSource: 'rastreador', driverId: 'd6', groupIds: ['g4'], operationId: 'op3', fuelGoal: 0, specs: { Motor: 'JCB 444 92 cv', Combustível: 'Diesel S10', Tanque: '160 L', 'Óleo do motor': '15W40', 'Óleo hidráulico': 'ISO VG 46' }, tracker: tr('864893030911249', 'Suntech ST310U', 200) }),
    veh({ id: 'a9', name: 'Caixa fria CF-07', plate: '', kind: 'equipamento', brand: 'Termo King', model: 'CF 120 L', year: '2023', meter: 'nenhum', kmSource: 'rastreador', groupIds: ['g3'], operationId: 'op1', fuelGoal: 0, specs: {}, customFields: [{ k: 'Faixa de temperatura', v: '2 a 8 °C' }, { k: 'Patrimônio', v: 'PAT-00731' }], tracker: tr('861230045671234', 'IoT LoRa Tag', 60) }),
    // cavalo 6x2 e carreta de 3 eixos (implemento com pneus próprios; km pelo histórico de engates)
    veh({ id: 'a10', name: 'RJX2B57', plate: 'RJX2B57', brand: 'Scania', model: 'R450 6x2', year: '2022/2022', can: true, groupIds: ['g2'], operationId: 'op2', fuelGoal: 2.4, fuelBudget: 24000, tracker: tr('868120244591073', 'Teltonika FMC130', 150) }),
    veh({ id: 'a11', name: 'Carreta SR-01', plate: 'QXA7C11', kind: 'implemento', category: 'carreta', brand: 'Randon', model: 'Semirreboque graneleiro 3 eixos', year: '2022', meter: 'km', kmSource: 'engate', kmBase: 61200, tireLayout: 'carreta', trailerType: 'semirreboque', groupIds: ['g2'], operationId: 'op2', fuelGoal: 0, specs: { Eixos: '3', Suspensão: 'Pneumática', Capacidade: '33 t' } }),
    // bitrem do PEW1A33: dois semirreboques de 2 eixos, em ordem (dianteiro e traseiro)
    veh({ id: 'a12', name: 'Bitrem BT-01A', plate: 'QXB3D12', kind: 'implemento', category: 'carreta', brand: 'Librelato', model: 'Bitrem graneleiro dianteiro 2 eixos', year: '2023', meter: 'km', kmSource: 'engate', kmBase: 38400, tireLayout: 'carreta', trailerType: 'semirreboque', groupIds: ['g2'], operationId: 'op2', fuelGoal: 0, specs: { Eixos: '2', Suspensão: 'Pneumática', Capacidade: '20 t' } }),
    veh({ id: 'a13', name: 'Bitrem BT-01B', plate: 'QXB3D13', kind: 'implemento', category: 'carreta', brand: 'Librelato', model: 'Bitrem graneleiro traseiro 2 eixos', year: '2023', meter: 'km', kmSource: 'engate', kmBase: 38400, tireLayout: 'carreta', trailerType: 'semirreboque', groupIds: ['g2'], operationId: 'op2', fuelGoal: 0, specs: { Eixos: '2', Suspensão: 'Pneumática', Capacidade: '20 t' } }),
  ];
  // documentos com vencimento (lib/assetDocs): um vencido, um na semana e alguns no mês, para o "Precisa de você"
  const due = (days: number) => new Date(now + days * DAY - 3 * 3600000).toISOString().slice(0, 10);
  const docs: Record<string, [string, number, string][]> = {
    a1: [['crlv', 160, ''], ['seguro', 5, 'APL 0091-772'], ['tacografo', 41, '']],
    a2: [['crlv', 190, ''], ['ipva', 22, ''], ['rntrc', 300, '052211874']],
    a4: [['crlv', -3, ''], ['tacografo', 12, '']],
    a5: [['seguro', 230, 'APL 0091-805']],
    a11: [['crlv', 75, '']],
  };
  // validade da CNH e do toxicológico: d3 com CNH vencendo, d5 com toxicológico vencido
  const dd: Record<string, [number, number]> = { d1: [420, 300], d2: [800, 510], d3: [4, 0], d4: [600, 0], d5: [380, -12], d6: [950, 640], d7: [260, 20] };
  for (const d of drivers as any[]) if (dd[d.id]) { d.cnhDue = due(dd[d.id][0]); if (dd[d.id][1]) d.toxDue = due(dd[d.id][1]); }
  for (const a of assets as any[]) a.documents = (docs[a.id] || []).map(([type, d, number], i) => ({ id: `doc_${a.id}_${i}`, type, number, due: due(d) }));

  const sq =(c: [number, number], d: number): [number, number][] => [[c[0] - d, c[1] - d], [c[0] - d, c[1] + d], [c[0] + d, c[1] + d], [c[0] + d, c[1] - d]];
  const fences = [
    { id: 'f1', name: 'Matriz Recife', type: 'Matriz', shape: 'polygon', points: sq([-8.1015, -34.9390], 0.0022), startsTrip: true, endsTrip: true, alertIn: false, alertOut: false, speedLimit: 20, maxStayMin: 0 },
    { id: 'f2', name: 'Filial Olinda', type: 'Filial', shape: 'circle', center: [-8.0089, -34.8553], radius: 260, startsTrip: true, endsTrip: true, alertIn: false, alertOut: false, speedLimit: 20, maxStayMin: 0 },
    { id: 'f3', name: 'Oficina Diesel PE', type: 'Oficina', shape: 'circle', center: [-8.1355, -34.9420], radius: 160, alertIn: true, alertOut: true, speedLimit: 10, maxStayMin: 0 },
    { id: 'f4', name: 'Posto BR-101', type: 'Posto', shape: 'circle', center: [-8.1450, -34.9600], radius: 160, alertIn: false, alertOut: false, maxStayMin: 30 },
    { id: 'f5', name: 'Cliente Atacadão Candeias', type: 'Cliente', shape: 'circle', center: [-8.2010, -34.9190], radius: 220, alertIn: false, alertOut: false, maxStayMin: 60 },
    { id: 'f6', name: 'Cliente Shopping Recife', type: 'Cliente', shape: 'circle', center: [-8.1187, -34.9048], radius: 260, alertIn: false, alertOut: false, maxStayMin: 45 },
    { id: 'f7', name: 'Obra Suape', type: 'Pátio', shape: 'polygon', points: sq([-8.3960, -34.9605], 0.004), alertIn: false, alertOut: true, maxStayMin: 0 },
    { id: 'f8', name: 'Área de risco — Av. Norte', type: 'Área de risco', shape: 'circle', center: [-8.0700, -34.9200], radius: 450, alertIn: true, alertOut: false, maxStayMin: 0 },
  ];

  const rules = [
    { id: 'r1', name: 'Veículo rodando após 22h', active: true, priority: 'media', conditions: [{ field: 'ignicao', op: '=', value: 'Ligada' }, { field: 'horario', op: 'depois de', value: '22:00' }, { field: 'velocidade', op: '>', value: '5' }], actions: { painel: true, email: true, motorista: true, ranking: true, bloqueio: false } },
    { id: 'r2', name: 'Velocidade acima de 90 km/h', active: true, priority: 'media', conditions: [{ field: 'velocidade', op: '>', value: '90' }], actions: { painel: true, motorista: true } },
    { id: 'r3', name: 'Temperatura do baú acima de -12 °C', active: true, priority: 'alta', groupId: 'g3', conditions: [{ field: 'temperatura', op: '>', value: '-12' }], actions: { painel: true, whatsapp: true } },
    { id: 'r4', name: 'Porta do baú aberta fora de cliente', active: true, priority: 'media', conditions: [{ field: 'porta', op: '=', value: 'Aberta' }, { field: 'fora_cerca', op: '=', value: 'Cliente' }], actions: { painel: true } },
    { id: 'r5', name: 'Bateria baixa / possível violação', active: true, priority: 'media', conditions: [{ field: 'bateria', op: '<', value: '11.5' }], actions: { painel: true, email: true } },
  // prioridade alta (crítico) só para: pânico, bloqueio pendente, área de risco, temperatura do baú e rastreador desconectado
  ...NEW_RULES,
  ];
  const commandDefs = [
    { id: 'c_bloq', name: 'Bloqueio', desc: 'Corta a alimentação com segurança', payload: 'RELAY,1#', kind: 'bloqueio', system: true },
    { id: 'c_desb', name: 'Desbloqueio', desc: 'Libera o veículo', payload: 'RELAY,0#', kind: 'desbloqueio', system: true },
    { id: 'c_alerta', name: 'Alerta ao motorista', desc: 'Buzzer + mensagem no teclado / app', payload: 'BUZZER,1#', kind: 'alerta', system: true },
    { id: 'c_bau', name: 'Abrir baú', desc: 'Aciona a saída 2 do rastreador', payload: 'OUTPUT2,1#', kind: 'custom' },
    { id: 'c_reset', name: 'Reiniciar rastreador', desc: 'Reinicia o equipamento', payload: 'RESET#', kind: 'custom' },
    { id: 'c_pos', name: 'Solicitar posição', desc: 'Força o envio da posição', payload: 'WHERE#', kind: 'custom' },
  ];

  // Estado inicial dos veículos
  const base = (o: any): VState => ({ seg: 1, speed: 0, target: 40, heading: 0, ignition: false, blocked: false, noSignal: false, stopLeft: 0, odometer: 0, hourmeter: 0, battery: 13.9, gps: 12, gsm: 4, lastUpdate: now, inside: [], ...o });
  const vehicles: Record<string, VState> = {
    a1: base({ assetId: 'a1', route: 'A', can: true, pos: [-8.1015, -34.9390], odometer: 412880 - 150, hourmeter: 21340, battery: 27.2 }),
    a2: base({ assetId: 'a2', can: true, pos: [-8.1352, -34.9418], odometer: 159955, hourmeter: 9840, battery: 25.9 }),
    a3: base({ assetId: 'a3', route: 'B', pos: [-8.1187, -34.9048], odometer: 88412 - 60, hourmeter: 3120, temp: -18, door: 'Fechada' }),
    a4: base({ assetId: 'a4', pos: [-8.0150, -34.8510], odometer: 301220, hourmeter: 14010, blocked: true, battery: 24.1 }),
    a5: base({ assetId: 'a5', route: 'C', pos: [-8.0089, -34.8553], odometer: 64010 - 90, hourmeter: 1890, seg: 1 }),
    a6: base({ assetId: 'a6', route: 'D', pos: [-8.0630, -34.8810], odometer: 48700 - 80, hourmeter: 2150, battery: 27.0 }),
    a7: base({ assetId: 'a7', pos: [-8.0120, -34.8600], odometer: 130201, hourmeter: 7720, noSignal: true, lastUpdate: now - 186 * DAY, battery: 0, gps: 0, gsm: 0 }),
    a8: base({ assetId: 'a8', route: 'E', pos: [-8.3940, -34.9600], odometer: 0, hourmeter: 4812 }),
    a10: base({ assetId: 'a10', can: true, pos: [-8.1009, -34.9381], odometer: 238420, hourmeter: 11820, battery: 26.6 }),
    a9: base({ assetId: 'a9', pos: [-8.1012, -34.9386], odometer: 0, hourmeter: 0, temp: 4.2 }),
  };

  // ---------- Jornada: 30 dias de marcações ----------
  const journey: any[] = [];
  const today0 = startOfDay(now);
  ['d1', 'd2', 'd3', 'd4', 'd5'].forEach((d, di) => {
    for (let k = 30; k >= 1; k--) {
      const day = today0 - k * DAY; const wd = new Date(day).getDay();
      if (wd === 0 || (wd === 6 && di % 2)) continue;
      const add = (h: number, type: string) => journey.push({ id: uid('jm'), driverId: d, ts: day + h * HOUR, type, source: di % 2 ? 'app' : 'teclado' });
      const late = (k + di) % 9 === 0; // dia com violações
      const start = late ? 5 : R(5.6, 7.2);
      add(start, 'inicio_jornada'); add(start + 0.05, 'inicio_direcao');
      const d1 = late ? 6.1 : R(2.5, 4.8); add(start + d1, 'fim_direcao');
      add(start + d1 + 0.05, 'inicio_refeicao'); const meal = (k + di) % 7 === 0 ? 0.6 : R(1.02, 1.3); add(start + d1 + 0.05 + meal, 'fim_refeicao');
      const s2 = start + d1 + meal + 0.1; add(s2, 'inicio_direcao');
      const d2 = R(2.5, 4.5); add(s2 + d2, 'fim_direcao');
      add(s2 + d2 + 0.02, 'inicio_espera'); add(s2 + d2 + R(0.3, 1), 'fim_espera');
      const end = late ? Math.min(23, s2 + d2 + 3.5) : s2 + d2 + R(1, 1.6); add(end, 'fim_jornada');
    }
  });

  // ---------- Combustível: jan/2025 → hoje ----------
  const fuelings: any[] = [];
  const fuelCfg: Record<string, { kmMonth: number; liters: number; fuel: string; price: number }> = {
    a1: { kmMonth: 9000, liters: 450, fuel: 'Diesel S10', price: 6.05 }, a2: { kmMonth: 8000, liters: 470, fuel: 'Diesel S10', price: 6.05 },
    a3: { kmMonth: 3000, liters: 38, fuel: 'Gasolina', price: 6.19 }, a4: { kmMonth: 4200, liters: 180, fuel: 'Diesel S10', price: 6.05 },
    a5: { kmMonth: 2600, liters: 62, fuel: 'Diesel S10', price: 6.05 }, a6: { kmMonth: 3500, liters: 72, fuel: 'Diesel S10', price: 6.05 },
  };
  const start2025 = new Date(2025, 0, 2).getTime();
  const stations = ['Posto BR-101', 'Posto Ipiranga Boa Viagem', 'Posto Shell Imbiribeira', 'Posto Petrobras Olinda'];
  for (const [aid, c] of Object.entries(fuelCfg)) {
    const a = assets.find((x) => x.id === aid)!;
    const end = aid === 'a4' ? now - 14 * DAY : aid === 'a2' ? now - 2 * DAY : now - DAY;
    const totalDays = (end - start2025) / DAY;
    let odo = vehicles[aid].odometer - (c.kmMonth / 30) * totalDays;
    let t = start2025;
    while (t < end) {
      const month = new Date(t).getMonth();
      const season = 1 + 0.06 * Math.sin((month / 12) * Math.PI * 2) + (new Date(t).getFullYear() === 2026 ? 0.03 : 0);
      const liters = c.liters * R(0.85, 1.08);
      const kmDone = liters * (a.fuelGoal * season * R(0.9, 1.12));
      odo += kmDone;
      const price = +(c.price * (new Date(t).getFullYear() === 2026 ? 1.04 : 1) * R(0.97, 1.04)).toFixed(3);
      fuelings.push({ id: uid('fu'), assetId: aid, driverId: a.driverId, ts: t, odometer: Math.round(odo), liters: +liters.toFixed(2), total: +(liters * price).toFixed(2), pricePerL: price, fuel: c.fuel, station: pick(stations), photos: [] });
      t += (kmDone / (c.kmMonth / 30)) * DAY;
    }
    const mine = fuelings.filter((f) => f.assetId === aid);
    const off = vehicles[aid].odometer - 40 - mine[mine.length - 1].odometer;
    mine.forEach((f) => (f.odometer = Math.round(f.odometer + off)));
    for (let i = fuelings.length - 1; i >= 0; i--) if (fuelings[i].assetId === aid && fuelings[i].odometer < 500) fuelings.splice(i, 1);
  }

  // ---------- Manutenção ----------
  const plans = [
    { id: 'p1', name: 'Troca de óleo do motor (leves)', service: 'oleo_motor', items: 'Óleo do motor (ficha técnica), filtro de óleo', trigger: 'ambos', kmInterval: 10000, daysInterval: 180, advanceKm: 1000, advanceDays: 15, assetIds: ['a3', 'a5', 'a6', 'a7'] },
    { id: 'p2', name: 'Troca de óleo do motor (pesados)', service: 'oleo_motor', items: 'Óleo do motor, filtros de óleo e combustível', trigger: 'ambos', kmInterval: 30000, daysInterval: 365, advanceKm: 2000, advanceDays: 20, assetIds: ['a1', 'a2', 'a4'] },
    { id: 'p3', name: 'Revisão do sistema de freios', service: 'freios', items: 'Pastilhas/lonas, discos/tambores, fluido', trigger: 'km', kmInterval: 40000, daysInterval: 0, advanceKm: 2000, advanceDays: 0, assetIds: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'] },
    { id: 'p4', name: 'Lubrificação geral', service: 'lubrificacao', items: 'Graxa nos pinos e articulações', trigger: 'tempo', kmInterval: 0, daysInterval: 30, advanceKm: 0, advanceDays: 5, assetIds: ['a8'] },
  ];
  let osn = 1000;
  const wo = (o: any) => ({ id: uid('os'), num: ++osn, quotes: [], evidences: [], comments: [], nf: { chave: '', numero: '', valor: 0, erp: 'nenhum' }, services: [], unplanned: false, ...o });
  const workOrders: any[] = [];
  const oilHist: Record<string, [number, number]> = { a1: [395000, 300], a2: [148000, 200], a3: [80000, 150], a4: [290000, 360], a5: [56000, 130], a6: [39000, 160], a7: [125000, 400] };
  for (const [aid, [odo, days]] of Object.entries(oilHist)) {
    const ts = now - days * DAY;
    workOrders.push(wo({ type: 'preventiva', assetId: aid, planId: ['a1', 'a2', 'a4'].includes(aid) ? 'p2' : 'p1', services: ['oleo_motor'], title: 'Troca de óleo do motor', status: 'concluida', openedAt: ts - DAY, shopInAt: ts - 5 * HOUR, releasedAt: ts, odometerAt: odo, cost: ['a1', 'a2', 'a4'].includes(aid) ? R(1800, 2600) : R(420, 780), supplier: 'Oficina Diesel PE' }));
  }
  // corretiva que recalcula a preventiva (exemplo do RZM9I22)
  workOrders.push(wo({ type: 'corretiva', assetId: 'a6', services: ['oleo_motor'], title: 'Vazamento no cárter — troca de junta e óleo', status: 'concluida', unplanned: true, openedAt: now - 20 * DAY, shopInAt: now - 20 * DAY, releasedAt: now - 19 * DAY + 4 * HOUR, odometerAt: 47900, cost: 1240, supplier: 'Auto Center BR-232', comments: [{ id: uid('c'), ts: now - 19 * DAY, user: 'Gestor', text: 'Óleo trocado junto com a junta; plano recalculado.' }] }));
  // histórico corretivo para MTBF/MTTR
  const fails = ['Troca de embreagem', 'Alternador sem carga', 'Pneu estourado', 'Vazamento no radiador', 'Sensor ABS', 'Lâmpada do farol', 'Motor de partida', 'Correia dentada'];
  for (let i = 0; i < 26; i++) {
    const aid = pick(['a1', 'a2', 'a3', 'a4', 'a5', 'a6']);
    const ts = start2025 + R(0, now - start2025 - 25 * DAY);
    const dur = R(3, 40) * HOUR;
    workOrders.push(wo({ type: 'corretiva', assetId: aid, services: [], title: pick(fails), status: 'concluida', unplanned: true, openedAt: ts, shopInAt: ts, releasedAt: ts + dur, odometerAt: 0, cost: R(250, 6500), supplier: pick(['Oficina Diesel PE', 'Auto Center BR-232', 'Concessionária']) }));
  }
  for (let i = 0; i < 14; i++) {
    const aid = pick(['a1', 'a2', 'a3', 'a4', 'a5', 'a6']);
    const ts = start2025 + R(0, now - start2025 - 25 * DAY);
    workOrders.push(wo({ type: 'preventiva', assetId: aid, services: ['freios'], planId: 'p3', title: 'Revisão do sistema de freios', status: 'concluida', openedAt: ts, shopInAt: ts, releasedAt: ts + R(3, 9) * HOUR, odometerAt: 0, cost: R(600, 3800), supplier: 'Oficina Diesel PE' }));
  }
  // OS aberta com orçamentos (PEW1A33 está na oficina)
  const q = (supplier: string, value: number, days: number, warranty: string) => ({ id: uid('q'), supplier, value, days, warranty, file: '' });
  const qs = [q('Oficina Diesel PE', 6480, 2, '6 meses'), q('Auto Center BR-232', 5920, 3, '3 meses'), q('Volvo Concessionária', 8150, 1, '12 meses · peça original')];
  workOrders.push(wo({ type: 'corretiva', assetId: 'a2', services: ['embreagem'], title: 'Embreagem patinando', description: 'Motorista relatou patinação em subidas carregado.', status: 'orcamento', unplanned: true, openedAt: now - 31 * HOUR, shopInAt: now - 30 * HOUR, odometerAt: 159955, quotes: qs, winnerId: '', comments: [{ id: uid('c'), ts: now - 29 * HOUR, user: 'Luciano Barros', text: 'Deixei o veículo na oficina às 08h40.' }] }));
  // linha amarela lubrificação
  workOrders.push(wo({ type: 'preventiva', assetId: 'a8', planId: 'p4', services: ['lubrificacao'], title: 'Lubrificação geral', status: 'concluida', openedAt: now - 26 * DAY, shopInAt: now - 26 * DAY, releasedAt: now - 26 * DAY + 2 * HOUR, odometerAt: 0, cost: 180 }));

  // ---------- Multas ----------
  const fines: any[] = [];
  const fineAssets = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];
  for (let i = 0; i < 32; i++) {
    const aid = pick(fineAssets); const a = assets.find((x) => x.id === aid)!;
    const inf = pick(CTB); const ts = start2025 + R(0, now - start2025 - 3 * DAY);
    const st = ts < now - 90 * DAY ? pick(['paga', 'paga', 'paga', 'recurso_indeferido']) : pick(['aberta', 'condutor_indicado', 'paga', 'recurso']);
    fines.push({ id: uid('mu'), auto: 'R' + Math.floor(R(100000000, 999999999)), assetId: aid, driverId: a.driverId || 'd7', ts, place: pick(['BR-101 km 78, Jaboatão', 'Av. Agamenon Magalhães, Recife', 'PE-015, Olinda', 'Av. Boa Viagem, Recife', 'BR-232 km 14, Recife']), ...inf, notifiedAt: Math.min(now - DAY, ts + R(8, 22) * DAY), dueDate: ts + 40 * DAY, status: st, ...(st !== 'aberta' ? { indicatedAt: ts + R(23, 30) * DAY } : {}), source: 'manual', operationId: a.operationId, org: pick(['DETRAN-PE', 'PRF', 'CTTU Recife']) });
  }
  // indicações de condutor em aberto: uma vencendo em 3 dias, uma em 12 e uma já vencida
  for (const [aid, code, ago, notified] of [['a2', '746-30', 20, 27], ['a5', '554-12', 9, 18], ['a3', '605-03', 50, 34]] as [string, string, number, number][]) {
    const a = assets.find((x) => x.id === aid)!; const ts = now - ago * DAY + R(7, 17) * HOUR;
    fines.push({ id: uid('mu'), auto: 'A' + Math.floor(R(10000000, 99999999)), assetId: aid, driverId: a.driverId || '', ts, place: pick(['BR-101 km 78, Jaboatão', 'Av. Agamenon Magalhães, Recife']), ...CTB.find((c) => c.code === code)!, notifiedAt: now - notified * DAY, dueDate: now - notified * DAY + 30 * DAY, status: 'aberta', source: 'manual', operationId: a.operationId, org: 'DETRAN-PE' });
  }

  // ---------- Checklist ----------
  const staff = [{ id: 'st1', name: 'Severino Lima', role: 'chefe_patio' }, { id: 'st2', name: 'Joana Porto', role: 'porteiro' }, { id: 'st3', name: 'Marcos Reis', role: 'chefe_patio' }];
  const respondentGroups = [
    { id: 'rg1', name: 'Motoristas pesados (CNH D/E)', ruleCnh: ['D', 'E'], ruleRoles: [], memberIds: [] },
    { id: 'rg2', name: 'Motoristas leves (CNH B/C)', ruleCnh: ['B', 'C'], ruleRoles: [], memberIds: [] },
    { id: 'rg3', name: 'Chefes de pátio', ruleCnh: [], ruleRoles: ['chefe_patio'], memberIds: [] },
  ];
  const checklistTemplates = [
    { id: 't1', name: 'Checklist diário de saída', active: true, schedule: { type: 'diario' }, targets: { groupIds: ['rg2'], personIds: ['d1'] }, questions: [
      { id: 'q1', label: 'Quilometragem atual', type: 'km', required: true }, { id: 'q2', label: 'Data e hora da inspeção', type: 'datahora', required: true },
      { id: 'q3', label: 'Estado dos pneus', type: 'multipla', options: ['Bom', 'Regular', 'Ruim'], requirePhoto: true, required: true, flagValues: ['Ruim'] },
      { id: 'q4', label: 'Nível do óleo', type: 'multipla', options: ['Normal', 'Baixo'], required: true, flagValues: ['Baixo'] },
      { id: 'q5', label: 'Luzes e setas funcionando?', type: 'sim_nao', required: true, flagValues: ['Não'] },
      { id: 'q7', label: 'Veículo tem avaria nova?', type: 'sim_nao', required: true, flagValues: ['Sim'] },
      { id: 'q6', label: 'Avarias ou observações', type: 'texto' }] },
    { id: 't2', name: 'Inspeção semanal de segurança', active: true, schedule: { type: 'semanal', weekday: 1 }, targets: { groupIds: ['rg1', 'rg2'], personIds: [] }, questions: [
      { id: 'q1', label: 'Extintor dentro da validade?', type: 'sim_nao', requirePhoto: true, required: true, flagValues: ['Não'] },
      { id: 'q2', label: 'Triângulo e macaco presentes?', type: 'sim_nao', required: true, flagValues: ['Não'] },
      { id: 'q3', label: 'Data da última lavagem', type: 'data' }] },
    { id: 't3', name: 'Inspeção da linha amarela', active: true, schedule: { type: 'ciclo', cycleDays: 15, startDate: now - 60 * DAY }, targets: { groupIds: [], personIds: ['d6'] }, questions: [
      { id: 'q1', label: 'Horímetro', type: 'km', required: true }, { id: 'q2', label: 'Vazamentos hidráulicos?', type: 'sim_nao', requirePhoto: true, required: true, flagValues: ['Sim'] }] },
    { id: 't4', name: 'Auditoria de tacógrafo', active: true, schedule: { type: 'datas', dates: [now - 40 * DAY, now - 10 * DAY, now + 20 * DAY].map((t) => new Date(t).toISOString().slice(0, 10)) }, targets: { groupIds: ['rg1'], personIds: [] }, questions: [{ id: 'q1', label: 'Disco/fita conferido?', type: 'sim_nao', required: true, flagValues: ['Não'] }] },
    { id: 't5', name: 'Vistoria semanal do pátio', active: true, schedule: { type: 'semanal', weekday: 5 }, targets: { groupIds: ['rg3'], personIds: [] }, questions: [
      { id: 'q1', label: 'Organização do pátio', type: 'nota', scaleMax: 5, flagBelow: 2, required: true },
      { id: 'q2', label: 'Extintores do pátio ok?', type: 'sim_nao', required: true, flagValues: ['Não'] },
      { id: 'q3', label: 'Foto geral do pátio', type: 'foto', required: true },
      { id: 'q4', label: 'Data e hora da vistoria', type: 'datahora', required: true }] },
  ];
  const checklistResponses: any[] = [];
  const driverAsset: Record<string, string> = { d1: 'a1', d2: 'a2', d3: 'a3', d4: 'a5', d5: 'a6', d6: 'a8' };
  // avarias concentradas em poucos veículos (numa frota real, a maioria passa limpa no checklist)
  const W: Record<string, number> = { d1: 0, d2: 0.5, d3: 1.6, d4: 0, d5: 0.7 };
  const flag = (d: string, p: number) => Math.random() < p * (W[d] ?? 1);
  for (let k = 75; k >= 0; k--) {
    const day = today0 - k * DAY; const wd = new Date(day).getDay();
    if (day + 17 * HOUR > now) continue;
    for (const d of ['d1', 'd3', 'd4', 'd5']) {
      if (wd === 0 || Math.random() < (d === 'd4' ? 0.35 : 0.1)) continue;
      const st = day + R(5.5, 7.5) * HOUR; const fin = st + R(2.5, 11) * MIN;
      checklistResponses.push({ id: uid('cr'), templateId: 't1', driverId: d, assetId: driverAsset[d], startedAt: st, finishedAt: fin, personId: d, answers: { q1: { value: '' }, q3: { value: flag(d, 0.04) ? 'Ruim' : pick(['Bom', 'Bom', 'Bom', 'Regular']), photo: '' }, q4: { value: flag(d, 0.05) ? 'Baixo' : 'Normal' }, q5: { value: flag(d, 0.03) ? 'Não' : 'Sim' }, q7: { value: flag(d, 0.03) ? 'Sim' : 'Não' } } });
    }
    if (wd === 1) for (const d of ['d1', 'd2', 'd3', 'd5']) checklistResponses.push({ id: uid('cr'), templateId: 't2', driverId: d, personId: d, assetId: driverAsset[d], startedAt: day + 8 * HOUR, finishedAt: day + 8 * HOUR + R(2, 6) * MIN, answers: { q1: { value: flag(d, 0.15) ? 'Não' : 'Sim' }, q2: { value: 'Sim' } } });
    if (wd === 5) for (const p of ['st1', 'st3']) if (Math.random() < 0.8) checklistResponses.push({ id: uid('cr'), templateId: 't5', personId: p, driverId: p, assetId: '', startedAt: day + 16 * HOUR, finishedAt: day + 16 * HOUR + R(3, 9) * MIN, answers: { q1: { value: String(pick([2, 3, 4, 4, 5])) }, q2: { value: Math.random() < 0.2 ? 'Não' : 'Sim' }, q4: { value: '' } } });
  }

  // ---------- Viagens ----------
  // matriz de viagens recorrentes: paradas com horário previsto e onde o veículo dorme em cada dia da semana
  const matrices = [
    { id: 'm1', createdAt: now - 60 * DAY, name: 'Entregas Recife', assetId: 'a6', driverId: 'd5', days: [1, 2, 3, 4, 5], stops: [{ fenceId: 'f5', time: '08:00' }, { fenceId: 'f6', time: '10:30' }, { fenceId: 'f1', time: '12:30' }], sleep: { 1: 'f1', 2: 'f1', 3: 'f1', 4: 'f1', 5: 'f2' } },
    { id: 'm2', createdAt: now - 60 * DAY, name: 'Transferência Suape', assetId: 'a4', driverId: '', days: [2, 4], stops: [{ fenceId: 'f7', time: '07:00' }, { fenceId: 'f1', time: '10:00' }], sleep: { 2: 'f1', 4: 'f1' } },
  ];
  const hist = seedTripHistory(assets, matrices, fences, now, R);
  const trips = [
    ...hist.trips,
    { id: uid('tr'), type: 'externo', name: 'Coleta Candeias → Obra Suape', assetId: 'a1', driverId: 'd1', originFenceId: 'f1', loadFenceId: 'f5', unloadFenceId: 'f7', destFenceId: 'f1', cargo: 'Cimento ensacado', status: 'em_andamento', startedAt: now - 3 * HOUR, loadedAt: now - 2 * HOUR, startSource: 'rastreador', stops: [], visited: [] },
    { id: uid('tr'), type: 'externo', name: 'Coleta Suape → Atacadão Candeias', assetId: 'a10', originFenceId: 'f1', loadFenceId: 'f7', unloadFenceId: 'f5', destFenceId: 'f1', cargo: 'Brita', status: 'aguardando', stops: [], visited: [] },
  ];

  const campaigns = [
    { id: 'cp1', name: 'Campanha de velocidade — outubro', from: '2026-10-01', to: '2026-10-31', eventTypes: ['excesso_velocidade'], maxPerVehicle: 3, prize: 'Vale-combustível de R$ 200 para quem cumprir', groupId: '' },
    { id: 'cp2', name: 'Direção suave no 4º trimestre', from: '2026-10-01', to: '2026-12-31', eventTypes: ['frenagem_brusca', 'aceleracao_brusca', 'curva_brusca'], maxPerVehicle: 10, prize: 'Folga extra', groupId: 'g1' },
  ];

  const accessLog = assets.filter((a) => a.tracker).map((a) => ({ id: uid('ac'), ts: a.tracker.linkedAt, imei: a.tracker.imei, assetId: a.id, assetName: a.name }));
  // eventos históricos para o ranking (últimos 60 dias)
  const events: any[] = [];
  const evW: Record<string, number> = { d1: 2.4, d2: 1.3, d3: 0.8, d4: 3.0, d5: 1.1, d6: 0.5 };
  for (const [d, w] of Object.entries(evW)) {
    const n = Math.round(40 * w);
    for (let i = 0; i < n; i++) {
      const can = ['d1', 'd2'].includes(d);
      const type = pick(['excesso_velocidade', 'excesso_velocidade', 'frenagem_brusca', 'aceleracao_brusca', 'curva_brusca', 'sem_cinto', 'ociosidade', 'celular', ...(can ? ['rpm_excessivo', 'banguela'] : [])]);
      const value = type === 'excesso_velocidade' ? Math.round(R(81, 108)) : type === 'ociosidade' ? Math.round(R(5, 28)) : type === 'rpm_excessivo' ? Math.round(R(2550, 3300)) : Math.round(R(40, 90));
      events.push({ id: uid('ev'), ts: now - R(1, 100) * DAY, assetId: driverAsset[d], driverId: d, type, value, source: ['rpm_excessivo', 'banguela'].includes(type) ? 'can' : 'rastreador', pos: [-8.1, -34.92] });
    }
  }

  for (const w of workOrders) w.items ||= genItems(w, plans);
  let state: any = {
    revenda: {
      branding: { name: 'Rastreadora Demo', tagline: 'Sua frota em tempo real, de ponta a ponta.', color: '#2251E6', logo: '', photo: '', photoPos: 'esquerda', supportPhone: '(81) 0000-0000' },
      modules: { monitoramento: true, ativos: true, manutencao: true, combustivel: true, checklist: true, viagens: true, multas: true, jornada: true, ranking: true, pneus: true },
      pricePerAccess: 5, clientName: 'Transportes Exemplo Ltda', erp: 'nenhum',
    },
    groups, operations, drivers, assets, fences, rules, commandDefs, vehicles, history: {}, events, alerts: [], commands: [], plans, workOrders,
    fuelings: enrichFuelings(fuelings), fines, checklistTemplates, checklistResponses, staff, respondentGroups, trips, matrices, gateLog: hist.gateLog, tripStats: hist.tripStats, fenceVisits: hist.fenceVisits, tripsV2: true, tripConfig: { patioTrigger: 'rastreador' }, journey, campaigns, accessLog,
    rankCfg: { types: {}, custom: [], limit: 100, limitPeriod: 'mes' }, fuelGoals: { company: { kml: 5, budget: 80000 }, operations: { op1: 8, op2: 2.3, op3: 3 }, groups: { g1: 6.5, g2: 2.3, g3: 10 } }, fuelCfg: { ocr: false }, eventWeights: {}, ruleHits: {}, simSpeed: 8, simRunning: true, seededAt: now,
  };
  // Gera as últimas 8 horas de deslocamento
  const steps = (8 * HOUR) / (20 * 1000);
  for (let i = steps; i > 0; i--) {
    const t = now - i * 20000;
    state = { ...state, ...processTick(state, t, 20) };
  }
  // carreta SR-01: puxada pelo KOZ5H91 por 99 dias e, há 21 dias, pelo RJX2B57
  const odoOf = (id: string) => state.vehicles[id]?.odometer || 0;
  state.couplings = [
    { id: 'eg1', tractorId: 'a1', items: ['a11'], from: now - 120 * DAY, to: now - 21 * DAY, kmFrom: Math.round(odoOf('a1') - 290 * 120), kmTo: Math.round(odoOf('a1') - 290 * 21) },
    { id: 'eg2', tractorId: 'a10', items: ['a11'], from: now - 21 * DAY + 2 * HOUR, kmFrom: Math.round(odoOf('a10') - 160 * 21) },
    ...bitremSeed(odoOf('a2'), now),
  ];
  state.tires = seedTires(assets, state.vehicles, now, (a) => (a.kind === 'implemento' ? trailerKm(state, a.id, odoOf) : odoOf(a.id)));
  state.tireCfg = { ...DEFAULT_TIRE_CFG };
  state.odometerReadings = [];
  state.maintRecipients = DEFAULT_RECIPIENTS.map((r) => ({ ...r })); // escalonamento por e-mail (fila simulada)
  state.escLog = {}; state.outbox = [];
  state.platform = { ...seedPlatform(now), plans: seedPlans(now), clients: seedClients(now) };
  // histórico motorista × veículo (lib/driverLinks): o vínculo atual começou há 45 dias; a1 teve outro motorista antes
  state.driverLinks = [{ id: 'dl0', assetId: 'a1', driverId: 'd7', start: now - 90 * DAY, end: now - 45 * DAY, source: 'escala' }, ...assets.filter((a: any) => a.driverId).map((a: any, i: number) => ({ id: 'dl' + (i + 1), assetId: a.id, driverId: a.driverId, start: now - 45 * DAY, end: null, source: a.id === 'a3' ? 'app' : 'escala' }))];
  // conflito para conferência: KHP4G42 na escala com Carla (d7), mas Paulo (d5) entrou pelo app há 6 h; vale o app (prioridade maior)
  state.driverLinks.push({ id: 'dlc1', assetId: 'a4', driverId: 'd7', start: now - 20 * DAY, end: null, source: 'escala' }, { id: 'dlc2', assetId: 'a4', driverId: 'd5', start: now - 6 * HOUR, end: null, source: 'app' });
  const a4 = (assets as any[]).find((a) => a.id === 'a4'); if (a4) a4.driverId = 'd5';
  state.trackerStock = [{ imei: '864893030911256', model: 'Suntech ST310U' }, { imei: '864893030911264', model: 'Suntech ST310U' }, { imei: '868120244591057', model: 'Teltonika FMC130' }, { imei: '358657103344554', model: 'GT06' }];
  for (const v of Object.values<any>(state.vehicles)) if (v.route && v.stopLeft > 90) v.stopLeft = 30 + Math.random() * 60;
  state.alerts = state.alerts.map((a: any) => treatOld({ ...a, read: a.ts < now - HOUR }, now));
  return state;
}


// bitrem do PEW1A33: só o BT-01A por 40 dias; há 34 dias, a composição completa (BT-01A + BT-01B)
export const bitremSeed = (odo: number, now: number) => [
  { id: 'eg3', tractorId: 'a2', items: ['a12'], from: now - 74 * DAY, to: now - 34 * DAY, kmFrom: Math.round(odo - 240 * 74), kmTo: Math.round(odo - 240 * 34) },
  { id: 'eg4', tractorId: 'a2', items: ['a12', 'a13'], from: now - 34 * DAY + 3 * HOUR, kmFrom: Math.round(odo - 240 * 34) },
];

// alertas com mais de 6 h já foram tratados pela central na simulação (o veículo só fica crítico com evento recente sem tratamento)
export const treatOld = (a: any, now: number) => (a.priority === 'alta' && !a.resolvedAt && a.ts < now - 6 * HOUR ? { ...a, read: true, resolvedAt: a.ts + 40 * 60000, resolvedBy: 'Central (simulação)' } : a);

// regras altas acrescentadas na revisão de prioridades (também entram em dados salvos antigos, ver store.ts)
export const NEW_RULES = [
  { id: 'r6', name: 'Velocidade acima de 120 km/h', active: true, priority: 'alta', conditions: [{ field: 'velocidade', op: '>', value: '120' }], actions: { painel: true, motorista: true, email: true } },
  { id: 'r7', name: 'Botão de pânico acionado', active: true, priority: 'alta', conditions: [{ field: 'panico', op: '=', value: 'Acionado' }], actions: { painel: true, email: true, whatsapp: true } },
  { id: 'r8', name: 'Rastreador desconectado da bateria', active: true, priority: 'alta', conditions: [{ field: 'alimentacao', op: '=', value: 'Desconectada' }], actions: { painel: true, email: true } },
];
// Itens de uma OS (simulação): itens do plano ou do serviço + mão de obra, com estimado e realizado.
// Estimado soma o orçamento vencedor (ou o custo com uma variação); realizado soma o custo final.
const ITEMS_BY_SERVICE: Record<string, string[]> = { oleo_motor: ['Óleo do motor', 'Filtro de óleo'], freios: ['Pastilhas/lonas', 'Discos/tambores', 'Fluido de freio'], embreagem: ['Kit de embreagem', 'Rolamento de embreagem'], lubrificacao: ['Graxa'], suspensao: ['Amortecedores', 'Buchas'], eletrica: ['Componente elétrico'], arrefecimento: ['Radiador / mangueiras', 'Aditivo'], pneus: ['Pneu'] };
export function genItems(w: any, plans: any[]) {
  const plan = plans.find((p: any) => p.id === w.planId);
  const labels = plan?.items ? String(plan.items).split(/,| e /).map((x: string) => x.trim()).filter(Boolean).slice(0, 3)
    : (w.services || []).flatMap((sv: string) => ITEMS_BY_SERVICE[sv] || []).slice(0, 3);
  const parts = (labels.length ? labels : [w.title]).map((l: string) => l.charAt(0).toUpperCase() + l.slice(1));
  const all = [...parts, 'Mão de obra'];
  const weights = all.map((_, i) => (i === all.length - 1 ? 0.35 : 0.65 / parts.length) * (0.8 + Math.random() * 0.4));
  const wsum = weights.reduce((a, b) => a + b, 0);
  const winner = (w.quotes || []).find((q: any) => q.id === w.winnerId);
  const done = w.status === 'concluida';
  const real = done ? w.cost || 0 : 0;
  const estTotal = winner?.value ?? (done ? Math.round(real * (0.82 + Math.random() * 0.3)) : null);
  const split = (t: number) => { const xs = weights.map((x) => Math.round((t * x) / wsum)); xs[xs.length - 1] += t - xs.reduce((a, b) => a + b, 0); return xs; };
  const es = estTotal != null ? split(estTotal) : null, rs = done ? split(real) : null;
  return all.map((label, i) => ({ id: `it${i}${Math.random().toString(36).slice(2, 6)}`, label, est: es ? es[i] : null, real: rs ? rs[i] : null, done }));
}