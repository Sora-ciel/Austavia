import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Reported 2026-10-26: "the tasks you add in a task block in canvas ... you add
// them but you see the added tasks only after clicking at the folder again."
//
// The block drew its list as `{#each todoTasks() as task}`. A Svelte template
// only redraws a part when a value it can see there changes; a function call
// hides what the function reads, so the list never noticed a task being added,
// ticked or deleted. It had been hidden by every change rebuilding the whole
// block, until a block's own changes stopped doing that (2026-10-05).
//
// Nothing about the data was wrong -- the task was saved -- which is why only
// looking at the screen found it. This keeps the shape out of every component.

const ROOT = new URL('../src/', import.meta.url).pathname;

function svelteFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return svelteFiles(path);
    return name.endsWith('.svelte') ? [path] : [];
  });
}

test('a task added in a task block shows at once: no list is drawn through a function call', () => {
  const offenders = [];
  for (const file of svelteFiles(ROOT)) {
    readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      if (/\{#each\s+[A-Za-z_$][\w$]*\(\)/.test(line)) {
        offenders.push(`${relative(ROOT, file)}:${index + 1}: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(offenders, [], 'draw the list from a reactive value ($:) instead');
});
