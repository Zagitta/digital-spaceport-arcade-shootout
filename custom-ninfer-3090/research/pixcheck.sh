#!/usr/bin/env bash
# Pixel-level visual verification of game canvas screenshots (no vision model needed).
# For each screenshot: unique color count, dominant colors, and spot checks.
set -u
cd "$(dirname "$0")/.."

check_shot () {
  local f="$1"; shift
  [ -f "$f" ] || { echo "MISSING $f"; return 1; }
  local uniq=$(convert "$f" -format "%k" info:)
  local size=$(identify -format "%wx%h" "$f")
  echo "--- $f ($size, $uniq colors)"
  # top 8 colors by frequency
  convert "$f" -depth 8 -format "%c" histogram:info:- 2>/dev/null | sort -rn | head -8 | sed 's/^/    /'
  for spec in "$@"; do
    # spec: "x,y,radius,label" — sample a disk and report mean color + non-black fraction
    local xy=${spec%%,*}; rest=${spec#*,}; rad=${rest%%,*}; rest2=${rest#*,}; label=${rest2%%,*}
    local x=${xy%%,*}; y=${xy#*,}
    local out=$(convert "$f" -crop $((rad*2))x$((rad*2))+$((x-rad))+$((y-rad)) +repage -format "%[fx:100*mean] %[fx:100*standard_deviation]" info: 2>/dev/null)
    local mean=$(echo "$out" | awk '{print $1}'); local sd=$(echo "$out" | awk '{print $2}')
    printf "    %-22s @(%s,%s) mean=%s sd=%s\n" "$label" "$x" "$y" "$mean" "$sd"
  done
}

echo "===== LUNAR LIFTER ====="
[ -f validation/lander/02_attract.png ] && check_shot validation/lander/02_attract.png
[ -f validation/lander/03_play_start.png ] && check_shot validation/lander/03_play_start.png
[ -f validation/lander/04_play_flying.png ] && check_shot validation/lander/04_play_flying.png
[ -f validation/lander/07_gameover_table.png ] && check_shot validation/lander/07_gameover_table.png
echo ""
echo "===== LANDING PAGE (full viewport) ====="
check_shot validation/landing.png 2>/dev/null || true
echo ""
echo "done"
