"""body-src/<id>.png (лист из 5 деталей на маджента-фоне, слева направо:
торс, плечо, предплечье с кистью, бедро, голень с ботинком) -> out/body/<id>-<часть>.png с прозрачностью.
Детали режутся по пустым столбцам, поэтому они не должны соприкасаться по горизонтали.
Запуск: .venv/bin/python scripts/body.py"""
import sys, pathlib
from PIL import Image

NAMES = ['torso', 'arm', 'hand', 'thigh', 'shin']
root = pathlib.Path(__file__).parent.parent
out = root / 'out' / 'body'; out.mkdir(parents=True, exist_ok=True)
bad = 0
for src in sorted((root / 'body-src').glob('*.png')):
    im = Image.open(src).convert('RGBA')
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, _ = px[x, y]
            if r > 150 and b > 150 and g < min(r, b) - 60: px[x, y] = (30, 20, 20, 0)
    alpha = im.getchannel('A')
    filled = [alpha.crop((x, 0, x + 1, im.height)).getbbox() is not None for x in range(im.width)]
    runs, start = [], None
    for x, f in enumerate(filled + [False]):
        if f and start is None: start = x
        if not f and start is not None:
            if x - start > 20: runs.append((start, x))  # мельче 20 px — мусор
            start = None
    if len(runs) != len(NAMES):
        print(f'{src.stem}: найдено деталей {len(runs)}, нужно {len(NAMES)}'); bad = 1; continue
    for name, (a, b) in zip(NAMES, runs):
        part = im.crop((a, 0, b, im.height)); part = part.crop(part.getbbox())
        part.save(out / f'{src.stem}-{name}.png')
        print(f'{src.stem}-{name}: {part.width}x{part.height}')
sys.exit(bad)
