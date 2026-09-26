// A line per launch, so that losing something local has a *when*.
//
// Asked for on 2026-09-26: "just to make sure — now if this happens again we'll
// be able to see what did it, or at least when it happened?" The honest answer
// was no. `describeLocalStorage` says what the database holds now, which tells
// three identical-looking faults apart, but an empty store looks the same the
// day it empties and a month later.
//
// What these tests hold in place is the *reading*: a drop is news, a rise is
// not, a launch that could not open the database is not evidence of anything,
// and no history at all is itself a finding rather than a shrug.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  journalEntry,
  appendLaunch,
  findLosses,
  describeJournal,
  JOURNAL_KEPT
} from '../src/utils/storageJournal.js';

const AT = new Date(2026, 8, 26, 14, 30, 0).getTime();
const HOUR = 60 * 60 * 1000;

const launch = (over = {}) => ({
  at: AT,
  version: '0.8.652',
  onDisk: 8,
  opened: true,
  blocks: 12,
  files: 40,
  audio: 129,
  covers: 130,
  index: true,
  ...over
});

describe('journalEntry', () => {
  it('keeps the few numbers a loss would show in', () => {
    const entry = journalEntry({
      at: AT,
      version: '0.8.652',
      store: {
        versionOnDisk: 8,
        counts: { blocks: 12, 'block-files': 40 },
        audioKeys: 129,
        coverKeys: 130,
        hasLibraryIndex: true,
        error: null
      }
    });

    assert.deepEqual(entry, launch());
  });

  it('records a database that would not open as exactly that', () => {
    const entry = journalEntry({ at: AT, version: '0.8.641', store: { error: 'VersionError: no' } });

    assert.equal(entry.opened, false);
    assert.equal(entry.audio, 0);
  });
});

describe('appendLaunch', () => {
  it('keeps the newest and drops the oldest once it is full', () => {
    let entries = [];
    for (let i = 0; i < JOURNAL_KEPT + 5; i += 1) {
      entries = appendLaunch(entries, launch({ at: AT + i * HOUR, blocks: i }));
    }

    assert.equal(entries.length, JOURNAL_KEPT);
    assert.equal(entries[entries.length - 1].blocks, JOURNAL_KEPT + 4);
    assert.equal(entries[0].blocks, 5);
  });

  it('survives a journal that is missing or has been tampered with', () => {
    assert.equal(appendLaunch(null, launch()).length, 1);
    assert.equal(appendLaunch('nonsense', launch()).length, 1);
    assert.equal(appendLaunch([null, undefined], launch()).length, 1);
  });
});

describe('findLosses', () => {
  it('names what went, when, and which builds it happened between', () => {
    const [loss] = findLosses([
      launch({ at: AT, version: '0.8.651' }),
      launch({ at: AT + HOUR, version: '0.8.652', audio: 0 })
    ]);

    assert.equal(loss.what, 'audio tracks');
    assert.equal(loss.from, 129);
    assert.equal(loss.to, 0);
    assert.equal(loss.everything, true);
    assert.equal(loss.fromVersion, '0.8.651');
    assert.equal(loss.toVersion, '0.8.652');
  });

  it('tells some of it going from all of it going', () => {
    const [loss] = findLosses([launch(), launch({ at: AT + HOUR, audio: 100 })]);

    assert.equal(loss.everything, false);
    assert.equal(loss.to, 100);
  });

  // Things arriving is the ordinary business of an app. Reporting it would
  // bury the one line anybody is reading this for.
  it('says nothing about things arriving', () => {
    assert.deepEqual(findLosses([launch({ audio: 10 }), launch({ at: AT + HOUR, audio: 200 })]), []);
  });

  // A launch that could not open the database reports zeroes because it could
  // not look. Comparing against that would cry wolf every time.
  it('does not treat a database it could not open as a loss', () => {
    const losses = findLosses([
      launch(),
      launch({ at: AT + HOUR, opened: false, audio: 0, blocks: 0 }),
      launch({ at: AT + 2 * HOUR })
    ]);

    assert.deepEqual(losses, []);
  });

  it('has nothing to say about a single launch', () => {
    assert.deepEqual(findLosses([launch()]), []);
    assert.deepEqual(findLosses([]), []);
  });
});

describe('describeJournal', () => {
  it('leads with the loss when there is one', () => {
    const text = describeJournal([
      launch({ at: AT, version: '0.8.641' }),
      launch({ at: AT + HOUR, version: '0.8.652', audio: 0 })
    ]).join('\n');

    assert.match(text, /SOMETHING WENT MISSING/);
    assert.match(text, /audio tracks: 129 → 0 \(all of it\)/);
    assert.match(text, /2026-09-26 15:30/);
    assert.match(text, /between 0.8.641 and 0.8.652/);
  });

  it('says so plainly when the same build was running either side', () => {
    const text = describeJournal([launch(), launch({ at: AT + HOUR, audio: 0 })]).join('\n');
    assert.match(text, /both launches were 0.8.652/);
  });

  it('says nothing went missing rather than staying silent', () => {
    const text = describeJournal([launch(), launch({ at: AT + HOUR })]).join('\n');
    assert.match(text, /nothing has gone missing/);
  });

  // The case that matters most and reads like an absence of information: a
  // swapped data folder takes localStorage with it, so an empty journal means
  // this profile has never run the app before.
  it('treats no history at all as a finding', () => {
    const text = describeJournal([]).join('\n');

    assert.match(text, /launch history: none/);
    assert.match(text, /never starting here before|ever starting here before/);
  });

  it('shows the recent launches so the numbers can be seen moving', () => {
    const entries = [1, 2, 3, 4, 5, 6, 7, 8].map(i =>
      launch({ at: AT + i * HOUR, blocks: i })
    );
    const text = describeJournal(entries, { show: 3 }).join('\n');

    assert.match(text, /8 launch\(es\) recorded, last 3/);
    assert.match(text, /folders 8/);
    assert.ok(!/folders 1 /.test(text), 'only the last few belong in a pasted report');
  });
});
