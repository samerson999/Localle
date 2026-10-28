import { DEFAULT_TIRE_CFG } from '@localle/shared/pneus';
import { DEFAULT_BILLING } from '@localle/shared/billing';
import { DEFAULT_RECIPIENTS } from '@localle/shared/escalation';

// Comandos de fábrica (modelos do modal de comandos): configuração, não dado.
const COMMAND_DEFS = [
  { id: 'c_bloq', name: 'Bloqueio', desc: 'Corta a alimentação com segurança', payload: 'RELAY,1#', kind: 'bloqueio', system: true },
  { id: 'c_desb', name: 'Desbloqueio', desc: 'Libera o veículo', payload: 'RELAY,0#', kind: 'desbloqueio', system: true },
  { id: 'c_alerta', name: 'Alerta ao motorista', desc: 'Buzzer + mensagem no teclado / app', payload: 'BUZZER,1#', kind: 'alerta', system: true },
  { id: 'c_bau', name: 'Abrir baú', desc: 'Aciona a saída 2 do rastreador', payload: 'OUTPUT2,1#', kind: 'custom' },
  { id: 'c_reset', name: 'Reiniciar rastreador', desc: 'Reinicia o equipamento', payload: 'RESET#', kind: 'custom' },
  { id: 'c_pos', name: 'Solicitar posição', desc: 'Força o envio da posição', payload: 'WHERE#', kind: 'custom' },
];

/**
 * Estado inicial do front: todas as coleções vazias, sem nenhum dado fictício. Os dados chegam da API
 * depois do login (syncFrota/syncModulos em localleApi.ts); ficam só configurações de fábrica (comandos,
 * destinatários de escalonamento, parâmetros de pneus) que a tela precisa para abrir.
 */
export function estadoInicial() {
  return {
    revenda: {
      branding: { name: 'Localle', tagline: '', color: '#2251E6', logo: '', photo: '', photoPos: 'esquerda', supportPhone: '' },
      modules: { monitoramento: true, ativos: true, manutencao: true, combustivel: true, checklist: true, viagens: true, multas: true, jornada: true, ranking: true, pneus: true },
      pricePerAccess: 5, clientName: '', erp: 'nenhum',
    },
    groups: [], operations: [], drivers: [], assets: [], fences: [], rules: [], commandDefs: COMMAND_DEFS.map((c) => ({ ...c })), vehicles: {}, history: {},
    events: [], alerts: [], commands: [], plans: [], workOrders: [], fuelings: [], fines: [], checklistTemplates: [], checklistResponses: [],
    staff: [], respondentGroups: [], trips: [], matrices: [], gateLog: [], tripStats: {}, fenceVisits: [], tripsV2: true, tripConfig: { patioTrigger: 'rastreador' },
    journey: [], campaigns: [], accessLog: [], rankCfg: { types: {}, custom: [], limit: 100, limitPeriod: 'mes' },
    fuelGoals: { company: { kml: 0, budget: 0 }, operations: {}, groups: {} }, fuelCfg: { ocr: false }, eventWeights: {}, ruleHits: {},
    couplings: [], tires: [], tireCfg: { ...DEFAULT_TIRE_CFG }, odometerReadings: [], maintRecipients: DEFAULT_RECIPIENTS.map((r) => ({ ...r })),
    escLog: {}, outbox: [], platform: { demoBilling: { ...DEFAULT_BILLING }, clients: [], contracts: [] }, driverLinks: [], trackerStock: [],
  };
}
