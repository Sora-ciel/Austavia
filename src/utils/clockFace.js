/**
 * What a clock block says, and when it next needs to say something different.
 *
 * ## What was asked for
 *
 * "It would be great to add a clock block that can be on all our modes apart
 * from Task, Playlist and Birthday." — 2026-09-27.
 *
 * ## Local time, built by hand
 *
 * The time is the one the person is living in, read from the local parts of a
 * Date — never `toISOString`, which is UTC and has already put tomorrow's date
 * on a habit tracker and a screenshot in this app. And it is assembled by hand
 * rather than through `Intl`, so that what the tests assert is what is drawn:
 * a locale-dependent string would pass here and read differently on the
 * device it is drawn on.
 *
 * ## Waking only when the face changes
 *
 * A clock that redraws every second to show hours and minutes is waking a phone
 * sixty times for every change anybody can see. So when seconds are hidden the
 * next tick is aimed at the start of the next minute, and only a face showing
 * seconds ticks every second. Each tick reads the time afresh rather than
 * counting, so a timer the browser delayed — a tab in the background, a phone
 * that slept — is right again on the next one instead of drifting.
 */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const pad = value => String(value).padStart(2, '0');

function asDate(at) {
  const when = at instanceof Date ? at : new Date(Number(at));
  return Number.isNaN(when.getTime()) ? new Date() : when;
}

/**
 * The parts of the face, separately, so the body can size them differently.
 *
 * `period` is AM or PM on a twelve-hour face and empty otherwise. Midnight on
 * a twelve-hour face is 12, not 0 — "0:15 AM" is not a time anyone says.
 */
export function clockParts({ at = Date.now(), hour12 = false, showSeconds = false } = {}) {
  const when = asDate(at);
  const hours = when.getHours();

  let shownHours;
  let period = '';
  if (hour12) {
    period = hours < 12 ? 'AM' : 'PM';
    shownHours = String(hours % 12 === 0 ? 12 : hours % 12);
  } else {
    shownHours = pad(hours);
  }

  const time = `${shownHours}:${pad(when.getMinutes())}`;
  return {
    time,
    seconds: showSeconds ? pad(when.getSeconds()) : '',
    period
  };
}

/** The day underneath, as a person writes it. */
export function clockDate(at = Date.now()) {
  const when = asDate(at);
  return `${DAYS[when.getDay()]} ${when.getDate()} ${MONTHS[when.getMonth()]}`;
}

/**
 * How long until the face next changes.
 *
 * Aimed a few milliseconds past the boundary rather than at it: a timer that
 * fires a hair early would read the old minute and have to fire again at once.
 */
export function msUntilNextTick({ now = Date.now(), showSeconds = false } = {}) {
  const when = asDate(now);
  const EPSILON = 20;

  if (showSeconds) {
    return 1000 - when.getMilliseconds() + EPSILON;
  }

  const intoMinute = when.getSeconds() * 1000 + when.getMilliseconds();
  return 60000 - intoMinute + EPSILON;
}
