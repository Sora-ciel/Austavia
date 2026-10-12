/**
 * Moving an MP4's index to the front before it is played.
 *
 * ## What was asked for
 *
 * "The musics that are m4a don't work well when playing [on Linux] … sometimes
 * a couple of seconds are silent, sometimes the whole playing is silent till
 * you change the timeline." Reported 2026-10-09, the day after the Linux app
 * was first built.
 *
 * ## What was measured
 *
 * The files are ordinary AAC with nothing wrong in the audio itself — no gaps
 * in the timestamps, one plain edit list. What they share is their layout:
 * `ftyp free mdat moov`, the index (`moov`) written *after* the sound (`mdat`),
 * which is what most converters produce unless told otherwise.
 *
 * WebKitGTK hands a blob: address to GStreamer as a stream, and a stream with
 * its index at the end has to be read to the end and then rewound before
 * anything can be decoded. In a real WebKitGTK webview, recording what reached
 * the speakers, one such file played for 18 seconds with the clock running and
 * not one sample of sound. The same file with `moov` moved to the front — the
 * same bytes of audio, nothing re-encoded — played at once.
 *
 * ## What this does
 *
 * Exactly what `ffmpeg -movflags +faststart` does, without ffmpeg: the `moov`
 * atom is moved to just before the first `mdat`, and every chunk offset inside
 * it (`stco`, or `co64` for big files) is moved by the same amount, since the
 * audio it points at is now that much further into the file. Nothing else
 * changes, so what is decoded is identical.
 *
 * It is only ever done to the copy handed to the player. The stored track is
 * left exactly as it was imported.
 *
 * A file it does not understand is played as it is rather than guessed at.
 */

import { readAtomHeader } from './mp4Cover.js';

/** Atoms on the way down to the chunk offset tables. */
const PATH_TO_OFFSETS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl']);

/** The top-level atoms of a file, or null when it is not a sane MP4. */
function topLevelAtoms(bytes) {
  const atoms = [];
  let offset = 0;
  while (offset < bytes.length) {
    const header = readAtomHeader(bytes, offset);
    if (!header || offset + header.size > bytes.length) return null;
    atoms.push({ ...header, offset });
    offset += header.size;
  }
  return atoms;
}

/** Whether these bytes start like an MP4 (`ftyp` as the first atom). */
export function looksLikeMp4(bytes) {
  return !!bytes && bytes.length >= 8
    && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
}

/**
 * Moves every chunk offset in `moov` (a copy, changed in place) that points at
 * or after `from` and before `to` by `shift`. False when one would no longer
 * fit in 32 bits, in which case the caller gives up and plays the original.
 */
function shiftChunkOffsets(moov, start, end, from, to, shift) {
  const view = new DataView(moov.buffer, moov.byteOffset, moov.byteLength);
  let offset = start;
  while (offset < end) {
    const header = readAtomHeader(moov, offset);
    if (!header || offset + header.size > end) return false;
    const body = offset + header.headerSize;

    if (PATH_TO_OFFSETS.has(header.type)) {
      if (!shiftChunkOffsets(moov, body, offset + header.size, from, to, shift)) return false;
    } else if (header.type === 'stco' || header.type === 'co64') {
      const wide = header.type === 'co64';
      // Version and flags, then the number of entries.
      const count = view.getUint32(body + 4);
      const first = body + 8;
      if (first + count * (wide ? 8 : 4) > offset + header.size) return false;
      for (let i = 0; i < count; i += 1) {
        if (wide) {
          const at = first + i * 8;
          const value = view.getUint32(at) * 2 ** 32 + view.getUint32(at + 4);
          if (value < from || value >= to) continue;
          const moved = value + shift;
          view.setUint32(at, Math.floor(moved / 2 ** 32));
          view.setUint32(at + 4, moved % 2 ** 32);
        } else {
          const at = first + i * 4;
          const value = view.getUint32(at);
          if (value < from || value >= to) continue;
          const moved = value + shift;
          if (moved > 0xffffffff) return false;
          view.setUint32(at, moved);
        }
      }
    }
    offset += header.size;
  }
  return true;
}

/**
 * The same file with its index in front of its sound, or null when nothing
 * needs doing (already in that order, or not an MP4) or it cannot be done
 * safely (a layout this does not recognise).
 */
export function faststart(bytes) {
  if (!looksLikeMp4(bytes)) return null;
  const atoms = topLevelAtoms(bytes);
  if (!atoms) return null;

  const moovIndex = atoms.findIndex(atom => atom.type === 'moov');
  const firstMdat = atoms.findIndex(atom => atom.type === 'mdat');
  if (moovIndex < 0 || firstMdat < 0 || moovIndex < firstMdat) return null;

  const moovAtom = atoms[moovIndex];
  const insertAt = atoms[firstMdat].offset;
  const moov = bytes.slice(moovAtom.offset, moovAtom.offset + moovAtom.size);
  // Everything from the first mdat up to where moov used to be moves along by
  // moov's size; anything after it stays where it was.
  const ok = shiftChunkOffsets(
    moov, moovAtom.headerSize, moov.length, insertAt, moovAtom.offset, moovAtom.size
  );
  if (!ok) return null;

  const out = new Uint8Array(bytes.length);
  out.set(bytes.subarray(0, insertAt), 0);
  out.set(moov, insertAt);
  out.set(bytes.subarray(insertAt, moovAtom.offset), insertAt + moov.length);
  out.set(bytes.subarray(moovAtom.offset + moovAtom.size), moovAtom.offset + moov.length);
  return out;
}

/**
 * The blob to hand to the player: the track itself, or, for an MP4 with its
 * index at the end, a reordered copy. Only an MP4 is ever read in full.
 */
export async function playableAudio(blob) {
  if (!blob || typeof blob.slice !== 'function') return blob;
  try {
    const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
    if (!looksLikeMp4(head)) return blob;
    const reordered = faststart(new Uint8Array(await blob.arrayBuffer()));
    return reordered ? new Blob([reordered], { type: blob.type || 'audio/mp4' }) : blob;
  } catch {
    return blob;
  }
}
