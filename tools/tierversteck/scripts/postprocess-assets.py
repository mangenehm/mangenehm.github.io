#!/usr/bin/env python3
"""
Nachbearbeitung der generierten Grafiken (Pillow):
Magenta-Hintergrund freistellen (vom Rand per Flood-Fill und eingeschlossene Flächen),
rosa Kantenpixel zu Weiß, zuschneiden, skalieren, als WebP nach assets/ schreiben
und assets/manifest.json erzeugen. Pferd und Katze werden gespiegelt, damit der Kopf
in einem Feld der L- bzw. Eckform liegt.

    python3 scripts/postprocess-assets.py <ordner-mit-png> assets
Erwartet <name>.png für snake, horse, dog, cat, mouse, hit, miss, hero.
"""
import sys, json
from collections import deque
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
jobs = {  # name: (max side, crop fraction)
  'snake': (512, 0), 'horse': (512, 0), 'dog': (768, 0), 'cat': (512, 0), 'mouse': (512, 0.035),
  'hit': (192, 0), 'miss': (192, 0),
}
manifest = {}
for name, (maxside, crop) in jobs.items():
    im = Image.open(f'{src}/{name}.png').convert('RGBA')
    if name in ('horse', 'cat'):
        im = im.transpose(Image.FLIP_LEFT_RIGHT)   # Kopf in ein Feld der Form legen
    if crop:
        w, h = im.size
        im = im.crop((int(w*crop), int(h*crop), int(w*(1-crop)), int(h*(1-crop))))
    w, h = im.size
    px = im.load()
    def mag(p):
        r, g, b, _ = p
        return ((r + b) / 2 - g) / 255
    # Magenta, das mit dem Rand verbunden ist, per Flood-Fill entfernen
    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        q.append((x, 0)); q.append((x, h - 1))
    for y in range(h):
        q.append((0, y)); q.append((w - 1, y))
    while q:
        x, y = q.popleft()
        i = y * w + x
        if seen[i]: continue
        seen[i] = 1
        if mag(px[x, y]) < 0.25: continue
        px[x, y] = (255, 255, 255, 0)
        for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx]: q.append((nx, ny))
    # eingeschlossene Magenta-Flächen (z. B. zwischen den Beinen) ebenfalls entfernen
    for y in range(h):
        for x in range(w):
            if px[x, y][3] and mag(px[x, y]) > 0.45:
                px[x, y] = (255, 255, 255, 0)
    # Kanten: rosa Mischpixel neben Transparenz → weiß (der Sticker-Rand ist weiß)
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            if p[3] and mag(p) > 0.08:
                near = any(0 <= x+dx < w and 0 <= y+dy < h and px[x+dx, y+dy][3] == 0 for dx in (-2,0,2) for dy in (-2,0,2))
                if near:
                    a = max(0, min(255, int(255 * (1 - (mag(p) - 0.08) / 0.4))))
                    px[x, y] = (255, 255, 255, a)
    im = im.crop(im.getbbox())
    im.thumbnail((maxside, maxside), Image.LANCZOS)
    im.save(f'{out}/{name}.webp', 'WEBP', quality=88, method=6)
    manifest[name] = f'{name}.webp'
    print(name, im.size)
hero = Image.open(f'{src}/hero.png').convert('RGB')
hero.thumbnail((1200, 1200), Image.LANCZOS)
hero.save(f'{out}/hero.webp', 'WEBP', quality=80, method=6)
manifest['hero'] = 'hero.webp'
print('hero', hero.size)
json.dump(manifest, open(f'{out}/manifest.json', 'w'), indent=2)
