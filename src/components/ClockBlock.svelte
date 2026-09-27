<script context="module">
  /**
   * Which clocks have their settings open, kept outside any one instance.
   *
   * A settings change goes into undo history, and history bumps every block's
   * version -- the canvas keys its blocks by it, which is deliberate: it is how
   * an undo makes a block re-read its saved state. The cost is that the block
   * is remounted on every change, so a panel held in the instance snapped shut
   * after each toggle and the next checkbox clicked was already gone.
   *
   * Kept here rather than saved with the block, because it is view state and
   * view state is never synced: another device has no business opening this
   * panel because it was open here.
   */
  const openPanels = new Set();
</script>

<script>
  /**
   * A clock, on the canvas.
   *
   * Built on BlockShell from the start, which is the whole point of BlockShell:
   * dragging, resizing, focus, colours and the header are written once there,
   * and a block type supplies only what makes it that type. Three of the older
   * blocks still carry their own copies of all that — PENDING records it — and
   * this one does not add a fourth.
   *
   * The face is ClockFace.svelte, shared with Simple Note, which draws blocks
   * without a frame.
   */
  import { tick } from 'svelte';
  import BlockShell from './BlockShell.svelte';
  import ClockFace from './ClockFace.svelte';

  export let id;
  export let initialPosition = { x: 100, y: 100 };
  export let initialSize = { width: 260, height: 150 };
  export let initialBgColor = '#000000';
  export let initialTextColor = '#ffffff';
  export let focused = false;
  export let canvasScale = 1;

  /** How the face reads. Saved with the block, so it reads the same everywhere. */
  export let initialHour12 = false;
  export let initialShowSeconds = false;
  export let initialShowDate = true;

  let hour12 = initialHour12;
  let showSeconds = initialShowSeconds;
  let showDate = initialShowDate;
  let settingsOpen = openPanels.has(id);

  function toggleSettings() {
    settingsOpen = !settingsOpen;
    if (settingsOpen) openPanels.add(id);
    else openPanels.delete(id);
  }

  /**
   * Save a setting once the shell has heard about it.
   *
   * The shell builds its update from the `fields` prop, and a changed checkbox
   * reaches that prop on the next update rather than the same instant. Saving
   * straight from the change handler would send the value the box had *before*
   * it was clicked -- a setting that looks changed and reverts on reload.
   */
  async function save(commit, key) {
    await tick();
    commit([key]);
  }
</script>

<BlockShell
  {id}
  {initialPosition}
  {initialSize}
  {initialBgColor}
  {initialTextColor}
  {focused}
  {canvasScale}
  label="Clock"
  fields={{ hour12, showSeconds, showDate }}
  minWidth={140}
  minHeight={90}
  on:update
  on:delete
  on:focusToggle
  let:commit
>
  <button
    slot="header-controls"
    let:ensureFocus={focusBlock}
    class="clock-settings-btn"
    title="Clock settings"
    aria-label="Clock settings"
    aria-expanded={settingsOpen}
    data-focus-guard
    on:click={() => { focusBlock(); toggleSettings(); }}
  >⋯</button>

  <div class="clock-body">
    <ClockFace {hour12} {showSeconds} {showDate} />

    {#if settingsOpen}
      <!-- Three switches and nothing else. A clock with a settings page is a
           clock somebody has to learn. -->
      <div class="clock-settings" data-focus-guard>
        <label>
          <input
            type="checkbox"
            bind:checked={hour12}
            on:change={() => save(commit, 'hour12')}
          />
          12-hour
        </label>
        <label>
          <input
            type="checkbox"
            bind:checked={showSeconds}
            on:change={() => save(commit, 'showSeconds')}
          />
          Seconds
        </label>
        <label>
          <input
            type="checkbox"
            bind:checked={showDate}
            on:change={() => save(commit, 'showDate')}
          />
          Date
        </label>
      </div>
    {/if}
  </div>
</BlockShell>

<style>
  .clock-body {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .clock-settings-btn {
    background: transparent;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: 0 6px;
    font-size: 1rem;
    line-height: 1;
  }

  /* Over the face rather than beside it, so opening it never resizes the
     block. Surface tinted from the block's own writing -- the theme rule. */
  .clock-settings {
    position: absolute;
    inset: auto 6px 6px 6px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    justify-content: center;
    padding: 6px 8px;
    border-radius: 8px;
    font-size: 0.78rem;
    color: inherit;
    background: color-mix(in srgb, currentColor 12%, transparent);
    backdrop-filter: blur(6px);
  }

  .clock-settings label {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    white-space: nowrap;
  }
</style>
