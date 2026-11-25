import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fitSeparatorsTogether, SHORT_SEPARATOR } from '../src/utils/separatorFit.js';

// Measured on the phone 2026-11-25: fitting dividers one at a time made the
// phone lay the note out once per divider on every change -- 47 of 69 busy
// seconds while typing. They are fitted together: every write, then every
// read, then every write.

function fake(seps) {
  const log = [];
  const ops = {
    inLine: d => d.inLine !== false,
    hasContentAfter: d => Boolean(d.after),
    setWidth: (d, w) => { log.push(['write', d.id]); d.width = w; },
    room: d => { log.push(['read', d.id]); return d.room; }
  };
  return { log, ops };
}

test('no divider is measured until every divider has been shrunk: one layout, not one each', () => {
  const seps = [{ id: 'a', room: 100.6 }, { id: 'b', room: 50.2 }, { id: 'c', room: 80 }];
  const { log, ops } = fake(seps);
  fitSeparatorsTogether(seps, ops);
  const firstRead = log.findIndex(e => e[0] === 'read');
  const lastRead = log.map(e => e[0]).lastIndexOf('read');
  assert.ok(log.slice(0, firstRead).every(e => e[0] === 'write'), 'writes before reads');
  assert.ok(log.slice(firstRead, lastRead + 1).every(e => e[0] === 'read'), 'the reads together');
  assert.ok(log.slice(lastRead + 1).every(e => e[0] === 'write'), 'writes after');
});

test('each still fills the rest of its line, a pixel spare, or is a short divider beside something', () => {
  const seps = [{ id: 'a', room: 100.6 }, { id: 'b', room: 999, after: true }];
  const { ops } = fake(seps);
  fitSeparatorsTogether(seps, ops);
  assert.equal(seps[0].width, '99px');
  assert.equal(seps[1].width, SHORT_SEPARATOR);
});
