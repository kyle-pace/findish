# The finDish wordmark and icons, drawn from Atkinson Hyperlegible Next Bold outlines
# (Kyle's pick, 2026-11-22; design/PLAN.md). Writes src/components/Wordmark.astro, the
# favicons and web app icons in public/, and design/app-icon-1024.png for the app.
# Run from anywhere:  pip install fonttools brotli cairosvg pillow && python3 design/wordmark.py
import math, io, cairosvg
from PIL import Image
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
import os
ROOT=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..')
F=ROOT+'/node_modules/@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-700-normal.woff2'
f=TTFont(F); gs=f.getGlyphSet(); cmap=f.getBestCmap()
def glyph(ch):
    p=SVGPathPen(gs); g=gs[cmap[ord(ch)]]; g.draw(p); return p.getCommands(), g.width
# leaf in font units (y up), centered in D counter
CX,CY=355,335
def leaf(L=245, ang=40, cx=CX, cy=CY, flip=True):
    pts=[(-0.5,0),(-0.44,-0.27),(0.12,-0.31),(0.5,0),(0.12,0.31),(-0.44,0.27)]
    a=math.radians(ang)
    def t(x,y):
        x,y=x*L,y*L
        X=x*math.cos(a)-y*math.sin(a); Y=x*math.sin(a)+y*math.cos(a)
        return (cx+X, cy+Y)
    P=[t(*q) for q in pts]
    d=f"M{P[0][0]:.1f} {P[0][1]:.1f}C{P[1][0]:.1f} {P[1][1]:.1f} {P[2][0]:.1f} {P[2][1]:.1f} {P[3][0]:.1f} {P[3][1]:.1f}C{P[4][0]:.1f} {P[4][1]:.1f} {P[5][0]:.1f} {P[5][1]:.1f} {P[0][0]:.1f} {P[0][1]:.1f}Z"
    v0=t(-0.36,0); v1=t(0.34,0)
    vein=f"M{v0[0]:.1f} {v0[1]:.1f}L{v1[0]:.1f} {v1[1]:.1f}"
    return d,vein
LEAF,VEIN=leaf()
TR=-20
# ---- wordmark svg (outlines) ----
x=0; ink=[]; dpath=None; dx=0
for ch in 'finDish':
    d,w=glyph(ch)
    if ch=='D': dpath=d; dx=x
    else: ink.append(f'<path transform="translate({x} 0)" d="{d}"/>')
    x+=w+TR
W=x-TR
WL,WV=leaf()
svg_wm=(f'<svg class="wordmark-art" viewBox="0 -760 {W} 775" aria-hidden="true" focusable="false">'
 f'<g transform="scale(1 -1)"><g class="wm-ink">{"".join(ink)}</g>'
 f'<g transform="translate({dx} 0)"><path class="wm-d" d="{dpath}"/><path class="wm-leaf" d="{WL}"/>'
 f'<path class="wm-vein" d="{WV}"/></g></g></svg>')
astro=f'''---
// The finDish wordmark (Kyle's pick, 2026-11-22): "finDish" in Atkinson Hyperlegible Next
// Bold, with the capital D in tomato and a basil leaf served in the D, so the name reads as
// find + dish and the D is the dish. It replaced the plate-shaped d with a line over "find"
// and one under "dish" (2026-11-16).
// The letters are drawn as outlines (scripts/wordmark/ has how), so the mark looks the same
// whichever font the display settings pick, and the only text in it is the one word
// "finDish": screen readers, copy-paste and search engines get that, never "fin…ish".
// It scales with the font size it's given and follows light and dark mode.
const art = '{svg_wm}';
---

<span class="wordmark"><span class="wordmark-text">finDish</span><Fragment set:html={{art}} /></span>

<style>
  .wordmark {{
    display: inline-block;
    line-height: 1;
    white-space: nowrap;
  }}

  /* The name for screen readers, copy-paste and search engines; the drawing is hidden from them. */
  .wordmark-text {{
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }}

  /* One em of type is 1000 units in the drawing; it sits on the baseline like the letters did. */
  .wordmark :global(.wordmark-art) {{
    display: inline-block;
    width: {W/1000:.3f}em;
    height: 0.775em;
    vertical-align: -0.015em;
    overflow: visible;
  }}

  .wordmark :global(.wm-ink) {{ fill: currentColor; }}
  .wordmark :global(.wm-d) {{ fill: var(--accent-ink); }}
  .wordmark :global(.wm-leaf) {{ fill: var(--basil); }}
  .wordmark :global(.wm-vein) {{
    fill: none;
    stroke: var(--basil-vein);
    stroke-width: 14;
    stroke-linecap: round;
    opacity: 0.55;
  }}

  @media (forced-colors: active) {{
    .wordmark :global(.wm-ink),
    .wordmark :global(.wm-d),
    .wordmark :global(.wm-leaf) {{ fill: CanvasText; }}
    .wordmark :global(.wm-vein) {{ stroke: Canvas; }}
  }}
</style>
'''
O=ROOT+'/public/'
open(ROOT+'/src/components/Wordmark.astro','w').write(astro)
# ---- icons ----
TILE,DC,LF,VC='#1d1714','#f2593c','#8ac27a','#f1e6df'
def icon_svg(rx=7, size=32, inner=True, scale=0.55):
    d,w=glyph('D'); IL,IV=leaf(L=280)
    S=size; s=S*scale/668
    tx=(S-596*s)/2-60*s; ty=(S+668*s)/2
    bg=f'<rect class="bg" width="{S}" height="{S}" rx="{rx}" fill="{TILE}"/>' if rx is not None else f'<rect class="bg" width="{S}" height="{S}" fill="{TILE}"/>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}">{bg}'
      f'<g transform="translate({tx:.3f} {ty:.3f}) scale({s:.5f} {-s:.5f})"><path d="{d}" fill="{DC}"/>'
      f'<path d="{IL}" fill="{LF}"/><path d="{IV}" fill="none" stroke="{VC}" stroke-width="16" stroke-linecap="round" opacity=".55"/></g></svg>')
fav=icon_svg(rx=7,size=32)
open(O+'favicon-v4.svg','w').write(fav+'\n')
def png(svg,w,path): cairosvg.svg2png(bytestring=svg.encode(),write_to=path,output_width=w)
png(fav,96,O+'favicon-96.png')
png(fav,192,O+'icons/icon-192.png'); png(fav,512,O+'icons/icon-512.png')
png(icon_svg(rx=None,size=32,scale=0.42),512,O+'icons/icon-maskable-512.png')
png(icon_svg(rx=None,size=32),180,O+'apple-touch-icon.png')
ims=[]
for s in (16,32,48):
    b=io.BytesIO(); cairosvg.svg2png(bytestring=fav.encode(),write_to=b,output_width=s); ims.append(Image.open(b).convert('RGBA'))
ims[2].save(O+'favicon.ico',sizes=[(16,16),(32,32),(48,48)],append_images=ims[:2])
# app icon 1024 full square for iOS
# The iPhone and iPad app icon (findish-app) is the same drawing, square, at 1024 px.
png(icon_svg(rx=None,size=1024),1024,ROOT+'/design/app-icon-1024.png')
print(W, len(svg_wm))
