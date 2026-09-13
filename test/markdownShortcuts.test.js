import { test } from 'node:test';
import assert from 'node:assert/strict';

import { shortcutFor, markShortcutFor, LEAF } from '../src/utils/markdownShortcuts.js';

// Named after the request: "make it so that we can aggregate markdowns, so that
// for example we can use the '# ' markdown to have a title and then add '- ' to
// have it making a list. Make sure all markdowns can work with that. There's
// the separator which should be cool to be able to put after in the same line,
// there's also images where it would be cool we can use styling and separation
// after too."

test('a title can be turned into a list without starting a new line', () => {
  // The heading is the block; "- " is typed into it. The editor refused this
  // because a list item has to start with a paragraph.
  const found = shortcutFor('- ');
  assert.equal(found?.kind, 'bulletList');
});

test('a separator can go after writing, on the same line', () => {
  const found = shortcutFor('some writing ---');
  assert.equal(found?.kind, 'horizontalRule');
  assert.equal(found.text, '---', 'the space before it is not part of the marker');
  assert.equal(found.index, 'some writing '.length);
});

test('a separator can go straight after a picture', () => {
  const found = shortcutFor(`${LEAF}---`);
  assert.equal(found?.kind, 'horizontalRule');
  assert.equal(found.index, LEAF.length, 'the picture stays where it is');
  assert.equal(found.text, '---');
});

test('a picture is whatever the editor says it is', () => {
  // The editor stands a leaf node in as the literal "%leaf%". Written down
  // because assuming U+FFFC instead is a silent failure next to every picture.
  assert.equal(LEAF, '%leaf%');
});

test('styling works straight after a picture too', () => {
  assert.equal(markShortcutFor(`${LEAF}**loud**`)?.kind, 'bold');
  assert.equal(markShortcutFor(`${LEAF}*quiet*`)?.kind, 'italic');
  assert.equal(markShortcutFor(`${LEAF}\`code\``)?.kind, 'code');
  assert.equal(markShortcutFor(`${LEAF}~~gone~~`)?.kind, 'strike');
});

test('the marker is what gets replaced, not the picture before it', () => {
  const found = markShortcutFor(`${LEAF}**loud**`);
  assert.equal(found.index, LEAF.length);
  assert.equal(found.text, '**loud**');
  assert.equal(found.content, 'loud');
});

test('every heading level is a heading', () => {
  for (let level = 1; level <= 6; level += 1) {
    const found = shortcutFor(`${'#'.repeat(level)} `);
    assert.equal(found?.kind, 'heading');
    assert.equal(found.level, level);
  }
  assert.equal(shortcutFor('####### '), null, 'seven is not a heading');
});

test('an ordered list keeps the number it was started at', () => {
  assert.deepEqual(
    { kind: shortcutFor('7. ')?.kind, start: shortcutFor('7. ')?.start },
    { kind: 'orderedList', start: 7 }
  );
  assert.equal(shortcutFor('3) ')?.kind, 'orderedList');
});

test('the other block shortcuts are all still shortcuts', () => {
  assert.equal(shortcutFor('- ')?.kind, 'bulletList');
  assert.equal(shortcutFor('* ')?.kind, 'bulletList');
  assert.equal(shortcutFor('+ ')?.kind, 'bulletList');
  assert.equal(shortcutFor('> ')?.kind, 'blockquote');
  assert.equal(shortcutFor('``` ')?.kind, 'codeBlock');
  assert.equal(shortcutFor('```js ')?.kind, 'codeBlock');
  assert.equal(shortcutFor('```js ')?.language, 'js');
});

test('ordinary writing is left alone', () => {
  assert.equal(shortcutFor('just writing'), null);
  assert.equal(shortcutFor('a-b '), null, 'a dash inside a word is a dash');
  assert.equal(shortcutFor('5---10'), null, 'a range is not a separator');
  assert.equal(shortcutFor('#tag '), null, 'a hash with no space is a tag');
  assert.equal(markShortcutFor('nothing here'), null);
  assert.equal(shortcutFor(''), null);
  assert.equal(shortcutFor(), null);
  assert.equal(markShortcutFor(), null);
});

test('a separator needs its own space, not the middle of a word', () => {
  assert.equal(shortcutFor('well---known'), null);
  assert.equal(shortcutFor('done ---')?.kind, 'horizontalRule');
  assert.equal(shortcutFor('---')?.kind, 'horizontalRule', 'on its own line as well');
});
