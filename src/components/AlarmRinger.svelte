<script>
  /**
   * Rings the alarms of the open folder, whichever mode or page is showing.
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
   * When is decided in utils/alarm.js; what was done about a ring is this
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
  import { clockDevices, peekClockDevice, setClockDevice } from '../utils/clockDeviceStore.js';

  export let blocks = [];
  /** The dialog palette App hands its other popups, so this reads as one of them. */
  export let themeStyle = '';

  let now = Date.now();
  let timer = null;
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

  function schedule() {
    clearTimeout(timer);
    now = Date.now();
    // Capped at a minute inside msUntilAlarmCheck: every wake works it out
    // again from the time, so a timer the device held back cannot make it miss.
    timer = setTimeout(schedule, msUntilAlarmCheck({ now, alarms }));
  }

  // Named only: the alarms. See ClockFace for why not the timer.
  $: rescheduleFor(alarms);
  function rescheduleFor() {
    if (mounted) schedule();
  }

  function onVisible() {
    if (document.visibilityState === 'visible') schedule();
  }

  // ── Sound ─────────────────────────────────────────────────────────
  // Made rather than played from a file, so there is nothing to ship or load
  // and nothing that can fail to arrive. Two short beeps a second, and a
  // vibration where the device has one.
  let audio = null;
  let beeper = null;

  function beep() {
    try {
      audio ??= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const start = audio.currentTime;
      for (const offset of [0, 0.22]) {
        const tone = audio.createOscillator();
        const gain = audio.createGain();
        tone.type = 'sine';
        tone.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, start + offset);
        gain.gain.exponentialRampToValueAtTime(0.3, start + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.16);
        tone.connect(gain).connect(audio.destination);
        tone.start(start + offset);
        tone.stop(start + offset + 0.18);
      }
    } catch {
      // No audio here; the banner still shows.
    }
    try {
      navigator.vibrate?.([180, 60, 180]);
    } catch {
      // Not a device that vibrates.
    }
  }

  $: sounding = ringing.length > 0;
  $: soundFor(sounding);
  function soundFor(on) {
    if (on && !beeper) {
      beep();
      beeper = setInterval(beep, 1000);
    } else if (!on && beeper) {
      clearInterval(beeper);
      beeper = null;
      try { navigator.vibrate?.(0); } catch { /* nothing to stop */ }
    }
  }

  function stop(alarm) {
    setClockDevice(alarm.id, dismissed(alarm.device, Date.now()));
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
    clearTimeout(timer);
    soundFor(false);
    audio?.close?.();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisible);
    }
  });
</script>

{#if ringing.length}
  <div class="alarm-banner" role="alertdialog" aria-label="Alarm ringing" style={themeStyle}>
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
