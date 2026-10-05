<script>
  /**
   * Single Note's search page: this folder's notes first, then every other
   * folder's after a separator. What it lists and in what order is decided in
   * utils/noteSearch.js; this draws it, in the mode's own colours.
   *
   * Opened from the note's title, which now shares one line with the word
   * count instead of a row of tabs above it -- asked for on 2026-10-05.
   */
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import { searchNotes } from '../utils/noteSearch.js';

  /** This folder's notes, in the order the mode shows them. */
  export let notes = [];
  export let currentFolder = '';
  export let currentNoteId = null;
  /** Every other folder's notes: async () => [{ folder, notes }]. */
  export let loadElsewhere = async () => [];

  const dispatch = createEventDispatcher();

  let query = '';
  let input;
  let elsewhere = [];
  let loadingElsewhere = true;

  $: results = searchNotes({ currentFolder, here: notes, elsewhere, query });
  $: nothingFound = !results.here.length && !results.elsewhere.length && !loadingElsewhere;

  onMount(async () => {
    await tick();
    input?.focus();
    try {
      elsewhere = await loadElsewhere();
    } catch (error) {
      console.warn('Could not list the notes in other folders:', error);
      elsewhere = [];
    } finally {
      loadingElsewhere = false;
    }
  });

  function pick(entry) {
    dispatch('pick', { folder: entry.folder, id: entry.id });
  }

  function onKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      dispatch('close');
    } else if (event.key === 'Enter') {
      const first = results.here[0] || results.elsewhere[0];
      if (first) {
        event.preventDefault();
        pick(first);
      }
    }
  }
</script>

<div class="note-picker" role="dialog" aria-label="Find a note">
  <div class="picker-head">
    <input
      class="picker-search"
      type="search"
      placeholder="Search notes"
      aria-label="Search notes"
      bind:this={input}
      bind:value={query}
      on:keydown={onKeydown}
    />
    <button class="picker-close" title="Back to the note" aria-label="Back to the note" on:click={() => dispatch('close')}>×</button>
  </div>

  <div class="picker-list">
    {#each results.here as entry (entry.id)}
      <button class="picker-note" class:current={entry.id === currentNoteId} on:click={() => pick(entry)}>
        <span class="picker-title">{entry.title}</span>
        {#if entry.snippet}<span class="picker-snippet">{entry.snippet}</span>{/if}
      </button>
    {/each}

    {#if results.elsewhere.length || loadingElsewhere}
      <div class="picker-separator" role="separator">
        <span>Other folders</span>
      </div>
    {/if}

    {#if loadingElsewhere}
      <div class="picker-quiet">Looking through the other folders…</div>
    {/if}

    {#each results.elsewhere as entry (`${entry.folder}/${entry.id}`)}
      <button class="picker-note" on:click={() => pick(entry)}>
        <span class="picker-title">{entry.title}</span>
        <span class="picker-folder">{entry.folder}</span>
        {#if entry.snippet}<span class="picker-snippet">{entry.snippet}</span>{/if}
      </button>
    {/each}

    {#if nothingFound}
      <div class="picker-quiet">No note has “{query}” in it.</div>
    {/if}
  </div>
</div>

<style>
  /* Over the note, below the title row: the mode's own surface and writing,
     so it is part of the page rather than a dialog on top of it. */
  .note-picker {
    --sb-thumb: var(--mode-text-color, #ffffff);
    --sb-track: var(--active-note-bg, var(--canvas-inner-bg, #000000));
    position: absolute;
    inset: 0;
    z-index: 5;
    display: flex;
    flex-direction: column;
    background: var(--active-note-bg, var(--canvas-inner-bg, #000000));
    color: var(--mode-text-color, #ffffff);
  }

  .picker-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px 8px;
  }

  .picker-search {
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

  .picker-search:focus {
    border-color: color-mix(in srgb, currentColor 60%, transparent);
  }

  .picker-close {
    flex: none;
    display: grid;
    place-items: center;
    padding: 0;
    width: 34px;
    height: 34px;
    font: inherit;
    font-size: 1.2rem;
    line-height: 1;
    color: inherit;
    background: transparent;
    border: 1px solid color-mix(in srgb, currentColor 28%, transparent);
    border-radius: 8px;
    cursor: pointer;
  }

  .picker-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .picker-note {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: baseline;
    column-gap: 10px;
    text-align: left;
    font: inherit;
    color: inherit;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 8px;
    padding: 8px 10px;
    cursor: pointer;
  }

  .picker-note:hover,
  .picker-note:focus-visible {
    background: color-mix(in srgb, currentColor 8%, transparent);
    outline: none;
  }

  .picker-note.current {
    border-color: color-mix(in srgb, currentColor 35%, transparent);
  }

  .picker-title {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .picker-folder {
    font-size: 0.75rem;
    opacity: 0.65;
    white-space: nowrap;
  }

  .picker-snippet {
    grid-column: 1 / -1;
    font-size: 0.8rem;
    opacity: 0.65;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .picker-separator {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 10px 0 4px;
    font-size: 0.75rem;
    letter-spacing: 0.04em;
    opacity: 0.7;
  }

  .picker-separator::before,
  .picker-separator::after {
    content: '';
    flex: 1;
    height: 1px;
    background: color-mix(in srgb, currentColor 30%, transparent);
  }

  .picker-quiet {
    padding: 8px 10px;
    font-size: 0.85rem;
    opacity: 0.65;
  }
</style>
