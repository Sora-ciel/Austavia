import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  readAtomHeader,
  sniffImageType,
  findCoverInAtoms,
  findMp4Cover
} from '../src/utils/mp4Cover.js';

// Named after the request: "musics like this one got covers but our app doesn't
// yet succeed in putting them -- I want you to find how to take their
// tags/covers so that we can have their covers."
//
// The example .m4a does carry artwork: a covr atom of 31,390 bytes beginning
// ff d8 ff e0 ... JFIF, which is a JPEG by any reading. But its data atom
// declares type 1 -- UTF-8 text -- where a picture says 13 for JPEG or 14 for
// PNG. A parser that believes the file reads it as a string and reports no
// picture, which is right behaviour on a wrong file.

// ── Building an MP4 by hand, so the tests own their fixtures ─────
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));

function atom(type, payload) {
  const size = 8 + payload.length;
  return [size >>> 24 & 0xff, size >>> 16 & 0xff, size >>> 8 & 0xff, size & 0xff, ...ascii(type), ...payload];
}

/** A `data` atom as iTunes writes one: 4 bytes of type, 4 reserved, payload. */
function dataAtom(declaredType, payload) {
  return atom('data', [0, 0, 0, declaredType, 0, 0, 0, 0, ...payload]);
}

const jpegBytes = (size) => [0xff, 0xd8, 0xff, 0xe0, ...new Array(Math.max(0, size - 6)).fill(0x41), 0xff, 0xd9];
const pngBytes = (size) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(Math.max(0, size - 8)).fill(0x42)];

/** moov > udta > meta (a full atom) > ilst > covr, the real shape. */
function moovWith(ilstChildren) {
  const ilst = atom('ilst', ilstChildren);
  const meta = atom('meta', [0, 0, 0, 0, ...atom('hdlr', new Array(20).fill(0)), ...ilst]);
  return atom('moov', [...atom('mvhd', new Array(100).fill(0)), ...atom('udta', meta)]);
}

test('a cover declared as text is still read as a picture', () => {
  // The whole fault. Type 1 is UTF-8 text; the bytes are a JPEG. The bytes win.
  const covr = atom('covr', dataAtom(1, jpegBytes(4000)));
  const found = findCoverInAtoms(Uint8Array.from(moovWith(covr)));
  assert.ok(found, 'found despite the wrong declaration');
  assert.equal(found.type, 'image/jpeg');
  assert.ok(found.size >= 4000);
});

test('a cover declared properly is read too, obviously', () => {
  for (const declared of [13, 14, 0, 27]) {
    const covr = atom('covr', dataAtom(declared, jpegBytes(4000)));
    const found = findCoverInAtoms(Uint8Array.from(moovWith(covr)));
    assert.ok(found, `declared type ${declared}`);
    assert.equal(found.type, 'image/jpeg');
  }
});

test('an atom name beginning with © does not stop the walk', () => {
  // This cost a build. iTunes names most of its metadata atoms with a leading
  // © -- ©nam, ©ART, ©alb -- and one of them is the *first* child of ilst. A
  // walk that only accepts printable ASCII rejects it and stops before ever
  // reaching the artwork sitting right beside it, which is exactly what
  // happened: the cover was there, the reader returned nothing.
  const covr = atom('covr', dataAtom(1, jpegBytes(4000)));
  const named = atom('©nam', dataAtom(1, ascii('Chest Pain')));
  const artist = atom('©ART', dataAtom(1, ascii('Malcolm Todd')));
  const found = findCoverInAtoms(Uint8Array.from(moovWith([...named, ...artist, ...covr])));
  assert.ok(found, 'the © atoms are stepped over, not tripped over');
  assert.equal(found.type, 'image/jpeg');
});

test('the artwork is found behind meta, which carries four extra bytes', () => {
  // `meta` is a full atom: version and flags sit between its header and its
  // children. Descending without stepping over those lands mid-length and the
  // whole walk falls apart.
  const covr = atom('covr', dataAtom(13, pngBytes(5000)));
  const found = findCoverInAtoms(Uint8Array.from(moovWith(covr)));
  assert.ok(found);
  assert.equal(found.type, 'image/png');
});

test('the largest picture wins when a file carries several', () => {
  const small = atom('covr', dataAtom(13, jpegBytes(2000)));
  const big = atom('covr', dataAtom(13, jpegBytes(9000)));
  const found = findCoverInAtoms(Uint8Array.from(moovWith([...small, ...big])));
  assert.ok(found.size >= 9000, `got ${found.size}`);
});

test('something that is not a picture is not offered as one', () => {
  // A covr atom really holding text, which is what type 1 usually means.
  const covr = atom('covr', dataAtom(1, ascii('this is genuinely just a comment, at length'.repeat(40))));
  assert.equal(findCoverInAtoms(Uint8Array.from(moovWith(covr))), null);
});

test('a tiny image is not a cover', () => {
  // Rejects sprites and stray thumbnails rather than showing a 16px smudge.
  const covr = atom('covr', dataAtom(13, jpegBytes(200)));
  assert.equal(findCoverInAtoms(Uint8Array.from(moovWith(covr))), null);
});

test('junk is walked off rather than wandered through', () => {
  assert.equal(findCoverInAtoms(Uint8Array.from([1, 2, 3])), null);
  assert.equal(findCoverInAtoms(Uint8Array.from(new Array(64).fill(0))), null);
  assert.equal(findCoverInAtoms(null), null);
  assert.equal(findCoverInAtoms(Uint8Array.from([])), null);
});

test('an atom header that is not one is refused', () => {
  assert.equal(readAtomHeader(Uint8Array.from([0, 0, 0, 8, 0x01, 0x02, 0x03, 0x04]), 0), null, 'unprintable type');
  assert.equal(readAtomHeader(Uint8Array.from([0, 0, 0, 2, ...ascii('moov')]), 0), null, 'size smaller than its header');
  assert.equal(readAtomHeader(Uint8Array.from([0, 0, 0, 8]), 0), null, 'truncated');
  assert.equal(readAtomHeader(null, 0), null);
});

test('an image is recognised by its own first bytes', () => {
  assert.equal(sniffImageType(Uint8Array.from(jpegBytes(100))), 'image/jpeg');
  assert.equal(sniffImageType(Uint8Array.from(pngBytes(100))), 'image/png');
  assert.equal(sniffImageType(Uint8Array.from(ascii('not an image at all'))), null);
  assert.equal(sniffImageType(Uint8Array.from([0xff])), null, 'too short to say');
});

test('only the metadata is read, not the audio beside it', async () => {
  // Why this exists rather than widening the byte scan: the top level is
  // stepped through by length, so the audio is skipped over rather than read.
  const covr = atom('covr', dataAtom(1, jpegBytes(4000)));
  const moov = moovWith(covr);
  // mdat first and large, the way the example file is laid out.
  const mdat = atom('mdat', new Array(400_000).fill(0x55));
  const file = new Blob([Uint8Array.from([...atom('ftyp', ascii('M4A ')), ...mdat, ...moov])]);

  let bytesRead = 0;
  const counting = {
    size: file.size,
    slice: (a, b) => { bytesRead += b - a; return file.slice(a, b); }
  };

  const cover = await findMp4Cover(counting);
  assert.ok(cover, 'found');
  assert.equal(cover.type, 'image/jpeg');
  assert.ok(bytesRead < file.size / 4, `read ${bytesRead} of ${file.size}`);
});

test('a file with no cover, and a file that is not MP4 at all, come back empty', async () => {
  const noCover = new Blob([Uint8Array.from([...atom('ftyp', ascii('M4A ')), ...moovWith([])])]);
  assert.equal(await findMp4Cover(noCover), null);
  assert.equal(await findMp4Cover(new Blob([Uint8Array.from(ascii('ID3 this is an mp3'))])), null);
  assert.equal(await findMp4Cover(null), null);
});
