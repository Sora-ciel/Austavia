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
<div
  class="clock-face"
  class:dated={showDate}
  class:with-seconds={!!parts.seconds}
  class:with-period={!!parts.period}
  role="timer" aria-label="{parts.time}{parts.period ? ` ${parts.period}` : ''}, {day}">
  <div class="clock-time">
    <span class="clock-hm">{parts.time}</span>{#if parts.seconds}<span class="clock-s">:{parts.seconds}</span>{/if}{#if parts.period}<span class="clock-period">{parts.period}</span>{/if}
  </div>
  {#if showDate}
    <div class="clock-date">{day}</div>
  {/if}
</div>

<style>
  /* Everything is sized from the face's own box rather than fixed, so a clock
     dragged twice as large reads twice as large instead of floating small in
     a big box.

     The time is set as one size on `.clock-time`, and the seconds and AM/PM
     are fractions of it, so the three always keep their proportions. That
     size is the smaller of two limits:

       height  most of the box, less the date's share when the date shows;
       width   a share of the box's width, narrower when seconds or AM/PM
               make the line longer -- width alone was the first version, and
               in a wide Simple Note column it cut the top off the digits.

     `cqh` and `cqi` are hundredths of the face's height and width, which is
     why the container is `size` rather than `inline-size`. */
  .clock-face {
    container-type: size;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.25em;
    /* The block's own writing colour, and nothing picked here -- the theme
       rule in CLAUDE.md. */
    color: inherit;
    font-variant-numeric: tabular-nums;
    user-select: none;
    overflow: hidden;
  }

  .clock-time {
    --by-height: 84cqh;
    --by-width: 30cqi;
    display: flex;
    align-items: baseline;
    font-size: min(var(--by-height), var(--by-width));
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 0.9;
    white-space: nowrap;
  }

  .dated .clock-time { --by-height: 70cqh; }
  .with-seconds .clock-time { --by-width: 21cqi; }
  .with-period .clock-time { --by-width: 25cqi; }
  .with-seconds.with-period .clock-time { --by-width: 18cqi; }

  /* The same size and weight as the hours and minutes. They were once a
     smaller, fainter afterthought; asked for on 2026-09-27 -- "when you put
     seconds the seconds are small but it really should be like the other
     numbers". The line is longer for it, which is what the narrower width
     allowances above are for. */
  .clock-s {
    font-size: 1em;
  }

  .clock-period {
    font-size: 0.3em;
    font-weight: 600;
    margin-left: 0.3em;
    opacity: 0.75;
  }

  /* Never below a size that can be read, even when that means the time
     gives up a little of the height to it. */
  .clock-date {
    font-size: clamp(0.62rem, 13cqh, 7cqi);
    font-weight: 600;
    opacity: 0.72;
    white-space: nowrap;
  }
</style>
