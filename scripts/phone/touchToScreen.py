# Touch to screen: for each finger lifted, the first frame of the app after it (PENDING, "The gap to native").
# Usage: python3 scripts/phone/touchToScreen.py <recording dir>...
import sys, re, bisect, collections
for d in sys.argv[1:]:
    ups = [float(m.group(1)) * 1e3 for m in (re.match(r'\[\s*([\d.]+)\]\s+EV_KEY\s+BTN_TOUCH\s+UP', l) for l in open(f'{d}/touch.txt', errors='ignore')) if m]
    frames = sorted({int(p[1]) / 1e6 for p in (l.split() for l in open(f'{d}/frames.txt')) if len(p) == 3 and 0 < int(p[1]) < 9e18})
    lat = []
    for i, t in enumerate(ups):
        j = bisect.bisect_right(frames, t)
        if j < len(frames) and frames[j] - t < 300:
            # Frames within 150ms after the release, all of them.
            lat.append([round(f - t) for f in frames[j:j + 4] if f - t < 150])
    buckets = collections.Counter((x[0] // 11) * 11 for x in lat if x)
    print(d.split('/')[-1], 'first frame after release, ms -> keys:', dict(sorted(buckets.items())))
    gap = sorted(b - a for a, b in zip(ups, ups[1:]))
    print('   time between releases, median ms:', round(gap[len(gap) // 2]))
