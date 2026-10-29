"""Dev only: draw an invented scorecard photo (landscape Letter, QR top-left like Lineups prints it) as a JPEG.

    node scripts/qr-matrix.mjs <sheet link> | python3 scripts/test-card.py out.jpg "Floor · Squad A" [--portrait] [--width 3000]

Invented names only. Never commit the output (real photos must never be committed either)."""
import json, sys
from PIL import Image, ImageDraw

out, title = sys.argv[1], sys.argv[2]
portrait = '--portrait' in sys.argv
width = int(sys.argv[sys.argv.index('--width') + 1]) if '--width' in sys.argv else 3000
mods = json.load(sys.stdin)
pw, ph = (612, 792) if portrait else (792, 612)
s = width / pw
img = Image.new('RGB', (width, round(ph * s)), 'white')
d = ImageDraw.Draw(img)
L = 36
q = 48 * s / len(mods)
for r, row in enumerate(mods):
    for c, v in enumerate(row):
        if v:
            d.rectangle([L * s + c * q, (L - 4) * s + r * q, L * s + (c + 1) * q - 1, (L - 4) * s + (r + 1) * q - 1], fill='black')
d.text(((L + 60) * s, (L + 4) * s), f'TEST MEET  {title}', fill='black', font_size=int(14 * s))
y = 110
names = ['Ada Example', 'Ben Sample', 'Cy Test', 'Di Invented', 'Ed Placeholder', 'Flo Fictional', 'Gus Madeup']
for i in range(15):
    d.rectangle([L * s, y * s, (pw - L) * s, (y + 28) * s], outline='black', width=max(1, int(s)))
    if i < len(names):
        d.text(((L + 6) * s, (y + 7) * s), f'{names[i]}   Test Club   9.{i}0', fill='black', font_size=int(11 * s))
    y += 28
img.save(out, 'JPEG', quality=90)
print(out, img.size)
