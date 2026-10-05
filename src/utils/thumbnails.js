/**
 * Small copies of pictures, for showing them small.
 *
 * Single Note's search page showed each note's picture at 72px by handing the
 * browser the picture itself -- often a full-size photo, often as a data URL
 * hundreds of kilobytes long -- and it lagged: reported on 2026-10-05, "the
 * image that it shows, it lags". Every card decoded and scaled the whole
 * picture to draw a thumbnail.
 *
 * So each picture is drawn once into a small canvas, kept as a small JPEG,
 * and that is what the cards show. Remembered by source for as long as the
 * page is open, so the same picture on two cards, or the page opened twice,
 * is made once. A picture that cannot be drawn -- a remote one the browser
 * will not let the page read back -- is shown as itself, as before.
 *
 * Browser-only: it acts rather than decides, and is not unit-tested.
 */

const made = new Map(); // src -> Promise<string>
const MAX_KEPT = 200;

/** A small version of `src`, `size` pixels on its shortest side at most. */
export function thumbnailFor(src, size = 144) {
  if (!src || typeof document === 'undefined') return Promise.resolve(src);
  const key = `${size}|${src}`;
  if (made.has(key)) return made.get(key);

  const job = new Promise(resolve => {
    const img = new Image();
    img.decoding = 'async';
    if (!String(src).startsWith('data:') && !String(src).startsWith('blob:')) img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const scale = Math.min(1, size / Math.max(1, Math.min(img.naturalWidth, img.naturalHeight)));
        if (scale >= 1) return resolve(src); // already small
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(blob => resolve(blob ? URL.createObjectURL(blob) : src), 'image/jpeg', 0.82);
      } catch {
        resolve(src); // a picture the page may not read back
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });

  made.set(key, job);
  if (made.size > MAX_KEPT) {
    const [oldest] = made.keys();
    made.get(oldest)?.then(url => { if (url?.startsWith('blob:') && url !== oldest) URL.revokeObjectURL(url); });
    made.delete(oldest);
  }
  return job;
}

/**
 * A Svelte action: `<img use:thumbnail={src}>` shows the small copy once it
 * is made, and nothing before.
 */
export function thumbnail(node, src) {
  let current = null;
  const show = next => {
    current = next;
    if (!next) {
      node.removeAttribute('src');
      return;
    }
    thumbnailFor(next).then(url => {
      if (current === next) node.src = url;
    });
  };
  show(src);
  return { update: show };
}
