"""Fixed-layout PDF of verified Artifact Tool renders. Native content remains in PPTX."""
import sys
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from pypdf import PdfReader
from PIL import Image

output, *pages = sys.argv[1:]
if len(pages) < 2:
    raise ValueError('At least two verified slide renders required')
c = canvas.Canvas(output, pagesize=(1200, 675), pageCompression=1)
c.setTitle('北一二部店務管理月報')
for page in pages:
    with Image.open(page) as image:
        if image.width * 9 != image.height * 16 or image.width < 3200:
            raise ValueError('Expected a high-resolution 16:9 slide render')
    c.drawImage(ImageReader(page), 0, 0, width=1200, height=675)
    c.showPage()
c.save()
r = PdfReader(output)
if len(r.pages) != len(pages) or any(abs(float(p.mediabox.width) / float(p.mediabox.height) - 16/9) > 1e-6 for p in r.pages):
    raise ValueError('PDF page count/aspect verification failed')
