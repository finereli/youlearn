#!/usr/bin/env python3
# pwa-kit: icons/scripts/icons.py v1
"""Generate src/lib/icons.ts from the material-symbols font.

The app draws its icons as inline SVG (see Icon.svelte), not a webfont - nothing
to download, so they render instantly. The paths are extracted here from the
material-symbols npm package, which we keep purely as the source of glyph
artwork. This is a one-off generator, not a build step.

Add an icon (extracts it and rewrites icons.ts, keeping the existing set):
    npm run icon add_circle download

List currently bundled icons:
    npm run icon
"""
import os
import re
import sys

os.chdir(os.path.join(os.path.dirname(__file__), ".."))

from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

SRC = "node_modules/material-symbols/material-symbols-rounded.woff2"
OUT = "src/lib/icons.ts"

font = TTFont(SRC)
cmap = font.getBestCmap()
char_to_glyph = {chr(cp): gn for cp, gn in cmap.items()}
glyph_set = font.getGlyphSet()

gsub = font["GSUB"].table
rlig = set()
for fr in gsub.FeatureList.FeatureRecord:
    if fr.FeatureTag == "rlig":
        rlig.update(fr.Feature.LookupListIndex)
lookups = gsub.LookupList.Lookup


def resolve(name):
    """The glyph an icon name produces: via its rlig ligature, or by codepoint."""
    if any(ch not in char_to_glyph for ch in name):
        return None
    seq = [char_to_glyph[ch] for ch in name]
    first, comps = seq[0], seq[1:]
    for li in rlig:
        for st in lookups[li].SubTable:
            sub = st.ExtSubTable if lookups[li].LookupType == 7 else st
            ligs = getattr(sub, "ligatures", None)
            if ligs and first in ligs:
                for lig in ligs[first]:
                    if list(lig.Component) == comps:
                        return lig.LigGlyph
    return name if name in glyph_set else None


def path_for(name):
    glyph = resolve(name)
    if glyph is None:
        sys.exit(f"'{name}' is not an icon in this font version.")
    pen = SVGPathPen(glyph_set)
    glyph_set[glyph].draw(pen)
    return pen.getCommands()


# Current set + any names requested on the command line.
existing = []
if os.path.exists(OUT):
    existing = re.findall(r"^  '([^']+)':", open(OUT).read(), re.M)
names = sorted(set(existing) | set(sys.argv[1:]))

if not sys.argv[1:] and existing:
    print("Bundled icons:", " ".join(existing))
    sys.exit(0)

lines = [
    "// Material Symbols Rounded icon paths, extracted from the material-symbols",
    "// font package. Font-unit coords (960 UPM, y-up); Icon.svelte applies the",
    "// flip. Add one with: npm run icon <name>.",
    "",
    "export const icons: Record<string, string> = {",
]
for name in names:
    lines.append(f"  {name!r}: {path_for(name)!r},")
lines.append("}")
open(OUT, "w").write("\n".join(lines) + "\n")
print(f"Wrote {OUT} with {len(names)} icons:", " ".join(names))
