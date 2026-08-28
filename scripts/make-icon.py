from PIL import Image, ImageDraw
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

def ring(draw, cx, cy, r, width, fill, start=0, extent=260):
    draw.arc([cx - r, cy - r, cx + r, cy + r], start, extent, fill=fill, width=width)

sizes = [16, 32, 48, 64, 128, 256]
pngs = []
for size in sizes:
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pad = size * 0.08
    d.rounded_rectangle([pad, pad, size - pad, size - pad], radius=size * 0.22, fill="#7A2F60")
    cx = cy = size / 2
    r = size * 0.38
    w = max(2, int(size * 0.13))
    ring(d, cx, cy, r, w, (255, 255, 255, 115))
    ring(d, cx, cy, r, w, (255, 255, 255, 255), -90, 190)
    pngs.append(im)

pngs[-1].save(ROOT / "icon.png")
pngs[-1].convert("RGBA").save(
    ROOT / "icon.ico",
    format="ICO",
    sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
)
print("icon.ico e icon.png gerados.")
