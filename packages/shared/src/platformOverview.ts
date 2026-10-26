// Visão geral da Locale: custo estimado do mês. Os dados da tela vêm do backend (/superadmin/visao-geral);
// só o custo continua estimado por constante, até existir cadastro de custo de chip e de infraestrutura.
export const CHIP_COST = 9;
export const INFRA_COST = 650;
export const custoDoMes = (veiculos: number) => veiculos * CHIP_COST + INFRA_COST;
