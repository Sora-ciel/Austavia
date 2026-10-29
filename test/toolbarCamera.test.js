import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Asked 2026-10-28: the camera "should be to the right, so it is always just
// before the settings button, on every type of device, instead of being in the
// centre of the two buttons around it". It takes the bar's free space itself;
// the settings group no longer does, and the narrow-screen rule that spread the
// bar evenly no longer decides where it goes.

const app = readFileSync(new URL('../src/App.svelte', import.meta.url), 'utf8');

test('the camera takes the free space, so it sits just before the settings button', () => {
  assert.match(app, /\.controls > \.screenshot-btn \{ margin-left: auto; \}/);
  const right = app.match(/\n\.right-controls \{\s*margin-left: ([^;]+);/);
  assert.ok(right && right[1] !== 'auto', 'the settings group is not pushed away from the camera');
});

test('the camera is the last thing before the settings group in the bar', () => {
  const camera = app.indexOf('class="screenshot-btn"');
  const settings = app.indexOf('<div class="right-controls">');
  assert.ok(camera > 0 && settings > camera);
  assert.doesNotMatch(app.slice(camera, settings), /<(button|div) class="(?!screenshot)/);
});
