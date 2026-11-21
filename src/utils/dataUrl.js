/**
 * A file or blob as a data: address -- the one reader everything uses.
 *
 * Written once on 2026-11-21 after the bloat count (PENDING, "Bloat") found
 * fourteen copies of these lines, each slightly different. Where a caller
 * wants a failure to read as "nothing" rather than an error, it says so with
 * `.catch(() => '')` at the call.
 */
export function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('could not read the file'));
    reader.readAsDataURL(blob);
  });
}
