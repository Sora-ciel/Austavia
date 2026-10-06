/**
 * Handing a file to the person: a screenshot, an export.
 *
 * ## What was asked for
 *
 * "The screenshot button doesn't seem to work well on mobile -- the download
 * and the copy. I can't find the downloaded file, and neither the copied one.
 * I think it would be better for it to show a thing as if it was share on
 * phone, and include gallery, so you can save it in the gallery" --
 * 2026-10-05.
 *
 * The app downloaded files the way a web page does, with a link it clicks
 * itself. Android's WebView does not act on that: nothing is saved, and the
 * picture copied to the clipboard does not reach other apps either. So in the
 * Android app a file is written to the app's cache and offered through the
 * system share sheet, where Photos, Files, Drive or any messaging app can take
 * it -- the same sheet every other app uses. A computer and a browser keep
 * downloading, which works there.
 *
 * `deliveryRoute` decides; `deliverFile` does it.
 */

export function isNativeAndroid() {
  const capacitor = typeof window !== 'undefined' ? window.Capacitor : null;
  return !!capacitor?.isNativePlatform?.() && capacitor.getPlatform?.() === 'android';
}

/** How a file reaches the person: 'share' in the Android app, 'download' elsewhere. */
export function deliveryRoute({ nativeAndroid = false } = {}) {
  return nativeAndroid ? 'share' : 'download';
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Saves or shares `blob` as `name`. Resolves to 'downloaded', 'shared', or
 * 'cancelled' when the share sheet was closed without choosing anything.
 */
export async function deliverFile(blob, name, { title = '' } = {}) {
  if (deliveryRoute({ nativeAndroid: isNativeAndroid() }) === 'download') {
    download(blob, name);
    return 'downloaded';
  }

  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share')
  ]);
  const written = await Filesystem.writeFile({
    path: name,
    data: await blobToBase64(blob),
    directory: Directory.Cache
  });
  try {
    await Share.share({ title: title || name, files: [written.uri] });
    return 'shared';
  } catch (error) {
    // Closing the sheet is an answer, not a failure.
    if (/cancel/i.test(String(error?.message || error))) return 'cancelled';
    throw error;
  }
}
