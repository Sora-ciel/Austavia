<script>
  /**
   * The line under an objective task: start/pause (time) or +1 (count), how
   * far along it is, and logging by hand. What any of it means is decided in
   * utils/taskGoals.js; this draws it and says what was pressed.
   *
   * Asked 2026-10-25 -- see that file for the request in full.
   */
  import { createEventDispatcher } from 'svelte';
  import { goalNow, goalLabel, parseTarget } from '../utils/taskGoals.js';

  export let goal;
  /** The clock, passed in so one tick in the mode moves every bar together. */
  export let now = Date.now();

  const dispatch = createEventDispatcher();

  let logging = false;
  let logText = '';
  let logError = false;

  $: state = goalNow(goal, now);
  $: label = goalLabel(goal, now);

  function openLog() {
    logging = true;
    logText = '';
    logError = false;
  }

  // "15m", "1h", "+3", "-10m": a leading minus takes a mistake back.
  // Enter saves and closes the field, and closing it is a blur, which also
  // saves -- so this must count once whichever comes first. Measured: 30m
  // logged with Enter showed as 1h before this guard.
  function commitLog() {
    if (!logging) return;
    const text = logText.trim();
    if (!text) { logging = false; return; }
    const negative = text.startsWith('-');
    const amount = parseTarget(text.replace(/^[-+]\s*/, ''), state.kind);
    if (!amount) { logError = true; return; }
    logging = false;
    logText = '';
    dispatch('log', negative ? -amount : amount);
  }

  function logKey(event) {
    if (event.key === 'Enter') { event.preventDefault(); commitLog(); }
    else if (event.key === 'Escape') { event.preventDefault(); logging = false; }
  }

  function focusOnMount(node) { node.focus(); }
</script>

{#if state}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="goal-line" class:reached={state.reached} on:click|stopPropagation on:dblclick|stopPropagation>
    {#if state.kind === 'time'}
      <button
        type="button"
        class="goal-btn"
        aria-label={state.running ? 'Pause' : 'Start'}
        title={state.running ? 'Pause' : 'Start'}
        on:click|stopPropagation={() => dispatch('timer')}
      >{state.running ? '⏸' : '▶'}</button>
    {:else}
      <!-- Asked 2026-10-26: a minus for counts, beside the plus. -->
      <button
        type="button"
        class="goal-btn"
        aria-label="One less time"
        title="One less time"
        disabled={state.value <= 0}
        on:click|stopPropagation={() => dispatch('uncount')}
      >−1</button>
      <button
        type="button"
        class="goal-btn"
        aria-label="One more time"
        title="One more time"
        on:click|stopPropagation={() => dispatch('count')}
      >+1</button>
    {/if}

    <div
      class="goal-bar"
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={Math.round(state.fraction * 100)}
    >
      <div class="goal-fill" style="width: {state.fraction * 100}%"></div>
    </div>

    <span class="goal-label">{label}{state.daily ? ' today' : ''}</span>

    {#if logging}
      <input
        class="goal-log"
        class:error={logError}
        aria-label={state.kind === 'time' ? 'Time to add' : 'Times to add'}
        placeholder={state.kind === 'time' ? '+15m' : '+3'}
        bind:value={logText}
        use:focusOnMount
        on:keydown={logKey}
        on:blur={commitLog}
        on:pointerdown|stopPropagation
      />
    {:else}
      <button
        type="button"
        class="goal-btn"
        aria-label="Log by hand"
        title="Log by hand"
        on:click|stopPropagation={openLog}
      >✎</button>
    {/if}
  </div>
{/if}

<style>
  /* Everything here takes the writing's own colour (currentColor), tinted for
     the groove and the buttons -- the theme rule in CLAUDE.md. */
  /* Sized for a finger: asked 2026-10-26, "the buttons are too small". */
  .goal-line {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 2px 8px;
    font-size: 0.82rem;
  }

  .goal-btn {
    flex: none;
    min-width: 38px;
    height: 32px;
    padding: 0 10px;
    border-radius: var(--block-control-radius, 6px);
    border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
    background: color-mix(in srgb, currentColor 10%, transparent);
    color: inherit;
    font: inherit;
    font-size: 0.85rem;
    line-height: 1;
    cursor: pointer;
  }
  .goal-btn:hover { background: color-mix(in srgb, currentColor 20%, transparent); }
  .goal-btn:disabled { opacity: 0.35; cursor: default; }

  .goal-bar {
    flex: 1 1 auto;
    min-width: 40px;
    height: 7px;
    border-radius: 99px;
    background: color-mix(in srgb, currentColor 18%, transparent);
    overflow: hidden;
  }
  .goal-fill {
    height: 100%;
    border-radius: inherit;
    background: currentColor;
    transition: width 0.3s;
  }

  .goal-label {
    flex: none;
    opacity: 0.75;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .reached .goal-label { opacity: 1; font-weight: 700; }

  .goal-log {
    flex: none;
    width: 80px;
    height: 32px;
    box-sizing: border-box;
    padding: 0 8px;
    border-radius: var(--block-control-radius, 6px);
    border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
    background: color-mix(in srgb, currentColor 8%, transparent);
    color: inherit;
    font: inherit;
    font-size: 0.85rem;
  }
  .goal-log.error { border-color: currentColor; border-style: dashed; }
</style>
