#!/usr/bin/env bash
# Generate catchy synthwave 8-bit thumbnails (160x90, 16:9) for the three arcade cards.
# Pure ImageMagick, -draw only (this IM7 build misparses -tile/+repage).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=assets/thumbs
mkdir -p "$OUT"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

# ---- scanline stripe mask (white lines every 4px) ----
SL=""
for ((y=0; y<90; y+=4)); do SL+="rectangle 0,$y 160,$((y+1)) "; done
magick -size 160x90 xc:none -fill white -draw "$SL" "$TMP/scan.png"

# ---- slatted sun: gradient disc, then cut horizontal gaps via a stripe mask ----
make_sun () { # $1=accent  -> $TMP/sun.png (70x70, slatted gradient disc)
  magick -size 70x70 gradient:'#ffe600-#ff2bd6' -rotate 90 \
    \( -size 70x70 xc:none -fill white -draw "circle 35,35 35,4" \) \
    -alpha set -compose CopyOpacity -composite "$TMP/sunraw.png"
  local SM=""
  for ((y=0; y<70; y+=9)); do SM+="rectangle 0,$y 70,$((y+5)) "; done
  magick -size 70x70 xc:none -fill white -draw "$SM" "$TMP/slatmask.png"
  magick "$TMP/sunraw.png" "$TMP/slatmask.png" -compose CopyOpacity -composite "$TMP/sun.png"
}

# ---- perspective grid (explicit lines, accent colored) ----
make_grid () { # $1=accent
  magick -size 160x90 xc:none -stroke "$1" -strokewidth 1 -fill none \
    -draw "line 0,46 160,46" \
    -draw "line 80,46 80,90" \
    -draw "line 56,46 40,90" -draw "line 104,46 120,90" \
    -draw "line 32,46 6,90" -draw "line 128,46 154,90" \
    -draw "line 8,46 -30,90" -draw "line 152,46 190,90" \
    -draw "line 0,52 160,52" -draw "line 0,60 160,60" -draw "line 0,72 160,72" \
    "$TMP/grid.png"
}

# ---- backdrop assembly: sky + sun + grid + stars + scanlines + vignette ----
bg () { # $1=file $2=accent
  local f="$1" acc="$2"
  make_sun "$acc"; make_grid "$acc"
  magick -size 160x90 xc:'#05010f' \
    -fill '#0b0426' -draw "rectangle 0,0 160,46" \
    -fill '#12062e' -draw "rectangle 0,46 160,90" \
    \( -size 160x90 xc:none -fill white \
       -draw "point 12,8" -draw "point 30,14" -draw "point 52,6" -draw "point 104,10" \
       -draw "point 138,6" -draw "point 152,20" -draw "point 68,18" -draw "point 24,30" \
       -draw "point 94,26" -draw "point 118,32" \
       -fill "$acc" -draw "point 44,26" -draw "point 142,38" -draw "point 148,44" \
    \) \
    -compose Over -composite \
    "$TMP/sun.png" -geometry +78+2 -compose Over -composite \
    "$TMP/grid.png" -compose Screen -composite \
    "$TMP/scan.png" -compose Over -composite \
    \( -size 160x90 radial-gradient:white-black \) -compose Multiply -composite \
    "$f"
  magick "$f" -sharpen 0x1.2 "$f"
}

# ---------- 1. LUNAR LIFTER : lander over a cratered neon moon ----------
bg "$OUT/lander.png" '#ff2bd6'
magick "$OUT/lander.png" \
  \( -size 160x90 xc:none \
     -fill '#232c4e' \
     -draw "polygon 0,90 0,68 14,64 28,67 42,62 56,66 70,60 84,64 98,58 112,63 126,59 140,64 152,61 160,65 160,90" \
     -stroke '#8a94b8' -strokewidth 1 -fill none \
     -draw "polyline 0,68 14,64 28,67 42,62 56,66 70,60 84,64 98,58 112,63 126,59 140,64 152,61 160,65" \
     -fill '#3c4670' -draw "circle 40,76 40,70" -draw "circle 118,78 118,71" -draw "circle 74,82 74,77" \
     -stroke '#2b3458' -strokewidth 1 -fill none -draw "circle 40,76 40,70" -draw "circle 118,78 118,71" \
  \) -compose Over -composite "$OUT/lander.png"
# landing pad: yellow deck + pink edge + cyan beacon mast
magick "$OUT/lander.png" \
  \( -size 160x90 xc:none \
     -fill '#ffe600' -draw "rectangle 62,58 100,61" \
     -fill '#ff2bd6' -draw "rectangle 62,57 100,58" \
     -fill '#21e6ff' -draw "rectangle 79,44 81,57" -draw "rectangle 78,43 82,44" \
  \) -compose Over -composite "$OUT/lander.png"
# lander ship
magick "$OUT/lander.png" \
  \( -size 160x90 xc:none \
     -fill '#c3cdf0' -draw "rectangle 76,26 86,36" \
     -fill '#21e6ff' -draw "rectangle 74,28 76,34" -draw "rectangle 86,28 88,34" \
     -fill '#ffffff' -draw "rectangle 78,22 84,26" \
     -fill '#ff2bd6' -draw "rectangle 73,36 89,38" \
     -fill '#8a94b8' -draw "rectangle 77,38 79,42" -draw "rectangle 85,38 87,42" \
     -fill '#ff8a00' -draw "polygon 80,42 81,49 83,42" -draw "polygon 85,42 84,48 86,42" \
     -fill '#ffe600' -draw "polygon 81,42 82,46 83,42" -draw "polygon 84,42 85,46 86,42" \
  \) -compose Over -composite "$OUT/lander.png"

# ---------- 2. NOVA BLASTER : alien wave, UFO, shields, cannon ----------
bg "$OUT/invaders.png" '#21e6ff'
magick "$OUT/invaders.png" \
  \( -size 160x90 xc:none \
     -fill '#39ff88' \
     -draw "rectangle 38,10 48,15" -draw "rectangle 58,10 68,15" -draw "rectangle 78,10 88,15" -draw "rectangle 98,10 108,15" -draw "rectangle 118,10 128,15" \
     -fill '#0b0426' -draw "rectangle 41,12 44,14" -draw "rectangle 61,12 64,14" -draw "rectangle 81,12 84,14" -draw "rectangle 101,12 104,14" -draw "rectangle 121,12 124,14" \
     -fill '#21e6ff' \
     -draw "rectangle 38,22 48,27" -draw "rectangle 58,22 68,27" -draw "rectangle 78,22 88,27" -draw "rectangle 98,22 108,27" -draw "rectangle 118,22 128,27" \
     -fill '#0b0426' -draw "rectangle 41,24 44,26" -draw "rectangle 61,24 64,26" -draw "rectangle 81,24 84,26" -draw "rectangle 101,24 104,26" -draw "rectangle 121,24 124,26" \
     -fill '#ff2bd6' \
     -draw "rectangle 38,34 48,39" -draw "rectangle 58,34 68,39" -draw "rectangle 78,34 88,39" -draw "rectangle 98,34 108,39" -draw "rectangle 118,34 128,39" \
     -fill '#0b0426' -draw "rectangle 41,36 44,38" -draw "rectangle 61,36 64,38" -draw "rectangle 81,36 84,38" -draw "rectangle 101,36 104,38" -draw "rectangle 121,36 124,38" \
  \) -compose Over -composite "$OUT/invaders.png"
# UFO scout
magick "$OUT/invaders.png" \
  \( -size 160x90 xc:none \
     -fill '#ff8a00' -draw "ellipse 146,12 9,4 0,360" \
     -fill '#ffe600' -draw "circle 146,9 146,6" \
     -fill '#21e6ff' -draw "point 140,13" -draw "point 146,14" -draw "point 152,13" \
  \) -compose Over -composite "$OUT/invaders.png"
# 4 destructible shields + player cannon
magick "$OUT/invaders.png" \
  \( -size 160x90 xc:none \
     -stroke '#21e6ff' -strokewidth 2 -fill '#0e1e33' \
     -draw "rectangle 18,56 40,70" -draw "rectangle 58,56 80,70" -draw "rectangle 98,56 120,70" -draw "rectangle 132,56 154,70" \
     -fill '#05010f' \
     -draw "rectangle 25,64 33,70" -draw "rectangle 65,64 73,70" -draw "rectangle 105,64 113,70" -draw "rectangle 139,64 147,70" \
     -fill '#39ff88' -draw "rectangle 73,76 87,83" \
     -fill '#ffffff' -draw "rectangle 78,71 82,76" -draw "rectangle 79,67 81,71" \
  \) -compose Over -composite "$OUT/invaders.png"

# ---------- 3. GRID RUNNER : neon car on the converging highway ----------
bg "$OUT/runner.png" '#9b5cff'
# widen the road: overlay a pink-edged trapezoid on the lower half
magick "$OUT/runner.png" \
  \( -size 160x90 xc:none \
     -fill 'rgba(18,6,46,0.75)' -draw "polygon 58,50 102,50 152,90 8,90" \
     -stroke '#ff2bd6' -strokewidth 2 -fill none -draw "polyline 58,50 8,90" -draw "polyline 102,50 152,90" \
     -stroke '#21e6ff' -strokewidth 1 -fill none \
     -draw "line 80,50 80,90" -draw "line 69,50 52,90" -draw "line 91,50 108,90" \
     -draw "line 60,56 100,56" -draw "line 54,66 106,66" -draw "line 47,78 113,78" \
  \) -compose Over -composite "$OUT/runner.png"
# neon car (purple wedge, cyan skirt, yellow lamps)
magick "$OUT/runner.png" \
  \( -size 160x90 xc:none \
     -fill '#9b5cff' -draw "polygon 64,52 96,52 100,61 60,61" \
     -fill '#c3cdf0' -draw "rectangle 69,54 91,59" \
     -fill '#21e6ff' -draw "rectangle 58,61 102,64" \
     -fill '#ffe600' -draw "rectangle 62,61 68,63" -draw "rectangle 92,61 98,63" \
     -fill '#ff2bd6' -draw "rectangle 56,64 104,66" \
  \) -compose Over -composite "$OUT/runner.png"
# oncoming traffic + data chips
magick "$OUT/runner.png" \
  \( -size 160x90 xc:none \
     -fill '#ff8a00' -draw "rectangle 26,72 38,80" -draw "rectangle 122,72 134,80" \
     -fill '#ffe600' -draw "rectangle 76,44 84,51" -draw "rectangle 92,40 98,45" \
     -fill '#0b0426' -draw "rectangle 78,46 82,49" -draw "rectangle 93,41 97,44" \
  \) -compose Over -composite "$OUT/runner.png"

echo "Generated thumbnails:"
for f in "$OUT"/*.png; do identify -format "  %f  %wx%h  %B bytes\n" "$f"; done
