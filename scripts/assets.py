"""Готовит картинки мини-аппа в app/assets из faces-src/ и body-src/ (маджента -> прозрачность).
Головы: <id>.png, опционально <id>-hurt.png и <id>-ko.png. Тела: листы из 5 деталей (см. body.py).
Запуск: .venv/bin/python scripts/assets.py"""
import json, pathlib
from PIL import Image

root = pathlib.Path(__file__).parent.parent
dst = root / 'app' / 'assets'; dst.mkdir(parents=True, exist_ok=True)
PARTS = ['torso', 'arm', 'hand', 'thigh', 'shin']
BODY_SCALE, HEAD_W = 0.5, 320
manifest = {'heads': {}, 'bodies': {}}

def key(im):
    im = im.convert('RGBA'); px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, _ = px[x, y]
            if r > 150 and b > 150 and g < min(r, b) - 60: px[x, y] = (30, 20, 20, 0)
    return im

def save(im, name):
    im.quantize(96, method=Image.Quantize.FASTOCTREE).save(dst / name, optimize=True)
    return [im.width, im.height]

for src in sorted((root / 'faces-src').glob('*.png')):
    im = key(Image.open(src)); im = im.crop(im.getbbox())
    im = im.resize((HEAD_W, round(im.height * HEAD_W / im.width)), Image.LANCZOS)
    manifest['heads'][src.stem] = save(im, f'head-{src.stem}.png')

for src in sorted((root / 'body-src').glob('*.png')):
    im = key(Image.open(src)); alpha = im.getchannel('A')
    filled = [alpha.crop((x, 0, x + 1, im.height)).getbbox() is not None for x in range(im.width)]
    runs, start = [], None
    for x, f in enumerate(filled + [False]):
        if f and start is None: start = x
        if not f and start is not None:
            if x - start > 20: runs.append((start, x))
            start = None
    assert len(runs) == len(PARTS), f'{src.stem}: деталей {len(runs)}, нужно {len(PARTS)}'
    sizes = {}
    for name, (a, b) in zip(PARTS, runs):
        part = im.crop((a, 0, b, im.height)); part = part.crop(part.getbbox())
        part = part.resize((round(part.width * BODY_SCALE), round(part.height * BODY_SCALE)), Image.LANCZOS)
        sizes[name] = save(part, f'body-{src.stem}-{name}.png')
    manifest['bodies'][src.stem] = sizes

(dst / 'manifest.json').write_text(json.dumps(manifest, indent=1))
print(json.dumps(manifest))
