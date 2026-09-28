<script>
  /**
   * Rings the alarms and timers of the open folder, whichever mode or page is
   * showing.
   *
   * Separate from the block, because a block is only drawn in the modes that
   * hold blocks: an alarm set in Canvas has to ring while the Playlist is open,
   * and a clock page showing the time has to ring as loudly as the alarm page.
   * So this watches the folder's clock blocks, and the block is only where the
   * alarm is set and answered.
   *
   * What it does not do, and cannot from here: ring while the app is closed,
   * or while a phone has put it to sleep in the background, or for a folder
   * that is not open. That is a native alarm, and PENDING says so.
   *
   * A timer that runs out rings here too, for the same reason: it was started
   * on the timer page, and nobody stays on the timer page.
   *
   * When is decided in utils/alarm.js and utils/countdown.js; what was done
   * about a ring, and the timers themselves, are this
   * device's, in clockDeviceStore.js, shared with the block so answering in
   * either place answers both.
   */
  import { onMount, onDestroy } from 'svelte';
  import {
    normalizeAlarmTime,
    isRinging,
    msUntilAlarmCheck,
    dismissed,
    snoozed,
    alarmReading
  } from '../utils/alarm.js';
  import { timerState, resetTimer, oneMoreMinute, msUntilTimerRingChange } from '../utils/countdown.js';
  import { clockDevices, peekClockDevice, setClockDevice } from '../utils/clockDeviceStore.js';
  import { createRinger } from '../utils/ringTone.js';
  import { popupLabel } from '../utils/clockPopups.js';

  export let blocks = [];
  /** The dialog palette App hands its other popups, so this reads as one of them. */
  export let themeStyle = '';
  /**
   * Pop-up windows that are open, by label, on the Windows app -- they ring
   * for themselves. See utils/clockPopups.js.
   */
  export let quiet = new Set();

  let now = Date.now();
  let wake = null;
  let mounted = false;

  $: alarms = (Array.isArray(blocks) ? blocks : [])
    .filter(block => block?.type === 'clock' && block.alarmEnabled === true && normalizeAlarmTime(block.alarmTime))
    .map(block => ({
      id: block.id,
      time: normalizeAlarmTime(block.alarmTime),
      hour12: block.hour12 === true,
      enabled: true,
      device: peekClockDevice(block.id, $clockDevices)
    }));

  $: ringing = alarms.filter(alarm => isRinging({ now, ...alarm }));

  // Every clock block's timer on this device, running or not -- a timer has
  // no switch in the note to filter on.
  $: timers = (Array.isArray(blocks) ? blocks : [])
    .filter(block => block?.type === 'clock')
    .map(block => ({ id: block.id, device: peekClockDevice(block.id, $clockDevices) }));

  $: rungTimers = timers.filter(entry => timerState(entry.device.timer, now) === 'ringing');

  function schedule() {
    clearTimeout(wake);
    now = Date.now();
    // Capped at a minute inside msUntilAlarmCheck: every wake works it out
    // again from the time, so a timer the device held back cannot make it miss.
    const waits = [
      msUntilAlarmCheck({ now, alarms }),
      ...timers.map(entry => msUntilTimerRingChange(entry.device.timer, now))
    ].filter(wait => wait !== null);
    wake = setTimeout(schedule, Math.min(...waits));
  }

  // Named only: the alarms and timers. See ClockFace for why not `wake`.
  $: rescheduleFor(alarms, timers);
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

  // ── Sound ─────────────────────────────────────────────────────────
  // The shared ring (utils/ringTone.js). Quiet for anything whose always-on-top
  // pop-up is open and ringing it already -- two sets of beeps a fraction of a
  // second apart sound like a fault, not an alarm.
  const ringer = createRinger();

  $: ringingLabels = [
    ...ringing.map(alarm => popupLabel(alarm.id, 'alarm')),
    ...rungTimers.map(entry => popupLabel(entry.id, 'timer'))
  ];
  $: ringer.set(ringingLabels.some(label => !quiet.has(label)));

  function stop(alarm) {
    setClockDevice(alarm.id, dismissed(alarm.device, Date.now()));
  }

  function changeTimer(entry, change) {
    setClockDevice(entry.id, { ...entry.device, timer: change(entry.device.timer, Date.now()) });
  }

  function snooze(alarm) {
    setClockDevice(alarm.id, snoozed(alarm.device, alarm.time, Date.now()));
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
    ringer.destroy();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisible);
    }
  });
</script>

{#if ringing.length || rungTimers.length}
  <div class="alarm-banner" role="alertdialog" aria-label={ringing.length ? "Alarm ringing" : "Timer finished"} style={themeStyle}>
    {#each ringing as alarm (alarm.id)}
      <div class="alarm-line">
        <svg class="bell" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3a6 6 0 0 0-6 6v3.5L4.5 15v1.5h15V15L18 12.5V9a6 6 0 0 0-6-6Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
          <path d="M10 19a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
        <span class="alarm-when">{alarmReading(alarm.time, alarm.hour12)}</span>
        <button class="alarm-btn" on:click={() => snooze(alarm)}>Snooze</button>
        <button class="alarm-btn primary" on:click={() => stop(alarm)}>Stop</button>
      </div>
    {/each}
    {#each rungTimers as entry (entry.id)}
      <div class="alarm-line">
        <svg class="bell" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="alarm-when">Time's up</span>
        <button class="alarm-btn" on:click={() => changeTimer(entry, oneMoreMinute)}>+1 min</button>
        <button class="alarm-btn primary" on:click={() => changeTimer(entry, resetTimer)}>Stop</button>
      </div>
    {/each}
  </div>
{/if}

<style>
  /* The same palette as the app's other dialogs, and the app's own colours
     when there is none -- the theme rule in CLAUDE.md. */
  .alarm-banner {
    position: fixed;
    top: calc(env(safe-area-inset-top, 0px) + 12px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 14px;
    border-radius: 14px;
    color: var(--dlg-text, var(--app-text));
    background: var(--dlg-bg, var(--app-bg));
    border: 1px solid var(--dlg-border, var(--app-border));
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
    max-width: calc(100vw - 32px);
  }

  .alarm-line {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .bell {
    width: 22px;
    height: 22px;
    animation: shake 1s ease-in-out infinite;
  }

  .alarm-when {
    font-size: 1.3rem;
    font-variant-numeric: tabular-nums;
    margin-right: auto;
  }

  .alarm-btn {
    font: inherit;
    color: var(--dlg-btn-text, inherit);
    background: var(--dlg-btn-bg, color-mix(in srgb, currentColor 10%, transparent));
    border: 1px solid color-mix(in srgb, currentColor 28%, transparent);
    border-radius: 999px;
    padding: 5px 14px;
    cursor: pointer;
  }

  .alarm-btn.primary {
    font-weight: 600;
  }

  @keyframes shake {
    0%, 100% { transform: rotate(0); }
    20% { transform: rotate(-14deg); }
    40% { transform: rotate(12deg); }
    60% { transform: rotate(-8deg); }
    80% { transform: rotate(4deg); }
  }
</style>
