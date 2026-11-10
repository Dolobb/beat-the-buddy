"""faces-src/<id>.png (голова на маджента-фоне) -> faces/<id>.webp, не больше 750 байт.
Запуск: .venv/bin/python scripts/faces.py   (нужен pillow)"""
import io, sys, pathlib
from PIL import Image

LIMIT = 750  # ответ бота 1024 байта: префикс data: + base64
root = pathlib.Path(__file__).parent.parent
bad = 0
for src in sorted((root / 'faces-src').glob('*.png')):
    im = Image.open(src).convert('RGBA')
    im.thumbnail((256, 256), Image.LANCZOS)
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, _ = px[x, y]
            if r > 150 and b > 150 and g < min(r, b) - 60:  # маджента и её ореол
                px[x, y] = (40, 20, 10, 0)  # тёмный RGB под прозрачностью: края без розовой каймы
    im = im.crop(im.getbbox())
    side = max(im.size)
    sq = Image.new('RGBA', (side, side), (40, 20, 10, 0))
    sq.paste(im, ((side - im.width) // 2, side - im.height))
    best = None
    for size in (56, 48, 44, 40, 36, 32):
        small = sq.resize((size, size), Image.LANCZOS)
        for q in (70, 50, 35, 22, 12):
            buf = io.BytesIO()
            small.save(buf, 'WEBP', quality=q, alpha_quality=40, method=6)
            if buf.tell() <= LIMIT:
                best = (size, q, buf.getvalue())
                break
        if best and best[1] >= 35: break  # крупнее, но не ценой каши
        if best is None: continue
    if not best:
        print(f'{src.stem}: НЕ ВЛЕЗЛО'); bad = 1; continue
    (root / 'faces' / f'{src.stem}.webp').write_bytes(best[2])
    print(f'{src.stem}: {best[0]}px q{best[1]} {len(best[2])} байт')
sys.exit(bad)
