<script>
  /**
   * The timer on the toolbar -- see utils/timerChip.js for what was asked for
   * and what it shows. Pressing it opens a panel with every timer in use and
   * its buttons; it closes on a click anywhere else, like the other menus.
   *
   * In the Android app it is in the notification shade instead, and this
   * keeps that notification true (utils/timerNotificationBridge.js).
   *
   * Keeps nothing of its own: the timers are this device's memory of each
   * clock (clockDeviceStore.js), the same record the block and the pop-ups
   * read, so a change here is a change everywhere.
   */
  import { onDestroy } from 'svelte';
  import { clockDevices, peekClockDevice, setClockDevice } from '../utils/clockDeviceStore.js';
  import { startTimer, pauseTimer, resetTimer, oneMoreMinute, timerReading } from '../utils/countdown.js';
  import { activeTimers, timerPlace, timerNotice, sameNotice } from '../utils/timerChip.js';
  import {
    isNativeAndroid,
    onTimerNotificationAction,
    showTimerNotification,
    clearTimerNotification
  } from '../utils/timerNotificationBridge.js';
  import { clickOutside } from '../utils/clickOutside.js';
  import PlayerIcon from './PlayerIcons.svelte';

  export let blocks = [];
  /** The dialog palette App gives its other pop-ups. */
  export let themeStyle = '';

  const onDesktop = typeof window !== 'undefined' && !!(window.__TAURI_INTERNALS__ || window.__TAURI__);
  const nativeAndroid = isNativeAndroid();
  let width = typeof window !== 'undefined' ? window.innerWidth : Infinity;
  $: place = timerPlace({ nativeAndroid, width });

  let now = Date.now();
  let open = false;
  let chipRef;
  // The timers the panel was showing: one stopped from it stays until the
  // panel closes, so it can be started again (see utils/timerChip.js).
  let shown = [];

  $: devices = Object.fromEntries(
    (blocks || []).filter(block => block?.type === 'clock').map(block => [block.id, peekClockDevice(block.id, $clockDevices)])
  );
  $: timers = activeTimers({ blocks, devices, now, keep: shown });
  $: first = timers[0];
  $: if (!timers.length && (open || shown.length)) closePanel();

  // Ticks only while there is a timer to show -- a toolbar that wakes four
  // times a second for nothing is a phone kept awake for nothing.
  let tick = null;
  // The notification counts down on its own, so the shade needs a look once
  // a second at most -- for a timer running out, not for its figure.
  $: setTicking(timers.length > 0 && place !== 'none' ? (place === 'toolbar' ? 250 : 1000) : 0);
  let tickEvery = 0;
  function setTicking(every) {
    if (every === tickEvery) return;
    clearInterval(tick);
    tick = every ? setInterval(() => { now = Date.now(); }, every) : null;
    tickEvery = every;
  }

  // The notification: redrawn when what it says changes, and again every
  // thirty seconds and whenever the app comes back to the front, from
  // scratch -- one lost update must not leave the shade wrong for good (the
  // recompute rule in CLAUDE.md).
  let lastNotice;
  $: notice = place === 'notification' ? timerNotice(timers, devices) : null;
  $: if (place === 'notification' && !sameNotice(notice, lastNotice)) sendNotice(notice);
  function sendNotice(next) {
    lastNotice = next;
    if (next) showTimerNotification(next);
    else clearTimerNotification();
  }
  const resend = () => { if (place === 'notification') sendNotice(timerNotice(timers, devices)); };
  const resendTimer = nativeAndroid ? setInterval(resend, 30000) : null;
  const onVisible = () => { if (document.visibilityState === 'visible') { now = Date.now(); resend(); } };
  if (nativeAndroid) {
    document.addEventListener('visibilitychange', onVisible);
    onTimerNotificationAction(({ action, blockId }) => {
      if (!blockId) return;
      const entry = activeTimers({ blocks, devices, now: Date.now() }).find(item => item.blockId === blockId);
      if (action === 'toggle' && entry) togglePause(entry);
      else if (action === 'plus') change(blockId, oneMoreMinute);
      else if (action === 'stop') change(blockId, resetTimer);
    });
  }

  onDestroy(() => {
    clearInterval(tick);
    clearInterval(resendTimer);
    if (nativeAndroid) document.removeEventListener('visibilitychange', onVisible);
  });

  function toggleOpen() {
    if (open) return closePanel();
    open = true;
    shown = timers.map(entry => entry.blockId);
  }

  function closePanel() {
    open = false;
    shown = [];
  }

  function change(blockId, fn) {
    if (!shown.includes(blockId)) shown = [...shown, blockId];
    const device = devices[blockId] || {};
    setClockDevice(blockId, { ...device, timer: fn(device.timer, Date.now()) });
    now = Date.now();
  }

  function togglePause(entry) {
    change(entry.blockId, entry.phase === 'running' ? pauseTimer : startTimer);
  }

  function reading(entry) {
    return entry.phase === 'ringing' ? "Time's up" : timerReading(entry.left);
  }

  function togglePopup(blockId) {
    const device = devices[blockId] || {};
    setClockDevice(blockId, { ...device, timerPopup: device.timerPopup === false });
  }
</script>

<svelte:window bind:innerWidth={width} />

{#if first && place === 'toolbar'}
  <div class="timer-chip-wrap">
    <button
      class="timer-chip"
      class:rung={first.phase === 'ringing'}
      class:open
      bind:this={chipRef}
      title="Timers"
      aria-expanded={open}
      aria-label={`Timer, ${reading(first)}`}
      on:click={toggleOpen}
    >
      <svg class="chip-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="chip-time">{reading(first)}</span>
      {#if first.phase === 'paused' || first.phase === 'stopped'}<PlayerIcon name="pause" size={11} />{/if}
      {#if timers.length > 1}<span class="chip-more">+{timers.length - 1}</span>{/if}
    </button>

    {#if open}
      <div
        class="timer-panel"
        style={themeStyle}
        role="dialog"
        aria-label="Timers"
        use:clickOutside={{ onOutside: closePanel, ignore: () => [chipRef] }}
      >
        {#each timers as entry (entry.blockId)}
          <div class="timer-row" class:rung={entry.phase === 'ringing'}>
            <span class="row-time">{reading(entry)}</span>
            <span class="row-actions">
              {#if entry.phase === 'stopped'}
                <button class="icon primary" title="Start" aria-label="Start" on:click={() => change(entry.blockId, startTimer)}>
                  <PlayerIcon name="play" size={13} />
                </button>
              {:else}
                {#if entry.phase !== 'ringing'}
                  <button class="icon" title={entry.phase === 'paused' ? 'Resume' : 'Pause'} aria-label={entry.phase === 'paused' ? 'Resume' : 'Pause'} on:click={() => togglePause(entry)}>
                    <PlayerIcon name={entry.phase === 'paused' ? 'play' : 'pause'} size={13} />
                  </button>
                {/if}
                <button title="One more minute" aria-label="One more minute" on:click={() => change(entry.blockId, oneMoreMinute)}>+1</button>
                <button class="icon primary" title="Stop and set back to the start" aria-label="Stop" on:click={() => change(entry.blockId, resetTimer)}>
                  <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.35-5.65M4 4v5h5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
              {/if}
              {#if onDesktop}
                <!-- The same switch as on the block: whether this timer opens
                     the always-on-top pop-up. -->
                <button
                  class="popup-switch"
                  class:off={devices[entry.blockId]?.timerPopup === false}
                  role="switch"
                  aria-checked={devices[entry.blockId]?.timerPopup !== false}
                  title="Always-on-top pop-up for this timer"
                  on:click={() => togglePopup(entry.blockId)}
                >Pop-up {devices[entry.blockId]?.timerPopup === false ? 'off' : 'on'}</button>
              {/if}
            </span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .timer-chip-wrap {
    position: relative;
    display: inline-flex;
    flex-shrink: 0;
  }

  /* The mini player follows the chip rather than taking the free space to
     its own left -- see App's .controls rules. */
  .timer-chip-wrap ~ :global(.mini-player) {
    margin-left: 8px;
  }

  /* Drawn as the Bg button is -- asked for on 2026-09-29, "css wise I think
     it should be called after bg button": the toolbar's button colours,
     handed down as --controls-button-* (App's controlsStyle), and the left
     buttons' size and corners. */
  .timer-chip {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    box-sizing: border-box;
    min-height: 42px;
    padding: 8px 12px;
    border-radius: 6px;
    border: 1px solid var(--controls-border, #444444);
    background: var(--controls-button-bg, #333333);
    color: var(--controls-button-text, #ffffff);
    font: inherit;
    /* The toolbar buttons' weight and line; the app's own 1.5 made the chip
       two pixels taller than the rest. */
    font-weight: 500;
    line-height: normal;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    cursor: pointer;
    transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
  }


  .chip-icon {
    width: 16px;
    height: 16px;
  }

  .chip-more {
    font-size: 0.72rem;
    opacity: 0.7;
  }

  .timer-chip.rung {
    animation: rung 1s ease-in-out infinite;
  }

  @keyframes rung {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.45; }
  }

  /* Just under the chip, its right edges lined up: the dialog colours App
     gives its other pop-ups. */
  .timer-panel {
    --sb-track: var(--dlg-bg, #17171a);
    --sb-thumb: var(--dlg-btn-text, var(--dlg-text, #f0f0f0));
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    z-index: 1400;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 240px;
    padding: 10px 12px;
    border-radius: 14px;
    border: 1px solid var(--dlg-border, #333);
    background: var(--dlg-bg, #17171a);
    color: var(--dlg-text, #f0f0f0);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  }

  .timer-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .row-time {
    min-width: 4.2em;
    font-size: 1.35rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .timer-row.rung .row-time {
    font-size: 0.95rem;
    animation: rung 1s ease-in-out infinite;
  }

  .row-actions {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-left: auto;
  }

  .row-actions button {
    font: inherit;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--dlg-btn-text, var(--dlg-text, #fff));
    background: color-mix(in srgb, currentColor 10%, transparent);
    border: 1px solid color-mix(in srgb, currentColor 28%, transparent);
    border-radius: 999px;
    padding: 3px 9px;
    cursor: pointer;
  }

  .row-actions button.icon {
    display: inline-grid;
    place-items: center;
    min-width: 28px;
    padding: 3px 7px;
  }

  .row-actions button.primary {
    color: var(--dlg-bg, #17171a);
    background: var(--dlg-btn-text, var(--dlg-text, #fff));
    border-color: transparent;
  }

  .popup-switch.off {
    opacity: 0.55;
    text-decoration: line-through;
  }
</style>
