// Whether the app's own typeface is actually being used.
//
// Written after "bold is not working in Single Note -- it removes the
// asterisks, so it does try". The mark was being applied correctly, and that
// was checked before anything else: the editor produced <strong> and the
// computed weight was 800. So the question was never the mark, it was whether
// 800 *draws* as anything.
//
// It only does if Inter loaded. The stroke that used to be drawn under bold
// was removed when Inter arrived, because Inter carries 100 to 900 and the
// weight became the font's own. Fall back to a system sans and there are two
// faces: 300 against 800 collapses to 400 against 700, and bold reads as
// barely bold. Nothing about that failure is visible -- the text is still
// there, still in a sans -- so it gets a line in the diagnostics.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { describeFonts } from '../src/utils/diagnostics.js';

const joined = fonts => describeFonts(fonts).join(String.fromCharCode(10));

describe('describeFonts', () => {
  it('says nothing when there is nothing to say', () => {
    assert.deepEqual(describeFonts(null), []);
  });

  it('reports both weights when the typeface is in use', () => {
    const text = joined({ supported: true, regular: true, bold: true });

    assert.match(text, /Inter 300 yes/);
    assert.match(text, /Inter 800 yes/);
    assert.ok(!/fallback/.test(text), 'nothing is wrong, so nothing should be claimed');
  });

  // The whole reason this exists. A build drawing in a fallback face still
  // looks fine; bold is the only thing that quietly stops working.
  it('explains what a missing typeface does to bold', () => {
    const text = joined({ supported: true, regular: false, bold: false });

    assert.match(text, /Inter 300 NO/);
    assert.match(text, /fallback face/);
    assert.match(text, /look weak whatever is marked/);
  });

  // Half-loaded is the same fault and must not read as fine.
  it('treats one weight missing as the fallback case', () => {
    const text = joined({ supported: true, regular: true, bold: false });

    assert.match(text, /Inter 800 NO/);
    assert.match(text, /fallback face/);
  });

  it('says so when the browser will not answer', () => {
    assert.match(joined({ supported: false }), /will not say which are loaded/);
  });
});
