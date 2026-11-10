"""Готовит картинки мини-аппа в app/assets из heads-src/ и body-src/ (маджента -> прозрачность).
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

# Три версии головы (обычная, -hurt, -ko) кладутся на общий холст: один масштаб (по обычной),
# низ шеи по центру и на одной высоте, чтобы голова не прыгала при смене состояния.
# В манифесте [w, h, k]: k = ширина холста / ширина обычной головы, рендер рисует шириной headW * k.
def neck_x(im):
    row = im.crop((0, im.height - 6, im.width, im.height)).getbbox()
    return (row[0] + row[2]) / 2

for base_src in sorted(p for p in (root / 'heads-src').glob('*.png') if '-' not in p.stem):
    fid = base_src.stem
    group = {}
    for suffix in ('', '-hurt', '-ko'):
        f = root / 'heads-src' / f'{fid}{suffix}.png'
        if f.exists():
            im = key(Image.open(f)); group[suffix] = im.crop(im.getbbox())
    base_w = group[''].width; s = HEAD_W / base_w
    half = max(max(neck_x(im), im.width - neck_x(im)) for im in group.values())
    H = max(im.height for im in group.values())
    for suffix, im in group.items():
        canvas = Image.new('RGBA', (round(half * 2), H), (30, 20, 20, 0))
        canvas.paste(im, (round(half - neck_x(im)), H - im.height))
        canvas = canvas.resize((round(canvas.width * s), round(H * s)), Image.LANCZOS)
        manifest['heads'][fid + suffix] = save(canvas, f'head-{fid}{suffix}.png') + [round(half * 2 / base_w, 3)]

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
