// Ícones ilustrados 3D do ativo (src/images/png-tight), escolhidos no cadastro — não usados no mapa.
// Gerados a partir do conjunto isométrico do inventário (docs/INVENTARIO-ASSETS.md); falta o dolly, que usa
// o da categoria mais próxima (reboque) até alguém desenhar o próprio.
const FILES = import.meta.glob('../images/png-tight/*.png', { eager: true, import: 'default' }) as Record<string, string>;

export const PNG_ICON_IDS = Object.keys(FILES)
  .map((p) => p.replace(/^.*\/(\d+-[^/]+)\.png$/, '$1'))
  .sort((a, b) => +a.split('-')[0] - +b.split('-')[0]);

export const pngIconUrl = (id: string) => Object.entries(FILES).find(([p]) => p.endsWith(`/${id}.png`))?.[1];

export const pngIconLabel = (id: string) => id.replace(/^\d+-/, '').replace(/-/g, ' ');

// id do png-tight mais próximo de cada categoria/silhueta, para sugerir ao abrir o seletor
export const PNG_ICON_SUGGESTION: Record<string, string> = {
  carro: '02-sedan',
  utilitario: '07-furgao-grande',
  picape: '04-picape-cabine-dupla',
  moto: '08-motocicleta',
  caminhao: '10-toco-4x2',
  cavalo: '21-cavalo-4x2',
  onibus: '31-onibus-urbano',
  semirreboque: '24-semirreboque-3-eixos',
  dolly: '48-reboque',
  reboque: '48-reboque',
  linha_amarela: '35-pa-carregadeira',
  equipamento: '56-pallet-de-carga',
  pessoal: '52-mala',
};
