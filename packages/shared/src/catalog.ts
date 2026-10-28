// Bases de referência simuladas (em produção: APIs de consulta veicular, SERPRO/SENATRAN etc.)
export const MODULES = [
  { key: 'monitoramento', label: 'Monitoramento' },
  { key: 'ativos', label: 'Gestão de ativos' },
  { key: 'manutencao', label: 'Manutenção' },
  { key: 'combustivel', label: 'Combustível' },
  { key: 'checklist', label: 'Checklist' },
  { key: 'viagens', label: 'Viagens' },
  { key: 'multas', label: 'Multas' },
  { key: 'jornada', label: 'Jornada' },
  { key: 'ranking', label: 'Ranking de motoristas' },
  { key: 'pneus', label: 'Pneus' },
] as const;
export type ModuleKey = typeof MODULES[number]['key'];

export const ASSET_KINDS = [
  { key: 'veiculo', label: 'Veículo' },
  { key: 'linha_amarela', label: 'Linha amarela' },
  { key: 'maquina', label: 'Máquina' },
  { key: 'equipamento', label: 'Equipamento' },
  { key: 'outro', label: 'Outros (maleta, caixa fria…)' },
];

export const FENCE_TYPES = ['Matriz', 'Filial', 'Cliente', 'Fornecedor', 'Oficina', 'Posto', 'Pátio', 'Área de risco', 'Outro'];


// Ficha técnica por modelo (simula base de dados veicular)
export const SPECS_DB: Record<string, Record<string, string>> = {
  'Delivery Express 4.150': { Motor: '2.8 Diesel 150 cv', Combustível: 'Diesel S10', Tanque: '90 L', 'Arla 32': '18 L', 'Óleo do motor': '15W40 API CK-4', 'Volume de óleo': '7,5 L', Bateria: '12 V 100 Ah', Farol: 'H4 60/55 W', 'Lanterna traseira': 'P21/5W', Pneus: '215/75 R17.5', 'Filtro de óleo': 'Ref. W 940/50', 'Filtro de ar': 'Ref. C 25 003' },
  'Strada Freedom 1.3': { Motor: '1.3 Firefly Flex 107 cv', Combustível: 'Flex', Tanque: '55 L', 'Óleo do motor': '5W30 sintético', 'Volume de óleo': '3,2 L', Bateria: '12 V 60 Ah', Farol: 'H4 60/55 W', 'Lanterna traseira': 'P21/5W', Pneus: '205/60 R16', 'Filtro de óleo': 'Ref. W 712/95', 'Filtro de ar': 'Ref. C 2201' },
  'Accelo 1016': { Motor: 'OM 924 LA 156 cv', Combustível: 'Diesel S10', Tanque: '150 L', 'Arla 32': '30 L', 'Óleo do motor': '15W40 MB 228.51', 'Volume de óleo': '11 L', Bateria: '2× 12 V 100 Ah', Farol: 'H4 75/70 W', Pneus: '215/75 R17.5', 'Filtro de óleo': 'Ref. W 950/26', 'Filtro de ar': 'Ref. C 15 300' },
  'Master Furgão 2.3': { Motor: '2.3 dCi 135 cv', Combustível: 'Diesel S10', Tanque: '80 L', 'Arla 32': '22 L', 'Óleo do motor': '5W30 RN17', 'Volume de óleo': '7,3 L', Bateria: '12 V 95 Ah', Farol: 'H7 55 W', Pneus: '225/65 R16C', 'Filtro de óleo': 'Ref. W 7008', 'Filtro de ar': 'Ref. C 30 012' },
  'Hilux SRV 2.8': { Motor: '2.8 Diesel 204 cv', Combustível: 'Diesel S10', Tanque: '80 L', 'Óleo do motor': '5W30 DL-1', 'Volume de óleo': '7,5 L', Bateria: '12 V 80 Ah', Farol: 'LED', 'Lanterna traseira': 'LED', Pneus: '265/60 R18', 'Filtro de óleo': 'Ref. 90915-YZZD2', 'Filtro de ar': 'Ref. 17801-0L040' },
  'R450 6x2': { Motor: 'DC13 450 cv', Combustível: 'Diesel S10', Tanque: '2× 400 L', 'Arla 32': '80 L', 'Óleo do motor': '10W40 Scania LDF-4', 'Volume de óleo': '36 L', Bateria: '2× 12 V 180 Ah', Farol: 'H7 70 W', Pneus: '295/80 R22.5', 'Filtro de óleo': 'Ref. 2022275', 'Filtro de ar': 'Ref. 1931683' },
  'FH 540 6x4': { Motor: 'D13K 540 cv', Combustível: 'Diesel S10', Tanque: '2× 480 L', 'Arla 32': '90 L', 'Óleo do motor': '10W40 VDS-4.5', 'Volume de óleo': '38 L', Bateria: '2× 12 V 225 Ah', Farol: 'LED', Pneus: '295/80 R22.5', 'Filtro de óleo': 'Ref. 21707134', 'Filtro de ar': 'Ref. 21702911' },
  'Fiorino Endurance 1.4': { Motor: '1.4 Fire Flex 88 cv', Combustível: 'Flex', Tanque: '48 L', 'Óleo do motor': '5W30 sintético', 'Volume de óleo': '2,8 L', Bateria: '12 V 50 Ah', Farol: 'H4 60/55 W', Pneus: '175/70 R14', 'Filtro de óleo': 'Ref. W 712/83', 'Filtro de ar': 'Ref. C 2486' },
  'Atego 2430': { Motor: 'OM 926 LA 286 cv', Combustível: 'Diesel S10', Tanque: '300 L', 'Arla 32': '40 L', 'Óleo do motor': '15W40 MB 228.51', 'Volume de óleo': '28 L', Bateria: '2× 12 V 150 Ah', Farol: 'H4 75/70 W', Pneus: '275/80 R22.5', 'Filtro de óleo': 'Ref. W 11 102/36', 'Filtro de ar': 'Ref. C 25 860' },
};
export const MODEL_BRAND: Record<string, string> = { 'Delivery Express 4.150': 'Volkswagen', 'Strada Freedom 1.3': 'Fiat', 'Accelo 1016': 'Mercedes-Benz', 'Master Furgão 2.3': 'Renault', 'Hilux SRV 2.8': 'Toyota', 'R450 6x2': 'Scania', 'FH 540 6x4': 'Volvo', 'Fiorino Endurance 1.4': 'Fiat', 'Atego 2430': 'Mercedes-Benz' };

// Matriz padrão de eventos (espelha fn_default_event_types no banco)
// RECURSO FUTURO: videotelemetria (sem cinto, celular, fadiga) fica escondida no ranking, na matriz e nas campanhas
// até existir uma fonte real desses eventos (câmera integrada ao rastreador). Para liberar, tire a categoria desta lista.
export const FUTURE_CATEGORIES = ['videotelemetria'];
export const EVENT_CATEGORIES: Record<string, string> = { basico: 'Básicos (rastreador)', telemetria: 'Telemetria / CAN', videotelemetria: 'Videotelemetria', jornada: 'Jornada', empresa: 'Regras da empresa' };
export const EVENT_TYPES: Record<string, { label: string; weight: number; category: string; tiers?: { min: number; weight: number }[]; unit?: string; requiresCan?: boolean }> = {
  excesso_velocidade: { label: 'Excesso de velocidade', weight: 3, category: 'basico', tiers: [{ min: 90, weight: 5 }, { min: 100, weight: 10 }], unit: 'km/h' },
  aceleracao_brusca: { label: 'Aceleração brusca', weight: 2, category: 'basico' },
  frenagem_brusca: { label: 'Frenagem brusca', weight: 3, category: 'basico' },
  curva_brusca: { label: 'Curva brusca', weight: 2, category: 'basico' },
  ociosidade: { label: 'Tempo ocioso (motor ligado parado)', weight: 1, category: 'telemetria', tiers: [{ min: 10, weight: 2 }, { min: 20, weight: 4 }], unit: 'min' },
  rpm_excessivo: { label: 'RPM excessivo', weight: 2, category: 'telemetria', tiers: [{ min: 2800, weight: 4 }], unit: 'rpm', requiresCan: true },
  banguela: { label: 'Banguela (ponto morto em movimento)', weight: 5, category: 'telemetria', unit: 'km/h', requiresCan: true },
  sem_cinto: { label: 'Sem cinto de segurança', weight: 4, category: 'videotelemetria' },
  celular: { label: 'Uso de celular', weight: 6, category: 'videotelemetria' },
  fadiga: { label: 'Fadiga / bocejo', weight: 6, category: 'videotelemetria' },
  violacao_jornada: { label: 'Violação de jornada', weight: 4, category: 'jornada' },
  fora_horario: { label: 'Rodou fora do horário (regra da empresa)', weight: 3, category: 'empresa' },
};

export const CTB = [
  { code: '745-50', description: 'Transitar em velocidade superior à máxima permitida em até 20%', severity: 'Média', points: 4, value: 130.16 },
  { code: '746-30', description: 'Velocidade superior à máxima em mais de 20% até 50%', severity: 'Grave', points: 5, value: 195.23 },
  { code: '747-10', description: 'Velocidade superior à máxima em mais de 50%', severity: 'Gravíssima', points: 7, value: 880.41 },
  { code: '605-03', description: 'Avançar o sinal vermelho do semáforo', severity: 'Gravíssima', points: 7, value: 293.47 },
  { code: '518-51', description: 'Deixar de usar o cinto de segurança', severity: 'Grave', points: 5, value: 195.23 },
  { code: '763-31', description: 'Dirigir utilizando-se de telefone celular', severity: 'Gravíssima', points: 7, value: 293.47 },
  { code: '554-12', description: 'Estacionar em local proibido', severity: 'Média', points: 4, value: 130.16 },
  { code: '683-11', description: 'Transitar com veículo em excesso de peso', severity: 'Média', points: 4, value: 130.16 },
  { code: '581-96', description: 'Transitar em faixa exclusiva de ônibus', severity: 'Gravíssima', points: 7, value: 293.47 },
];

export const JOURNEY_TYPES: Record<string, string> = {
  inicio_jornada: 'Início de jornada', inicio_direcao: 'Início de direção', fim_direcao: 'Parada de direção',
  inicio_refeicao: 'Início de refeição', fim_refeicao: 'Fim de refeição', inicio_espera: 'Início de espera',
  fim_espera: 'Fim de espera', inicio_descanso: 'Início de descanso', fim_descanso: 'Fim de descanso', fim_jornada: 'Fim de jornada',
};
