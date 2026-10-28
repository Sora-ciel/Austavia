<script>
  /**
   * A sheet for choosing one thing from a list: it covers the area it is
   * opened in, with a title, a close button and rows -- a name on the left and
   * a count on the right -- and goes on Escape or the close button.
   *
   * Made for Playlist mode's playlists (asked 2026-10-28: "a page like the one
   * you use in Single Note mode to search notes, but something simpler that
   * just lists the different playlists ... with the amount of songs on the
   * right"), and made shared from the start, since Single Note's NotePicker is
   * the same shape with more in it (CLAUDE.md, "One of everything"; moving it
   * onto this is in PENDING).
   *
   * Rows are given as `items`: `{ id, name, count, current, actions }`, where
   * `actions` are small buttons beside the count -- `{ label, title, run }`.
   * Picking a row dispatches `pick` with its id. Anything else (a row to add
   * a new one) goes in the `footer` slot.
   *
   * Drawn in the colours of what it sits over: --mode-text-color and
   * --canvas-inner-bg, which every mode sets.
   */
  import { createEventDispatcher, onMount } from 'svelte';

  export let title = '';
  export let items = [];
  /** A search field in the head, filtering the rows by name, as the note picker has. */
  export let searchable = true;
  export let searchLabel = 'Search';

  let query = '';
  $: shown = query.trim()
    ? items.filter(item => item.name.toLowerCase().includes(query.trim().toLowerCase()))
    : items;

  const dispatch = createEventDispatcher();
  let sheet;

  // Every row keeps room for as many buttons as the busiest one, so the counts
  // line up in one column whether or not a row has buttons of its own.
  $: actionSlots = Math.max(0, ...shown.map(item => (item.actions || []).length));

  function onKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      dispatch('close');
    }
  }

  // Focus comes into the sheet, so the keys reach it and a screen reader
  // starts here.
  onMount(() => sheet?.focus());
</script>

<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
<div class="picker-sheet" role="dialog" aria-label={title} tabindex="-1" bind:this={sheet} on:keydown={onKeydown}>
  <div class="sheet-head">
    {#if searchable}
      <input class="sheet-search" type="search" placeholder={searchLabel} aria-label={searchLabel} bind:value={query} />
    {:else}
      <h3 class="sheet-title">{title}</h3>
    {/if}
    <button class="sheet-close" title="Close" aria-label="Close" on:click={() => dispatch('close')}>×</button>
  </div>
  <ul class="sheet-list">
    {#each shown as item (item.id)}
      <li class="sheet-row" class:current={item.current}>
        <button class="sheet-pick" aria-current={item.current ? 'true' : undefined} on:click={() => dispatch('pick', item.id)}>
          <span class="sheet-name">{item.name}</span>
          {#if item.count !== undefined}<span class="sheet-count">{item.count}</span>{/if}
        </button>
        {#each item.actions || [] as action}
          <button class="sheet-action" title={action.title} aria-label={action.title} on:click|stopPropagation={action.run}>{action.label}</button>
        {/each}
        {#each Array(actionSlots - (item.actions || []).length) as _}
          <span class="sheet-action-space" aria-hidden="true"></span>
        {/each}
      </li>
    {/each}
  </ul>
  <slot name="footer" />
</div>

<style>
  .picker-sheet {
    --sb-thumb: var(--mode-text-color, #ffffff);
    --sb-track: var(--canvas-inner-bg, #000000);
    position: absolute;
    inset: 0;
    z-index: 5;
    display: flex;
    flex-direction: column;
    background: var(--canvas-inner-bg, #000000);
    color: var(--mode-text-color, #ffffff);
    outline: none;
  }

  .sheet-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px 8px;
  }

  .sheet-title {
    flex: 1;
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
  }

  /* As the note picker's search: tinted with the writing's colour. */
  .sheet-search {
    flex: 1;
    min-width: 0;
    font: inherit;
    color: inherit;
    background: color-mix(in srgb, currentColor 8%, transparent);
    border: 1px solid color-mix(in srgb, currentColor 28%, transparent);
    border-radius: 8px;
    padding: 8px 10px;
    outline: none;
  }

  .sheet-search:focus {
    border-color: color-mix(in srgb, currentColor 60%, transparent);
  }

  .sheet-close {
    width: 34px;
    height: 34px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    font-size: 1.3rem;
    cursor: pointer;
  }

  .sheet-close:hover {
    background: color-mix(in srgb, currentColor 10%, transparent);
  }

  /* As tall as its rows, and no taller, so what follows (a "new" row) sits
     right under the last one; it scrolls once there are more than fit. */
  .sheet-list {
    flex: 0 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    list-style: none;
    margin: 0;
    padding: 0 10px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* Each row a card, as the note picker draws its notes (asked 2026-10-28,
     "the same style as Single Note mode"): a border in the writing's colour,
     solid for the one open now. */
  .sheet-row {
    display: flex;
    align-items: center;
    gap: 4px;
    padding-right: 4px;
    border: 2px solid color-mix(in srgb, currentColor 35%, transparent);
    border-radius: 10px;
  }

  .sheet-row:hover {
    border-color: color-mix(in srgb, currentColor 55%, transparent);
  }

  .sheet-row.current {
    border-color: currentColor;
    box-shadow: 0 0 0 1px color-mix(in srgb, currentColor 45%, transparent);
  }

  .sheet-pick {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    padding: 0 12px;
    border: none;
    border-radius: 10px;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .sheet-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sheet-name {
    font-weight: 600;
  }

  .sheet-count {
    flex: none;
    opacity: 0.65;
    font-variant-numeric: tabular-nums;
  }

  .sheet-action {
    flex: none;
    box-sizing: border-box;
    width: 34px;
    height: 34px;
    padding: 0;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    opacity: 0.6;
    cursor: pointer;
  }

  .sheet-action-space {
    flex: none;
    width: 34px;
  }

  .sheet-action:hover {
    opacity: 1;
    background: color-mix(in srgb, currentColor 10%, transparent);
  }
</style>
