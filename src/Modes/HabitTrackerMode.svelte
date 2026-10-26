<script>
  import ModeWallpaper from '../components/ModeWallpaper.svelte';
  // The folder's wallpaper -- Canvas's picture and settings; see hasWallpaper
  // in modeRegistry.js.
  export let backgroundSettings = {};
  import { onMount } from "svelte";
  // The shared one, rather than the copy that used to live here: that copy did
  // not understand 4- or 8-digit hex, so a theme using either fell through to
  // light text and could put it on a light background.
  import { getReadableTextColor } from "../utils/readableColor.js";
  import { recentDays, daysToShow } from "../utils/habitDays.js";
  import { createListReorder } from "../utils/listReorder.js";
  import HabitPage from "../components/HabitPage.svelte";
  import { moveToSlot } from "../utils/dropPlacement.js";
  import { habitStreaks } from "../utils/habitStreaks.js";
  import { onDestroy, createEventDispatcher } from "svelte";
  import { habitsEqual, withDayTapped, withHabitRenamed, withScheduleSet } from "../utils/habitStore.js";
  import { isDue, describeSchedule, normalizeSchedule, WEEKDAY_ORDER } from "../utils/habitSchedule.js";

  export let modeLabels = {};
  export let activeMode = "default";
  export let canvasColors = {};
  /**
   * The open folder's habits.
   *
   * They used to be a single list in localStorage: the same habits in every
   * folder, on one device only, so a tick on the phone never reached the
   * computer. They now belong to the folder and travel with it -- see
   * utils/habitStore.js. This mode owns none of it; it asks for a change and
   * the folder decides, which is how every other mode's settings work.
   */
  export let habits = [];

  const dispatch = createEventDispatcher();

  let newHabitName = "";

  const today = new Date();

  const defaultCanvasColors = {
    outerBg: "#000000",
    innerBg: "#000000"
  };

  $: canvasTheme = { ...defaultCanvasColors, ...(canvasColors || {}) };
  // The theme's own text colour first, and only a computed one when it has
  // none. This mode used to always compute, so it ignored whatever the theme
  // actually asked for and picked its own black or white — the one thing a
  // theme is most obviously entitled to decide.
  $: modeTextColor = canvasTheme.textColor || getReadableTextColor(canvasTheme.innerBg);
  // The styles below reach for the block theme's variables and fall back when
  // one does not resolve. That fallback is not a rare path here, it is the
  // usual one: `--block-header-bg` is declared on .app as `var(--bg)`, and
  // `--bg` is block-scoped — every block sets it inline from its own colour.
  // Nothing in this mode is a block, so it never resolves, and a var() inside a
  // custom property is substituted where it is *declared*, not where it is
  // used, so defining --bg here could not rescue it either.
  //
  // Hence the fallbacks are written in terms of the canvas colours rather than
  // as fixed values. This mode was not ignoring the theme; it was reading
  // variables that cannot resolve outside a block and landing on a hardcoded
  // dark blue every time.
  $: canvasCssVars = `--canvas-outer-bg: ${canvasTheme.outerBg}; --canvas-inner-bg: ${canvasTheme.innerBg}; --mode-text-color: ${modeTextColor};`;

  // One letter on a phone, three on a computer. A whole "Wed" inside a square
  // narrow enough for seven of them is unreadable anyway, and the column is
  // named by the number under it.
  const formatDayLabel = (date, narrow) =>
    date.toLocaleDateString(undefined, { weekday: narrow ? "narrow" : "short" });

  // Just the number on a phone. "Sep 20" does not fit and does not need to:
  // the window is the last week, so nobody is wondering which month it is.
  const formatDayNumber = (date, narrow) =>
    narrow
      ? String(date.getDate())
      : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  // How many days are on screen follows the width of the window, the same way
  // the rest of the app decides which layout it is in. The window itself lives
  // in utils/habitDays.js: it ends today and runs backwards, where it used to
  // start today and run forwards into days that had not happened yet.
  let viewportWidth = typeof window === "undefined" ? 1440 : window.innerWidth;
  $: compact = viewportWidth <= 1024;
  $: days = recentDays({ today, count: daysToShow({ width: viewportWidth }) }).map(day => ({
    key: day.key,
    date: day.date,
    isToday: day.isToday,
    label: formatDayLabel(day.date, compact),
    number: formatDayNumber(day.date, compact),
    full: day.date.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric"
    })
  }));

  const saveHabits = updatedHabits => {
    // Guarded, because this is now a folder write and a folder write is a
    // sync. Saving a list identical to the one already there stamps a new
    // modifiedAt, which two devices then hand back and forth for as long as
    // both are open -- the fault syncRules.js carries a scar from.
    if (habitsEqual(habits, updatedHabits)) return;
    dispatch('modeSettingChange', { habit: { habits: updatedHabits } });
  };

  const addHabit = () => {
    const trimmed = newHabitName.trim();
    if (!trimmed) return;
    const next = [
      ...habits,
      { id: crypto.randomUUID(), name: trimmed, log: {} }
    ];
    newHabitName = "";
    saveHabits(next);
  };

  const deleteHabit = habitId => {
    menuFor = null;
    saveHabits(habits.filter(habit => habit.id !== habitId));
  };

  // ── Renaming a habit ─────────────────────────────────────────────
  // Asked 2026-10-25: "Make it possible to change name of the habit. On mobile
  // in the long press pop up." The name turns into a field in place, already
  // selected: Enter or leaving it saves, Escape keeps the old name. What a name
  // may be is decided in withHabitRenamed (habitStore.js) -- an empty one is
  // refused rather than taking the habit's history with it.
  let renamingId = null;
  let renameDraft = "";

  function startRename(habit) {
    menuFor = null;
    renamingId = habit.id;
    renameDraft = habit.name;
  }

  function commitRename() {
    if (renamingId === null) return;
    const id = renamingId;
    renamingId = null;
    saveHabits(withHabitRenamed(habits, id, renameDraft));
  }

  function cancelRename() {
    renamingId = null;
  }

  function renameKey(event) {
    if (event.key === "Enter") { event.preventDefault(); commitRename(); }
    else if (event.key === "Escape") { event.preventDefault(); cancelRename(); }
  }

  // Focused and selected as it appears, so typing replaces the old name.
  function focusAndSelect(node) {
    node.focus();
    node.select();
  }

  // ── Holding a habit down, and moving it ─────────────────────────
  // Asked for: "on mobile the thing to close the habit should probably be a
  // pop-up, like after a long press on the line of our habit — so that you can
  // remove the delete button that shows itself at all time." And on 2026-10-26,
  // drag to reorder, with Task mode's drop line.
  //
  // Both are the shared gestures in utils/listReorder.js, the ones Task mode
  // uses: on a phone, hold a habit to pick it up and slide it, or hold and let
  // go without moving for its menu; on a computer, drag it by its handle. The
  // click that ends a hold is swallowed there, so it does not also mark a day.
  let menuFor = null;
  let draggingId = null;
  let dropLine = null;

  const reorder = createListReorder({
    listOf: () => document.querySelector(".habit-grid"),
    itemsIn: list => [...list.querySelectorAll(":scope > .habit-row")],
    idOf: element => element.dataset.habitId,
    onPick: id => { draggingId = id; },
    onLine: line => { dropLine = line ? { y: line.y } : null; },
    onDrop: (id, groupIds, slot) => {
      const group = groupIds.map(gid => habits.find(h => h.id === gid)).filter(Boolean);
      const next = moveToSlot(habits, id, group, slot);
      if (next !== habits) saveHabits(next);
    },
    onHeld: id => { menuFor = id; }
  });

  /** The click that follows a long press, eaten before it marks a day. */
  const guardClick = event => reorder.swallowClick(event);

  onDestroy(() => reorder.destroy());

  // ── A habit's page ──────────────────────────────────────────────
  // Agreed 2026-10-26 (item 11): tap a habit's name to look back over it --
  // components/HabitPage.svelte. On a computer a double-click on the name
  // still renames it, so a single click waits a moment to be sure it is not
  // the first half of one.
  let pageFor = null;
  let nameClickTimer = null;
  $: pageHabit = pageFor ? habits.find(habit => habit.id === pageFor) : null;

  function nameClick(habit, event) {
    if (guardClick(event)) return;
    clearTimeout(nameClickTimer);
    if (compact) { pageFor = habit.id; return; }
    nameClickTimer = setTimeout(() => { pageFor = habit.id; }, 260);
  }

  function nameDoubleClick(habit) {
    clearTimeout(nameClickTimer);
    startRename(habit);
  }

  onDestroy(() => clearTimeout(nameClickTimer));

  // ── When a habit is meant to be done ────────────────────────────
  // Agreed 2026-10-26: "Habits that aren't daily: '3 times a week' or
  // 'Mon/Wed/Fri'. Days it isn't due show as rest days, not ✕, and don't break
  // the streak." Set in the habit's menu; stored and read in
  // utils/habitSchedule.js, counted in utils/habitStreaks.js.
  const weekdayLetter = day =>
    new Date(2026, 9, 26 + ((day + 6) % 7)).toLocaleDateString(undefined, { weekday: "narrow" });
  const weekdayName = day =>
    new Date(2026, 9, 26 + ((day + 6) % 7)).toLocaleDateString(undefined, { weekday: "long" });

  function setSchedule(habitId, schedule) {
    saveHabits(withScheduleSet(habits, habitId, schedule));
  }

  function toggleWeekday(habit, day) {
    const current = normalizeSchedule(habit.schedule);
    const chosen = current?.kind === "days" ? current.days : [];
    const next = chosen.includes(day) ? chosen.filter(d => d !== day) : [...chosen, day];
    setSchedule(habit.id, next.length ? { kind: "days", days: next } : undefined);
  }

  // The first press, from any other schedule, starts at 3 a week -- the
  // example the request gave -- rather than stepping from 7, where + did
  // nothing and − gave 6.
  function stepTimes(habit, by) {
    const current = normalizeSchedule(habit.schedule);
    if (current?.kind !== "weekly") return setSchedule(habit.id, { kind: "weekly", times: 3 });
    const next = Math.max(1, Math.min(7, current.times + by));
    setSchedule(habit.id, next >= 7 ? undefined : { kind: "weekly", times: next });
  }

  // Streaks, worked out from each habit's days whenever they change -- see
  // utils/habitStreaks.js. A value rather than a call in the template, so the
  // row redraws when a day is ticked (test/templateReactivity.test.js).
  $: streaks = Object.fromEntries(habits.map(habit => [habit.id, habitStreaks(habit, { today })]));

  // Nothing, then ✓, then ✕, then nothing -- worked out in utils/habitStore.js,
  // in the same terms the folder stores. It used to write "none" for the last
  // step, which the store read as a tick, so a day could never be cleared.
  const toggleDay = (habitId, dayKey) => {
    saveHabits(withDayTapped(habits, habitId, dayKey));
  };

  onMount(() => {
    // Nothing is loaded here any more. The habits arrive as a prop from the
    // folder, so opening a folder on any device shows the same list.
    //
    // Which days are on screen follows the window, and the window changes
    // without anybody touching the tracker: rotated, resized, or shrunk by a
    // keyboard sliding up.
    const noteWidth = () => { viewportWidth = window.innerWidth; };
    noteWidth();
    window.addEventListener("resize", noteWidth);
    window.addEventListener("orientationchange", noteWidth);
    return () => {
      window.removeEventListener("resize", noteWidth);
      window.removeEventListener("orientationchange", noteWidth);
    };
  });
</script>

<style>
  .habit-tracker {
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 30px;
    width: 100%;
    height: calc(100dvh - var(--controls-height, 56px));
    overflow-y: auto;
    background: var(--canvas-inner-bg, #000000);
    color: var(--mode-text-color, #ffffff);
    font-family: var(--block-body-font, inherit);
  }

  .habit-header {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .habit-header h2 {
    font-size: 1.6rem;
    margin: 0;
    font-family: var(--block-header-font, inherit);
    letter-spacing: var(--block-header-letter-spacing, 0.04em);
    text-transform: var(--block-header-transform, uppercase);
  }

  .habit-header p {
    margin: 0;
    opacity: 0.8;
  }

  .habit-form {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  .habit-form input {
    flex: 1 1 240px;
    min-width: 200px;
    padding: 10px 12px;
    border-radius: var(--block-control-radius, 8px);
    border: var(--block-border-width, 1px) solid var(--block-border-color, var(--app-border, color-mix(in srgb, var(--mode-text-color, #ffffff) 20%, transparent)));
    background: var(--block-header-bg, var(--app-surface, color-mix(in srgb, var(--mode-text-color, #ffffff) 8%, transparent)));
    color: inherit;
  }

  .habit-form button {
    padding: 10px 16px;
    border-radius: var(--block-control-radius, 8px);
    border: var(--block-border-width, 1px) solid var(--block-border-color, var(--app-border, color-mix(in srgb, var(--mode-text-color, #ffffff) 20%, transparent)));
    background: var(--block-media-button-bg, color-mix(in srgb, var(--mode-text-color, #ffffff) 12%, transparent));
    color: inherit;
    cursor: pointer;
  }

  .habit-grid {
    display: grid;
    gap: 12px;
    /* The drop line is placed from the top of the list. */
    position: relative;
  }

  .habit-row.dragging {
    opacity: 0.55;
  }

  .habit-row .drag-handle {
    align-self: stretch;
    font-size: 1rem;
    letter-spacing: -0.2em;
  }

  /* Days in a row, under the name -- utils/habitStreaks.js. */
  .habit-streak {
    font-size: 0.85rem;
    opacity: 0.85;
    white-space: nowrap;
  }

  .habit-streak.quiet {
    opacity: 0.6;
  }

  .habit-schedule {
    font-size: 0.75rem;
    opacity: 0.65;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* A day the habit is not meant for: there, and tappable -- a habit done on a
     rest day counts -- but faint, so it does not read as one left undone. */
  .day-button.rest:not(.done) {
    opacity: 0.4;
    border-style: dashed;
  }

  /* Skipped: neither done nor missed. Outlined like an empty day, dashed,
     with its dash. */
  .day-button.skipped {
    background: transparent;
    border-style: dashed;
    opacity: 0.75;
  }

  /* The schedule, inside the habit's menu. Choices are the menu's own buttons
     in the writing's colour; the chosen one is filled with it. */
  .habit-schedule-editor {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 4px 2px;
  }

  .schedule-label {
    font-size: 0.72rem;
    opacity: 0.7;
    padding: 2px 6px 0;
  }

  .schedule-choice,
  .weekday,
  .times-step {
    border-radius: var(--block-control-radius, 8px);
    border: 1px solid color-mix(in srgb, var(--mode-text-color, currentColor) 25%, transparent);
    background: color-mix(in srgb, var(--mode-text-color, currentColor) 8%, transparent);
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .schedule-choice {
    min-height: 36px;
    text-align: left;
    padding: 0 10px;
  }

  .schedule-choice.chosen,
  .weekday.chosen {
    background: var(--mode-text-color, currentColor);
    color: var(--canvas-inner-bg, #000000);
  }

  .weekday-row {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 4px;
  }

  .weekday {
    min-height: 34px;
    padding: 0;
  }

  .times-row {
    display: grid;
    grid-template-columns: 36px 1fr 36px;
    align-items: center;
    gap: 6px;
    text-align: center;
    border-radius: var(--block-control-radius, 8px);
  }

  .times-row.chosen {
    outline: 1px solid var(--mode-text-color, currentColor);
  }

  .times-step {
    min-height: 34px;
    font-size: 1.1rem;
  }

  .habit-row {
    border-radius: var(--block-border-radius, 16px);
    padding: 12px 14px;
    border: var(--block-border-width, 1px) solid var(--block-border-color, color-mix(in srgb, var(--mode-text-color, #ffffff) 12%, transparent));
    background: var(--block-header-bg, color-mix(in srgb, var(--mode-text-color, #ffffff) 6%, transparent));
    box-shadow: var(--block-shadow, none);
    display: grid;
    /* The handle, the name, the days, the buttons. */
    grid-template-columns: auto minmax(140px, 200px) 1fr auto;
    gap: 12px;
    align-items: center;
  }

  .habit-name {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .habit-name strong {
    font-size: 1.05rem;
  }

  /* The name opens the habit's page. */
  .habit-title {
    cursor: pointer;
  }

  .habit-title:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .calendar {
    display: grid;
    /* The past days share the width evenly and today, the last square, gets
       half as much again. Agreed 2026-10-26: "today stands out -- a bigger
       square for today, the past days smaller", because most visits are to
       tick today. --past-days is set on the element from how many are shown. */
    grid-template-columns: repeat(var(--past-days, 6), minmax(0, 1fr)) minmax(0, 1.5fr);
    gap: 6px;
  }

  .calendar-header {
    font-size: 0.8rem;
    opacity: 0.75;
    text-align: center;
  }

  .day-button {
    border-radius: var(--block-control-radius, 10px);
    padding: 6px 4px;
    border: var(--block-border-width, 1px) solid var(--block-border-color, color-mix(in srgb, var(--mode-text-color, #ffffff) 15%, transparent));
    background: var(--block-media-button-bg, color-mix(in srgb, var(--mode-text-color, #ffffff) 7%, transparent));
    color: inherit;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    cursor: pointer;
  }

  .day-button.done {
    background: var(--block-accent-color, color-mix(in srgb, var(--mode-text-color, #ffffff) 28%, transparent));
    border-color: var(--block-accent-color, color-mix(in srgb, var(--mode-text-color, #ffffff) 55%, transparent));
    color: var(--block-accent-text, var(--canvas-inner-bg, #000000));
  }

  .day-button.missed {
    background: transparent;
    border-color: var(--block-focus-outline, color-mix(in srgb, var(--mode-text-color, #ffffff) 45%, transparent));
    color: var(--block-focus-outline, var(--mode-text-color, #ffffff));
  }

  .day-status {
    font-size: 1.1rem;
    font-weight: 600;
  }

  /* Today: found at a glance, and the easiest square to hit. */
  .day-button.is-today {
    border-width: 2px;
    border-color: var(--block-focus-outline, color-mix(in srgb, var(--mode-text-color, #ffffff) 60%, transparent));
    font-weight: 700;
  }

  .day-button.is-today .day-status {
    font-size: 1.35rem;
  }

  /* ── A phone ────────────────────────────────────────────────────
     Asked for: "one habit just takes around the height of two lines, and the
     days to press are small enough to see the last 7 days -- right now it's
     not workable."

     It was not workable because the row was laid out as three columns, the
     first of them 160px wide at minimum, on a screen 390px across. The days
     were then asked for 70px each and there are seven of them, so they wrapped
     into four or five rows, and one habit filled most of the screen.

     So on a phone the row is two lines: the name on the first, the week on the
     second. Seven days share the full width instead of queueing for what is
     left of it, and each square carries its letter and its number and nothing
     else -- the tick is the square's own colour, which it already was. */
  @media (max-width: 1024px) {
    .habit-tracker {
      gap: 12px;
      padding: 14px;
    }

    .habit-header h2 {
      font-size: 1.25rem;
    }

    /* Only the flame and the number fit beside a week on a phone. */
    .habit-streak {
      font-size: 0.7rem;
    }

    .habit-streak .streak-words,
    .habit-streak.quiet {
      display: none;
    }

    .habit-schedule {
      font-size: 0.62rem;
    }

    .habit-grid {
      gap: 8px;
    }

    /* The box and its button on one line. Wrapped, they cost about seventy
       pixels of a screen the habits themselves are meant to be filling. */
    .habit-form {
      flex-wrap: nowrap;
      gap: 8px;
    }

    .habit-form input {
      flex: 1 1 auto;
      min-width: 0;
      padding: 8px 10px;
    }

    .habit-form button {
      flex: 0 0 auto;
      padding: 8px 12px;
      white-space: nowrap;
    }

    .habit-row {
      /* Everything on one line. Stacking the week under the name was the first
         try and measured 89px — nearly four lines — because the Delete button
         made the name's line 32px tall on its own. Side by side, the tallest
         thing in the row is a day square and the row is the height of one. */
      grid-template-columns: minmax(48px, 72px) minmax(0, 1fr) auto;
      grid-template-areas: "name calendar actions";
      gap: 6px;
      padding: 5px 6px;
      align-items: center;
    }

    .habit-name { grid-area: name; }
    .habit-actions { grid-area: actions; }
    .calendar { grid-area: calendar; }

    .habit-name strong {
      font-size: 0.85rem;
      line-height: 1.2;
      /* A long habit name shortens rather than pushing the week off the edge. */
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .calendar {
      /* Never wrapping: the columns are fixed by the rule above (the past
         days, then today wider), not handed out by auto-fit, which is what made
         them wrap onto a second line. */
      gap: 3px;
    }

    .day-button {
      padding: 3px 0;
      gap: 0;
      min-width: 0;
      line-height: 1.15;
    }

    .calendar-header {
      font-size: 0.62rem;
      opacity: 0.7;
    }

    /* The status glyph is dropped: with the square already coloured for done
       and outlined for missed, it was a third line saying what the colour
       said, and the third line is most of the height. */
    .day-status {
      display: none;
    }

    .day-button span:not(.calendar-header) {
      font-size: 0.78rem;
      font-weight: 600;
    }

    /* Dropping the glyph left "missed" with nothing to read it by: it inherits
       a colour meant for an outline, which on a dark theme came out as an empty
       black square — emptier-looking than a day nobody has touched, which is
       the opposite of what it means. So at this size it says so with its own
       border and a struck-through number, neither of which costs any height. */
    .day-button.missed {
      border-color: color-mix(in srgb, var(--mode-text-color, #ffffff) 55%, transparent);
      color: inherit;
      opacity: 0.8;
    }

    .day-button.missed span:not(.calendar-header) {
      text-decoration: line-through;
    }


    /* A cross rather than the word, because the word is wider than the name
       column it would be taking the space from. */
    .habit-actions button {
      padding: 0;
      width: 24px;
      height: 24px;
      font-size: 0.95rem;
      line-height: 1;
      display: grid;
      place-items: center;
    }
  }

  .habit-actions button {
    border-radius: var(--block-control-radius, 10px);
    padding: 8px 12px;
    border: var(--block-border-width, 1px) solid var(--block-border-color, color-mix(in srgb, var(--mode-text-color, #ffffff) 18%, transparent));
    background: var(--block-media-button-bg, color-mix(in srgb, var(--mode-text-color, #ffffff) 10%, transparent));
    color: inherit;
    cursor: pointer;
  }

  /* The menu a long press opens. Anchored to its own row rather than floating
     in the middle of the screen, so it is obvious which habit is about to go. */
  .habit-row {
    position: relative;
  }

  .habit-row.menu-open {
    /* Says which row the menu belongs to while the backdrop dims everything. */
    border-color: color-mix(in srgb, var(--mode-text-color, #ffffff) 45%, transparent);
  }

  .habit-menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
    background: color-mix(in srgb, var(--canvas-inner-bg, #000000) 45%, transparent);
  }

  .habit-menu {
    position: absolute;
    right: 8px;
    top: calc(100% - 4px);
    z-index: 11;
    /* Wide enough for a week of day buttons a thumb can hit. */
    min-width: 248px;
    padding: 6px;
    border-radius: var(--block-control-radius, 10px);
    border: var(--block-border-width, 1px) solid var(--block-border-color, color-mix(in srgb, var(--mode-text-color, #ffffff) 25%, transparent));
    /* Opaque, because it sits over the row it belongs to. */
    background: var(--canvas-inner-bg, #000000);
    box-shadow: var(--block-shadow, 0 6px 20px rgba(0, 0, 0, 0.45));
    /* Rename above Delete, apart enough not to be hit for each other. */
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .habit-menu-name {
    padding: 4px 8px 6px;
    font-size: 0.75rem;
    opacity: 0.7;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The name, while it is being changed: the row's own writing, in a field
     tinted with that writing's colour, per CLAUDE.md. */
  .habit-rename {
    font: inherit;
    font-size: 1.05rem;
    font-weight: 700;
    color: inherit;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: 2px 6px;
    border-radius: var(--block-control-radius, 6px);
    border: 1px solid color-mix(in srgb, var(--mode-text-color, currentColor) 35%, transparent);
    background: color-mix(in srgb, var(--mode-text-color, currentColor) 10%, transparent);
    outline: none;
  }

  .habit-menu-rename,
  .habit-menu-delete {
    width: 100%;
    /* A thumb-sized target: this one is worth being easy to hit deliberately
       and hard to hit by accident, which is why it is behind a hold. */
    min-height: 40px;
    padding: 0 10px;
    text-align: left;
    border-radius: var(--block-control-radius, 8px);
    border: none;
    background: color-mix(in srgb, var(--mode-text-color, #ffffff) 10%, transparent);
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .empty-state {
    opacity: 0.7;
    padding: 16px;
    border-radius: 12px;
    border-width: var(--block-border-width, 1px);
    border-style: dashed;
    border-color: var(--block-border-color, var(--app-border, color-mix(in srgb, var(--mode-text-color, #ffffff) 20%, transparent)));
  }

  /* Above the wallpaper, which sits at z-index 0 between this mode's own
     background and its content -- see ModeWallpaper.svelte. */
  .habit-tracker > :not(.mode-wallpaper) {
    position: relative;
    z-index: 1;
  }
</style>

<section class="habit-tracker" style={canvasCssVars}>
  <ModeWallpaper settings={backgroundSettings} />
  <div class="habit-header">
    <h2>{modeLabels?.[activeMode] ?? "Habit Tracker"}</h2>
    <p>Tap a day to mark it ✓, again for ✕, again for – (skipped), again to clear. Today is the last square.</p>
  </div>

  <div class="habit-form">
    <input
      type="text"
      placeholder="Add a new habit (e.g. Drink water)"
      bind:value={newHabitName}
      on:keydown={(event) => event.key === "Enter" && addHabit()}
    />
    <button on:click={addHabit}>Add habit</button>
  </div>

  {#if habits.length === 0}
    <div class="empty-state">No habits yet. Add one to start tracking.</div>
  {:else}
    <div class="habit-grid">
      {#if dropLine}
        <div class="drop-line" aria-hidden="true" style="top: {dropLine.y}px"></div>
      {/if}
      {#each habits as habit (habit.id)}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          class="habit-row"
          class:menu-open={menuFor === habit.id}
          class:dragging={draggingId === habit.id}
          data-habit-id={habit.id}
          on:pointerdown={event => reorder.itemDown(event, habit.id)}
          on:contextmenu={event => {
            // A right-click is a computer's way to the habit's menu, as a hold
            // is a phone's -- the same as Task mode. On a phone the hold has
            // its own path, so the system's long-press menu is only stopped.
            event.preventDefault();
            if (!compact) menuFor = habit.id;
          }}
        >
          {#if !compact}
            <button
              type="button"
              class="drag-handle"
              aria-label="Move {habit.name}"
              title="Drag to move"
              on:pointerdown={event => reorder.handleDown(event, habit.id)}
            >⋮⋮</button>
          {/if}
          <div class="habit-name" title={habit.name}>
            {#if renamingId === habit.id}
              <!-- Its own touches stay its own: a hold here is selecting text,
                   not asking the row for its menu. -->
              <input
                class="habit-rename"
                aria-label="Habit name"
                maxlength="120"
                bind:value={renameDraft}
                use:focusAndSelect
                on:keydown={renameKey}
                on:blur={commitRename}
                on:pointerdown|stopPropagation
              />
            {:else}
              <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
              <strong
                class="habit-title"
                title="Open {habit.name}"
                on:click={event => nameClick(habit, event)}
                on:dblclick={() => nameDoubleClick(habit)}
              >{habit.name}</strong>
            {/if}
            {#if habit.schedule}
              <span class="habit-schedule">{describeSchedule(habit.schedule)}</span>
            {/if}
            {#if streaks[habit.id]?.current > 0}
              <span class="habit-streak" title="Days in a row{streaks[habit.id].best > streaks[habit.id].current ? `; best ${streaks[habit.id].best}` : ''}">
                🔥 {streaks[habit.id].current}<span class="streak-words">{' '}{streaks[habit.id].current === 1 ? streaks[habit.id].unit.slice(0, -1) : streaks[habit.id].unit}{#if streaks[habit.id].best > streaks[habit.id].current} · best {streaks[habit.id].best}{/if}</span>
              </span>
            {:else if streaks[habit.id]?.best > 0}
              <span class="habit-streak quiet">Best: {streaks[habit.id].best} {streaks[habit.id].best === 1 ? streaks[habit.id].unit.slice(0, -1) : streaks[habit.id].unit}</span>
            {/if}
          </div>
          <div class="calendar" style="--past-days: {Math.max(0, days.length - 1)}">
            {#each days as day}
              <button
                class="day-button {habit.log?.[day.key] ?? 'none'}"
                class:is-today={day.isToday}
                class:rest={!isDue(habit.schedule, day.date)}
                title={isDue(habit.schedule, day.date) ? day.full : `${day.full} -- a rest day`}
                aria-label={day.full}
                on:click={event => { if (!guardClick(event)) toggleDay(habit.id, day.key); }}
              >
                <span class="calendar-header">{day.label}</span>
                <span>{day.number}</span>
                <span class="day-status">
                  {habit.log?.[day.key] === "done"
                    ? "✓"
                    : habit.log?.[day.key] === "missed"
                    ? "✕"
                    : habit.log?.[day.key] === "skipped"
                    ? "–"
                    : "•"}
                </span>
              </button>
            {/each}
          </div>
          {#if !compact}
            <div class="habit-actions">
              <button on:click={() => startRename(habit)}>Rename</button>
              <button on:click={() => deleteHabit(habit.id)}>Delete</button>
            </div>
          {/if}

          {#if menuFor === habit.id}
            <!-- A backdrop rather than a document listener: it dismisses on the
                 first touch anywhere, it cannot be left behind if this row is
                 removed, and it stops that touch reaching whatever was under
                 it — which would otherwise be a day square. -->
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div class="habit-menu-backdrop" on:pointerdown|stopPropagation={() => (menuFor = null)}></div>
            <div class="habit-menu" role="menu">
              <div class="habit-menu-name">{habit.name}</div>
              <button
                type="button"
                role="menuitem"
                class="habit-menu-rename"
                on:pointerdown|stopPropagation
                on:click|stopPropagation={() => { menuFor = null; pageFor = habit.id; }}
              >
                Open habit page
              </button>
              <button
                type="button"
                role="menuitem"
                class="habit-menu-rename"
                on:pointerdown|stopPropagation
                on:click|stopPropagation={() => startRename(habit)}
              >
                Rename habit
              </button>
              <!-- When it is meant to be done. Every change saves at once, as a
                   tap on a day does, and the Undo button takes it back. -->
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <div class="habit-schedule-editor" on:pointerdown|stopPropagation>
                <button
                  type="button"
                  class="schedule-choice"
                  class:chosen={!habit.schedule}
                  on:click|stopPropagation={() => setSchedule(habit.id, undefined)}
                >Every day</button>
                <div class="schedule-label">On these days</div>
                <div class="weekday-row">
                  {#each WEEKDAY_ORDER as day}
                    <button
                      type="button"
                      class="weekday"
                      class:chosen={habit.schedule?.kind === "days" && habit.schedule.days.includes(day)}
                      aria-label={weekdayName(day)}
                      title={weekdayName(day)}
                      on:click|stopPropagation={() => toggleWeekday(habit, day)}
                    >{weekdayLetter(day)}</button>
                  {/each}
                </div>
                <div class="schedule-label">Or so many times a week</div>
                <div class="times-row" class:chosen={habit.schedule?.kind === "weekly"}>
                  <button type="button" class="times-step" aria-label="Fewer" on:click|stopPropagation={() => stepTimes(habit, -1)}>−</button>
                  <span>{habit.schedule?.kind === "weekly" ? `${habit.schedule.times}× a week` : "Off"}</span>
                  <button type="button" class="times-step" aria-label="More" on:click|stopPropagation={() => stepTimes(habit, 1)}>+</button>
                </div>
              </div>
              <button
                type="button"
                role="menuitem"
                class="habit-menu-delete"
                on:pointerdown|stopPropagation
                on:click|stopPropagation={() => deleteHabit(habit.id)}
              >
                Delete habit
              </button>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
  {#if pageHabit}
    <HabitPage
      habit={pageHabit}
      {today}
      on:tap={event => toggleDay(pageHabit.id, event.detail)}
      on:close={() => (pageFor = null)}
    />
  {/if}
</section>
