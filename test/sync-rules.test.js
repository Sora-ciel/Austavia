// What may be synced, and what counts as a change.
//
// Every case here is a bug that reached a release. The comment above each group
// says which one, so that a failure tells you what broke rather than only that
// something did.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isSyncableFileId,
  findEmbeddedDataUrls,
  payloadCarriesDataUrl,
  withoutEmptyValues,
  unpaintThemeColours
} from '../src/utils/syncRules.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// A folder with no name was uploaded on every change and the account answered
// PERMISSION_DENIED. The rejection was the lucky outcome: `files/${fileId}`
// with a blank id becomes `files/`, the trailing slash is stripped, and the
// write lands on the node holding every folder and replaces the lot.
test('a folder name the database cannot hold is never sent', async t => {
  await t.test('ordinary names are allowed', () => {
    for (const name of ['MyNotes', 'default', 'a folder with spaces', 'accentué', '2026 notes']) {
      assert.equal(isSyncableFileId(name), true, name);
    }
  });

  await t.test('a blank name is refused — it would overwrite every folder', () => {
    assert.equal(isSyncableFileId(''), false);
  });

  await t.test('every character a database key forbids is refused', () => {
    for (const name of ['notes.txt', 'a/b', 'x#1', '$cash', '[bracket]', 'a]b']) {
      assert.equal(isSyncableFileId(name), false, name);
    }
  });

  await t.test('a name that is not a string at all is refused', () => {
    for (const value of [null, undefined, 42, {}, []]) {
      assert.equal(isSyncableFileId(value), false, String(value));
    }
  });
});

// A picture pasted into a text block was never recognised as an attachment,
// because only a value that was *nothing but* a data: URL ever was. Its base64
// went into the database inline, the write failed, and the upload loop
// abandoned every folder queued behind it.
test('a picture embedded in written text is found', async t => {
  await t.test('in a note, both quote styles', () => {
    assert.equal(findEmbeddedDataUrls(`<p>hi <img src="${PNG}"></p>`).length, 1);
    assert.equal(findEmbeddedDataUrls(`<p><img src='${PNG}'></p>`).length, 1);
  });

  await t.test('in a task, as markdown and as HTML', () => {
    // Tasks held markdown once and hold HTML now. Both shapes must be found:
    // when the editor changed, the markdown-only test silently stopped matching.
    assert.equal(findEmbeddedDataUrls(`do this ![](${PNG})`).length, 1);
    assert.equal(findEmbeddedDataUrls(`<p>do this <img src="${PNG}"></p>`).length, 1);
  });

  await t.test('with other attributes alongside it', () => {
    assert.equal(findEmbeddedDataUrls(`<img src="${PNG}" width="200" alt="x">`).length, 1);
  });

  await t.test('the URL comes back whole', () => {
    assert.equal(findEmbeddedDataUrls(`<img src="${PNG}">`)[0], PNG);
  });

  await t.test('the same picture twice is one upload', () => {
    assert.equal(findEmbeddedDataUrls(`<img src="${PNG}"><img src="${PNG}">`).length, 1);
  });

  await t.test('two different pictures are two', () => {
    const other = PNG.replace('iVBOR', 'AVBOR');
    assert.equal(findEmbeddedDataUrls(`<img src="${PNG}"><img src="${other}">`).length, 2);
  });

  await t.test('a link href counts too', () => {
    assert.equal(findEmbeddedDataUrls(`<a href="${PNG}">x</a>`).length, 1);
  });

  await t.test('a Storage link is left alone', () => {
    const url = 'https://firebasestorage.googleapis.com/v0/b/x/o/y?alt=media';
    assert.equal(findEmbeddedDataUrls(`<img src="${url}">`).length, 0);
  });

  await t.test('ordinary writing is left alone', () => {
    assert.equal(findEmbeddedDataUrls('<p>just words, nothing pasted</p>').length, 0);
    assert.equal(findEmbeddedDataUrls(null).length, 0);
  });
});

// The last line of defence: whatever the caller believes about attachments, a
// payload still holding base64 must never be written to the database.
test('inline base64 anywhere in a payload is detected', async t => {
  await t.test('found however deeply it is buried', () => {
    assert.equal(payloadCarriesDataUrl({ blocks: [{ content: `<img src="${PNG}">` }] }), true);
    assert.equal(payloadCarriesDataUrl({ a: { b: { c: [{ d: PNG }] } } }), true);
    assert.equal(payloadCarriesDataUrl({ modeSettings: { single: { backgroundImage: PNG } } }), true);
  });

  await t.test('a payload holding only Storage links passes', () => {
    assert.equal(payloadCarriesDataUrl({ blocks: [{ content: '<img src="https://storage/x">' }] }), false);
  });

  await t.test('odd input never throws', () => {
    assert.equal(payloadCarriesDataUrl(null), false);
    assert.equal(payloadCarriesDataUrl(undefined), false);
    const cyclic = {}; cyclic.self = cyclic;
    assert.equal(payloadCarriesDataUrl(cyclic), false);
  });
});

// Two instances open on one account handed the folder back and forth every few
// seconds, remounting each time, with nobody editing. The database stores no
// empty list, so a folder uploaded with `tasks: []` came back without the
// field; loading put it back, the copy on disk then differed, and the save that
// followed stamped a new modifiedAt that the other instance read as an edit.
test('a cloud round trip does not look like an edit', async t => {
  const fingerprint = value => JSON.stringify(withoutEmptyValues(value) ?? {});

  await t.test('empty and absent are the same', () => {
    assert.equal(fingerprint({ id: 'b1', tasks: [] }), fingerprint({ id: 'b1' }));
    assert.equal(fingerprint({ id: 'b1', meta: {} }), fingerprint({ id: 'b1' }));
    assert.equal(fingerprint({ id: 'b1', note: null }), fingerprint({ id: 'b1' }));
  });

  await t.test('the same nesting the database drops', () => {
    assert.equal(fingerprint({ a: { b: [], c: {} } }), fingerprint({}));
    assert.equal(fingerprint({ blocks: [{ tasks: [] }] }), fingerprint({ blocks: [{}] }));
  });

  // The danger in folding empty together with absent is a real change being
  // skipped, so this is the half that matters most.
  await t.test('emptying a list is still a change', () => {
    assert.notEqual(
      fingerprint({ id: 'b1', tasks: [{ id: 't1' }] }),
      fingerprint({ id: 'b1', tasks: [] })
    );
  });

  await t.test('ordinary edits are still changes', () => {
    assert.notEqual(fingerprint({ content: 'one' }), fingerprint({ content: 'one two' }));
    assert.notEqual(fingerprint({ content: '' }), fingerprint({ content: 'x' }));
  });

  await t.test('values that merely look empty are kept', () => {
    // 0 and false are values the database stores, so they must survive.
    assert.equal(withoutEmptyValues({ n: 0 }).n, 0);
    assert.equal(withoutEmptyValues({ b: false }).b, false);
    assert.equal(withoutEmptyValues({ s: '' }).s, '');
  });
});

// "Blocks follow theme" writes the current theme's colours into every block.
// They are derived from whichever theme *this device* is on, so two devices on
// different themes each rewrote what the other wrote, every rewrite read as a
// real edit, and the two handed the folder back and forth for as long as both
// were open. Caught by the sync log:
//   blocks.0.bgColor: #1b2129 -> #1c0d2bc7
//   blocks.0.textColor: #ffb454 -> #ffffff
test('a theme repaint is not an edit', async t => {
  const painted = deviceColours => ({
    id: 'b1',
    type: 'text',
    bgColor: deviceColours.bg,
    textColor: deviceColours.text,
    _baseBgColor: '#202020',
    _baseTextColor: '#e0e0e0'
  });
  const compare = block => JSON.stringify(unpaintThemeColours(block));

  await t.test('two devices on different themes agree', () => {
    const onThisDevice = painted({ bg: '#1c0d2bc7', text: '#ffffff' });
    const onTheOther = painted({ bg: '#1b2129', text: '#ffb454' });
    assert.equal(compare(onThisDevice), compare(onTheOther));
  });

  await t.test('a third theme agrees too', () => {
    assert.equal(
      compare(painted({ bg: '#0a0607', text: '#ff5c5c' })),
      compare(painted({ bg: '#1c0d2bc7', text: '#ffffff' }))
    );
  });

  await t.test('the colours compared are the ones the person chose', () => {
    const block = unpaintThemeColours(painted({ bg: '#1c0d2bc7', text: '#ffffff' }));
    assert.equal(block.bgColor, '#202020');
    assert.equal(block.textColor, '#e0e0e0');
    assert.equal('_baseBgColor' in block, false);
  });

  // The danger in ignoring painted colours is ignoring a real one too.
  await t.test('a colour the person actually picked is still a change', () => {
    const before = { ...painted({ bg: '#1c0d2bc7', text: '#ffffff' }), _baseBgColor: '#202020' };
    const after = { ...painted({ bg: '#1c0d2bc7', text: '#ffffff' }), _baseBgColor: '#ff0000' };
    assert.notEqual(compare(before), compare(after));
  });

  await t.test('an unpainted block is left exactly as it is', () => {
    const plain = { id: 'b1', bgColor: '#123456', textColor: '#abcdef' };
    assert.deepEqual(unpaintThemeColours(plain), plain);
    assert.notEqual(
      JSON.stringify(unpaintThemeColours(plain)),
      JSON.stringify(unpaintThemeColours({ ...plain, bgColor: '#000000' }))
    );
  });

  await t.test('odd input does not throw', () => {
    assert.equal(unpaintThemeColours(null), null);
    assert.equal(unpaintThemeColours(undefined), undefined);
  });
});

// Read straight off the sync log, after the theme fix:
//   blocks.3.scrollTop: 1384.177734375 -> 1384
// Where you happen to have scrolled inside a text block is not an edit. It
// differs per device and per window, and a round trip through the database
// changed the value on its own, which was enough to restart the loop.
test('view state on a block is not content', async t => {
  // Read out of App.svelte rather than copied, so this cannot quietly drift out
  // of step with the list the app actually uses.
  const source = readFileSync(new URL('../src/App.svelte', import.meta.url), 'utf8');
  const VOLATILE = JSON.parse(
    source.match(/const VOLATILE_BLOCK_KEYS = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"')
  );

  await t.test('the app really does treat these as volatile', () => {
    for (const key of ['_version', 'editing', 'scrollTop', 'resolvedSrc', 'attachmentRequiresAuth']) {
      assert.ok(VOLATILE.includes(key), `${key} is missing from VOLATILE_BLOCK_KEYS`);
    }
  });

  const asContent = block => {
    const copy = { ...block };
    for (const key of VOLATILE) delete copy[key];
    return JSON.stringify(withoutEmptyValues(copy) ?? {});
  };

  await t.test('scrolling inside a block is not an edit', () => {
    const base = { id: 'b1', content: '<p>same words</p>' };
    assert.equal(
      asContent({ ...base, scrollTop: 1384.177734375 }),
      asContent({ ...base, scrollTop: 1384 })
    );
    assert.equal(asContent({ ...base, scrollTop: 0 }), asContent(base));
  });

  await t.test('a resolved picture URL belongs to the session, not the note', () => {
    const base = { id: 'b1', src: 'https://storage/x' };
    assert.equal(
      asContent({ ...base, resolvedSrc: 'https://signed-one', attachmentRequiresAuth: true }),
      asContent({ ...base, resolvedSrc: 'https://signed-two', attachmentRequiresAuth: false })
    );
  });

  // The danger in ignoring fields is ignoring a real change sitting beside one.
  await t.test('a real edit alongside view state still counts', () => {
    assert.notEqual(
      asContent({ id: 'b1', content: 'one', scrollTop: 10 }),
      asContent({ id: 'b1', content: 'two', scrollTop: 10 })
    );
  });

  await t.test('moving a block is still an edit', () => {
    assert.notEqual(
      asContent({ id: 'b1', position: { x: 476, y: 312 }, scrollTop: 99 }),
      asContent({ id: 'b1', position: { x: 539, y: 285 }, scrollTop: 99 })
    );
  });
});

// ── The loop, twice ───────────────────────────────────────────────
// "Blocks follow theme" writes this device's theme into every block. Two
// devices on different themes each rewrite what the other wrote, every rewrite
// reads as an edit, and the folder goes back and forth for as long as both are
// open with nobody editing anything.
//
// It was fixed once by undoing the paint before comparing, and came straight
// back when painting started recording _themedBgColor as well and that was not
// undone. So these are written in terms of what must not happen, not in terms
// of which fields exist: whatever painting writes today, two devices must agree.
test('a folder painted by two different themes still compares equal', async t => {
  const painted = (bg, text) => ({
    id: 'b1',
    type: 'text',
    content: 'unchanged',
    bgColor: bg,
    textColor: text,
    _baseBgColor: '#000000',
    _baseTextColor: '#ffffff',
    _themedBgColor: bg,
    _themedTextColor: text
  });

  await t.test('the two agree once the paint is undone', () => {
    const onCopperLagoon = unpaintThemeColours(painted('#3a1d18', '#6fe3dc'));
    const onSomethingElse = unpaintThemeColours(painted('#1b2129', '#ffb454'));
    assert.deepEqual(onCopperLagoon, onSomethingElse);
  });

  await t.test('nothing the paint wrote survives the comparison', () => {
    const out = unpaintThemeColours(painted('#3a1d18', '#6fe3dc'));
    for (const key of ['_baseBgColor', '_baseTextColor', '_themedBgColor', '_themedTextColor']) {
      assert.equal(key in out, false, `${key} must not reach the comparison`);
    }
  });

  await t.test('the colours the person chose are what is left', () => {
    const out = unpaintThemeColours(painted('#3a1d18', '#6fe3dc'));
    assert.equal(out.bgColor, '#000000');
    assert.equal(out.textColor, '#ffffff');
  });

  await t.test('a colour picked by hand still reads as a change', () => {
    const theirs = unpaintThemeColours({ ...painted('#3a1d18', '#6fe3dc'), _baseBgColor: '#cc2929' });
    const mine = unpaintThemeColours(painted('#1b2129', '#ffb454'));
    assert.notDeepEqual(theirs, mine, 'a real edit must still be seen');
  });

  await t.test('a block the theme never touched is handed back untouched', () => {
    const plain = { id: 'b2', bgColor: '#123456', textColor: '#ffffff' };
    assert.equal(unpaintThemeColours(plain), plain);
  });
});
