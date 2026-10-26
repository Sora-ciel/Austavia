/**
 * When a finished objective rings, and when it stops.
 *
 * ## What was asked for
 *
 * 2026-10-26: objectives "should have a sound when they finish and a popup --
 * I'm thinking reuse the timer's, for all types of devices." So a finished
 * objective appears in the same banner as a finished timer, with the same
 * sound, wherever Austavia is open (AlarmRinger.svelte, in every mode).
 *
 * ## Time and count ring differently
 *
 * A time objective finishes on its own, often while somebody is doing the
 * thing it measures and not looking: it rings until it is stopped, exactly
 * like a timer, for up to RING_WINDOW_MS.
 *
 * A count objective finishes because somebody just pressed +1 on it -- they
 * are looking at it already. A ring that has to be stopped would be a chore,
 * so it chimes once and the banner shows for CHIME_MS, then goes by itself.
 *
 * ## Answered per device, like the timer
 *
 * Stopping a ring is remembered on this device (as a timer's is): two devices
 * open on the same folder each ring, and each is stopped where it is. A ring
 * is known by the task and the moment the goal was reached, so the same task
 * finishing again tomorrow rings again.
 *
 * Absolute, like everything else here: what rings is worked out from the tasks
 * and the clock each time, never from remembering that a ring started.
 */

import { goalFinishMoment, normalizeGoal } from './taskGoals.js';
import { habitGoalTasks } from './habitGoals.js';

/** Habits with an amount or a time ring the same way (2026-10-26, habitGoals.js). */
const HABITS = { id: 'habits' };

/** How long a finished time objective keeps ringing if nobody stops it. */
export const RING_WINDOW_MS = 10 * 60 * 1000;
/** How long a finished count objective's banner stays. */
export const CHIME_MS = 6 * 1000;
export const ANSWERED_KEY = 'austavia.taskGoals.answered';
const KEEP_ANSWERED_MS = 2 * 24 * 60 * 60 * 1000;

/** The key a ring is answered under: the task and the moment it finished. */
export function ringKey(taskId, finishedAt) {
  return `${taskId}@${finishedAt}`;
}

function tasksOf(blocks, habits = []) {
  const out = habitGoalTasks(habits).map(task => ({ block: HABITS, task }));
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (block?.type !== 'task' || !Array.isArray(block.tasks)) continue;
    for (const task of block.tasks) {
      if (task && task.goal) out.push({ block, task });
    }
  }
  return out;
}

/**
 * The objectives ringing now, newest first: `{ key, blockId, taskId, task,
 * kind, finishedAt, loud }`. `loud` is a ring until stopped; otherwise a chime.
 */
export function goalRings({ blocks = [], habits = [], now = Date.now(), answered = {} } = {}) {
  const rings = [];
  for (const { block, task } of tasksOf(blocks, habits)) {
    const goal = normalizeGoal(task.goal);
    if (!goal) continue;
    const finishedAt = goalFinishMoment(goal);
    if (finishedAt === null || finishedAt > now) continue;
    const loud = goal.kind === 'time';
    // Over *at* the end, not after it: the ringer wakes at exactly that moment
    // (msUntilGoalRingChange), and a ring still counted as on then had no later
    // moment to wake for, so its banner stayed up for the ringer's fallback
    // minute -- seen on the first count objective tried.
    if (now - finishedAt >= (loud ? RING_WINDOW_MS : CHIME_MS)) continue;
    const key = ringKey(task.id, finishedAt);
    if (answered[key]) continue;
    rings.push({ key, blockId: block.id, taskId: task.id, task, kind: goal.kind, finishedAt, loud });
  }
  return rings.sort((a, b) => b.finishedAt - a.finishedAt);
}

/**
 * How long until what is ringing next changes -- a timer finishing, or a ring
 * running out -- so the ringer can sleep until then. Null when nothing is due.
 */
export function msUntilGoalRingChange({ blocks = [], habits = [], now = Date.now() } = {}) {
  let soonest = null;
  for (const { task } of tasksOf(blocks, habits)) {
    const goal = normalizeGoal(task.goal);
    if (!goal) continue;
    const finishedAt = goalFinishMoment(goal);
    if (finishedAt === null) continue;
    const ends = finishedAt + (goal.kind === 'time' ? RING_WINDOW_MS : CHIME_MS);
    for (const moment of [finishedAt, ends]) {
      if (moment > now && (soonest === null || moment - now < soonest)) soonest = moment - now;
    }
  }
  return soonest;
}

/** The rings already answered on this device. */
export function readAnswered(storage) {
  try {
    const raw = JSON.parse(storage?.getItem(ANSWERED_KEY) || '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

/** Answers a ring on this device; old answers are let go as it goes. */
export function answerRing(storage, key, now = Date.now()) {
  const answered = readAnswered(storage);
  const kept = {};
  for (const [k, at] of Object.entries(answered)) {
    if (Number(at) > now - KEEP_ANSWERED_MS) kept[k] = at;
  }
  kept[key] = now;
  try {
    storage?.setItem(ANSWERED_KEY, JSON.stringify(kept));
  } catch {
    // Not remembered: it rings out its window instead.
  }
  return kept;
}
