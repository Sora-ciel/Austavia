/**
 * Objectives in the timer's notification -- running ones counting down, and
 * finished ones saying "Time's up" -- so they reach a phone with the app shut.
 *
 * ## What was asked for
 *
 * 2026-10-26: objectives "should have a sound when they finish and a pop-up --
 * reuse the timer's, for all types of devices." Built then for the app open
 * only, with the rest owed. Reported 2026-10-28: "the notification pop-up
 * doesn't show, like in timer. I asked for that, not just an in-app timer."
 *
 * ## Reused, not repeated
 *
 * The timer already has the whole path on Android: a notification with a live
 * countdown and buttons (TimerNotifications.java), and an alarm that plays
 * "Time's up" when the app is not in front. It shows one thing -- whatever
 * matters most -- and hands back which one a button was pressed on. So an
 * objective is handed to it as one more entry, ranked with the clock timers
 * (`withGoalTimers`), carrying a key of its own (`goal:<owner>:<taskId>`) so a
 * press can be routed back to the task or habit (`parseGoalKey`).
 *
 * Only time objectives: a count has nothing to count down, and its "Done"
 * chime is for somebody already looking at it.
 */

import { goalNow, goalFinishMoment, normalizeGoal } from './taskGoals.js';
import { goalRings } from './taskGoalRings.js';
import { habitGoalTasks } from './habitGoals.js';
import { htmlToText } from './htmlToText.js';

/** The owner of a habit's objective, in a key: habits have no block. */
export const HABITS_OWNER = 'habits';
const PREFIX = 'goal:';

export function goalKey(owner, taskId) {
  return `${PREFIX}${owner}:${taskId}`;
}

/** `{ owner, taskId }` from a key, or null for anything else (a clock's id). */
export function parseGoalKey(key) {
  if (typeof key !== 'string' || !key.startsWith(PREFIX)) return null;
  const rest = key.slice(PREFIX.length);
  const at = rest.indexOf(':');
  if (at <= 0 || at === rest.length - 1) return null;
  return { owner: rest.slice(0, at), taskId: rest.slice(at + 1) };
}

function nameOf(task) {
  const text = htmlToText(String(task?.text || '')).trim();
  return text.length > 60 ? `${text.slice(0, 59)}…` : text || 'Objective';
}

function eachGoalTask(blocks, habits, now) {
  const out = [];
  for (const block of blocks || []) {
    if (block?.type !== 'task' || !Array.isArray(block.tasks)) continue;
    for (const task of block.tasks) if (task?.goal) out.push({ owner: block.id, task });
  }
  for (const task of habitGoalTasks(habits, now)) out.push({ owner: HABITS_OWNER, task });
  return out;
}

/**
 * The time objectives worth a notification: running ones, with when they
 * finish, and finished ones still ringing here. In the timer's entry shape --
 * `{ blockId, phase, left, endsAt, title, ringKey }` -- with `blockId` the
 * objective's key.
 */
export function goalTimers({ blocks = [], habits = [], now = Date.now(), answered = {} } = {}) {
  const entries = [];
  const ringing = new Map(
    goalRings({ blocks, habits, now, answered })
      .filter(ring => ring.loud)
      .map(ring => [ring.taskId, ring])
  );
  for (const { owner, task } of eachGoalTask(blocks, habits, now)) {
    const goal = normalizeGoal(task.goal);
    if (!goal || goal.kind !== 'time') continue;
    const ring = ringing.get(task.id);
    if (ring) {
      entries.push({ blockId: goalKey(owner, task.id), phase: 'ringing', left: 0, endsAt: 0, title: nameOf(task), ringKey: ring.key });
      continue;
    }
    const state = goalNow(goal, now);
    if (!state?.running || state.reached) continue;
    const endsAt = goalFinishMoment(goal) ?? 0;
    entries.push({ blockId: goalKey(owner, task.id), phase: 'running', left: Math.max(0, endsAt - now), endsAt, title: nameOf(task) });
  }
  return entries;
}

const ORDER = { ringing: 0, running: 1, paused: 2 };

/** Clock timers and objectives together, most pressing first, as activeTimers orders them. */
export function withGoalTimers(timers = [], goals = []) {
  const rank = phase => ORDER[phase] ?? 3;
  return [...timers, ...goals].sort((a, b) => rank(a.phase) - rank(b.phase) || a.left - b.left);
}
