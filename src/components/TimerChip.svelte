<script>
  /**
   * The timer on the toolbar -- see utils/timerChip.js for what was asked for
   * and what it shows. Pressing it opens a panel with every timer in use and
   * its buttons; it closes on a click anywhere else, like the other menus.
   *
   * Keeps nothing of its own: the timers are this device's memory of each
   * clock (clockDeviceStore.js), the same record the block and the pop-ups
   * read, so a change here is a change everywhere.
   */
  import { onDestroy } from 'svelte';
  import { clockDevices, peekClockDevice, setClockDevice } from '../utils/clockDeviceStore.js';
  import { startTimer, pauseTimer, resetTimer, oneMoreMinute, timerReading } from '../utils/countdown.js';
  import { activeTimers } from '../utils/timerChip.js';
  import { clickOutside } from '../utils/clickOutside.js';
  import PlayerIcon from './PlayerIcons.svelte';

  export let blocks = [];
  /** The dialog palette App gives its other pop-ups. */
  export let themeStyle = '';

  const onDesktop = typeof window !== 'undefined' && !!(window.__TAURI_INTERNALS__ || window.__TAURI__);

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
  $: setTicking(timers.length > 0);
  function setTicking(on) {
    if (on && !tick) tick = setInterval(() => { now = Date.now(); }, 250);
    else if (!on && tick) { clearInterval(tick); tick = null; }
  }
  onDestroy(() => clearInterval(tick));

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

{#if first}
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

  /* Sized and coloured as the mini player beside it: the toolbar's own
     button colours, nothing picked here. */
  .timer-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 42px;
    padding: 0 12px;
    border-radius: 8px;
    border: 1px solid var(--controls-border, #333);
    background: color-mix(in srgb, var(--player-veil, var(--controls-bg, #111)) 75%, transparent);
    color: var(--controls-button-text, var(--controls-text, #fff));
    font: inherit;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }

  .timer-chip.open {
    border-color: color-mix(in srgb, var(--controls-button-text, var(--controls-text, #fff)) 55%, transparent);
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

  /* Below the toolbar at the right, where the player's panel opens: the
     dialog colours App gives its other pop-ups. */
  .timer-panel {
    --sb-track: var(--dlg-bg, #17171a);
    --sb-thumb: var(--dlg-btn-text, var(--dlg-text, #f0f0f0));
    position: fixed;
    top: calc(var(--controls-height, 56px) + 8px);
    right: 8px;
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
