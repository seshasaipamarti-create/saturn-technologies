"""Convert the demo screenshots (PNG) to optimised 960x600 WebP and delete the PNGs. Needs Pillow."""
import glob, os
from PIL import Image
for f in glob.glob(os.path.join(os.path.dirname(__file__), '..', 'assets', 'img', 'work', '*.png')):
    im = Image.open(f).convert('RGB').resize((960, 600), Image.LANCZOS)
    out = f[:-4] + '.webp'
    im.save(out, 'WEBP', quality=82, method=6)
    os.remove(f)
    print(os.path.basename(out), os.path.getsize(out) // 1024, 'KB')
