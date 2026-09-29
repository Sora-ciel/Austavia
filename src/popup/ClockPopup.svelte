<script>
  /**
   * The always-on-top pop-up for one clock block's timer or ringing alarm, in
   * its own small window on the Windows app. What it is for, and why it
   * behaves as it does, is in utils/clockPopups.js.
   *
   * It keeps no state of its own. The timer is read from this device's memory
   * of the block, the same record the block and the main window read, and every
   * button writes to that record -- the other windows hear the write and follow.
   */
  import { onMount, onDestroy } from 'svelte';
  import { clockDevices, clockDevice, peekClockDevice, setClockDevice } from '../utils/clockDeviceStore.js';
  import {
    timerState,
    timeLeft,
    startTimer,
    pauseTimer,
    resetTimer,
    oneMoreMinute,
    timerReading
  } from '../utils/countdown.js';
  import { isRinging, dismissed, snoozed, alarmReading } from '../utils/alarm.js';
  import { timerFractionLeft, HIDDEN_KEY_PREFIX, KEEP_KEY_PREFIX, POSITION_KEY, THEME_KEY } from '../utils/clockPopups.js';
  import { createRinger } from '../utils/ringTone.js';

  const params = new URLSearchParams(location.search);
  const blockId = params.get('block') || '';
  const kind = params.get('kind') === 'alarm' ? 'alarm' : 'timer';
  const label = params.get('label') || '';
  const alarmTime = params.get('time') || '';
  const hour12 = params.get('hour12') === '1';

  let win = null;
  let now = Date.now();
  let tick = null;
  let theme = readTheme();

  clockDevice(blockId);
  $: device = peekClockDevice(blockId, $clockDevices);

  $: phase = timerState(device.timer, now);
  $: left = timeLeft(device.timer, now);
  $: fraction = timerFractionLeft(left, device.timer?.duration);
  $: alarmRinging = kind === 'alarm' && isRinging({ now, time: alarmTime, enabled: true, device });
  $: ringing = kind === 'timer' ? phase === 'ringing' : alarmRinging;

  // Kept open after its own Stop, ready to start again -- see clockPopups.js.
  let kept = readKept();
  $: idle = phase === 'idle' || phase === 'done';

  // Nothing left to show: the timer was stopped or reset in the app, or the
  // alarm was answered. The main window would close it on its next look too;
  // closing here makes it immediate. A kept pop-up stays.
  $: finished = kind === 'timer' ? idle && !kept : !alarmRinging;
  $: if (finished && win) closeWindow();

  function readKept() {
    try { return localStorage.getItem(KEEP_KEY_PREFIX + label) !== null; } catch { return false; }
  }

  // It rings for itself, so it is heard with Austavia minimised. The main
  // window stays quiet for anything a pop-up is ringing.
  const ringer = createRinger();
  $: ringer.set(ringing);

  function readTheme() {
    try {
      return JSON.parse(localStorage.getItem(THEME_KEY) || 'null') || {};
    } catch {
      return {};
    }
  }

  function onStorage(event) {
    if (event.key === THEME_KEY) theme = readTheme();
    if (event.key === KEEP_KEY_PREFIX + label) kept = readKept();
  }

  function change(fn) {
    setClockDevice(blockId, { ...device, timer: fn(device.timer, Date.now()) });
  }

  function togglePause() {
    if (kind !== 'timer') return;
    if (phase === 'running') change(pauseTimer);
    else if (phase === 'paused' || idle) change(idle ? (timer, at) => startTimer(resetTimer(timer), at) : startTimer);
  }

  // Stop sets the timer back to its length and keeps the pop-up, so the same
  // timer can be started again from here. Asked for once it had been tried.
  function stop() {
    if (kind === 'timer') {
      try { localStorage.setItem(KEEP_KEY_PREFIX + label, String(Date.now())); } catch { /* closes instead */ }
      kept = true;
      change(resetTimer);
    } else {
      setClockDevice(blockId, dismissed(device, Date.now()));
    }
  }

  function snooze() {
    setClockDevice(blockId, snoozed(device, alarmTime, Date.now()));
  }

  // Hidden, not stopped. It stays hidden for this run and comes back when
  // time is up -- see popupsWanted.
  function hide() {
    try {
      localStorage.setItem(HIDDEN_KEY_PREFIX + label, String(Date.now()));
      localStorage.removeItem(KEEP_KEY_PREFIX + label);
    } catch { /* shown again next tick */ }
    kept = false;
    closeWindow();
  }

  async function closeWindow() {
    try { await win?.close(); } catch { /* already gone */ }
  }

  // Double-click: back to the app.
  async function openApp() {
    try {
      const { Window } = await import('@tauri-apps/api/window');
      const main = await Window.getByLabel('main');
      await main?.unminimize();
      await main?.show();
      await main?.setFocus();
    } catch { /* not the desktop app */ }
  }

  // Space does nothing here. It used to pause, and a focused button answered
  // it as well -- so the Pause just clicked went on pausing and resuming with
  // every space typed while the pop-up still had the keyboard. Asked on
  // 2026-09-28 to be switched off. Both the down and the up are swallowed:
  // a button presses on the up.
  function onKey(event) {
    if (event.key === ' ' || event.code === 'Space') {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.type === 'keydown' && event.key === 'Escape') hide();
  }

  let stopMoved = null;

  onMount(async () => {
    tick = setInterval(() => { now = Date.now(); }, 250);
    window.addEventListener('storage', onStorage);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);

    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      win = getCurrentWindow();
      // Where it was dragged to, so the next one opens there.
      stopMoved = await win.onMoved(async ({ payload }) => {
        try {
          const scale = await win.scaleFactor();
          localStorage.setItem(POSITION_KEY, JSON.stringify({ x: payload.x / scale, y: payload.y / scale }));
        } catch { /* keeps the default place */ }
      });
    } catch {
      // Opened in a browser for a look: everything but the window works.
    }
  });

  onDestroy(() => {
    clearInterval(tick);
    ringer.destroy();
    stopMoved?.();
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKey, true);
  });
</script>

<!-- The whole card is the handle for dragging the window; its buttons are
     not, and keep their clicks. -->
<div
  class="card"
  class:ringing
  data-tauri-drag-region
  style="--pp-bg: {theme.bg || 'rgba(12, 12, 14, 0.9)'}; --pp-text: {theme.text || '#ffffff'}; --pp-accent: {theme.accent || theme.text || '#ffffff'}; --pp-border: {theme.border || 'rgba(255, 255, 255, 0.25)'};"
  on:dblclick={openApp}
  role="timer"
  aria-label={kind === 'timer' ? 'Timer' : 'Alarm'}
>
  <div class="top" data-tauri-drag-region>
    <span class="what" data-tauri-drag-region>
      {#if kind === 'timer'}
        {ringing ? "Time's up" : `Timer · ${timerReading(device.timer?.duration || 0)}`}
      {:else}
        Alarm · {alarmReading(alarmTime, hour12)}
      {/if}
    </span>
    <button class="hide" title={idle ? 'Close' : 'Hide (the timer keeps going)'} aria-label={idle ? 'Close' : 'Hide'} on:click={hide}>×</button>
  </div>

  <!-- The time and what to do about it on one row, and how much is left as a
       hairline along the bottom: the same things as before in two thirds of
       the height -- see POPUP_HEIGHT in utils/clockPopups.js. -->
  <div class="row" data-tauri-drag-region>
    <div class="figure" class:long={kind === 'timer' && left >= 3600000} data-tauri-drag-region>
      {#if kind === 'timer'}
        {timerReading(left)}
      {:else}
        {alarmReading(alarmTime, hour12)}
      {/if}
    </div>

    <div class="actions">
      {#if kind === 'timer'}
        {#if ringing}
          <button title="One more minute" on:click={() => change(oneMoreMinute)}>+1</button>
          <button class="primary" on:click={stop}>Stop</button>
        {:else if idle}
          <!-- Stopped here: the timer is back to its length, ready to run again. -->
          <button class="primary" on:click={togglePause}>Start</button>
        {:else}
          <button on:click={togglePause}>{phase === 'paused' ? 'Resume' : 'Pause'}</button>
          <button title="One more minute" on:click={() => change(oneMoreMinute)}>+1</button>
          <button class="primary" on:click={stop}>Stop</button>
        {/if}
      {:else}
        <button on:click={snooze}>Snooze</button>
        <button class="primary" on:click={stop}>Stop</button>
      {/if}
    </div>
  </div>

  {#if kind === 'timer'}
    <div class="bar" aria-hidden="true"><span style="width: {fraction * 100}%"></span></div>
  {/if}
</div>

<style>
  /* The window is transparent; the card is what shows, in the app's own
     dialog colours, handed over through local storage (THEME_KEY). */
  /* Nothing behind the card. The window is transparent so the card's rounded
     corners are the window's corners -- but the page it opens is the app's,
     and app.css paints #app black; that drew a square behind the rounded
     card, reported on 2026-09-28. Cleared here for the pop-up only. */
  :global(html),
  :global(body),
  :global(#app) {
    margin: 0;
    background: transparent !important;
    overflow: hidden;
  }

  .card {
    position: relative;
    box-sizing: border-box;
    width: 100vw;
    height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    padding: 5px 8px 8px 10px;
    border-radius: 12px;
    border: 1px solid var(--pp-border);
    background: var(--pp-bg);
    color: var(--pp-text);
    font-family: 'Inter', system-ui, sans-serif;
    user-select: none;
    cursor: default;
    overflow: hidden;
  }

  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .what {
    font-size: 0.66rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    opacity: 0.7;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .figure {
    flex: none;
    font-size: 1.55rem;
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }

  /* An hour or more is two characters longer; it gives up a little size
     rather than push the buttons out of the card. */
  .figure.long {
    font-size: 1.2rem;
  }

  .actions {
    display: flex;
    gap: 4px;
    margin-left: auto;
  }

  /* How much is left: a hairline along the bottom edge rather than a row of
     its own. */
  .bar {
    position: absolute;
    left: 10px;
    right: 10px;
    bottom: 4px;
    height: 2px;
    border-radius: 1px;
    background: color-mix(in srgb, var(--pp-text) 16%, transparent);
    overflow: hidden;
  }

  .bar span {
    display: block;
    height: 100%;
    background: var(--pp-accent);
    transition: width 0.25s linear;
  }

  button {
    font: inherit;
    font-size: 0.68rem;
    font-weight: 600;
    color: var(--pp-text);
    background: color-mix(in srgb, var(--pp-text) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--pp-text) 28%, transparent);
    border-radius: 999px;
    padding: 2px 8px;
    cursor: pointer;
  }

  button:hover {
    background: color-mix(in srgb, var(--pp-text) 20%, transparent);
  }

  button.primary {
    color: var(--pp-bg);
    background: var(--pp-accent);
    border-color: transparent;
  }

  .hide {
    padding: 0 6px;
    font-size: 0.85rem;
    line-height: 1.1;
    border: none;
    background: transparent;
    opacity: 0.6;
  }

  .hide:hover {
    opacity: 1;
    background: color-mix(in srgb, var(--pp-text) 15%, transparent);
  }

  .ringing {
    animation: ring 1s ease-in-out infinite;
  }

  @keyframes ring {
    0%, 100% { border-color: var(--pp-accent); }
    50% { border-color: var(--pp-border); }
  }

  .ringing .figure {
    color: var(--pp-accent);
  }
</style>
