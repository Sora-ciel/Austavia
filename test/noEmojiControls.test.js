import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Reported 2026-10-28: the pause button on a habit's timer "is an emoji, so
// it's bad. It can't have the theme colour like the play icon." The system
// draws ⏸ ⏮ ⏭ ⏯ ⏹ as coloured emoji, which no theme can reach; controls use
// PlayerIcons.svelte, drawn in the writing's colour (CLAUDE.md).

// fileURLToPath, not .pathname: on Windows .pathname is /E:/..., which
// readdirSync turns into E:\E:\... and every test here failed there.
const ROOT = fileURLToPath(new URL('../src/', import.meta.url));
const files = dir => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? files(path) : name.endsWith('.svelte') ? [path] : [];
});

test('no control is drawn with a media emoji the theme cannot colour', () => {
  const offenders = [];
  for (const file of files(ROOT)) {
    const markup = readFileSync(file, 'utf8')
      .replace(/<script[\s\S]*?<\/script>/g, '')
      .replace(/<style[\s\S]*?<\/style>/g, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    // Inside buttons only: a heading may carry one as decoration.
    const buttons = markup.match(/<button[\s\S]*?<\/button>/g) || [];
    if (buttons.some(button => /[⏸⏮⏭⏯⏹]/.test(button))) offenders.push(relative(ROOT, file));
  }
  assert.deepEqual(offenders, []);
});
