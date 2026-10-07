# Génère l'icône de l'application (build/icon.png 512×512 et build/icon.ico).
import sys
from PIL import Image, ImageDraw, ImageFont

size = 512
img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([16, 16, size - 16, size - 16], radius=96, fill=(31, 58, 95, 255))
d.rectangle([96, 360, size - 96, 376], fill=(232, 163, 61, 255))
font = None
for path in ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 'C:/Windows/Fonts/arialbd.ttf']:
    try:
        font = ImageFont.truetype(path, 170)
        break
    except OSError:
        pass
font = font or ImageFont.load_default()
box = d.textbbox((0, 0), 'DQP', font=font)
w, h = box[2] - box[0], box[3] - box[1]
d.text(((size - w) / 2 - box[0], 150 - box[1]), 'DQP', font=font, fill=(255, 255, 255, 255))
out = sys.argv[1] if len(sys.argv) > 1 else 'build'
img.save(f'{out}/icon.png')
img.save(f'{out}/icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
