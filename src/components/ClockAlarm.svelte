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

<div class="clock-alarm" class:ringing={status.state === 'ringing'}>
  {#if page === 'alarm'}
    <div class="alarm-page" data-focus-guard>
      <input
        class="alarm-time"
        type="time"
        value={normalTime}
        aria-label="Alarm time"
        on:change={onTimeChange}
      />
      <div class="alarm-row">
        <button
          class="alarm-switch"
          class:on={alarmEnabled && normalTime}
          role="switch"
          aria-checked={alarmEnabled && !!normalTime}
          aria-label="Alarm on"
          disabled={!normalTime}
          on:click={toggleEnabled}
        ><span class="knob"></span></button>
        <span class="alarm-status">{status.text}</span>
      </div>
      {#if status.state === 'ringing'}
        <div class="alarm-row">
          <button class="alarm-action" on:click={snooze}>Snooze</button>
          <button class="alarm-action primary" on:click={stop}>Stop</button>
        </div>
      {:else if status.state === 'snoozed'}
        <div class="alarm-row">
          <button class="alarm-action" on:click={stop}>Stop</button>
        </div>
      {/if}
    </div>
  {:else if page === 'stopwatch'}
    <div class="alarm-page" data-focus-guard>
      <div class="watch-reading" role="timer" aria-label="Stopwatch">{stopwatchReading(counted)}</div>
      <div class="alarm-row">
        {#if watchRunning}
          <button class="alarm-action" on:click={() => changeWatch(lapped)}>Lap</button>
          <button class="alarm-action primary" on:click={() => changeWatch(paused)}>Pause</button>
        {:else if counted > 0}
          <button class="alarm-action" on:click={() => changeWatch(reset)}>Reset</button>
          <button class="alarm-action primary" on:click={() => changeWatch(started)}>Resume</button>
        {:else}
          <button class="alarm-action primary" on:click={() => changeWatch(started)}>Start</button>
        {/if}
      </div>
      {#each laps as lap (lap.number)}
        <div class="watch-lap">
          <span>Lap {lap.number}</span>
          <span>{stopwatchReading(lap.split)}</span>
        </div>
      {/each}
    </div>
  {:else if page === 'timer'}
    <div class="alarm-page" class:timer-rung={timerPhase === 'ringing'} data-focus-guard>
      {#if timerPhase === 'idle'}
        <!-- The reading is where its length is typed: "5" is five minutes,
             "1:30" a minute and a half. Keyed on the length so a change from
             elsewhere redraws it rather than leaving the old text in place. -->
        {#key countdown.duration}
          <input
            class="watch-reading timer-input"
            type="text"
            inputmode="numeric"
            value={timerReading(countdown.duration)}
            aria-label="Timer length"
            on:change={onDurationChange}
            on:keydown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          />
        {/key}
      {:else}
        <div class="watch-reading" role="timer" aria-label="Timer">{timerReading(left)}</div>
      {/if}
      <div class="alarm-row">
        {#if timerPhase === 'running'}
          <button class="alarm-action" on:click={() => changeTimer(resetTimer)}>Reset</button>
          <button class="alarm-action primary" on:click={() => changeTimer(pauseTimer)}>Pause</button>
        {:else if timerPhase === 'paused'}
          <button class="alarm-action" on:click={() => changeTimer(resetTimer)}>Reset</button>
          <button class="alarm-action primary" on:click={() => changeTimer(startTimer)}>Resume</button>
        {:else if timerPhase === 'ringing'}
          <button class="alarm-action" on:click={() => changeTimer(oneMoreMinute)}>+1 min</button>
          <button class="alarm-action primary" on:click={() => changeTimer(resetTimer)}>Stop</button>
        {:else if timerPhase === 'done'}
          <span class="alarm-status">Done</span>
          <button class="alarm-action primary" on:click={() => changeTimer(resetTimer)}>Reset</button>
        {:else}
          <button class="alarm-action primary" on:click={() => changeTimer(startTimer)}>Start</button>
        {/if}
      </div>
    </div>
  {:else}
    <ClockFace {hour12} {showSeconds} {showDate} />
  {/if}

  <!-- Bottom left is the timer. -->
  <button
    class="clock-corner bottom-left"
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
      <svg class="bell" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      {#if countdownCorner.kind === 'timer'}<span>{countdownCorner.text}</span>{/if}
    {/if}
  </button>

  <!-- Each corner holds its own page's news, and the time while its own page
       is open. Top left is the stopwatch. -->
  <button
    class="clock-corner left"
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
      <svg class="bell" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="13.5" r="7" fill="none" stroke="currentColor" stroke-width="1.8"/>
        <path d="M12 13.5V10M10 3h4M12 3v3.5M18 7.5l1.5-1.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
      {#if watchCorner.kind === 'stopwatch'}<span>{watchCorner.text}</span>{/if}
    {/if}
  </button>

  <!-- Top right is the alarm. -->
  <button
    class="clock-corner right"
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
      <svg class="bell" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3a6 6 0 0 0-6 6v3.5L4.5 15v1.5h15V15L18 12.5V9a6 6 0 0 0-6-6Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        <path d="M10 19a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
      {#if corner.kind === 'alarm'}<span>{corner.text}</span>{/if}
    {/if}
  </button>
</div>

<style>
  .clock-alarm {
    position: relative;
    width: 100%;
    height: 100%;
    color: inherit;
  }

  /* Laid out below the corners rather than beside them. Centred in the whole
     block, the figure shared a line with both corners and missed them by a
     few pixels -- which a 12-hour time or an hour-long run would close. */
  .alarm-page {
    container-type: size;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    padding-top: 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    overflow: hidden;
  }

  /* A small block keeps the last lap only, and a very small one none: a
     figure and its buttons are the stopwatch, laps are extra. */
  @container (max-height: 110px) {
    .watch-lap + .watch-lap {
      display: none;
    }
  }

  @container (max-height: 80px) {
    .watch-lap {
      display: none;
    }
  }

  /* The time is the page, so it is written as large as the clock's own. */
  .alarm-time {
    font: inherit;
    font-size: min(30cqmin, 17cqi);
    font-weight: 300;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    color: inherit;
    background: transparent;
    border: none;
    border-bottom: 1px solid color-mix(in srgb, currentColor 25%, transparent);
    padding: 0 0.1em;
    text-align: center;
    color-scheme: light dark;
    max-width: 100%;
  }

  .alarm-time:focus {
    outline: none;
    border-bottom-color: currentColor;
  }

  .alarm-row {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: min(10cqmin, 0.85rem);
  }

  .alarm-status {
    opacity: 0.75;
    white-space: nowrap;
  }

  /* A switch drawn from the block's own writing colour: the groove is the text
     colour at a fifth, the knob is the text colour -- the theme rule's pairing. */
  .alarm-switch {
    position: relative;
    width: 34px;
    height: 18px;
    padding: 0;
    border: none;
    border-radius: 9px;
    background: color-mix(in srgb, currentColor 20%, transparent);
    color: inherit;
    cursor: pointer;
    flex: none;
  }

  .alarm-switch.on {
    background: color-mix(in srgb, currentColor 55%, transparent);
  }

  .alarm-switch:disabled {
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

  .alarm-switch.on .knob {
    transform: translateX(16px);
  }

  .alarm-action {
    font: inherit;
    color: inherit;
    background: color-mix(in srgb, currentColor 12%, transparent);
    border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
    border-radius: 999px;
    padding: 3px 12px;
    cursor: pointer;
  }

  .alarm-action.primary {
    background: color-mix(in srgb, currentColor 28%, transparent);
  }

  /* The stopwatch figure, as large as the alarm's time and in the same
     numerals as the clock, so the three pages read as one block. */
  .watch-reading {
    font-size: min(24cqmin, 13cqi);
    font-weight: 300;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    white-space: nowrap;
  }

  .watch-lap {
    display: flex;
    gap: 14px;
    font-size: min(9cqmin, 0.78rem);
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
    opacity: 0.7;
  }

  /* The corners: small, and quiet until they have something to say. */
  .clock-corner {
    position: absolute;
    top: 4px;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 2px 6px;
    border: none;
    border-radius: 999px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    opacity: 0.55;
    cursor: pointer;
    z-index: 1;
  }

  .clock-corner.left {
    left: 6px;
  }

  .clock-corner.right {
    right: 6px;
  }

  .clock-corner.bottom-left {
    top: auto;
    bottom: 4px;
    left: 6px;
  }

  /* The length is typed into the reading itself, so it looks like the
     reading until it is being typed in. */
  .timer-input {
    font-family: inherit;
    color: inherit;
    background: transparent;
    border: none;
    border-bottom: 1px solid color-mix(in srgb, currentColor 25%, transparent);
    padding: 0 0.1em;
    text-align: center;
    width: 5.5em;
    max-width: 100%;
  }

  .timer-input:focus {
    outline: none;
    border-bottom-color: currentColor;
  }

  .timer-rung .watch-reading,
  .clock-corner.rung {
    animation: ring-pulse 1s ease-in-out infinite;
  }

  .clock-corner:hover,
  .clock-corner:focus-visible {
    opacity: 1;
    background: color-mix(in srgb, currentColor 12%, transparent);
  }

  .clock-corner.active {
    opacity: 0.9;
  }

  .bell {
    width: 1.15em;
    height: 1.15em;
  }

  .ringing .clock-corner.right {
    animation: ring-pulse 1s ease-in-out infinite;
  }

  @keyframes ring-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.35; }
  }
</style>
