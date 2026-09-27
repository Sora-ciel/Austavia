<script>
  /**
   * The clock itself — the time, and the day beneath it.
   *
   * A body without a frame, for the same reason MusicPlayer is one: Simple Note
   * draws its blocks without a frame and needs exactly this, while Canvas wraps
   * it in BlockShell to get dragging and resizing. One face, two frames, and a
   * change to how the time looks is made once.
   *
   * What it says and when it next changes are decided in utils/clockFace.js.
   * This only keeps a timer and draws.
   */
  import { onMount, onDestroy } from 'svelte';
  import { clockParts, clockDate, msUntilNextTick } from '../utils/clockFace.js';

  export let hour12 = false;
  export let showSeconds = false;
  export let showDate = true;

  let now = Date.now();
  let timer = null;

  $: parts = clockParts({ at: now, hour12, showSeconds });
  $: day = clockDate(now);

  function schedule() {
    clearTimeout(timer);
    // Read afresh every time rather than counted up, so a timer the browser
    // held back -- a background tab, a phone that slept -- is right again on
    // the next tick instead of carrying its lateness forward.
    now = Date.now();
    timer = setTimeout(schedule, msUntilNextTick({ now, showSeconds }));
  }

  let mounted = false;

  // Changing whether seconds show changes how often it has to wake.
  //
  // The statement names only `showSeconds`, deliberately. Svelte works out
  // what a reactive statement depends on from what it mentions, and anything
  // read inside a called function is invisible to it. Naming `timer` here --
  // the obvious way to write "only once it is running" -- would make it depend
  // on the very value schedule() assigns, and it would reschedule itself on
  // every update for ever.
  $: rescheduleFor(showSeconds);

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
</script>

<!-- A timer role, not a live region: a live region would read the time out
     every minute to somebody using a screen reader, which is not what a clock
     on a page is for. The label is there when they go and look. -->
<div class="clock-face" role="timer" aria-label="{parts.time}{parts.period ? ` ${parts.period}` : ''}, {day}">
  <div class="clock-time">
    <span class="clock-hm">{parts.time}</span>{#if parts.seconds}<span class="clock-s">:{parts.seconds}</span>{/if}{#if parts.period}<span class="clock-period">{parts.period}</span>{/if}
  </div>
  {#if showDate}
    <div class="clock-date">{day}</div>
  {/if}
</div>

<style>
  /* Everything is sized from the block rather than fixed, so a clock dragged
     twice as large reads twice as large instead of floating small in a big
     box.

     Sized from the *tighter* of the two sides. Width alone was the first
     version, and in a wide Simple Note column it made the numerals taller
     than the box: the top of the digits was cut off and the date pushed out
     of sight entirely. `cqmin` is a hundredth of whichever side is shorter,
     and the `cqi` cap beside it keeps a long "12:04:15 PM" inside a narrow
     block too. Both need the face to have a real height, which is why the
     container is `size` rather than `inline-size`. */
  .clock-face {
    container-type: size;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.2em;
    /* The block's own writing colour, and nothing picked here -- the theme
       rule in CLAUDE.md. */
    color: inherit;
    font-variant-numeric: tabular-nums;
    user-select: none;
    overflow: hidden;
  }

  .clock-time {
    display: flex;
    align-items: baseline;
    line-height: 1;
    white-space: nowrap;
  }

  .clock-hm {
    font-size: min(44cqmin, 24cqi);
    font-weight: 300;
    letter-spacing: -0.02em;
  }

  /* Smaller and quieter: seconds are movement, not the reading. */
  .clock-s {
    font-size: min(18cqmin, 10cqi);
    opacity: 0.6;
  }

  .clock-period {
    font-size: min(12cqmin, 6cqi);
    margin-left: 0.3em;
    opacity: 0.75;
  }

  .clock-date {
    font-size: min(12cqmin, 6.5cqi);
    opacity: 0.7;
    white-space: nowrap;
  }
</style>
