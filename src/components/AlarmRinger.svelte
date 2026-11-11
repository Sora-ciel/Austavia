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
  import { timerState, timerEndsAt, resetTimer, oneMoreMinute, msUntilTimerRingChange } from '../utils/countdown.js';
  import { clockDevices, peekClockDevice, setClockDevice } from '../utils/clockDeviceStore.js';
  import { createRinger, stillSounding, RING_SOUND_MS } from '../utils/ringTone.js';
  // Finished objectives ring here too, in the same banner and with the same
  // sound -- asked 2026-10-26. When and for how long: utils/taskGoalRings.js.
  import { goalRings, msUntilGoalRingChange, readAnswered, answerRing } from '../utils/taskGoalRings.js';
  import { htmlToText } from '../utils/htmlToText.js';

  export let blocks = [];
  /** The folder's habits: one with an amount or a time rings like a task's. */
  export let habits = [];
  /** The dialog palette App hands its other popups, so this reads as one of them. */
  export let themeStyle = '';

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

  const deviceStorage = () => (typeof localStorage === 'undefined' ? undefined : localStorage);
  let answeredGoals = readAnswered(deviceStorage());
  // A ring stopped from the notification (App.svelte, handleGoalAction) is
  // written to this device's answers outside this component; read them again.
  const rereadAnswered = () => { answeredGoals = readAnswered(deviceStorage()); };
  if (typeof window !== 'undefined') window.addEventListener('austavia:goal-answered', rereadAnswered);
  $: goalRinging = goalRings({ blocks, habits, now, answered: answeredGoals });

  function stopGoal(ring) {
    answeredGoals = answerRing(deviceStorage(), ring.key, Date.now());
  }

  function goalName(ring) {
    const text = htmlToText(ring.task?.text || '').trim();
    return text.length > 40 ? `${text.slice(0, 40)}…` : text || 'Objective';
  }

  // A count objective chimes once, the first time it is seen finished.
  const chimed = new Set();
  $: for (const ring of goalRinging) {
    if (!ring.loud && !chimed.has(ring.key)) {
      chimed.add(ring.key);
      ringer.chime();
    }
  }

  function schedule() {
    clearTimeout(wake);
    now = Date.now();
    // Capped at a minute inside msUntilAlarmCheck: every wake works it out
    // again from the time, so a timer the device held back cannot make it miss.
    const waits = [
      msUntilAlarmCheck({ now, alarms }),
      ...timers.map(entry => msUntilTimerRingChange(entry.device.timer, now)),
      msUntilGoalRingChange({ blocks, habits, now }),
      // The moment a ring's sound stops, two minutes in (ringTone.js).
      ...soundEnds().map(end => end + RING_SOUND_MS - now + 5).filter(wait => wait > 0)
    ].filter(wait => wait !== null);
    wake = setTimeout(schedule, Math.min(...waits));
  }

  // Named only: the alarms and timers. See ClockFace for why not `wake`.
  $: rescheduleFor(alarms, timers, blocks, habits);
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
  // The shared ring (utils/ringTone.js), for everything: the always-on-top
  // pop-ups only show. A finished timer or objective sounds until it is
  // stopped or for two minutes, whichever comes first; an alarm for its whole
  // ring.
  const ringer = createRinger();

  function soundEnds() {
    return [
      ...rungTimers.map(entry => timerEndsAt(entry.device.timer)),
      ...goalRinging.filter(ring => ring.loud).map(ring => ring.finishedAt)
    ];
  }
  $: sounding = ringing.length > 0
    || rungTimers.some(entry => stillSounding(timerEndsAt(entry.device.timer), now))
    || goalRinging.some(ring => ring.loud && stillSounding(ring.finishedAt, now));
  $: ringer.set(sounding);

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
    if (typeof window !== 'undefined') window.removeEventListener('austavia:goal-answered', rereadAnswered);
    // Also stops a reschedule already queued from starting the timer again.
    mounted = false;
    clearTimeout(wake);
    ringer.destroy();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisible);
    }
  });
</script>

{#if ringing.length || rungTimers.length || goalRinging.length}
  <div class="alarm-banner" role="alertdialog" aria-label={ringing.length ? "Alarm ringing" : rungTimers.length ? "Timer finished" : "Objective done"} style={themeStyle}>
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
    {#each goalRinging as ring (ring.key)}
      <div class="alarm-line">
        <svg class="bell" class:still={!ring.loud} viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
          <path d="M8 12.5l2.6 2.6L16 9.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="alarm-when goal-when">
          <span class="goal-name">{goalName(ring)}</span>
          <span class="goal-done">{ring.kind === 'time' ? "Time's up" : 'Done'}</span>
        </span>
        <button class="alarm-btn primary" on:click={() => stopGoal(ring)}>{ring.loud ? 'Stop' : 'OK'}</button>
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

  /* An objective's line names the task, which can be long: it shortens rather
     than pushing the button off the banner. */
  .goal-when {
    display: flex;
    flex-direction: column;
    min-width: 0;
    font-size: 1rem;
  }
  .goal-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 52vw;
  }
  .goal-done {
    font-size: 0.8rem;
    opacity: 0.75;
  }
  .bell.still { animation: none; }
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
