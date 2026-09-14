"""One-shot PWA icon generator. Run: uv run --with pillow scripts/generate-pwa-icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path('static/icons')
OUT.mkdir(parents=True, exist_ok=True)
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
BG = '#111111'
FG = '#f9f9f8'


def mark(size: int, bg_opaque: bool, scale: float = 1.0) -> Image.Image:
    img = Image.new('RGBA', (size, size), BG if bg_opaque else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if not bg_opaque:
        d.rounded_rectangle([0, 0, size, size], radius=int(size * 14 / 64), fill=BG)
    font = ImageFont.truetype(FONT, int(size * 0.53 * scale))
    d.text((size / 2, size * 0.60), 'r.', font=font, fill=FG, anchor='mm')
    return img


# ponytail: generated from favicon.svg look; replace with designed maskable art when brand needs safe-zone art.
mark(192, False).save(OUT / 'icon-192.png')
mark(512, False).save(OUT / 'icon-512.png')
mark(180, False).save(OUT / 'apple-touch-icon.png')
# Maskable: opaque full-bleed bg, smaller centered mark so Android crop keeps it.
mark(512, True, scale=380 / 512).save(OUT / 'icon-maskable-512.png')
print('icons written')
