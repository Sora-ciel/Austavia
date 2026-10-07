/**
 * A colour as the theme editor shows it: a picker, and how see-through.
 *
 * The browser's colour picker has no alpha, and the panels of every
 * see-through theme are eight-digit hex with a zero alpha. Editing them with
 * the bare picker flattened them to opaque -- one of the reasons an official
 * theme could not be rebuilt in the editor (asked for on 2026-10-06). So a
 * colour is split into its picker part and its opacity, and put back together
 * in the form the theme already used.
 */

const clamp01 = value => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1);
const hex2 = value => Math.round(value).toString(16).padStart(2, '0');

/**
 * `{ hex: '#rrggbb', alpha: 0..1, form: 'hex' | 'rgba' }`, or `null` when the
 * value is not a plain colour -- a gradient, a CSS variable -- and can only be
 * edited as text.
 */
export function parseCssColor(value) {
  const text = String(value ?? '').trim();
  let match = /^#([0-9a-f]{3,4})$/i.exec(text);
  if (match) {
    const full = match[1].split('').map(c => c + c).join('');
    return parseCssColor(`#${full}`);
  }
  match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(text);
  if (match) {
    return {
      hex: `#${match[1].toLowerCase()}`,
      alpha: match[2] ? parseInt(match[2], 16) / 255 : 1,
      form: 'hex'
    };
  }
  match = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(text);
  if (match) {
    const [r, g, b] = match.slice(1, 4).map(Number);
    if ([r, g, b].some(c => c > 255)) return null;
    return {
      hex: `#${hex2(r)}${hex2(g)}${hex2(b)}`,
      alpha: match[4] === undefined ? 1 : clamp01(Number(match[4])),
      form: 'rgba'
    };
  }
  return null;
}

/** A picker colour and an opacity, in the form the value was written in. */
export function formatCssColor(hex, alpha = 1, form = 'hex') {
  const parsed = parseCssColor(hex);
  if (!parsed) return String(hex ?? '');
  const a = clamp01(alpha);
  if (a >= 0.999) return parsed.hex;
  if (form === 'rgba') {
    const [r, g, b] = [1, 3, 5].map(at => parseInt(parsed.hex.slice(at, at + 2), 16));
    return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 100) / 100})`;
  }
  return `${parsed.hex}${hex2(a * 255)}`;
}

/**
 * A colour at full opacity: what writing takes when a button is filled with
 * the text colour and the writing swaps to the panel's. On a see-through theme
 * the panel colour is clear, and swapped onto writing it made the writing
 * disappear on the Bin button and the dialogs' main buttons (2026-10-06). The
 * colour stays the theme's; only its transparency goes. Anything that is not a
 * plain colour comes back as `fallback`.
 */
export function solidColor(value, fallback = '') {
  const parsed = parseCssColor(value);
  return parsed ? parsed.hex : (fallback || String(value ?? ''));
}
