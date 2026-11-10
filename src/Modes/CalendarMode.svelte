<script>
  /**
   * Calendar mode: the folder's calendar, full size, a day at a time.
   *
   * Asked 2026-11-10: "Add a calendar mode and block where you can put time
   * blocks easily of what you will do at a certain hour. this mode will be
   * pretty big, it will have different way of showing the calendar. Like one
   * day 4 day, week, month. year. But let's just focus now on easy put of
   * different time block ... the day by day way of showing the calendar for
   * now."
   *
   * The mode only mounts calendar blocks (CLAUDE.md, "a mode only shows
   * blocks"): everything a calendar does is CalendarBlock's, here drawn
   * `big`. A folder with several has a tab for each; one with none offers to
   * make one. Which tab is open is this device's.
   */
  import { createEventDispatcher } from 'svelte';
  import Block from '../components/Block.svelte';
  import ModeWallpaper from '../components/ModeWallpaper.svelte';
  import { modeTextColor as modeTextColorFor } from '../utils/modeSurface.js';

  export let blocks = [];
  export let focusedBlockId = null;
  export let canvasColors = {};
  export let backgroundSettings = {};
  export let canvasRef;
  export let openFolder = '';

  const dispatch = createEventDispatcher();

  $: canvasTheme = { outerBg: '#000000', innerBg: '#000000', ...(canvasColors || {}) };
  $: modeTextColor = modeTextColorFor(canvasTheme);
  $: modeVars = `--canvas-outer-bg: ${canvasTheme.outerBg}; --canvas-inner-bg: ${canvasTheme.innerBg}; --mode-text-color: ${modeTextColor};`;

  $: calendars = blocks.filter(block => block.type === 'calendar');
  let chosenId = null;
  $: shownCalendar = calendars.find(block => block.id === chosenId) || calendars[0] || null;
</script>

<div class="calendar-mode" bind:this={canvasRef} style={modeVars}>
  <ModeWallpaper settings={backgroundSettings} />

  {#if calendars.length > 1}
    <div class="calendar-tabs" role="tablist">
      {#each calendars as block, i (block.id)}
        <button
          class="calendar-tab"
          role="tab"
          aria-selected={block.id === shownCalendar?.id}
          on:click={() => (chosenId = block.id)}
        >{(block.title || '').trim() || `Calendar ${i + 1}`}</button>
      {/each}
    </div>
  {/if}

  {#if shownCalendar}
    <div class="calendar-body">
      {#key shownCalendar.id}
        <Block
          block={shownCalendar}
          placement="page"
          big
          focused={shownCalendar.id === focusedBlockId}
          fileKey={openFolder}
          on:update
          on:delete
          on:focusToggle
        />
      {/key}
    </div>
  {:else}
    <div class="calendar-empty">
      <p>No calendar in this folder yet.</p>
      <button class="calendar-make" on:click={() => dispatch('addBlock', { type: 'calendar' })}>＋ Make a calendar</button>
    </div>
  {/if}
</div>

<style>
  .calendar-mode {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    background: var(--canvas-inner-bg, #000);
    color: var(--mode-text-color, #fff);
  }

  .calendar-mode > :not(:global(.mode-wallpaper)) {
    position: relative;
    z-index: 1;
  }

  .calendar-tabs {
    display: flex;
    gap: 6px;
    padding: 8px 10px 0;
    overflow-x: auto;
  }

  .calendar-tab {
    flex: none;
    padding: 3px 12px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.8rem;
    opacity: 0.6;
    cursor: pointer;
  }

  .calendar-tab[aria-selected='true'] {
    opacity: 1;
    border-color: currentColor;
  }

  /* The calendar fills the mode, the whole width on a computer, as a page
     does (asked 2026-11-10 for Page mode, and wanted most of all for 7 days). */
  .calendar-body {
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
    margin: 0 auto;
    padding: 4px 8px 0;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }

  .calendar-body > :global(.note.on-page) {
    flex: 1 1 auto;
    height: auto !important;
    min-height: 0;
  }

  .calendar-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    opacity: 0.85;
  }

  .calendar-make {
    padding: 8px 16px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
</style>
