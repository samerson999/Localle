// Ícones vistos de cima para o marcador do mapa (src/images/png-topdown), gerados a partir dos PNGs
// laterais do png-tight. Giram livres com o heading do rastreador porque foram desenhados para isso
// (nariz do veículo sempre para cima no arquivo original). Categorias sem versão top-down continuam
// com o glifo de linha (assetArt.MAP_GLYPH) dentro do disco colorido por status.
const FILES = import.meta.glob('../images/png-topdown/topdown-*.png', { eager: true, import: 'default' }) as Record<string, string>;

const urlOf = (name: string) => Object.entries(FILES).find(([p]) => p.endsWith(`/topdown-${name}.png`))?.[1];

// categoria do marcador (mesma chave do MAP_GLYPH) -> nome do arquivo png-tight de origem
const SOURCE: Record<string, string> = {
  carro: '02-sedan',
  picape: '04-picape-cabine-dupla',
  moto: '08-motocicleta',
  cavalo: '21-cavalo-4x2',
  carreta: '24-semirreboque-3-eixos',
  reboque: '48-reboque',
  linha_amarela: '35-pa-carregadeira',
};

export const topdownUrl = (category: string) => { const src = SOURCE[category]; return src ? urlOf(src) : undefined; };
