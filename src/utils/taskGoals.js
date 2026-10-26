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
 *     target: number,        // whole minutes for time, times for count; >= 1
 *     targetSeconds: number, // time only: the goal to the second
 *     progress: number,      // ms for time, times for count; >= 0
 *     daily: boolean,
 *     day: 'YYYY-MM-DD' | null,       // the day progress belongs to (daily)
 *     runningSince: number | null,    // epoch ms, time only
 *     finishedAt: number | null       // when the goal was reached (for the ring)
 *   }
 *
 * ## Seconds (asked 2026-10-26)
 *
 * "Objectives should be able to have seconds." A time goal is kept to the
 * second in `targetSeconds`. `target` stays whole minutes, rounded up, because
 * a phone or a computer still on an older build reads only that -- and an older
 * build drops a goal whose `target` is under one minute, so a 30-second goal
 * written as 0.5 would vanish on its next save. Rounded up, it keeps a goal
 * that is a little longer there, rather than none.
 *
 * ## Ringing (asked 2026-10-26)
 *
 * "They should have a sound when they finish and a popup ... reuse the timer's."
 * `finishedAt` records the moment a goal was reached, so the ring can say
 * when, and every device can tell a finish it has not answered yet; and
 * `goalFinishMoment` works out when a running timer *will* finish, so the ring
 * can wake for it without anything having to be written first.
 */

export const GOAL_KINDS = Object.freeze(['time', 'count']);
const SECOND = 1000;
const MAX_TARGET = 100000;
const MAX_SECONDS = MAX_TARGET * 60;

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
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= min ? n : null;
}

/** The goal in its own units: ms for time, times for count. */
function targetUnits(goal) {
  return goal.kind === 'time' ? goal.targetSeconds * SECOND : goal.target;
}

/**
 * A goal as it should be, or null when there is none worth keeping.
 * What arrives may have been written by an older build or another device: a
 * time goal from before seconds has only `target`, in minutes.
 */
export function normalizeGoal(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!GOAL_KINDS.includes(raw.kind)) return null;
  const isTime = raw.kind === 'time';
  let target;
  let targetSeconds = null;
  if (isTime) {
    const seconds = finiteAtLeast(raw.targetSeconds, 1);
    const minutes = finiteAtLeast(raw.target, 1);
    targetSeconds = seconds !== null ? Math.round(seconds) : minutes !== null ? Math.round(minutes * 60) : null;
    if (targetSeconds === null) return null;
    targetSeconds = Math.min(MAX_SECONDS, targetSeconds);
    target = Math.max(1, Math.ceil(targetSeconds / 60));
  } else {
    const count = finiteAtLeast(raw.target, 1);
    if (count === null) return null;
    target = Math.min(MAX_TARGET, Math.floor(count));
  }
  const goal = {
    kind: raw.kind,
    target,
    progress: finiteAtLeast(raw.progress, 0) ?? 0,
    daily: raw.daily === true,
    day: typeof raw.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.day) ? raw.day : null,
    // null is "not running", and Number(null) is 0 -- which would read as a
    // timer started in 1970. Only a real moment counts.
    runningSince: isTime ? finiteAtLeast(raw.runningSince, 1) : null,
    finishedAt: finiteAtLeast(raw.finishedAt, 1)
  };
  if (isTime) goal.targetSeconds = targetSeconds;
  return goal;
}

/**
 * Reads what somebody typed as a goal. For time, in seconds: "2h", "90m",
 * "45s", "1h30" or "1:30" (an hour and a half), "1m30", "1h 5m 10s",
 * "1:05:10", or a bare number of minutes. For count, a whole number. Null when
 * it cannot be read, so the editor can say so rather than guess.
 */
export function parseTarget(text, kind) {
  const value = String(text ?? '').trim().toLowerCase();
  if (!value) return null;
  if (kind === 'count') {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 ? Math.min(n, MAX_TARGET) : null;
  }
  let seconds = null;
  let m;
  if ((m = /^(\d+):(\d{1,2}):(\d{1,2})$/.exec(value))) seconds = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  else if ((m = /^(\d+):(\d{1,2})$/.exec(value))) seconds = Number(m[1]) * 3600 + Number(m[2]) * 60;
  else if ((m = /^(\d+(?:\.\d+)?)\s*h\s*(\d+)$/.exec(value))) seconds = Math.round(Number(m[1]) * 3600) + Number(m[2]) * 60;
  else if ((m = /^(\d+(?:\.\d+)?)\s*m(?:in)?\s*(\d+)$/.exec(value))) seconds = Math.round(Number(m[1]) * 60) + Number(m[2]);
  else if ((m = /^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in)?)?\s*(?:(\d+)\s*s(?:ec)?)?$/.exec(value)) && (m[1] || m[2] || m[3])) {
    seconds = Math.round(Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60) + Number(m[3] || 0);
  }
  else if (/^\d+$/.test(value)) seconds = Number(value) * 60;
  return seconds && seconds >= 1 ? Math.min(seconds, MAX_SECONDS) : null;
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
  const target = targetUnits(goal);
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

/**
 * When the goal was or will be reached: a running timer's finish worked out
 * from when it started, otherwise the moment recorded. Null when it has not
 * finished and is not on its way there.
 */
export function goalFinishMoment(rawGoal) {
  const goal = normalizeGoal(rawGoal);
  if (!goal) return null;
  if (goal.kind === 'time' && goal.runningSince !== null) {
    return goal.runningSince + Math.max(0, targetUnits(goal) - goal.progress);
  }
  return goal.finishedAt;
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
 * - A running timer that has reached its goal stops there, the task is done,
 *   and the moment it was reached is recorded.
 */
export function settleTask(task, now) {
  const goal = normalizeGoal(task?.goal);
  if (!goal) return task;
  const today = dayKey(now);
  let next = goal;
  let done = task.done === true;

  if (goal.daily && goal.day !== today) {
    const runningSince = goal.runningSince !== null ? Math.max(goal.runningSince, startOfDay(now)) : null;
    next = { ...next, progress: 0, day: today, runningSince, finishedAt: null };
    if (goal.day !== null) done = false;
  }

  if (next.kind === 'time' && next.runningSince !== null) {
    const remaining = targetUnits(next) - next.progress;
    if (now - next.runningSince >= remaining) {
      next = {
        ...next,
        progress: targetUnits(next),
        runningSince: null,
        finishedAt: next.runningSince + Math.max(0, remaining)
      };
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
 * Logs progress by hand: seconds for time, times for count. A negative amount
 * corrects a mistake, never below zero. Crossing the goal moves the task to
 * Done and records the moment; a task already past it can be unticked and
 * carry on.
 */
export function addProgress(task, amount, now) {
  const settled = settleTask(task, now);
  const goal = normalizeGoal(settled?.goal);
  const n = Number(amount);
  if (!goal || !Number.isFinite(n) || n === 0) return settled;
  const step = goal.kind === 'time' ? n * SECOND : Math.trunc(n);
  const units = targetUnits(goal);
  // A running timer's time so far is folded in first, so the log adds to it.
  const running = goal.runningSince !== null;
  const sofar = running ? goal.progress + Math.max(0, now - goal.runningSince) : goal.progress;
  const progress = Math.max(0, sofar + step);
  const reachedNow = progress >= units;
  const crossed = sofar < units && reachedNow;
  return {
    ...settled,
    done: crossed ? true : settled.done,
    goal: {
      ...goal,
      progress,
      day: goal.day ?? dayKey(now),
      // Keeps running from here, unless the log has just finished it.
      runningSince: running && !reachedNow ? now : null,
      finishedAt: crossed ? now : reachedNow ? goal.finishedAt : null
    }
  };
}

/**
 * Gives a task an objective, or changes it: `target` is seconds for time and
 * times for count. Progress is kept when the kind stays the same, so lowering
 * a goal does not throw away work done.
 */
export function setGoal(task, { kind, target, daily = false } = {}, now) {
  if (!GOAL_KINDS.includes(kind)) return task;
  const current = normalizeGoal(task?.goal);
  const keep = current && current.kind === kind;
  const goal = normalizeGoal({
    kind,
    ...(kind === 'time' ? { targetSeconds: target } : { target }),
    daily: daily === true,
    progress: keep ? current.progress : 0,
    runningSince: keep ? current.runningSince : null,
    day: keep ? current.day : dayKey(now),
    finishedAt: null
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

/** "1h 05m", "12m 07s", "45s", "2h": the units there are, the smaller padded. */
export function formatDuration(totalSeconds) {
  const all = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(all / 3600);
  const m = Math.floor((all % 3600) / 60);
  const s = all % 60;
  const parts = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(h ? `${String(m).padStart(2, '0')}m` : `${m}m`);
  if (s) parts.push(h || m ? `${String(s).padStart(2, '0')}s` : `${s}s`);
  return parts.length ? parts.join(' ') : '0s';
}

/** "12m 07s / 30m" or "7 / 20", for beside the bar. */
export function goalLabel(rawGoal, now) {
  const state = goalNow(rawGoal, now);
  if (!state) return '';
  if (state.kind === 'count') return `${state.value} / ${state.target}`;
  return `${formatDuration(state.value / SECOND)} / ${formatDuration(state.target / SECOND)}`;
}
