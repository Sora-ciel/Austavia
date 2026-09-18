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

/**
 * ## Quality: the picture is left alone unless it cannot be sent
 *
 * The first version of this shrank every cover to 512 and re-encoded it, which
 * cost quality on covers that were never the problem — and the problem turned
 * out to be somewhere else entirely, so every one of those was paid for
 * nothing.
 *
 * So: a cover that already fits is handed over **exactly as it is**, bytes
 * untouched, no re-encode and no loss. Only one that will not fit is reduced,
 * and then by as little as gets it under the limit rather than straight to the
 * smallest size. Most embedded art is 50–300KB and goes through as-is.
 */

/** What a reduced cover is re-encoded as. JPEG, because a cover is a photograph. */
export const ENCODE_TYPE = 'image/jpeg';

/**
 * Tried in order, and the first that fits wins.
 *
 * Only reached by a cover too big to send as it stands, so the question is not
 * "how small" but "how little can be taken off". A 1400px sleeve usually lands
 * on the first step and keeps far more detail than the flat 512 it used to get.
 */
export const REDUCTION_STEPS = Object.freeze([
  { edge: 1024, quality: 0.92 },
  { edge: 768, quality: 0.9 },
  { edge: 512, quality: 0.85 },
  { edge: 320, quality: 0.8 }
]);

/** The largest step, kept as a name for the tests and for targetSize's default. */
export const MAX_EDGE = REDUCTION_STEPS[0].edge;

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
 * The cover as a data URL the notification can be given, or '' when there is none.
 *
 * Untouched if it fits, reduced only as far as it has to be if it does not.
 *
 * Browser-only — reducing needs a canvas — but the untouched path does not, so
 * a cover that already fits still gets through somewhere without one. A failure
 * here is never fatal: artwork is decoration, and a notification without it is
 * still a working notification.
 */
export async function coverForNotification(blob) {
  if (!blob) return '';

  // As it is, if it will go. This is the ordinary case and it costs the picture
  // nothing at all.
  const original = await asDataUrl(blob);
  if (fitsOnAnIntent(original)) return original;

  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return '';

  let bitmap = null;
  try {
    bitmap = await createImageBitmap(blob);

    let smallest = '';
    for (const step of REDUCTION_STEPS) {
      const size = targetSize({ width: bitmap.width, height: bitmap.height, max: step.edge });
      if (!size) return '';

      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext('2d');
      if (!context) return '';
      context.drawImage(bitmap, 0, 0, size.width, size.height);

      const reduced = canvas.toDataURL(ENCODE_TYPE, step.quality);
      // The first step that fits is the most detail this cover can be sent
      // with, so stop rather than carrying on down the list.
      if (fitsOnAnIntent(reduced)) return reduced;
      smallest = reduced;
    }

    // Past the last step and still too big: a cover this stubborn is better
    // left out than sent as something that will not arrive.
    return fitsOnAnIntent(smallest) ? smallest : '';
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
