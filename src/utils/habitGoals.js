/**
 * Amounts and time on a habit -- "drink 8 glasses", "read 20 minutes" -- as
 * Task mode's objectives, not a second copy of them.
 *
 * ## What was asked for
 *
 * Agreed 2026-10-26, item 7 of the habit tracker plan: "Amounts, not just ✓:
 * 'Drink water, 8 glasses' or 'Read 20 min'. This could reuse the Task-mode
 * objectives (count and time, +1, the timer, the ring when done), so it's
 * mostly a link rather than new code." And the rule asked for the same day:
 * two things doing one job share the code (CLAUDE.md, "One of everything").
 *
 * ## How
 *
 * Every objective function in taskGoals.js works on a task: whether it is
 * done, and its goal. A habit, on a given day, *is* that -- its goal, and
 * whether today is ✓ -- so it is handed to them as one (`habitTask`) and the
 * answer written back (`fromHabitTask`). The goal is stored on the habit
 * exactly as on a task, always daily, since a habit is kept day by day.
 *
 * Reaching the goal marks the day it was reached ✓ in the habit's log, which
 * is what its streak and page read. Falling short leaves the day as it is:
 * an empty day it was due is a missed one, the same as for any habit.
 */

import { normalizeGoal, keptGoal, settleTask, dayKey } from './taskGoals.js';
import { normalizeHabits, dayMark } from './habitStore.js';

/** A habit on the day of `now`, in the shape the objective functions take. */
export function habitTask(habit, now = Date.now()) {
  return {
    id: habit?.id,
    text: habit?.name,
    done: dayMark(habit?.log?.[dayKey(now)]) === 'done',
    // Daily by what a habit is -- for a goal this build can read. One it
    // cannot is handed on exactly as it is.
    goal: habit?.goal ? (normalizeGoal(habit.goal) ? { ...habit.goal, daily: true } : habit.goal) : undefined
  };
}

/** The habit after an objective function has answered for it. */
export function fromHabitTask(habit, task) {
  const before = normalizeGoal(habit?.goal);
  const after = normalizeGoal(task?.goal);
  const next = { ...habit };
  if (after) next.goal = { ...after, daily: true };
  // A goal of a kind only a newer build knows: this one cannot act on it, and
  // must not take its silence for "no goal" (utils/keepUnknown.js). Only an
  // answer with no goal at all -- removeGoal -- removes it.
  else if (task?.goal) next.goal = keptGoal(task.goal) ?? habit.goal;
  else delete next.goal;
  // A goal reached is a day done -- the day it was reached, which for a timer
  // that ran past midnight unseen is not necessarily today.
  if (after?.finishedAt && after.finishedAt !== before?.finishedAt) {
    next.log = { ...(habit?.log || {}), [dayKey(after.finishedAt)]: 'done' };
  }
  return next;
}

/**
 * The habits with one of them changed by an objective function -- startTimer,
 * pauseTimer, setGoal, removeGoal, or (task, now) => addProgress(task, n, now).
 */
export function withHabitGoal(habits, habitId, change, now = Date.now()) {
  const list = normalizeHabits(habits);
  return list.map(habit => (habit.id === habitId ? fromHabitTask(habit, change(habitTask(habit, now), now)) : habit));
}

/**
 * Every habit's objective made true for `now`: a new day starts from zero, a
 * timer that reached its goal stops and the day is ✓. The same list back when
 * nothing changed -- so the caller's equality guard stops the save, and this
 * is safe on open, on a timer, and twice.
 */
export function settleHabits(habits, now = Date.now()) {
  const list = normalizeHabits(habits);
  let changed = false;
  const next = list.map(habit => {
    if (!habit.goal) return habit;
    const task = habitTask(habit, now);
    const settled = settleTask(task, now);
    if (settled === task) return habit;
    changed = true;
    return fromHabitTask(habit, settled);
  });
  return changed ? next : habits;
}

/** The habits with goals, as tasks, for the ring (taskGoalRings.js). */
export function habitGoalTasks(habits, now = Date.now()) {
  return normalizeHabits(habits).filter(habit => habit.goal).map(habit => habitTask(habit, now));
}
