<script>
  /**
   * The objective of one task, set from its right-click menu (a hold and
   * release on the phone): time or count, the goal, and whether it resets
   * every day. Asked 2026-10-25 -- "on the right click you choose which type".
   * The rules are in utils/taskGoals.js.
   */
  import { createEventDispatcher } from 'svelte';
  import { parseTarget, formatDuration } from '../utils/taskGoals.js';

  export let x = 0;
  export let y = 0;
  /** The task's current objective, or null for an ordinary task. */
  export let goal = null;
  export let taskLabel = '';
  /**
   * The last goal set on this device, per kind (readLastGoal in
   * utils/taskModeView.js). Asked 2026-10-26: a new task starts from "the one
   * you put at last", and time and count are two different fields.
   */
  export let last = { kind: 'time', timeSeconds: null, count: null, daily: false };

  const dispatch = createEventDispatcher();

  // "1h 30m", "45s": what parseTarget reads back.
  function durationText(seconds) {
    return seconds ? formatDuration(seconds) : '';
  }

  // Each kind keeps its own text, so switching never carries "30m" into the
  // count box or 20 into the time one. A task's own goal fills its kind; the
  // other kind, and a task with none yet, start from the last one set.
  let kind = goal?.kind || last?.kind || 'time';
  let timeText = goal?.kind === 'time' ? durationText(goal.targetSeconds ?? goal.target * 60) : durationText(last?.timeSeconds);
  let countText = goal?.kind === 'count' ? String(goal.target) : (last?.count ? String(last.count) : '');
  let daily = goal ? goal.daily === true : last?.daily === true;
  let error = '';

  // Kept on screen, whatever corner it was opened in.
  const WIDTH = 248;
  $: left = Math.max(8, Math.min(x, (typeof window === 'undefined' ? 1200 : window.innerWidth) - WIDTH - 8));
  $: top = Math.max(8, Math.min(y, (typeof window === 'undefined' ? 800 : window.innerHeight) - 260));

  function save() {
    const target = parseTarget(kind === 'time' ? timeText : countText, kind);
    if (!target) {
      error = kind === 'time' ? 'Try 2h, 90m, 45s or 1m30s' : 'A whole number, like 20';
      return;
    }
    dispatch('save', { kind, target, daily });
  }

  function onKey(event) {
    if (event.key === 'Enter') { event.preventDefault(); save(); }
    else if (event.key === 'Escape') { event.preventDefault(); dispatch('close'); }
  }

  function focusOnMount(node) { node.focus(); node.select(); }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="goal-backdrop" on:pointerdown|stopPropagation={() => dispatch('close')}></div>
<div class="goal-editor" role="dialog" aria-label="Objective" style="left: {left}px; top: {top}px; width: {WIDTH}px;">
  {#if taskLabel}<div class="goal-editor-task">{taskLabel}</div>{/if}

  <div class="goal-kinds" role="radiogroup" aria-label="Kind of objective">
    <button type="button" role="radio" aria-checked={kind === 'time'} class:on={kind === 'time'}
      on:click={() => { kind = 'time'; error = ''; }}>Time</button>
    <button type="button" role="radio" aria-checked={kind === 'count'} class:on={kind === 'count'}
      on:click={() => { kind = 'count'; error = ''; }}>Count</button>
  </div>

  <label class="goal-field">
    <span>{kind === 'time' ? 'Time to do' : 'Times to do'}</span>
    {#if kind === 'time'}
      <input
        bind:value={timeText}
        placeholder="2h, 90m, 45s"
        use:focusOnMount
        on:keydown={onKey}
        on:input={() => (error = '')}
      />
    {:else}
      <input
        bind:value={countText}
        placeholder="20"
        inputmode="numeric"
        use:focusOnMount
        on:keydown={onKey}
        on:input={() => (error = '')}
      />
    {/if}
  </label>
  {#if error}<div class="goal-error">{error}</div>{/if}

  <label class="goal-daily">
    <input type="checkbox" bind:checked={daily} />
    <span>Resets every day</span>
  </label>

  <div class="goal-actions">
    {#if goal}
      <button type="button" class="goal-remove" on:click={() => dispatch('remove')}>Remove</button>
    {/if}
    <button type="button" class="goal-save" on:click={save}>{goal ? 'Save' : 'Set objective'}</button>
  </div>
</div>

<style>
  /* Opaque, over the list; every colour from the mode's own (the theme rule in
     CLAUDE.md): the writing colour for text and tints, the mode's background
     for the surface. */
  .goal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
  }
  .goal-editor {
    position: fixed;
    z-index: 41;
    box-sizing: border-box;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    border-radius: var(--block-control-radius, 10px);
    border: 1px solid color-mix(in srgb, var(--text, var(--mode-text-color, currentColor)) 25%, transparent);
    background: var(--task-surface, var(--canvas-inner-bg, #000));
    color: var(--text, var(--mode-text-color, inherit));
    box-shadow: var(--block-shadow, 0 6px 20px rgba(0, 0, 0, 0.45));
    font-size: 0.85rem;
  }
  .goal-editor-task {
    font-size: 0.75rem;
    opacity: 0.7;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .goal-kinds { display: flex; gap: 6px; }
  .goal-kinds button,
  .goal-actions button {
    flex: 1;
    min-height: 32px;
    border-radius: var(--block-control-radius, 8px);
    border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .goal-kinds button.on,
  .goal-save {
    background: color-mix(in srgb, currentColor 18%, transparent) !important;
    border-color: color-mix(in srgb, currentColor 55%, transparent) !important;
    font-weight: 700;
  }
  .goal-field { display: flex; flex-direction: column; gap: 4px; }
  .goal-field span { font-size: 0.72rem; opacity: 0.7; }
  .goal-field input {
    box-sizing: border-box;
    width: 100%;
    padding: 6px 8px;
    border-radius: var(--block-control-radius, 8px);
    border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
    background: color-mix(in srgb, currentColor 8%, transparent);
    color: inherit;
    font: inherit;
  }
  .goal-error { font-size: 0.72rem; }
  .goal-daily { display: flex; align-items: center; gap: 8px; cursor: pointer; }
  .goal-daily input { accent-color: currentColor; margin: 0; }
  .goal-actions { display: flex; gap: 6px; }
  .goal-remove { opacity: 0.8; }
</style>
