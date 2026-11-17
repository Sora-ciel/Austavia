// "Copy as markdown" in Task mode (src/utils/taskMarkdown.js).
//
// Asked 2026-11-17: "when copying the markdown ... first all non checked
// task then all checked tasks". The same message had been copied this way,
// and showed tasks pasted as "<p>...</p>".

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { tasksToMarkdown, plainTaskText } from '../src/utils/taskMarkdown.js';

describe('copying a task list as markdown', () => {
  it('copies every task not done first, then every task done, each in its own order', () => {
    const md = tasksToMarkdown({
      title: 'Austavia',
      tasks: [
        { text: 'one', done: true },
        { text: 'two', done: false },
        { text: 'three', done: true },
        { text: 'four', done: false }
      ]
    });
    assert.equal(md, '# Austavia\n\n- [ ] two\n- [ ] four\n- [x] one\n- [x] three');
  });

  it('a task written in the editor is copied as its words, not its HTML', () => {
    assert.equal(plainTaskText('<p>In task mode, remove the <strong>color</strong> input</p>'), 'In task mode, remove the color input');
    assert.equal(plainTaskText('<p>a &amp; b</p><p>c</p>'), 'a & b c');
    assert.equal(plainTaskText('plain stays plain'), 'plain stays plain');
  });
});
