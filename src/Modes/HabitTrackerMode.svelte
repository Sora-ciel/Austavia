<script>
  import { onMount } from "svelte";
  // The shared one, rather than the copy that used to live here: that copy did
  // not understand 4- or 8-digit hex, so a theme using either fell through to
  // light text and could put it on a light background.
  import { getReadableTextColor } from "../utils/readableColor.js";
  import { recentDays, daysToShow } from "../utils/habitDays.js";

  export let modeLabels = {};
  export let activeMode = "default";
  export let canvasColors = {};

  const STORAGE_KEY = "habitTrackerData";

  let habits = [];
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
    habits = updatedHabits;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(habits));
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
    saveHabits(habits.filter(habit => habit.id !== habitId));
  };

  const toggleDay = (habitId, dayKey) => {
    const updated = habits.map(habit => {
      if (habit.id !== habitId) return habit;
      const current = habit.log?.[dayKey] || "none";
      const next =
        current === "none" ? "done" : current === "done" ? "missed" : "none";
      return {
        ...habit,
        log: { ...habit.log, [dayKey]: next }
      };
    });
    saveHabits(updated);
  };

  onMount(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          habits = parsed;
        }
      } catch {
        habits = [];
      }
    }
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
  }

  .habit-row {
    border-radius: var(--block-border-radius, 16px);
    padding: 12px 14px;
    border: var(--block-border-width, 1px) solid var(--block-border-color, color-mix(in srgb, var(--mode-text-color, #ffffff) 12%, transparent));
    background: var(--block-header-bg, color-mix(in srgb, var(--mode-text-color, #ffffff) 6%, transparent));
    box-shadow: var(--block-shadow, none);
    display: grid;
    grid-template-columns: minmax(140px, 200px) 1fr auto;
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

  .calendar {
    display: grid;
    /* 56 rather than 70: a fortnight of 70px squares does not fit beside the
       name on a normal window, so the row wrapped onto a second line of
       squares and one habit came out 264px tall. */
    grid-template-columns: repeat(auto-fit, minmax(56px, 1fr));
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

    /* The standing instruction is the same for every habit and is only worth
       one sentence at the top; repeating it under each one was a whole line
       per habit. */
    .habit-name span {
      display: none;
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
      /* Seven equal columns, never wrapping. auto-fit with a minimum is what
         made them wrap -- it hands out as many columns as fit and pushes the
         rest onto another line, which is the opposite of what a week wants. */
      grid-template-columns: repeat(7, minmax(0, 1fr));
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

    /* Today is worth finding at a glance, now that it is the last square
       rather than the first. */
    .day-button.is-today {
      border-color: var(--block-focus-outline, color-mix(in srgb, var(--mode-text-color, #ffffff) 55%, transparent));
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

  .empty-state {
    opacity: 0.7;
    padding: 16px;
    border-radius: 12px;
    border-width: var(--block-border-width, 1px);
    border-style: dashed;
    border-color: var(--block-border-color, var(--app-border, color-mix(in srgb, var(--mode-text-color, #ffffff) 20%, transparent)));
  }
</style>

<section class="habit-tracker" style={canvasCssVars}>
  <div class="habit-header">
    <h2>{modeLabels?.[activeMode] ?? "Habit Tracker"}</h2>
    <p>Tap a day to mark it ✓, again for ✕, again to clear. Today is the last square.</p>
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
      {#each habits as habit}
        <div class="habit-row">
          <div class="habit-name" title={habit.name}>
            <strong>{habit.name}</strong>
            <span>Tap a day to mark ✓ or ✕.</span>
          </div>
          <div class="calendar">
            {#each days as day}
              <button
                class="day-button {habit.log?.[day.key] ?? 'none'}"
                class:is-today={day.isToday}
                title={day.full}
                aria-label={day.full}
                on:click={() => toggleDay(habit.id, day.key)}
              >
                <span class="calendar-header">{day.label}</span>
                <span>{day.number}</span>
                <span class="day-status">
                  {habit.log?.[day.key] === "done"
                    ? "✓"
                    : habit.log?.[day.key] === "missed"
                    ? "✕"
                    : "•"}
                </span>
              </button>
            {/each}
          </div>
          <div class="habit-actions">
            <button on:click={() => deleteHabit(habit.id)} title="Delete habit" aria-label="Delete habit">{compact ? "×" : "Delete"}</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>
