"""Gera versões WebP leves (2x do tamanho de uso, card aspect 4/3 ~ 640x480) das capas de
src/images/images-relatorios, hoje PNGs de 1536x1024/1672x941 e 1.7-2.2MB cada, usadas full-bleed
num card pequeno em Relatorios.tsx. Mantém o PNG original só como fallback <picture>.

Uso: python scripts/otimizar_relatorios.py
"""
from pathlib import Path
from PIL import Image

DIR = Path(__file__).resolve().parent.parent / 'src' / 'images' / 'images-relatorios'
OUT = DIR / 'web'
TARGET_W = 640  # 2x de ~320px exibidos no card


def main():
    OUT.mkdir(exist_ok=True)
    for src in sorted(DIR.glob('*.png')):
        im = Image.open(src).convert('RGB')
        if im.width > TARGET_W:
            h = round(im.height * TARGET_W / im.width)
            im = im.resize((TARGET_W, h), Image.LANCZOS)
        dest = OUT / (src.stem + '.webp')
        im.save(dest, 'WEBP', quality=78, method=6)
        print(src.name, '->', dest.name, f'{dest.stat().st_size // 1024}KB')


if __name__ == '__main__':
    main()
