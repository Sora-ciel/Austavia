import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  positionReport,
  worthReporting,
  seekTarget,
  DRIFT_TOLERANCE_MS
} from '../src/utils/playbackPosition.js';

// Named after the request: the phone's notification should be styled like the
// app's own player. Android draws the notification itself and will not take a
// layout, so what can be made to match is the icons and the controls -- and the
// progress bar, which was not drawn at all because the session reported
// PLAYBACK_POSITION_UNKNOWN. This is the part that decides what it is told.

test('a paused track is reported as not moving', () => {
  // The whole reason the bar has to know the speed. Reporting 1x while paused
  // leaves Android extrapolating forward over a track that is not playing, so
  // the bar creeps on and then snaps back whenever anything refreshes it.
  const paused = positionReport({ position: 30, duration: 200, playing: false });
  assert.equal(paused.speed, 0);
  const playing = positionReport({ position: 30, duration: 200, playing: true });
  assert.equal(playing.speed, 1);
});

test('seconds become whole milliseconds', () => {
  const report = positionReport({ position: 12.3456, duration: 200.5, playing: true });
  assert.equal(report.positionMs, 12346);
  assert.equal(report.durationMs, 200500);
});

test('a duration that is not a number yet says nothing rather than nonsense', () => {
  // audioEl.duration is NaN until the browser has read the file's metadata, and
  // every track loaded from disk spends a moment there. A NaN passed onward
  // becomes a nonsense length in the shade.
  const report = positionReport({ position: 0, duration: NaN, playing: true });
  assert.equal(report.durationMs, null, 'no length claimed');
  assert.equal(report.positionMs, 0, 'but the position is still worth sending');
});

test('a stream, which reports no length at all, is not given one', () => {
  assert.equal(positionReport({ position: 5, duration: 0 }).durationMs, null);
  assert.equal(positionReport({ position: 5, duration: Infinity }).durationMs, null);
});

test('the bar is never drawn past the end of its own track', () => {
  // A file whose metadata disagrees with its decoder reports a position a
  // fraction beyond its duration.
  const report = positionReport({ position: 200.4, duration: 200, playing: true });
  assert.equal(report.positionMs, 200000);
});

test('without a position there is nothing to report', () => {
  assert.equal(positionReport({ position: NaN, duration: 100 }), null);
  assert.equal(positionReport({ position: -1 }), null);
  assert.equal(positionReport(), null);
});

test('a track playing normally is never reported again, however long it plays', () => {
  // The bug this was written to avoid. Comparing against the position last sent
  // rather than against where Android will have carried it to fires once a
  // second for ever, on a track that is playing perfectly -- which is exactly
  // the cost the whole arrangement exists to avoid.
  const start = 40_000;
  for (let elapsed = 250; elapsed <= 10 * 60_000; elapsed += 250) {
    const truth = start + elapsed;
    assert.equal(
      worthReporting({
        positionMs: truth,
        lastReportedMs: start,
        lastReportedAt: 1_000_000,
        now: 1_000_000 + elapsed,
        playing: true
      }),
      false,
      `reported again after ${elapsed}ms of ordinary playback`
    );
  }
});

test('a seek is news, because the system could not have guessed it', () => {
  const common = { lastReportedMs: 40_000, lastReportedAt: 1_000_000, now: 1_002_000, playing: true };
  // Two seconds on, the shade thinks it is at 42s. Jumping to 90s is a seek.
  assert.equal(worthReporting({ ...common, positionMs: 90_000 }), true);
  assert.equal(worthReporting({ ...common, positionMs: 10_000 }), true, 'backwards counts too');
  assert.equal(
    worthReporting({ ...common, positionMs: 42_000 }),
    false,
    'and exactly where it was expected is not'
  );
});

test('a stall, where the music falls behind the bar, is corrected', () => {
  // The event path can miss this entirely -- nothing fires when audio simply
  // stops advancing -- so it is what the drift check is really for.
  assert.equal(
    worthReporting({
      positionMs: 40_000,          // the audio has not moved
      lastReportedMs: 40_000,
      lastReportedAt: 1_000_000,
      now: 1_005_000,              // but five seconds have passed
      playing: true
    }),
    true
  );
});

test('while paused, any move at all is news', () => {
  // Nothing is extrapolating, so there is no drift to forgive.
  assert.equal(
    worthReporting({ positionMs: 40_100, lastReportedMs: 40_000, playing: false }),
    true
  );
  assert.equal(
    worthReporting({ positionMs: 40_000, lastReportedMs: 40_000, playing: false }),
    false,
    'but standing still is not'
  );
});

test('the first report is always worth sending', () => {
  assert.equal(worthReporting({ positionMs: 0, lastReportedMs: null }), true);
  assert.equal(worthReporting({ positionMs: 0, lastReportedMs: undefined }), true);
  assert.equal(worthReporting({ positionMs: NaN, lastReportedMs: 0 }), false);
  assert.equal(worthReporting(), false);
});

test('the tolerance sits between playback drift and the smallest deliberate seek', () => {
  // Written down so that changing it is a decision rather than a tweak.
  assert.equal(DRIFT_TOLERANCE_MS, 1000);
});

test('a seek from the notification comes back in the seconds an audio element wants', () => {
  assert.equal(seekTarget(90_000), 90);
  assert.equal(seekTarget(1500), 1.5);
  assert.equal(seekTarget(0), 0);
});

test('a seek to nowhere is refused rather than moving the track to NaN', () => {
  // Setting currentTime to NaN throws, and it would take the track down with it.
  assert.equal(seekTarget(-1), null);
  assert.equal(seekTarget(NaN), null);
  assert.equal(seekTarget(undefined), null);
  assert.equal(seekTarget('nonsense'), null);
});
