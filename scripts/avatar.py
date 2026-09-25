"""Final avatar: a big ladle with a red heart inside, sticker style on the channel's blue."""

import cairosvg
from PIL import Image, ImageDraw, ImageFont

BLUE = "#487AFF"
RED = "#FD0100"
DARK = "#1B1440"
GOLD = "#FFC83D"
GOLD_DARK = "#E0A21A"

HEART = "M0,-35 C-10,-62 -60,-62 -60,-22 C-60,12 -22,34 0,58 C22,34 60,12 60,-22 C60,-62 10,-62 0,-35 Z"

# Geometry (640×640, Telegram crops to a circle of radius 320).
CX, CY = 272, 350        # bowl rim centre
RX, RY = 165, 38         # rim ellipse
DEPTH = 150              # bowl depth below the rim
bowl_front = f"M{CX-RX},{CY} A{RX},{DEPTH} 0 0 0 {CX+RX},{CY} A{RX},{RY} 0 0 1 {CX-RX},{CY} Z"
bowl_outline = f"M{CX-RX},{CY} A{RX},{DEPTH} 0 0 0 {CX+RX},{CY} A{RX},{RY} 0 0 0 {CX-RX},{CY} Z"
handle = f"M{CX+RX-22},{CY-6} L530,158"
heart = f'<g transform="translate({CX},{CY-38}) scale(1.55)"><path d="{HEART}" fill="{RED}" stroke="{DARK}" stroke-width="5.5" stroke-linejoin="round"/>' \
        f'<path d="M-38,-30 C-36,-42 -24,-46 -16,-40" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round"/></g>'
heart_white = f'<g transform="translate({CX},{CY-38}) scale(1.55)"><path d="{HEART}" fill="#fff" stroke="#fff" stroke-width="26" stroke-linejoin="round"/></g>'

SVG = f"""<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
<defs><filter id="sh" x="-20%" y="-20%" width="140%" height="140%">
  <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#0b1d5c" flood-opacity="0.35"/></filter></defs>
<rect width="640" height="640" fill="{BLUE}"/>
<!-- white sticker outline -->
<g filter="url(#sh)">
  <path d="{handle}" stroke="#fff" stroke-width="92" stroke-linecap="round"/>
  <path d="{bowl_outline}" fill="#fff" stroke="#fff" stroke-width="44" stroke-linejoin="round"/>
  {heart_white}
</g>
<!-- handle -->
<path d="{handle}" stroke="{DARK}" stroke-width="50" stroke-linecap="round"/>
<path d="{handle}" stroke="{GOLD}" stroke-width="36" stroke-linecap="round"/>
<path d="M{CX+RX+8},{CY-50} L512,178" stroke="#fff3c4" stroke-width="8" stroke-linecap="round" opacity="0.8"/>
<!-- back of the bowl (inside) -->
<ellipse cx="{CX}" cy="{CY}" rx="{RX}" ry="{RY}" fill="{GOLD_DARK}" stroke="{DARK}" stroke-width="8"/>
<!-- heart sitting in the bowl -->
{heart}
<!-- front of the bowl covers the bottom of the heart -->
<path d="{bowl_front}" fill="{GOLD}" stroke="{DARK}" stroke-width="8" stroke-linejoin="round"/>
<path d="M{CX-RX+30},{CY+45} C{CX-RX+60},{CY+105} {CX-60},{CY+135} {CX-10},{CY+138}" stroke="#fff3c4" stroke-width="13" fill="none" stroke-linecap="round"/>
</svg>"""

open("avatar_ladle_v2.svg", "w").write(SVG)
cairosvg.svg2png(bytestring=SVG.encode(), write_to="avatar_ladle_v2.png", output_width=640, output_height=640)
im = Image.open("avatar_ladle_v2.png").convert("RGB")
im.save("avatar.jpg", quality=92)

# Preview as Telegram shows it.
mask = Image.new("L", (640, 640), 0)
ImageDraw.Draw(mask).ellipse((0, 0, 640, 640), fill=255)
circ = Image.new("RGBA", (640, 640))
circ.paste(im.convert("RGBA"), (0, 0), mask)
sheet = Image.new("RGB", (720, 400), "#f2f2f5")
sheet.paste(circ.resize((320, 320)), (20, 40), circ.resize((320, 320)))
for i, size in enumerate([96, 54, 36]):
    s = circ.resize((size, size), Image.LANCZOS)
    sheet.paste(s, (400, 40 + i * 120), s)
d = ImageDraw.Draw(sheet)
F = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 18)
d.text((520, 75), "профиль", fill="#555", font=F)
d.text((520, 175), "список чатов", fill="#555", font=F)
d.text((520, 285), "в группе", fill="#555", font=F)
sheet.save("avatar_ladle_v2_preview.png")
print("ok")
