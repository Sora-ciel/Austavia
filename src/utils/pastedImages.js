/**
 * Which of the things on a clipboard are pictures worth putting in a note.
 *
 * ## What was asked for
 *
 * "On phone it says that Austavia doesn't permit to paste an image like that.
 * So we need to allow it."
 *
 * There are two separate paths and both were shut:
 *
 * - **Into a note, from the clipboard.** The window-level paste handler in
 *   `App.svelte` deliberately steps aside for anything editable, leaving it to
 *   the editor -- and the editor had no paste handling of its own, so an image
 *   pasted into a note went nowhere. That is every platform, not only phones.
 * - **From the keyboard, on Android.** A keyboard inserts a picture through
 *   `InputConnection.commitContent`, which an app has to opt into by declaring
 *   the types it accepts. Nothing declared any, so the keyboard told the person
 *   the app does not allow it. That half lives in the Android project; this
 *   module is what both paths hand their pictures to.
 *
 * ## Why a module for something this small
 *
 * Because the shape of a clipboard is not the same twice. A desktop browser
 * fills `files`; a WebView often fills only `items`, where a picture is a
 * `kind: 'file'` entry that has to be asked for one; and a copied screenshot
 * arrives alongside an `image/png` *and* a `text/html` holding an `<img>` tag,
 * so taking the first thing offered gets the markup rather than the picture.
 *
 * Working that out where a browser is required means it can only be checked by
 * pasting, on each platform, by hand.
 *
 * A picture always wins over whatever is offered beside it. Copying an image in
 * a browser puts an `image/png` on the clipboard *and* the `<img>` markup it
 * came from; copying one in a file manager puts the picture and its filename as
 * text. In both cases the picture is the thing meant, and the other half is
 * either a link that stops working when that page changes or a path nobody
 * wanted written into their note.
 */

/** A picture, as far as this is concerned. */
export function isImage(type) {
  return typeof type === 'string' && type.startsWith('image/');
}

/**
 * The pictures on a clipboard, in the order they were offered.
 *
 * Takes the two shapes a clipboard comes in and returns files. Anything that
 * claims to be a picture but produces nothing is dropped rather than passed on
 * as a hole for the caller to trip over.
 */
export function imagesFrom(clipboard) {
  if (!clipboard) return [];

  const found = [];
  const seen = new Set();
  const keep = (file) => {
    if (!file || !isImage(file.type)) return;
    // The same picture can appear in both lists. Name and size is enough to
    // tell one paste's duplicates apart, and being wrong costs one extra
    // picture rather than a missing one.
    const mark = `${file.name || ''}:${file.size ?? ''}:${file.type}`;
    if (seen.has(mark)) return;
    seen.add(mark);
    found.push(file);
  };

  for (const file of Array.from(clipboard.files || [])) keep(file);

  for (const item of Array.from(clipboard.items || [])) {
    if (item?.kind !== 'file' || !isImage(item.type)) continue;
    keep(typeof item.getAsFile === 'function' ? item.getAsFile() : null);
  }

  return found;
}

/**
 * Whether a paste holds a picture at all.
 *
 * Asked before anything is prevented: a paste with no picture in it has to
 * carry on being an ordinary paste, and a handler that swallows every paste in
 * order to look for pictures breaks pasting text.
 */
export function hasImage(clipboard) {
  return imagesFrom(clipboard).length > 0;
}
