#!/bin/bash
# Kept 2026-11-25: see PENDING, "The gap to native, measured exactly".
# Touch to screen, from Android's own clocks: the touchscreen's events
# (getevent) and the app layer's frames reaching the screen (SurfaceFlinger).
# $1: activity (NativeTypingTestActivity or MainActivity), $2 seconds, $3 out dir.
ADB=~/Android/Sdk/platform-tools/adb
ACT=$1; SECS=${2:-40}; OUT=$3; mkdir -p "$OUT"
LAYER=$($ADB shell dumpsys SurfaceFlinger --list | grep -oE "com\.sora\.austavia\.staging/com\.sora\.austavia\.${ACT}[$]_[0-9]+#[0-9]+" | tail -1)
echo "layer: $LAYER"
$ADB shell getevent -lt /dev/input/event3 > "$OUT/touch.txt" &
GE=$!
: > "$OUT/frames.txt"
END=$(( $(date +%s) + 600 )); rm -f "$OUT/stop"
while [ "$(date +%s)" -lt "$END" ] && [ ! -e "$OUT/stop" ]; do
  $ADB shell "dumpsys SurfaceFlinger --latency '$LAYER'" | tail -n +2 >> "$OUT/frames.txt"
  sleep 0.6
done
kill $GE 2>/dev/null; $ADB shell pkill -f "getevent -lt" 2>/dev/null
echo "touch lines: $(wc -l < "$OUT/touch.txt"), frames: $(sort -u "$OUT/frames.txt" | wc -l)"
