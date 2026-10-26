/**
 * Objective tasks: a task with a goal of time or of times.
 *
 * ## What was asked for
 *
 * 2026-10-25: "In task mode, have objective task, where you can add an amount
 * of time to do." Then, when asked how: "it's going to be time that fills up,
 * but you'll also be able to count how many times -- for example if you want
 * to draw 20 times -- and both you will be able to log by hand." And whether
 * it resets each day: "it should depend ... on the right click you choose
 * which type." So, per task:
 *
 * - **time**: a goal in minutes, filled by a timer started and paused as often
 *   as wanted, sessions adding up -- or by logging time by hand;
 * - **count**: a goal in times, filled one at a time or logged by hand;
 * - **daily** or not: a daily objective starts from zero each day and comes
 *   back to To Do; otherwise progress keeps adding up until the goal.
 *
 * Reaching the goal moves the task to Done.
 *
 * ## Stored absolutely
 *
 * A running timer is the moment it was started (`runningSince`), never a
 * number that something has to keep counting up -- that would be wrong the
 * moment the app was closed, and different on every device. Elapsed time is
 * always worked out from it. A daily objective records which day its progress
 * belongs to (`day`), so a new day is a fact read off the task rather than an
 * event somebody had to be awake for. `settleTask` recomputes both from
 * scratch, which is what makes it safe to run on open, on a timer and twice.
 *
 * ## Shape on a task
 *
 *   goal: {
 *     kind: 'time' | 'count',
 *     target: number,        // minutes for time, times for count; >= 1
 *     progress: number,      // ms for time, times for count; >= 0
 *     daily: boolean,
 *     day: 'YYYY-MM-DD' | null,       // the day progress belongs to (daily)
 *     runningSince: number | null     // epoch ms, time only
 *   }
 */

export const GOAL_KINDS = Object.freeze(['time', 'count']);
const MINUTE = 60 * 1000;
const MAX_TARGET = 100000;

/** The local calendar day of a moment, as YYYY-MM-DD. */
export function dayKey(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function finiteAtLeast(value, min) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min ? n : null;
}

/**
 * A goal as it should be, or null when there is none worth keeping.
 * What arrives may have been written by an older build or another device.
 */
export function normalizeGoal(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!GOAL_KINDS.includes(raw.kind)) return null;
  const target = finiteAtLeast(raw.target, 1);
  if (target === null) return null;
  const isTime = raw.kind === 'time';
  return {
    kind: raw.kind,
    target: Math.min(MAX_TARGET, isTime ? Math.round(target) : Math.floor(target)),
    progress: finiteAtLeast(raw.progress, 0) ?? 0,
    daily: raw.daily === true,
    day: typeof raw.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.day) ? raw.day : null,
    // null is "not running", and Number(null) is 0 -- which would read as a
    // timer started in 1970. Only a real moment counts.
    runningSince: isTime && raw.runningSince != null ? finiteAtLeast(raw.runningSince, 1) : null
  };
}

/**
 * Reads what somebody typed as a goal: for time "2h", "90m", "1h30", "1:30"
 * or a bare number of minutes; for count a whole number. Null when it cannot
 * be read, so the editor can say so rather than guess.
 */
export function parseTarget(text, kind) {
  const value = String(text ?? '').trim().toLowerCase();
  if (!value) return null;
  if (kind === 'count') {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 ? Math.min(n, MAX_TARGET) : null;
  }
  let minutes = null;
  let m;
  if ((m = /^(\d+):(\d{1,2})$/.exec(value))) minutes = Number(m[1]) * 60 + Number(m[2]);
  else if ((m = /^(\d+(?:\.\d+)?)\s*h(?:\s*(\d+)\s*m?)?$/.exec(value))) minutes = Math.round(Number(m[1]) * 60) + Number(m[2] || 0);
  else if ((m = /^(\d+)\s*m(?:in)?$/.exec(value))) minutes = Number(m[1]);
  else if (/^\d+$/.test(value)) minutes = Number(value);
  return minutes && minutes >= 1 ? Math.min(minutes, MAX_TARGET) : null;
}

/** How much of the goal is done right now, for drawing it. */
export function goalNow(rawGoal, now) {
  const goal = normalizeGoal(rawGoal);
  if (!goal) return null;
  const today = dayKey(now);
  const stale = goal.daily && goal.day !== null && goal.day !== today;
  let value = stale ? 0 : goal.progress;
  if (goal.kind === 'time' && goal.runningSince !== null) {
    const from = stale ? Math.max(goal.runningSince, startOfDay(now)) : goal.runningSince;
    value += Math.max(0, now - from);
  }
  const target = goal.kind === 'time' ? goal.target * MINUTE : goal.target;
  return {
    kind: goal.kind,
    value,
    target,
    fraction: Math.min(1, value / target),
    reached: value >= target,
    running: goal.runningSince !== null,
    daily: goal.daily
  };
}

function withGoal(task, goal) {
  return { ...task, goal };
}

/**
 * Brings a task up to date with the clock. Returns the same task when nothing
 * changed, so a caller can skip a save.
 *
 * - A daily objective on a new day starts again from zero and is back in To Do
 *   (a timer left running carries on, counted from midnight).
 * - A running timer that has reached its goal stops there, and the task is
 *   done.
 */
export function settleTask(task, now) {
  const goal = normalizeGoal(task?.goal);
  if (!goal) return task;
  const today = dayKey(now);
  let next = goal;
  let done = task.done === true;

  if (goal.daily && goal.day !== today) {
    const runningSince = goal.runningSince !== null ? Math.max(goal.runningSince, startOfDay(now)) : null;
    next = { ...next, progress: 0, day: today, runningSince };
    if (goal.day !== null) done = false;
  }

  if (next.kind === 'time' && next.runningSince !== null) {
    const total = next.progress + Math.max(0, now - next.runningSince);
    if (total >= next.target * MINUTE) {
      next = { ...next, progress: next.target * MINUTE, runningSince: null };
      done = true;
    }
  }

  if (next === goal && done === (task.done === true)) return task;
  return { ...task, done, goal: next };
}

/** Starts the timer of a time objective. */
export function startTimer(task, now) {
  const settled = settleTask(task, now);
  const goal = normalizeGoal(settled?.goal);
  if (!goal || goal.kind !== 'time' || goal.runningSince !== null) return settled;
  return withGoal(settled, { ...goal, day: goal.day ?? dayKey(now), runningSince: now });
}

/** Pauses it, keeping the time it ran. */
export function pauseTimer(task, now) {
  const settled = settleTask(task, now);
  const goal = normalizeGoal(settled?.goal);
  if (!goal || goal.runningSince === null) return settled;
  return withGoal(settled, {
    ...goal,
    progress: goal.progress + Math.max(0, now - goal.runningSince),
    runningSince: null
  });
}

/**
 * Logs progress by hand: minutes for time, times for count. A negative amount
 * corrects a mistake, never below zero. Crossing the goal moves the task to
 * Done; a task already past it can be unticked and carry on.
 */
export function addProgress(task, amount, now) {
  const settled = settleTask(task, now);
  const goal = normalizeGoal(settled?.goal);
  const n = Number(amount);
  if (!goal || !Number.isFinite(n) || n === 0) return settled;
  const step = goal.kind === 'time' ? n * MINUTE : Math.trunc(n);
  const targetUnits = goal.kind === 'time' ? goal.target * MINUTE : goal.target;
  // A running timer's time so far is folded in first, so the log adds to it.
  const running = goal.runningSince !== null;
  const sofar = running ? goal.progress + Math.max(0, now - goal.runningSince) : goal.progress;
  const progress = Math.max(0, sofar + step);
  const reachedNow = progress >= targetUnits;
  const crossed = sofar < targetUnits && reachedNow;
  return {
    ...settled,
    done: crossed ? true : settled.done,
    goal: {
      ...goal,
      progress,
      day: goal.day ?? dayKey(now),
      // Keeps running from here, unless the log has just finished it.
      runningSince: running && !reachedNow ? now : null
    }
  };
}

/**
 * Gives a task an objective, or changes it. Progress is kept when the kind
 * stays the same, so lowering a goal does not throw away work done.
 */
export function setGoal(task, { kind, target, daily = false } = {}, now) {
  if (!GOAL_KINDS.includes(kind)) return task;
  const current = normalizeGoal(task?.goal);
  const keep = current && current.kind === kind;
  const goal = normalizeGoal({
    kind,
    target,
    daily: daily === true,
    progress: keep ? current.progress : 0,
    runningSince: keep ? current.runningSince : null,
    day: keep ? current.day : dayKey(now)
  });
  if (!goal) return task;
  return { ...task, goal };
}

/** Back to an ordinary task. Whether it is done is left as it is. */
export function removeGoal(task) {
  if (!task || !('goal' in task)) return task;
  const { goal, ...rest } = task;
  return rest;
}

function formatMinutes(totalMinutes) {
  const m = Math.floor(totalMinutes);
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (!h) return `${rest}m`;
  return rest ? `${h}h ${String(rest).padStart(2, '0')}` : `${h}h`;
}

/** "1h 20 / 2h" or "7 / 20", for beside the bar. */
export function goalLabel(rawGoal, now) {
  const state = goalNow(rawGoal, now);
  if (!state) return '';
  if (state.kind === 'count') return `${state.value} / ${state.target}`;
  return `${formatMinutes(state.value / MINUTE)} / ${formatMinutes(state.target / MINUTE)}`;
}
