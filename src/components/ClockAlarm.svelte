<script>
  /**
   * The clock block's body: a clock page, and an alarm, a stopwatch and a
   * timer page, each with a corner of its own.
   *
   * Asked for on 2026-09-27 -- "a block that does both, and which one is open
   * is an on-device save. On the alarm page the clock still shows small in a
   * corner, and on the clock page one click puts it in alarm mode, and an
   * active alarm shows in that same corner." The rules are in utils/alarm.js
   * and tested there in those words; this keeps a timer and draws.
   *
   * The stopwatch followed the same day -- "a chronometer mode that will be on
   * the other corner to click on" -- so the alarm has the top-right corner and
   * the stopwatch the top-left. Each corner shows its own page's news, and on
   * its own page shows the time and leads back to the clock. Its rules are in
   * utils/stopwatch.js.
   *
   * Then the timer -- "on the bottom left corner probably" -- by the same rule,
   * with its rules in utils/countdown.js.
   *
   * Frameless, like ClockFace, so Canvas can wrap it in BlockShell and Simple
   * Note can lay it out itself. The alarm's time and switch are the block's and
   * are saved by whoever holds it, through the `alarm` event. The page, what
   * was done about a ring, the stopwatch and the timer are this device's --
   * clockDeviceStore.js.
   */
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import ClockFace from './ClockFace.svelte';
  import { clockParts, msUntilNextTick } from '../utils/clockFace.js';
  import {
    normalizeAlarmTime,
    alarmStatus,
    cornerReading,
    msUntilAlarmCheck,
    dismissed,
    snoozed
  } from '../utils/alarm.js';
  import {
    elapsed,
    isRunning,
    started,
    paused,
    lapped,
    reset,
    lapRows,
    stopwatchReading,
    msUntilStopwatchChange,
    stopwatchCorner
  } from '../utils/stopwatch.js';
  import {
    timerState,
    timeLeft,
    startTimer,
    pauseTimer,
    resetTimer,
    setDuration,
    oneMoreMinute,
    parseDuration,
    timerReading,
    msUntilTimerChange,
    timerCorner
  } from '../utils/countdown.js';
  import { clockDevices, clockDevice, peekClockDevice, setClockDevice } from '../utils/clockDeviceStore.js';

  export let blockId;
  export let hour12 = false;
  export let showSeconds = false;
  export let showDate = true;
  export let alarmTime = '';
  export let alarmEnabled = false;
  /** Called before anything in the body acts -- the canvas uses it to focus the block. */
  export let beforeAct = () => {};

  const dispatch = createEventDispatcher();

  // Brought into the store once, here, rather than inside a reactive
  // statement: bringing it in updates the store, and a store updated by the
  // statement reading it runs that statement again.
  clockDevice(blockId);
  $: device = peekClockDevice(blockId, $clockDevices);
  $: page = device.page;

  let now = Date.now();
  let wake = null;
  let mounted = false;

  $: normalTime = normalizeAlarmTime(alarmTime);
  $: small = clockParts({ at: now, hour12 });
  $: clockTime = small.period ? `${small.time} ${small.period}` : small.time;
  $: corner = cornerReading({ page, time: normalTime, enabled: alarmEnabled, hour12, clockTime });
  $: watch = device.stopwatch;
  $: watchCorner = stopwatchCorner({ page, stopwatch: watch, now, clockTime });
  $: watchRunning = isRunning(watch);
  $: counted = elapsed(watch, now);
  // The last two laps: a block is small, and a list long enough to scroll
  // would bring a scroll inside a block with it.
  $: laps = lapRows(watch).slice(0, 2);
  $: countdown = device.timer;
  $: timerPhase = timerState(countdown, now);
  $: left = timeLeft(countdown, now);
  $: countdownCorner = timerCorner({ page, timer: countdown, now, clockTime });
  $: status = alarmStatus({ now, time: normalTime, enabled: alarmEnabled, device, hour12 });

  function schedule() {
    clearTimeout(wake);
    now = Date.now();
    // The soonest of the corner clock's next minute, the alarm's next change
    // and the stopwatch's next figure -- often on its own page, once a second
    // in its corner, never while it is stopped.
    const waits = [
      msUntilNextTick({ now }),
      msUntilAlarmCheck({ now, alarms: [{ time: alarmTime, enabled: alarmEnabled, device }] }),
      msUntilStopwatchChange(device.stopwatch, { now, fine: device.page === 'stopwatch' }),
      msUntilTimerChange(device.timer, now)
    ].filter(wait => wait !== null);
    const wait = Math.min(...waits);
    wake = setTimeout(schedule, wait);
  }

  // Named only: the alarm, and what this device did about it. See ClockFace
  // for why a reactive statement must not name the `wake` it sets.
  $: rescheduleFor(alarmTime, alarmEnabled, device);
  function rescheduleFor() {
    // Just after this update rather than inside it. schedule() sets `now`,
    // and Svelte does not re-run statements above this one for a change made
    // while it is running them -- so a Start pressed here was drawn against
    // the time before it was pressed, a 2-second timer reading 0:03, until
    // the next tick a second later.
    if (mounted) Promise.resolve().then(() => { if (mounted) schedule(); });
  }

  function onVisible() {
    if (document.visibilityState === 'visible') schedule();
  }

  onMount(() => {
    mounted = true;
    schedule();
    document.addEventListener('visibilitychange', onVisible);
  });

  onDestroy(() => {
    // Also stops a reschedule already queued from starting the timer again.
    mounted = false;
    clearTimeout(wake);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisible);
    }
  });

  function showPage(next) {
    beforeAct();
    setClockDevice(blockId, { ...device, page: next });
  }

  function saveAlarm(patch, changedKeys) {
    beforeAct();
    dispatch('alarm', { alarmTime, alarmEnabled, ...patch, changedKeys });
  }

  function onTimeChange(event) {
    const next = normalizeAlarmTime(event.currentTarget.value);
    if (!next) return;
    // Choosing a time is choosing to be woken at it: switch it on too, rather
    // than leave a set time silently off.
    saveAlarm({ alarmTime: next, alarmEnabled: true }, ['alarmTime', 'alarmEnabled']);
  }

  function toggleEnabled() {
    if (!normalTime) return;
    saveAlarm({ alarmEnabled: !alarmEnabled }, ['alarmEnabled']);
  }

  function changeTimer(change) {
    beforeAct();
    setClockDevice(blockId, { ...device, timer: change(device.timer, Date.now()) });
  }

  function onDurationChange(event) {
    const ms = parseDuration(event.currentTarget.value);
    if (ms) {
      changeTimer((current, at) => setDuration(current, ms, at));
    } else {
      // Not a length: put back what it was rather than leave the typo showing.
      event.currentTarget.value = timerReading(device.timer.duration);
    }
  }

  function changeWatch(change) {
    beforeAct();
    setClockDevice(blockId, { ...device, stopwatch: change(device.stopwatch, Date.now()) });
  }

  function stop() {
    beforeAct();
    setClockDevice(blockId, dismissed(device));
  }

  function snooze() {
    beforeAct();
    setClockDevice(blockId, snoozed(device, normalTime));
  }
</script>

<!-- A grid, not a pile of absolutes: a thin band at the top for two corners,
     one at the bottom for the third, and everything else is the stage. The
     stage is what the numerals are sized from, so they fill it and can never
     run under a corner -- the corners are not on top of it, they are beside
     it. -->
<div class="clock-alarm" class:ringing={status.state === 'ringing'}>
  <!-- Each corner holds its own page's news, and the time while its own page
       is open. Top left is the stopwatch. -->
  <button
    class="corner corner-tl"
    class:active={watchCorner.kind === 'stopwatch'}
    data-focus-guard
    title={page === 'stopwatch' ? 'Back to the clock' : 'Stopwatch'}
    aria-label={page === 'stopwatch' ? `Back to the clock, ${watchCorner.text}` : watchCorner.text ? `Stopwatch, ${watchCorner.text}` : 'Stopwatch'}
    on:mousedown|stopPropagation
    on:pointerdown|stopPropagation
    on:touchstart|stopPropagation
    on:click|stopPropagation={() => showPage(page === 'stopwatch' ? 'clock' : 'stopwatch')}
  >
    {#if watchCorner.kind === 'time'}
      <span>{watchCorner.text}</span>
    {:else}
      <svg class="corner-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="13.5" r="7" fill="none" stroke="currentColor" stroke-width="2.2"/>
        <path d="M12 13.5V10M10 3h4M12 3v3.5M18 7.5l1.5-1.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
      </svg>
      {#if watchCorner.kind === 'stopwatch'}<span>{watchCorner.text}</span>{/if}
    {/if}
  </button>

  <!-- Top right is the alarm. -->
  <button
    class="corner corner-tr"
    class:active={corner.kind === 'alarm' || status.state === 'ringing' || status.state === 'snoozed'}
    data-focus-guard
    title={page === 'alarm' ? 'Back to the clock' : 'Alarm'}
    aria-label={page === 'alarm' ? `Back to the clock, ${corner.text}` : corner.text ? `Alarm, ${corner.text}` : 'Alarm'}
    on:mousedown|stopPropagation
    on:pointerdown|stopPropagation
    on:touchstart|stopPropagation
    on:click|stopPropagation={() => showPage(page === 'alarm' ? 'clock' : 'alarm')}
  >
    {#if corner.kind === 'time'}
      <span>{corner.text}</span>
    {:else}
      <svg class="corner-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3a6 6 0 0 0-6 6v3.5L4.5 15v1.5h15V15L18 12.5V9a6 6 0 0 0-6-6Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>
        <path d="M10 19a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
      </svg>
      {#if corner.kind === 'alarm'}<span>{corner.text}</span>{/if}
    {/if}
  </button>

  <div class="stage">
    {#if page === 'alarm'}
      <div class="page" data-focus-guard>
        <input
          class="hero hero-alarm"
          type="time"
          value={normalTime}
          aria-label="Alarm time"
          on:change={onTimeChange}
        />
        <!-- One row whatever the state, so a small block has room for it:
             the switch while it is set, the answers while it rings. -->
        <div class="controls">
          {#if status.state === 'ringing'}
            <button class="action" on:click={snooze}>Snooze</button>
            <button class="action primary" on:click={stop}>Stop</button>
          {:else if status.state === 'snoozed'}
            <span class="status">{status.text}</span>
            <button class="action" on:click={stop}>Stop</button>
          {:else}
            <button
              class="switch"
              class:on={alarmEnabled && normalTime}
              role="switch"
              aria-checked={alarmEnabled && !!normalTime}
              aria-label="Alarm on"
              disabled={!normalTime}
              on:click={toggleEnabled}
            ><span class="knob"></span></button>
            <span class="status">{status.text}</span>
          {/if}
        </div>
      </div>
    {:else if page === 'stopwatch'}
      <div class="page" data-focus-guard>
        <div class="hero hero-stopwatch" role="timer" aria-label="Stopwatch">{stopwatchReading(counted)}</div>
        <div class="controls">
          {#if watchRunning}
            <button class="action" on:click={() => changeWatch(lapped)}>Lap</button>
            <button class="action primary" on:click={() => changeWatch(paused)}>Pause</button>
          {:else if counted > 0}
            <button class="action" on:click={() => changeWatch(reset)}>Reset</button>
            <button class="action primary" on:click={() => changeWatch(started)}>Resume</button>
          {:else}
            <button class="action primary" on:click={() => changeWatch(started)}>Start</button>
          {/if}
        </div>
        {#each laps as lap (lap.number)}
          <div class="lap">
            <span>Lap {lap.number}</span>
            <span>{stopwatchReading(lap.split)}</span>
          </div>
        {/each}
      </div>
    {:else if page === 'timer'}
      <div class="page" class:rung={timerPhase === 'ringing'} data-focus-guard>
        {#if timerPhase === 'idle'}
          <!-- The reading is where its length is typed: "5" is five minutes,
               "1:30" a minute and a half. Keyed on the length so a change from
               elsewhere redraws it rather than leaving the old text in place. -->
          {#key countdown.duration}
            <input
              class="hero hero-timer timer-input"
              type="text"
              inputmode="numeric"
              value={timerReading(countdown.duration)}
              aria-label="Timer length"
              on:change={onDurationChange}
              on:keydown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            />
          {/key}
        {:else}
          <div class="hero hero-timer" role="timer" aria-label="Timer">{timerReading(left)}</div>
        {/if}
        <div class="controls">
          {#if timerPhase === 'running'}
            <button class="action" on:click={() => changeTimer(resetTimer)}>Reset</button>
            <button class="action primary" on:click={() => changeTimer(pauseTimer)}>Pause</button>
          {:else if timerPhase === 'paused'}
            <button class="action" on:click={() => changeTimer(resetTimer)}>Reset</button>
            <button class="action primary" on:click={() => changeTimer(startTimer)}>Resume</button>
          {:else if timerPhase === 'ringing'}
            <button class="action" on:click={() => changeTimer(oneMoreMinute)}>+1 min</button>
            <button class="action primary" on:click={() => changeTimer(resetTimer)}>Stop</button>
          {:else if timerPhase === 'done'}
            <span class="status">Done</span>
            <button class="action primary" on:click={() => changeTimer(resetTimer)}>Reset</button>
          {:else}
            <button class="action primary" on:click={() => changeTimer(startTimer)}>Start</button>
          {/if}
        </div>
      </div>
    {:else}
      <ClockFace {hour12} {showSeconds} {showDate} />
    {/if}
  </div>

  <!-- Bottom left is the timer. -->
  <button
    class="corner corner-bl"
    class:active={countdownCorner.kind === 'timer'}
    class:rung={countdownCorner.ringing}
    data-focus-guard
    title={page === 'timer' ? 'Back to the clock' : 'Timer'}
    aria-label={page === 'timer' ? `Back to the clock, ${countdownCorner.text}` : countdownCorner.text ? `Timer, ${countdownCorner.text}` : 'Timer'}
    on:mousedown|stopPropagation
    on:pointerdown|stopPropagation
    on:touchstart|stopPropagation
    on:click|stopPropagation={() => showPage(page === 'timer' ? 'clock' : 'timer')}
  >
    {#if countdownCorner.kind === 'time'}
      <span>{countdownCorner.text}</span>
    {:else}
      <svg class="corner-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      {#if countdownCorner.kind === 'timer'}<span>{countdownCorner.text}</span>{/if}
    {/if}
  </button>
</div>

<style>
  /* ── Layout ──────────────────────────────────────────────────────────
     Every colour here is the block's own writing colour, or that colour
     mixed into transparency -- the theme rule in CLAUDE.md. The tints are
     named once so the pages agree on them. */
  .clock-alarm {
    --tint-faint: color-mix(in srgb, currentColor 10%, transparent);
    --tint-soft: color-mix(in srgb, currentColor 18%, transparent);
    --tint-strong: color-mix(in srgb, currentColor 34%, transparent);

    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto minmax(0, 1fr) auto;
    grid-template-areas:
      "tl    tr"
      "stage stage"
      "bl    .";
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    padding: 2px 3px;
    color: inherit;
    /* The whole block is a container too, so the corners can be sized from
       it -- see .corner. The stage inside stays its own container for the
       figures. */
    container-type: size;
  }

  .corner-tl { grid-area: tl; justify-self: start; }
  .corner-tr { grid-area: tr; justify-self: end; }
  .corner-bl { grid-area: bl; justify-self: start; }

  /* What every size below is measured against: `cqh` and `cqi` are
     hundredths of the stage's height and width. */
  .stage {
    grid-area: stage;
    container-type: size;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .page {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: min(5cqh, 8px);
  }

  /* ── The hero: the one big figure on each page ──────────────────────
     Sized from whichever of the stage's sides runs out first, so it is as
     large as the block allows without being cut. The width caps differ
     because the figures differ in length. */
  .hero {
    font-family: inherit;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
    line-height: 0.95;
    white-space: nowrap;
    color: inherit;
  }

  .hero-alarm     { font-size: min(52cqh, 24cqi); }  /* 07:30    */
  .hero-timer     { font-size: min(54cqh, 26cqi); }  /* 5:00     */
  .hero-stopwatch { font-size: min(54cqh, 17cqi); }  /* 00:05.37 */

  /* The inputs are the hero, dressed as the hero: a line underneath says
     it can be changed, and nothing else does. */
  input.hero {
    background: transparent;
    border: none;
    border-bottom: 2px solid var(--tint-soft);
    border-radius: 0;
    /* An input's own padding and line box made it half as tall again as
       its writing, which pushed the page off the top of a small stage. */
    box-sizing: content-box;
    height: 1em;
    padding: 0.04em 0.08em;
    line-height: 1;
    text-align: center;
    max-width: 100%;
    color-scheme: light dark;
  }

  input.hero:focus {
    outline: none;
    border-bottom-color: currentColor;
  }

  /* As wide as what is typed, where the browser can do that, so the line
     underneath is as long as the figure. Elsewhere, wide enough for
     "1:02:03", the longest a timer reads. */
  .timer-input {
    width: 4.6em;
  }

  @supports (field-sizing: content) {
    .timer-input {
      field-sizing: content;
      width: auto;
      min-width: 2em;
    }
  }

  /* ── Controls ────────────────────────────────────────────────────── */
  .controls {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: clamp(0.7rem, 12cqh, 1rem);
    font-weight: 600;
  }

  .status {
    opacity: 0.75;
    white-space: nowrap;
  }

  .action {
    font: inherit;
    color: inherit;
    background: var(--tint-faint);
    border: 1.5px solid var(--tint-strong);
    border-radius: 999px;
    padding: 0.15em 0.9em;
    cursor: pointer;
  }

  .action.primary {
    background: var(--tint-strong);
    border-color: transparent;
  }

  /* A switch: the groove is the writing colour tinted, the knob is the
     writing colour itself. */
  .switch {
    position: relative;
    flex: none;
    width: 34px;
    height: 18px;
    padding: 0;
    border: none;
    border-radius: 9px;
    background: var(--tint-soft);
    color: inherit;
    cursor: pointer;
  }

  .switch.on {
    background: color-mix(in srgb, currentColor 60%, transparent);
  }

  .switch:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: currentColor;
    transition: transform 0.15s;
  }

  .switch.on .knob {
    transform: translateX(16px);
  }

  .lap {
    display: flex;
    gap: 14px;
    font-size: clamp(0.65rem, 9cqh, 0.8rem);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 1.15;
    opacity: 0.7;
  }

  /* Laps are extra: a short stage keeps the newest only, a very short one
     none, so the figure and its buttons keep the room. */
  @container (max-height: 120px) {
    .lap + .lap { display: none; }
  }

  @container (max-height: 95px) {
    .lap { display: none; }
  }

  /* ── Corners ─────────────────────────────────────────────────────────
     Small, and quiet until they have something to say. */
  /* Sized from the block, like the figure in the middle. Asked for on
     2026-09-28: the corners "should also get bigger as the block gets bigger,
     like what's written in the middle" -- then "around half smaller", then "20px instead". About a twentieth of the block's shorter
     side, never smaller than they were (so the default block looks as it
     did) and capped, so on a very large block they stay corners rather than
     crowding the stage. Padding and gap are in em so they grow with it. */
  .corner {
    display: inline-flex;
    align-items: center;
    gap: 0.25em;
    padding: 0.1em 0.45em;
    border: none;
    border-radius: 999px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: clamp(0.7rem, 4.5cqmin, 20px);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    opacity: 0.6;
    cursor: pointer;
  }

  .corner:hover,
  .corner:focus-visible {
    opacity: 1;
    background: var(--tint-faint);
  }

  .corner.active {
    opacity: 0.95;
  }

  .corner-icon {
    width: 1.2em;
    height: 1.2em;
  }

  /* ── Ringing ─────────────────────────────────────────────────────── */
  .ringing .corner-tr,
  .corner.rung,
  .page.rung .hero {
    animation: ring-pulse 1s ease-in-out infinite;
  }

  @keyframes ring-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.35; }
  }
</style>
