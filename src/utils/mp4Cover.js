/**
 * Cover art out of an MP4 container — `.m4a`, `.mp4`, `.m4b`.
 *
 * ## What was asked for
 *
 * "Musics like this one got covers but our app doesn't yet succeed in putting
 * them. I want you to find how to take their tags/covers so that we can have
 * their covers."
 *
 * ## Why the ordinary parser misses them
 *
 * The example file does have artwork: a `covr` atom holding 31,390 bytes that
 * begin `ff d8 ff e0 … JFIF`, which is a JPEG by any reading. But an iTunes
 * metadata atom declares what it holds in a type field, and this one says **1**
 * — UTF-8 text — where a picture should say 13 for JPEG or 14 for PNG. A parser
 * that believes the file reads those bytes as a string and reports no picture,
 * which is correct behaviour on an incorrect file, and is why nothing turned up.
 *
 * Plenty of encoders get this wrong. Rather than trusting the declaration, this
 * looks at the first bytes of the payload and believes those instead: a thing
 * that starts with a JPEG or PNG signature is a picture, whatever the atom
 * claims.
 *
 * ## Why not just scan the file for a JPEG
 *
 * There is already a last-resort byte scan, and on this file it also failed —
 * the artwork sits 99.1% of the way in, past the head it reads. Widening it
 * would work and would cost a multi-megabyte search on every track without
 * stored art.
 *
 * Reading the container properly is both more accurate and far cheaper. MP4 is
 * a tree of length-prefixed atoms, so the top level can be stepped through
 * eight bytes at a time until `moov` is found, and only that one atom read —
 * 67KB rather than 3.3MB on the example file.
 */

/** What an atom's header says, or null when there is not a sane one there. */
export function readAtomHeader(bytes, offset) {
  if (!bytes || offset + 8 > bytes.length) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let size = view.getUint32(offset);
  let headerSize = 8;

  let type = '';
  for (let i = 0; i < 4; i += 1) type += String.fromCharCode(bytes[offset + 4 + i]);
  // An atom type is four printable characters, and this is how a walk over
  // junk stops rather than wandering.
  //
  // `\xa9` has to be allowed as well, and leaving it out is not a small
  // oversight: iTunes names most of its metadata atoms with a leading © —
  // ©nam, ©ART, ©alb — and one of those is the *first* child of `ilst`, so a
  // check without it rejects the very first thing inside the list and stops
  // before ever reaching the artwork beside it. Which is exactly what it did.
  if (!/^[\x20-\x7e\xa9]{4}$/.test(type)) return null;

  if (size === 1) {
    // 64-bit size, for atoms past 4GB. The high word is dropped: a media file
    // that large is not one this app is going to hold in memory anyway.
    if (offset + 16 > bytes.length) return null;
    const high = view.getUint32(offset + 8);
    const low = view.getUint32(offset + 12);
    if (high !== 0) return null;
    size = low;
    headerSize = 16;
  } else if (size === 0) {
    // Runs to the end of its parent.
    size = bytes.length - offset;
  }

  if (size < headerSize) return null;
  return { type, size, headerSize };
}

/** Atoms that hold other atoms on the way to the artwork. */
const CONTAINERS = new Set(['moov', 'udta', 'meta', 'ilst', 'covr', 'trak', 'mdia']);

/**
 * `meta` is a *full* atom: four bytes of version and flags sit between its
 * header and its children. Descending without stepping over those lands in the
 * middle of a length and the walk falls apart.
 */
const FULL_ATOMS = new Set(['meta']);

/** JPEG and PNG, recognised by their own first bytes rather than by a claim. */
export function sniffImageType(bytes, at = 0, end = bytes.length) {
  const length = end - at;
  if (length < 8) return null;
  if (bytes[at] === 0xff && bytes[at + 1] === 0xd8 && bytes[at + 2] === 0xff) return 'image/jpeg';
  if (
    bytes[at] === 0x89 &&
    bytes[at + 1] === 0x50 &&
    bytes[at + 2] === 0x4e &&
    bytes[at + 3] === 0x47
  ) {
    return 'image/png';
  }
  return null;
}

/** The smallest thing worth calling a cover, to skip stray icons. */
const MIN_COVER_BYTES = 1024;

/**
 * The artwork inside an MP4 tree, or null.
 *
 * Give it the whole file or just the `moov` atom; it walks whatever it is
 * given. The biggest picture wins, because a file with several usually has the
 * front cover as the largest.
 */
export function findCoverInAtoms(bytes, start = 0, end = bytes?.length ?? 0, depth = 0) {
  if (!bytes || depth > 8) return null;

  let best = null;
  let offset = start;

  while (offset + 8 <= end) {
    const header = readAtomHeader(bytes, offset);
    if (!header) break;
    if (offset + header.size > end) break;

    const childrenStart =
      offset + header.headerSize + (FULL_ATOMS.has(header.type) ? 4 : 0);

    if (header.type === 'covr') {
      // Inside are one or more `data` atoms: header, four bytes of type, four
      // reserved, then the payload. The type is read past rather than trusted.
      let at = childrenStart;
      while (at + 16 <= offset + header.size) {
        const inner = readAtomHeader(bytes, at);
        if (!inner) break;
        const payloadStart = at + inner.headerSize + 8;
        const payloadEnd = Math.min(at + inner.size, offset + header.size);
        const type = sniffImageType(bytes, payloadStart, payloadEnd);
        const size = payloadEnd - payloadStart;
        if (type && size >= MIN_COVER_BYTES && (!best || size > best.size)) {
          best = { start: payloadStart, end: payloadEnd, size, type };
        }
        at += inner.size;
      }
    } else if (CONTAINERS.has(header.type)) {
      const found = findCoverInAtoms(bytes, childrenStart, offset + header.size, depth + 1);
      if (found && (!best || found.size > best.size)) best = found;
    }

    offset += header.size;
  }

  return best;
}

/**
 * The cover out of a file, reading as little of it as possible.
 *
 * Steps through the top-level atoms by their lengths — eight bytes read per
 * atom — and only pulls in `moov`, which holds the metadata and is small. On
 * the example file that is 67KB read instead of 3.3MB scanned.
 */
export async function findMp4Cover(file) {
  if (!file || typeof file.slice !== 'function') return null;

  try {
    let offset = 0;
    while (offset + 8 <= file.size) {
      const head = new Uint8Array(await file.slice(offset, offset + 16).arrayBuffer());
      const header = readAtomHeader(head, 0);
      if (!header) return null;

      if (header.type === 'moov') {
        const moov = new Uint8Array(
          await file.slice(offset, offset + header.size).arrayBuffer()
        );
        const found = findCoverInAtoms(moov, 0, moov.length);
        if (!found) return null;
        return new Blob([moov.subarray(found.start, found.end)], { type: found.type });
      }

      // `mdat` is the audio itself and is most of the file; stepping over it by
      // its length is the whole reason this is cheap.
      offset += header.size;
    }
    return null;
  } catch {
    return null;
  }
}
