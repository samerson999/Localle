"""Normaliza as ilustrações 3D (vazio, erro, onboarding) para o mesmo peso visual.

Lê src/images/ilustracoes/NN-nome.png (o arquivo entregue), recorta a margem transparente e
reposiciona o objeto num canvas de 640x512 com a mesma altura útil (70% = 358 px, largura no
máximo 90% = 576 px), centralizado. Grava src/images/ilustracoes/ilu-<id>.png, que é o que a
interface usa (componente Illustration em src/components/ui.tsx).

Também limpa a franja (pixels com alfa <= 3 viram transparência pura, sem borda clara sobre fundo
escuro) e descarta pontos soltos fora do objeto, que desalinhariam o recorte.

Uso:  pip install pillow   e   python scripts/ilustracoes.py
Rode de novo sempre que um NN-nome.png for substituído.
"""
from pathlib import Path
from PIL import Image, ImageFilter

DIR = Path(__file__).resolve().parent.parent / 'src' / 'images' / 'ilustracoes'
W, H = 640, 512
UTIL_H, UTIL_W = round(H * 0.70), round(W * 0.90)
ALPHA_MIN = 10  # o que conta como objeto para achar o recorte (inclui a sombra de contato)

# número do arquivo entregue -> identificador do inventário (docs/INVENTARIO-ASSETS.md)
IDS = {
    '01': 'erro', '02': 'busca-veiculo', '03': 'tudo-em-dia', '04': 'link-expirado', '05': 'sem-acesso',
    '06': 'cercas', '07': 'checklist', '08': 'pneus', '09': 'manutencao', '10': 'combustivel',
    '11': 'viagens', '12': 'multas', '13': 'jornada', '14': 'campanhas', '15': 'telemetria',
    '16': 'replay', '17': 'documentos', '18': 'estoque',
}


def normalize(src: Path) -> Image.Image:
    im = Image.open(src).convert('RGBA')
    a = im.getchannel('A')
    im.putalpha(a.point(lambda v: 0 if v <= 3 else v))  # franja quase invisível -> transparente
    mask = a.point(lambda v: 255 if v > ALPHA_MIN else 0)
    # o recorte ignora sujeiras soltas (pontos de poucos pixels): acha a caixa na máscara erodida
    # e devolve uma folga para a borda suave; o que fica fora dela é descartado
    core = mask.filter(ImageFilter.MinFilter(7)).getbbox()
    if not core:
        raise SystemExit(f'{src.name}: imagem vazia')
    pad = 6
    core = (max(0, core[0] - pad), max(0, core[1] - pad), min(im.width, core[2] + pad), min(im.height, core[3] + pad))
    box = mask.crop(core).getbbox()
    box = (core[0] + box[0], core[1] + box[1], core[0] + box[2], core[1] + box[3])
    obj = im.crop(box)
    k = min(UTIL_H / obj.height, UTIL_W / obj.width)
    size = (max(1, round(obj.width * k)), max(1, round(obj.height * k)))
    # redimensiona com alfa pré-multiplicado: evita halo escuro ou claro na borda
    obj = obj.convert('RGBa').resize(size, Image.LANCZOS).convert('RGBA')
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    out.alpha_composite(obj, ((W - size[0]) // 2, (H - size[1]) // 2))
    return out


def main():
    for src in sorted(DIR.glob('[0-9][0-9]-*.png')):
        num = src.name[:2]
        if num not in IDS:
            print(f'ignorado (sem identificador): {src.name}')
            continue
        dst = DIR / f'ilu-{IDS[num]}.png'
        normalize(src).save(dst, optimize=True)
        print(f'{src.name} -> {dst.name}')


if __name__ == '__main__':
    main()
