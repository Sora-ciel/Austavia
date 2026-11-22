import { test } from 'node:test';
import assert from 'node:assert/strict';

import { keyboardStep, holdsCaret, installKeyboardCaret } from '../src/utils/keyboardCaret.js';

// Asked 2026-11-21, and wanted -- not an accident: "on phone when you remove
// the keyboard it should remove the caret. not remove the focus but the
// caret. because it stays. it should be a all around app change."

const run = heights => {
  let state = null;
  return heights.map(height => {
    const step = keyboardStep(state, { width: 384, height });
    state = step.state;
    return step.closed;
  });
};

test('putting the keyboard away is noticed: the screen grows back by a keyboard', () => {
  assert.deepEqual(run([780, 480, 780]), [false, false, true]);
});

test('a bar coming and going, or the keyboard coming up, is not the keyboard going away', () => {
  assert.deepEqual(run([780, 740, 780]), [false, false, false]);
  assert.deepEqual(run([780, 480]), [false, false]);
});

test('turning the phone starts again rather than reading as a keyboard', () => {
  let { state } = keyboardStep(null, { width: 384, height: 480 });
  const turned = keyboardStep(state, { width: 800, height: 360 });
  assert.equal(turned.closed, false);
  assert.equal(turned.state.open, false);
});

test('writing of every kind holds a caret; a button or a box to tick does not', () => {
  assert.equal(holdsCaret({ nodeType: 1, isContentEditable: true }), true);
  assert.equal(holdsCaret({ nodeType: 1, tagName: 'TEXTAREA' }), true);
  assert.equal(holdsCaret({ nodeType: 1, tagName: 'INPUT', type: 'text' }), true);
  assert.equal(holdsCaret({ nodeType: 1, tagName: 'INPUT', type: 'checkbox' }), false);
  assert.equal(holdsCaret({ nodeType: 1, tagName: 'BUTTON' }), false);
});

// What makes it real: the writing is let go of -- its caret goes.
test('when the keyboard goes, the writing that had it is let go of, wherever it is', () => {
  let resize = null;
  let blurred = 0;
  const writing = { nodeType: 1, isContentEditable: true, blur: () => { blurred += 1; } };
  const vv = { width: 384, height: 780, addEventListener: (_, fn) => { resize = fn; }, removeEventListener: () => {} };
  const win = { visualViewport: vv, matchMedia: () => ({ matches: true }), document: { activeElement: writing } };
  installKeyboardCaret(win);
  vv.height = 480; resize();
  assert.equal(blurred, 0, 'not while the keyboard is up');
  vv.height = 780; resize();
  assert.equal(blurred, 1);
});
