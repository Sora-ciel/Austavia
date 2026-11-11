import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Asked 2026-10-26: "even though modes end up using the same colour in one
// theme, the colours aren't named the same. I think they should. And if the
// mode wants to overwrite, it can. But from basic it should be the same."
// Done 2026-10-29: one name per meaning (CLAUDE.md, "One of everything").
//
//   a block's own colours ............ --bg, --text
//   what a mode's content sits on .... --mode-surface, --mode-surface-text
//   a mode's writing and background .. --mode-text-color, --canvas-inner-bg
//   what an editor paints (on purpose) --editor-paper, --editor-ink
//
// The names they replaced must not come back.

const RETIRED = ['--bg-color', '--text-color', '--active-note-bg', '--active-note-text', '--pl-surface', '--task-surface', '--tab-bg', '--tab-text'];

// fileURLToPath, not .pathname: on Windows .pathname is /E:/..., which
// readdirSync turns into E:\E:\... and every test here failed there.
const ROOT = fileURLToPath(new URL('../src/', import.meta.url));
const files = dir => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? files(path) : /\.(svelte|js|css)$/.test(name) ? [path] : [];
});

test('the same colour has one name in every mode', () => {
  const found = [];
  for (const file of files(ROOT)) {
    const source = readFileSync(file, 'utf8');
    for (const name of RETIRED) if (new RegExp(`${name}\\b`).test(source)) found.push(`${relative(ROOT, file)}: ${name}`);
  }
  assert.deepEqual(found, []);
});

test('a mode works out its writing colour in one place', () => {
  const copies = files(ROOT).filter(file => /canvasTheme\.textColor \|\| getReadableTextColor\(canvasTheme\.innerBg\)/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(copies.map(file => relative(ROOT, file)), []);
});
