// Reads the tags embedded in an audio file — title, artist, album, year and
// lyrics — plus the cover art if there is one.
//
// The original file is always stored untouched, so nothing embedded in it is
// ever lost; this only lifts the interesting parts out so the app can show
// them. Text fields ride along with the synced metadata (they're small);
// the cover image is handed back separately to be kept device-local, since
// artwork routinely runs past 100KB and would blow up the sync payload.

const FALLBACK_TITLE_FROM_NAME = name => String(name || '').replace(/\.[^.]+$/, '');

// Everything the parser can read tags out of. The browser's own MIME guess is
// unreliable — .m4a comes through as audio/x-m4a, audio/mp4, video/mp4 or an
// empty string depending on the platform — so the extension is checked too and
// a file is accepted if either says it's audio.
export const SUPPORTED_AUDIO_EXTENSIONS = [
  'mp3', 'm4a', 'm4b', 'm4p', 'mp4', 'aac', 'adts',
  'flac', 'ogg', 'oga', 'opus', 'spx',
  'wav', 'wave', 'aif', 'aiff', 'aifc',
  'wma', 'asf', 'ape', 'wv', 'mpc',
  'dsf', 'dff', 'mka', 'webm', 'caf', 'amr', '3gp'
];

export function extensionOf(name) {
  const match = /\.([a-z0-9]+)$/i.exec(String(name || ''));
  return match ? match[1].toLowerCase() : '';
}

export function isSupportedAudioFile(file) {
  if (!file) return false;
  if (typeof file.type === 'string' && file.type.startsWith('audio/')) return true;
  return SUPPORTED_AUDIO_EXTENSIONS.includes(extensionOf(file.name));
}

// For the file picker's accept attribute, on a desktop browser.
export const AUDIO_ACCEPT_ATTRIBUTE = [
  'audio/*',
  ...SUPPORTED_AUDIO_EXTENSIONS.map(ext => `.${ext}`)
].join(',');

/**
 * What to put on the picker, given where it is going to open.
 *
 * Nothing, on a phone. Android turns `accept` into a MIME filter and hands it
 * to whichever provider is showing the files; anything the provider reports a
 * different type for is greyed out and cannot be chosen at all. Which types it
 * gets wrong is the provider's business, not ours — and this file already knows
 * they are unreliable: `isSupportedAudioFile` exists precisely because .m4a and
 * friends arrive as video/* or with no type at all. Filtering the picker by the
 * one thing we have already decided not to trust is how a music file ends up
 * greyed out in a folder full of music.
 *
 * Nothing is lost by asking for everything: whatever comes back still goes
 * through isSupportedAudioFile, so a file that is not audio is dropped exactly
 * as it was before. The attribute was never the thing keeping them out.
 *
 * A desktop browser keeps the list, where it filters by extension, gets it
 * right, and saves scrolling past documents.
 */
export function audioAcceptFor({ native = false } = {}) {
  return native ? undefined : AUDIO_ACCEPT_ATTRIBUTE;
}

export async function readAudioTags(file) {
  const fallback = {
    title: FALLBACK_TITLE_FROM_NAME(file?.name),
    artist: '',
    album: '',
    year: '',
    genre: '',
    lyrics: '',
    durationSeconds: null
  };

  try {
    // Loaded on demand: the parser is sizeable and only matters while adding
    // music, so it shouldn't sit in the initial bundle.
    const { parseBlob } = await import('music-metadata');
    // The blob carries its own name and type, but a File whose MIME the
    // browser left blank still parses because the parser falls back to
    // sniffing the container's magic bytes.
    //
    // `duration: true` is deliberately not set: for formats that don't state
    // the length in a header (VBR MP3 without a Xing frame, most obviously)
    // it makes the parser read the entire file to count frames. Across a
    // library of a few thousand tracks that is the difference between a short
    // wait and an unusable one. Where the duration is cheap to know, the
    // parser still reports it.
    const parsed = await parseBlob(file);
    const common = parsed?.common || {};

    const lyricsEntry = Array.isArray(common.lyrics) ? common.lyrics[0] : common.lyrics;
    const lyrics = typeof lyricsEntry === 'string'
      ? lyricsEntry
      : lyricsEntry?.text || lyricsEntry?.syncText?.map(part => part.text).join('') || '';

    // Containers vary in how many pictures they carry and which one is the
    // front cover, so prefer an explicitly-typed cover and fall back to the
    // first picture that actually has bytes.
    const pictures = Array.isArray(common.picture) ? common.picture.filter(p => p?.data) : [];
    const picture =
      pictures.find(p => /cover \(front\)|front/i.test(p.type || '')) || pictures[0] || null;
    const pictureCover = picture
      ? new Blob([picture.data], { type: picture.format || 'image/jpeg' })
      : null;

    // Files that keep their artwork somewhere non-standard parse fine but
    // report no picture; fall back to scanning the bytes for one.
    const cover = pictureCover || (await findEmbeddedCoverInBytes(file));

    return {
      tags: {
        title: (common.title || '').trim() || fallback.title,
        artist: (common.artist || common.albumartist || '').trim(),
        album: (common.album || '').trim(),
        year: common.year ? String(common.year) : '',
        genre: Array.isArray(common.genre) ? common.genre.join(', ') : (common.genre || ''),
        lyrics: (lyrics || '').trim(),
        durationSeconds: parsed?.format?.duration ? Math.round(parsed.format.duration) : null
      },
      cover,
      parsed: true,
      error: null
    };
  } catch (error) {
    // An unreadable or unusual container shouldn't stop the track being added —
    // the file itself still holds everything it came with. `parsed` is reported
    // so callers can tell a file with no artwork apart from one we simply
    // failed to read; they look identical otherwise.
    console.warn('Could not read tags from audio file:', error);
    // The container may be unreadable while the artwork inside it is fine.
    const scanned = await findEmbeddedCoverInBytes(file);
    return { tags: fallback, cover: scanned, parsed: false, error };
  }
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

// ── Last-resort artwork recovery ──────────────────────────────────
// Some encoders store cover art where a spec-abiding MP4 parser won't find
// it — files from SnapTube are a known case, and Windows' own Groove player
// misses their artwork too while more permissive players find it. Rather than
// guess at which non-standard atom was used, this scans the raw bytes for an
// embedded JPEG or PNG and pulls out the largest valid one.
//
// It only runs when the parser found no picture, and only over the ends of the
// file, so it costs nothing for the overwhelming majority of tracks.

const SCAN_HEAD_BYTES = 3 * 1024 * 1024;
const SCAN_TAIL_BYTES = 1 * 1024 * 1024;
const MIN_IMAGE_BYTES = 2 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
// Album art is never a 16px icon; this rejects UI sprites and stray thumbnails.
const MIN_IMAGE_EDGE = 120;

function indexOfSequence(bytes, pattern, from = 0) {
  outer: for (let i = from; i <= bytes.length - pattern.length; i += 1) {
    for (let j = 0; j < pattern.length; j += 1) {
      if (bytes[i + j] !== pattern[j]) continue outer;
    }
    return i;
  }
  return -1;
}

const JPEG_START = [0xff, 0xd8, 0xff];
const JPEG_END = [0xff, 0xd9];
const PNG_START = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_END = [0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];

function findImageCandidates(bytes) {
  const found = [];
  for (const [start, end, type, endLength] of [
    [JPEG_START, JPEG_END, 'image/jpeg', 2],
    [PNG_START, PNG_END, 'image/png', 8]
  ]) {
    let at = 0;
    while (found.length < 12) {
      const begin = indexOfSequence(bytes, start, at);
      if (begin === -1) break;
      const stop = indexOfSequence(bytes, end, begin + start.length);
      at = begin + start.length;
      if (stop === -1) continue;
      const size = stop + endLength - begin;
      if (size < MIN_IMAGE_BYTES || size > MAX_IMAGE_BYTES) continue;
      found.push({ bytes: bytes.subarray(begin, begin + size), type, size });
    }
  }
  // Biggest first: the cover is normally the largest image in the file.
  return found.sort((a, b) => b.size - a.size);
}

async function isUsableCover(blob) {
  if (typeof createImageBitmap !== 'function') return true; // can't check; accept
  try {
    const bitmap = await createImageBitmap(blob);
    const ok = bitmap.width >= MIN_IMAGE_EDGE && bitmap.height >= MIN_IMAGE_EDGE;
    bitmap.close?.();
    return ok;
  } catch {
    return false; // not a decodable image, so not artwork
  }
}

export async function findEmbeddedCoverInBytes(file) {
  if (!file || typeof file.slice !== 'function') return null;
  try {
    const chunks = [new Uint8Array(await file.slice(0, SCAN_HEAD_BYTES).arrayBuffer())];
    if (file.size > SCAN_HEAD_BYTES + SCAN_TAIL_BYTES) {
      chunks.push(new Uint8Array(await file.slice(file.size - SCAN_TAIL_BYTES).arrayBuffer()));
    }

    for (const chunk of chunks) {
      for (const candidate of findImageCandidates(chunk)) {
        const blob = new Blob([candidate.bytes], { type: candidate.type });
        if (await isUsableCover(blob)) return blob;
      }
    }
  } catch (error) {
    console.warn('Byte scan for artwork failed:', error);
  }
  return null;
}
