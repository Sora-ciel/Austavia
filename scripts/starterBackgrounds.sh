#!/bin/bash
# The starter folders' wallpapers (utils/plannerFolder.js), made rather than
# drawn: no one else's art ships with Austavia (PENDING, "Starter folders").
# Needs ImageMagick. Run from the project's root; writes public/starter/.
#
# The planner's: dark slate with soft light and a faint dot grid, for white
# writing. Grain breaks up the banding that smooth gradients get in WebP.
set -e
OUTDIR=public/starter
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

planner() {
  local W=$1 H=$2 OUT=$3
  local S=$(( W<H ? W : H ))
  magick -size ${W}x${H} gradient:'#0e1420'-'#121926' "$WORK/base.png"
  magick -size ${W}x${H} xc:none \
    -fill 'rgba(75,115,200,0.46)' -draw "circle $((W*16/100)),$((H*20/100)) $((W*16/100+S*45/100)),$((H*20/100))" \
    -fill 'rgba(55,145,155,0.36)' -draw "circle $((W*86/100)),$((H*80/100)) $((W*86/100+S*50/100)),$((H*80/100))" \
    -fill 'rgba(120,95,180,0.28)' -draw "circle $((W*72/100)),$((H*10/100)) $((W*72/100+S*25/100)),$((H*10/100))" \
    -blur 0x$((S/6)) "$WORK/glow.png"
  local STEP=$(( S/28 ))
  magick -size ${STEP}x${STEP} xc:none -fill 'rgba(255,255,255,0.07)' -draw "circle $((STEP/2)),$((STEP/2)) $((STEP/2+1)),$((STEP/2))" "$WORK/tile.png"
  magick -size ${W}x${H} tile:"$WORK/tile.png" "$WORK/dots.png"
  magick "$WORK/base.png" "$WORK/glow.png" -compose over -composite "$WORK/dots.png" -compose over -composite \
    \( -size ${W}x${H} radial-gradient:'rgba(0,0,0,0)'-'rgba(0,0,0,0.45)' \) -compose over -composite \
    -attenuate 0.35 +noise Uniform -quality 90 "$OUT"
}

mkdir -p "$OUTDIR"
planner 2560 1440 "$OUTDIR/planner-desktop.webp"
planner 1170 2532 "$OUTDIR/planner-phone.webp"
echo "wallpapers in $OUTDIR"
