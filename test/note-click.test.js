// Clicking into a scrolled note.
//
// Reported on 2026-10-05: "when focusing on those note blocks sometimes it
// just scrolls all the way up and puts a caret up when I clicked a lot lower
// in the scroll". The editor's own box was squeezed to the block's height, so
// once a note was scrolled the click fell outside it: the first click placed
// no caret, and a click between paragraphs reached the scroller, whose
// fallback focus scrolled to a caret at the top. Wanted: the caret where you
// clicked, and the note left where it was.
//
// Both halves live in .svelte files Node cannot run, so they are read.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../src/components/${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

describe('clicking lower in a scrolled note', () => {
  it('the writing is as tall as itself, so every click in a note lands in it', () => {
    // The note's own rule -- the one that clears the floated pictures -- not
    // the inline variant's.
    const rules = read('TipTapEditor.svelte').match(/:global\(\.tiptap-inner\) \{[\s\S]*?\n  \}/g) || [];
    const rule = rules.find(text => text.includes('display: flow-root')) || '';
    assert.match(rule, /flex: 1 0 auto;/, 'the editor must not shrink to the block -- `1 1 auto` with a min-height squeezed it');
  });

  it('a focus that is not placing the caret never scrolls to an old one', () => {
    const editor = read('TipTapEditor.svelte');
    assert.match(editor, /on:click=\{\(\) => editor\?\.commands\.focus\(null, \{ scrollIntoView: false \}\)\}/);
    const shell = read('BlockShell.svelte');
    const place = shell.match(/function placeCaretWhereClicked[\s\S]*?\n  \}/)?.[0] || '';
    assert.doesNotMatch(place, /\.focus\(\)/, 'a bare focus() scrolls to the stored caret -- the top, for a note never clicked in');
    assert.match(place, /scrollIntoView: false/);
  });
});
