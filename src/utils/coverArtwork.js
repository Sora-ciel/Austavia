/**
 * The cover, cut down to a size that can actually be handed to Android.
 *
 * ## What was asked for
 *
 * "I also asked for the cover as background and we don't have it. Lark Player
 * and other music players have it, we should have it."
 *
 * ## Why it was not arriving
 *
 * The notification is started with `startForegroundService(intent)`, and the
 * cover travels as a string extra on that intent. Everything on an intent goes
 * through Binder, whose transaction buffer is about a megabyte for the whole
 * process — not per call — and embedded album art is routinely 500KB to 1.5MB
 * before base64 makes it a third larger again. Over the limit the write does
 * not fail loudly in a way the app can see; the artwork simply never turns up.
 *
 * Nothing was resizing it. A cover is stored exactly as it was embedded in the
 * file, which for a well-tagged album is often 1400×1400.
 *
 * ## What the system does with it
 *
 * Android draws the media notification itself, and from Android 12 the artwork
 * is what colours it; from 13 the system's media card uses the art as its
 * background. So "the cover as the background" is not something the app draws —
 * it is something the app *supplies*, and supplying it is the whole of it.
 *
 * 512 on the long edge is comfortably more than the card is ever drawn at and
 * lands around 40–80KB as JPEG, which is far enough under the limit that a
 * second notification in flight cannot push it over.
 */

/** The long edge the cover is cut down to. */
export const MAX_EDGE = 512;

/** What it is re-encoded as. JPEG, because a cover is a photograph. */
export const ENCODE_TYPE = 'image/jpeg';
export const ENCODE_QUALITY = 0.85;

/**
 * The most we will put on an intent, in characters of data URL.
 *
 * Deliberately far below the Binder ceiling rather than near it. The budget is
 * shared across everything in flight in the process, so the question is not
 * "does this one fit" but "does this one fit alongside whatever else is
 * happening", and there is no way to ask that from here.
 */
export const MAX_DATA_URL_CHARS = 300_000;

/**
 * The size to draw the cover at: the long edge capped, the shape kept.
 *
 * A cover is usually square but not always — some are a scan of a sleeve, and
 * stretching those to a square is worse than leaving them alone.
 */
export function targetSize({ width, height, max = MAX_EDGE } = {}) {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;

  const longest = Math.max(w, h);
  // Never scaled up. A small cover made bigger is the same picture with more
  // bytes, and the notification would rather have the original.
  if (longest <= max) return { width: Math.round(w), height: Math.round(h), resized: false };

  const ratio = max / longest;
  return {
    width: Math.max(1, Math.round(w * ratio)),
    height: Math.max(1, Math.round(h * ratio)),
    resized: true
  };
}

/** Whether a data URL is small enough to risk putting on an intent. */
export function fitsOnAnIntent(dataUrl) {
  return typeof dataUrl === 'string' && dataUrl.length > 0 && dataUrl.length <= MAX_DATA_URL_CHARS;
}

/**
 * The cover as a data URL small enough to send, or '' when there is none.
 *
 * Browser-only — it needs a canvas — so it is guarded rather than assumed, and
 * the shape of the decision above is what the tests cover. A failure here is
 * never fatal: artwork is decoration, and a notification without it is still a
 * working notification.
 */
export async function shrinkCover(blob) {
  if (!blob || typeof document === 'undefined' || typeof createImageBitmap !== 'function') {
    return '';
  }

  let bitmap = null;
  try {
    bitmap = await createImageBitmap(blob);
    const size = targetSize({ width: bitmap.width, height: bitmap.height });
    if (!size) return '';

    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) return '';
    context.drawImage(bitmap, 0, 0, size.width, size.height);

    const shrunk = canvas.toDataURL(ENCODE_TYPE, ENCODE_QUALITY);
    // Re-encoding can come out larger than the original for a small, already
    // well-compressed cover, and there is no sense sending the worse of the two.
    const original = size.resized ? '' : await asDataUrl(blob);
    const best =
      original && original.length < shrunk.length && fitsOnAnIntent(original) ? original : shrunk;
    return fitsOnAnIntent(best) ? best : '';
  } catch {
    return '';
  } finally {
    bitmap?.close?.();
  }
}

function asDataUrl(blob) {
  return new Promise(resolve => {
    try {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    } catch {
      resolve('');
    }
  });
}
