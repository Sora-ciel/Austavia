<script>
  /**
   * The clock block's body: a clock page and an alarm page, and a corner that
   * always holds the other one.
   *
   * Asked for on 2026-09-27 -- "a block that does both, and which one is open
   * is an on-device save. On the alarm page the clock still shows small in a
   * corner, and on the clock page one click puts it in alarm mode, and an
   * active alarm shows in that same corner." The rules are in utils/alarm.js
   * and tested there in those words; this keeps a timer and draws.
   *
   * Frameless, like ClockFace, so Canvas can wrap it in BlockShell and Simple
   * Note can lay it out itself. The alarm's time and switch are the block's and
   * are saved by whoever holds it, through the `alarm` event. The page, and
   * what was done about a ring, are this device's -- clockDeviceStore.js.
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
  let timer = null;
  let mounted = false;

  $: normalTime = normalizeAlarmTime(alarmTime);
  $: small = clockParts({ at: now, hour12 });
  $: corner = cornerReading({
    page,
    time: normalTime,
    enabled: alarmEnabled,
    hour12,
    clockTime: small.period ? `${small.time} ${small.period}` : small.time
  });
  $: status = alarmStatus({ now, time: normalTime, enabled: alarmEnabled, device, hour12 });

  function schedule() {
    clearTimeout(timer);
    now = Date.now();
    // The sooner of the corner clock's next minute and the alarm's next
    // change, so "Rings in 12 min" and the ringing state are both current.
    const wait = Math.min(
      msUntilNextTick({ now }),
      msUntilAlarmCheck({ now, alarms: [{ time: alarmTime, enabled: alarmEnabled, device }] })
    );
    timer = setTimeout(schedule, wait);
  }

  // Named only: the alarm, and what this device did about it. See ClockFace
  // for why a reactive statement must not name the timer it sets.
  $: rescheduleFor(alarmTime, alarmEnabled, device);
  function rescheduleFor() {
    if (mounted) schedule();
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
    clearTimeout(timer);
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
  {:else}
    <ClockFace {hour12} {showSeconds} {showDate} />
  {/if}

  <!-- The corner always holds the other page: the time while the alarm is
       open, the alarm (or the way to it) while the clock is. -->
  <button
    class="clock-corner"
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

  .alarm-page {
    container-type: size;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: min(5cqmin, 10px);
    overflow: hidden;
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

  /* Top right, small, and quiet until it has something to say. */
  .clock-corner {
    position: absolute;
    top: 4px;
    right: 6px;
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

  .ringing .clock-corner {
    animation: ring-pulse 1s ease-in-out infinite;
  }

  @keyframes ring-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.35; }
  }
</style>
