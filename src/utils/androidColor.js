/**
 * A theme colour, written the way Android reads one: `#AARRGGBB`.
 *
 * The timer notification is painted in the theme's dialog colours (asked for
 * on 2026-10-05: "hopefully it follows the colour of the themes"), and those
 * arrive as CSS -- `#17171a`, `#111111f0`, `rgba(12, 12, 14, 0.78)`. Android's
 * Color.parseColor takes neither the short forms nor rgb(), and reads an
 * eight-digit hex with the alpha first where CSS puts it last.
 *
 * `opaque` drops the alpha. A notification's background sits on whatever the
 * system draws, so a see-through theme's 78% backing would show the shade
 * through it; its colour without the transparency is what the theme means.
 *
 * Anything it cannot read -- a gradient, a var(), a colour name -- is null,
 * and the notification keeps its own colours for that part rather than guess.
 */
export function toAndroidColor(css, { opaque = false } = {}) {
  const rgba = parseCssColor(css);
  if (!rgba) return null;
  const [r, g, b, a] = rgba;
  const alpha = opaque ? 255 : Math.round(a * 255);
  const hex = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${hex(alpha)}${hex(r)}${hex(g)}${hex(b)}`.toUpperCase();
}

function parseCssColor(css) {
  const value = String(css ?? '').trim().toLowerCase();
  if (!value) return null;

  const hexMatch = value.match(/^#([0-9a-f]{3,8})$/);
  if (hexMatch) {
    let digits = hexMatch[1];
    if (digits.length === 3 || digits.length === 4) digits = [...digits].map(d => d + d).join('');
    if (digits.length !== 6 && digits.length !== 8) return null;
    const n = i => parseInt(digits.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), digits.length === 8 ? n(6) / 255 : 1];
  }

  const fn = value.match(/^rgba?\(([^)]+)\)$/);
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const channel = p => (p.endsWith('%') ? (parseFloat(p) / 100) * 255 : parseFloat(p));
    const [r, g, b] = parts.slice(0, 3).map(channel);
    const alphaPart = parts[3];
    const a = alphaPart === undefined ? 1 : alphaPart.endsWith('%') ? parseFloat(alphaPart) / 100 : parseFloat(alphaPart);
    if ([r, g, b, a].some(n => !Number.isFinite(n))) return null;
    return [r, g, b, Math.max(0, Math.min(1, a))];
  }

  return null;
}
