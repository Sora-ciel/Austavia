import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Named after the request, which was made three times: "the bold is not
// different enough from the non bold text, it's hard to see the difference",
// then "the difference is still just palpable", then "i see a difference but it
// still ain't enough. make the regular less bold".
//
// The first two were answered by changing the typeface, twice, and neither
// helped much — because the cause was never the typeface. Simple Note mode set
// every text block to `font-weight: bold`, so plain writing there was already
// 700 and the bold inside it 900: a quarter more ink, against two and a half
// times as much everywhere else. Nothing failed when that line was written and
// nothing would fail if it came back, which is what these tests are for.
//
// They read the stylesheets rather than a module, because there is no module to
// read: the weights are CSS, applied by the browser, and a test that checked
// some JavaScript constant instead would be a test on the deciding rather than
// on the behaviour.

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const css = read('../src/app.css');
const simpleNote = read('../src/Modes/SimpleNoteMode.svelte');
const taskMode = read('../src/Modes/TaskMode.svelte');

/** The weights a rule declares, in the order they appear. */
function weightsIn(source, selector) {
  const found = [];
  // Anchored to the start of a line, and indentation is allowed. Searching for
  // the selector anywhere finds it inside a longer one — looking for `a {`
  // matches `.ProseMirror a {` several rules earlier and reads the wrong rule.
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const opens = new RegExp(`^[ \\t]*${escaped}`, 'm').exec(source);
  if (!opens) return found;
  const at = opens.index;
  // Just this rule's body: from its opening brace to the matching close. The
  // stylesheets nest only in ways that do not reach inside a declaration
  // block, so the first `}` is the right one.
  const body = source.slice(at, source.indexOf('}', at));
  for (const match of body.matchAll(/font-weight:\s*([a-z0-9 ]+);/g)) {
    found.push(match[1].trim());
  }
  return found;
}

/** What the browser resolves a keyword to, for the ones CSS defines. */
const NUMBER = { normal: 400, bold: 700 };
const asNumber = (weight) => NUMBER[weight] ?? Number(weight);

test('the writing is lighter than bold has any need of', () => {
  const [weight] = weightsIn(css, ':root {');
  assert.ok(weight, 'the root sets a weight at all');
  assert.ok(
    asNumber(weight) < 400,
    `the app's regular writing should be lighter than 400, and is ${weight}`
  );
});

test('bold goes to the end of the weight axis', () => {
  assert.deepEqual(weightsIn(css, 'strong,\nb {'), ['900']);
});

test('there is room between the two for bold to be seen in', () => {
  const regular = asNumber(weightsIn(css, ':root {')[0]);
  const bold = asNumber(weightsIn(css, 'strong,\nb {')[0]);
  // 500 apart on Inter is bold carrying roughly two and a half times the ink,
  // measured in a browser. Below about 300 apart it is the "palpable, but not
  // enough" that was reported.
  assert.ok(
    bold - regular >= 500,
    `regular ${regular} and bold ${bold} are too close for the difference to read`
  );
});

test('a Simple Note text block is not bold before anybody asks for bold', () => {
  // The line this replaces was `font-weight: bold`, and it is why bold looked
  // broken in the one mode the complaint kept naming.
  const weights = weightsIn(simpleNote, ':global(.container .tiptap-wrap) {');
  assert.deepEqual(weights, ['inherit']);
});

test('no mode quietly makes all of its writing heavy', () => {
  // The wider version of the rule above: a wrapper around ordinary writing
  // takes the weight it is given. Anything that sets one is claiming every
  // word inside it, bold included.
  for (const [name, source] of [
    ['Simple Note', simpleNote],
    ['Task', taskMode]
  ]) {
    for (const match of source.matchAll(
      /\.tiptap-wrap[^{]*\{[^}]*font-weight:\s*([a-z0-9 ]+);/g
    )) {
      const weight = match[1].trim();
      assert.ok(
        weight === 'inherit' || asNumber(weight) < 400,
        `${name} mode sets its text blocks to ${weight}, which leaves bold nowhere to go`
      );
    }
  }
});

test('bold in a task is the same bold as bold anywhere else', () => {
  // It was capped at 700 here, so a task's bold was a step weaker than a
  // note's — a difference no theme asked for and nobody could have chosen on
  // purpose.
  assert.deepEqual(weightsIn(taskMode, '.task-text :global(strong)'), ['900']);
});

test('a link is not made semi-bold on its way past', () => {
  // The Vite starter's `a { font-weight: 500 }`. Beside a 400 body it passed
  // unnoticed; beside a 300 one it turns every link in a note semi-bold.
  assert.deepEqual(weightsIn(css, 'a {'), ['inherit']);
});

test('synthesised weights stay off, so a missing face is visible', () => {
  // With `font-synthesis: none` a weight the face does not have falls back to
  // the nearest one it does, rather than the browser smearing the glyphs into
  // a fake bold. That is what made it possible to measure that Arial's 300 and
  // 400 are the same pixels — and it is why the bundled face has to be
  // variable for any of the numbers above to mean anything.
  assert.match(css, /font-synthesis:\s*none/);
  assert.match(css, /font-weight:\s*100 900/, 'the bundled face declares the full axis');
});
