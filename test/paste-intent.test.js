// What a paste is, before anything decides where it goes.
//
// Asked for on 2026-09-28: "improve our editor so that we can easily copy and
// paste lists, images etc., which we can't yet in any mode." Measured before
// changing anything: a copied list pasted onto the canvas became one block per
// item, and a list from Word or Google Docs pasted into a note became a picture.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { pasteKind, textOfHtml, textChunks } from '../src/utils/pasteIntent.js';

describe('pasteKind', () => {
  // Word, Google Docs and Office put a rendered picture of the selection on the
  // clipboard beside the real content. The content is what was copied.
  it('pastes the list, not the preview picture, from Word or Google Docs', () => {
    const html = '<html><body><ul><li>from word one</li><li>from word two</li></ul></body></html>';
    assert.equal(pasteKind({ html, text: 'from word one\nfrom word two', imageCount: 1 }), 'html');
  });

  it('pastes the picture when a picture is all that was copied', () => {
    // Copying an image in a browser: the file, and its own <img> markup.
    assert.equal(pasteKind({ html: '<img src="https://x/y.png">', imageCount: 1 }), 'image');
    // Copying one in a file manager: the file, and its path as text.
    assert.equal(pasteKind({ text: 'C:\\pictures\\y.png', imageCount: 1 }), 'image');
  });

  it('pastes a picture copied out of a note, which comes as markup only', () => {
    assert.equal(pasteKind({ html: '<p><img src="data:image/png;base64,AAAA"></p>' }), 'html');
  });

  it('keeps lists, headings and pictures together when they were copied together', () => {
    const html = '<p>Intro</p><ul><li><p>apple</p></li></ul><p>pic <img src="data:image/png;base64,AA"></p>';
    assert.equal(pasteKind({ html, text: 'Intro\n\n- apple', imageCount: 0 }), 'html');
  });

  it('falls back to plain text, and to nothing', () => {
    assert.equal(pasteKind({ text: 'just words' }), 'text');
    assert.equal(pasteKind({ html: '<p>  </p>', text: '   ' }), 'none');
  });
});

describe('textOfHtml', () => {
  it('counts writing, not markup, styles or scripts', () => {
    assert.equal(textOfHtml('<style>p{color:red}</style><p>&nbsp;</p><!-- x -->'), '');
    assert.equal(textOfHtml('<ul><li>a</li><li>b</li></ul>'), 'a b');
  });
});

describe('textChunks', () => {
  it('still makes one block per paragraph of plain text', () => {
    assert.deepEqual(textChunks('first\n\nsecond'), ['first', 'second']);
  });

  // The one-block-per-item bug: a copied list has blank lines between items.
  it('keeps a list in one piece, even with blank lines between its items', () => {
    assert.deepEqual(
      textChunks('Intro\n\n- apple\n\n- pear\n\n1. one\n\n2. two\n\nAfter'),
      ['Intro', '- apple\n\n- pear\n\n1. one\n\n2. two', 'After']
    );
  });

  it('keeps a code block in one piece', () => {
    assert.deepEqual(textChunks('```\nline one\n\nline two\n```\n\nafter'), ['```\nline one\n\nline two\n```', 'after']);
  });

  it('makes nothing of nothing', () => {
    assert.deepEqual(textChunks('   \n\n  '), []);
  });
});
