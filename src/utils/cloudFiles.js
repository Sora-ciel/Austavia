/**
 * A folder's pictures, wallpaper and sound, made its own.
 *
 * Once a folder has synced, the pictures in it are links into the cloud,
 * stored under a path named after the folder (`attachments/<folder>/...`).
 * Three things need them as the pictures themselves instead:
 *
 * - **Export**, so a file still shows its pictures wherever it is opened
 *   ("also the background images", asked for on 2026-10-05).
 * - **Duplicate**, so the copy does not share files with the original: delete
 *   the original from the cloud and its whole path goes, links and all.
 * - **Rename**, for the same reason -- the old name's path is deleted once the
 *   folder is under its new one.
 *
 * So the links are fetched and put back as data. When the folder is next
 * uploaded, its own pictures go to its own path. Firebase's download links
 * answer any origin (`Access-Control-Allow-Origin: *`, checked 2026-10-05),
 * so the page may fetch them.
 *
 * `cloudLinksIn` and `withLinksReplaced` decide; `embedCloudFiles` fetches.
 */

const CLOUD_FILE = /^https:\/\/firebasestorage\.googleapis\.com\//;
const IMG_SRC = /(<img\b[^>]*?\bsrc\s*=\s*["'])([^"']+)(["'])/gi;

export function isCloudFile(value) {
  return typeof value === 'string' && CLOUD_FILE.test(value);
}

/**
 * The address to download a link from. A link inside written text is stored
 * as HTML writes it, with `&amp;` for `&`, and fetched as written it loses its
 * `token` -- the cloud then answers 403 and the picture reads as unreachable.
 * That refused every rename, duplicate and conflict copy of a folder with a
 * picture in its writing (found 2026-11-12, on Arial). The link itself stays as
 * stored, so the replacement still finds it in the text.
 */
export function fetchableLink(link) {
  return String(link).replace(/&amp;/g, '&');
}

/** Every cloud link in a folder: block pictures, pictures in writing and tasks, the wallpaper, and sound when `audio`. */
export function cloudLinksIn(payload, { audio = false } = {}) {
  const found = new Set();
  const fromHtml = html => {
    for (const match of String(html || '').matchAll(IMG_SRC)) if (isCloudFile(match[2])) found.add(match[2]);
  };
  for (const block of payload?.blocks || []) {
    if (!block || typeof block !== 'object') continue;
    if (isCloudFile(block.src)) found.add(block.src);
    if (audio && isCloudFile(block.trackUrl)) found.add(block.trackUrl);
    fromHtml(block.content);
    for (const task of Array.isArray(block.tasks) ? block.tasks : []) fromHtml(task?.text);
  }
  const wall = payload?.modeSettings?.default;
  if (isCloudFile(wall?.backgroundImage)) found.add(wall.backgroundImage);
  if (isCloudFile(wall?.backgroundImageMobile)) found.add(wall.backgroundImageMobile);
  return [...found];
}

/** The folder with each link in `map` (link -> replacement) put in its place. */
export function withLinksReplaced(payload, map) {
  const swap = value => (typeof value === 'string' && map.has(value) ? map.get(value) : value);
  const inHtml = html => typeof html === 'string'
    ? html.replace(IMG_SRC, (whole, open, src, close) => (map.has(src) ? `${open}${map.get(src)}${close}` : whole))
    : html;

  const blocks = (payload?.blocks || []).map(block => {
    if (!block || typeof block !== 'object') return block;
    const next = { ...block, src: swap(block.src), trackUrl: swap(block.trackUrl), content: inHtml(block.content) };
    if (block.src === undefined) delete next.src;
    if (block.trackUrl === undefined) delete next.trackUrl;
    if (block.content === undefined) delete next.content;
    if (Array.isArray(block.tasks)) next.tasks = block.tasks.map(task => (task && typeof task.text === 'string' ? { ...task, text: inHtml(task.text) } : task));
    // A picture worked out for this session from the old link is stale now.
    delete next.resolvedSrc;
    delete next.attachmentRequiresAuth;
    return next;
  });

  const settings = payload?.modeSettings;
  const wall = settings?.default;
  let modeSettings = settings;
  if (wall && typeof wall === 'object') {
    const nextWall = { ...wall };
    for (const key of ['backgroundImage', 'backgroundImageMobile']) {
      if (key in wall) nextWall[key] = swap(wall[key]);
    }
    modeSettings = { ...settings, default: nextWall };
  }

  return { ...payload, blocks, modeSettings };
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * The folder with its cloud links fetched and put in as data. A link that
 * cannot be fetched is left as a link, and counted in `failed`.
 */
export async function embedCloudFiles(payload, { audio = false } = {}) {
  const links = cloudLinksIn(payload, { audio });
  const map = new Map();
  let failed = 0;
  // Why each one failed, so a sync log can say "HTTP 404" (the picture is
  // gone) rather than only that something did.
  const reasons = [];
  for (const link of links) {
    try {
      const response = await fetch(fetchableLink(link));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      map.set(link, await blobToDataUrl(await response.blob()));
    } catch (error) {
      failed += 1;
      reasons.push(String(error?.message || error));
      console.warn('Could not fetch a picture to keep with the folder:', link, error);
    }
  }
  return { payload: map.size ? withLinksReplaced(payload, map) : payload, embedded: map.size, failed, reasons };
}
