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
  /** A card's writing colour from its note's: (entry) => css variables. */
  export let cardStyle = () => '';
  /**
   * A category's background from its folder's wallpaper settings:
   * (wallpaper) => css variables. See groupStyle in SingleNoteMode.
   */
  export let groupStyle = () => '';
  /** This folder's wallpaper settings, for the cards of its own notes. */
  export let hereWallpaper = null;

  const dispatch = createEventDispatcher();

  let query = '';
  let input;
  let elsewhere = [];
  let loadingElsewhere = true;

  $: results = searchNotes({ currentFolder, here: notes, hereWallpaper, elsewhere, query });
  $: nothingFound = !results.here.length && !results.elsewhere.length && !loadingElsewhere;
  // A picture that will not load is simply left out of its card.
  let brokenPictures = new Set();
  function pictureFailed(src) {
    brokenPictures = new Set([...brokenPictures, src]);
  }

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
    <!-- Each folder is a category: its wallpaper behind the whole of it, its
         name, and its notes on top with no background of their own. Asked
         for on 2026-10-05: "easier to see and cleaner". -->
    {#if results.here.length}
      <section class="picker-folder-group" aria-label={currentFolder} style={groupStyle(hereWallpaper)}>
        <span class="picker-group-wall" aria-hidden="true"></span>
        <h3 class="picker-folder">{currentFolder}</h3>
        {#each results.here as entry (entry.id)}
          <button
            class="picker-note"
            class:current={entry.id === currentNoteId}
            style={cardStyle(entry)}
            on:click={() => pick(entry)}
          >
            <span class="picker-words">
              <span class="picker-title">{entry.title}</span>
              {#if entry.snippet}<span class="picker-snippet">{entry.snippet}</span>{/if}
            </span>
            {#if entry.picture && !brokenPictures.has(entry.picture)}
              <img class="picker-picture" src={entry.picture} alt="" loading="lazy" on:error={() => pictureFailed(entry.picture)} />
            {/if}
          </button>
        {/each}
      </section>
    {/if}

    {#if results.elsewhere.length || loadingElsewhere}
      <div class="picker-separator" role="separator">
        <span>Other folders</span>
      </div>
    {/if}

    {#if loadingElsewhere}
      <div class="picker-quiet">Looking through the other folders…</div>
    {/if}

    <!-- A folder with no notes, or none the search finds, is not listed. -->
    {#each results.elsewhere as group (group.folder)}
      <section class="picker-folder-group" aria-label={group.folder} style={groupStyle(group.wallpaper)}>
        <span class="picker-group-wall" aria-hidden="true"></span>
        <h3 class="picker-folder">{group.folder}</h3>
        {#each group.notes as entry (`${entry.folder}/${entry.id}`)}
          <button
            class="picker-note"
            class:current={entry.id === currentNoteId}
            style={cardStyle(entry)}
            on:click={() => pick(entry)}
          >
            <span class="picker-words">
              <span class="picker-title">{entry.title}</span>
              {#if entry.snippet}<span class="picker-snippet">{entry.snippet}</span>{/if}
            </span>
            {#if entry.picture && !brokenPictures.has(entry.picture)}
              <img class="picker-picture" src={entry.picture} alt="" loading="lazy" on:error={() => pictureFailed(entry.picture)} />
            {/if}
          </button>
        {/each}
      </section>
    {/each}

    {#if nothingFound}
      <div class="picker-quiet">No note has “{query}” in it.</div>
    {/if}
  </div>
</div>

<style>
  /* Over the note, below the title row, and see-through: Single Note hides the
     note underneath while this is open, so what shows behind is the page's
     own background -- the theme's opacity and the wallpaper through it, as
     the note has them (asked for on 2026-10-05). */
  .note-picker {
    --sb-thumb: var(--active-note-text, var(--mode-text-color, #ffffff));
    --sb-track: transparent;
    position: absolute;
    inset: 0;
    z-index: 5;
    display: flex;
    flex-direction: column;
    background: transparent;
    color: var(--active-note-text, var(--mode-text-color, #ffffff));
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

  /* A note on its category: no background of its own, so the folder's
     wallpaper behind the category shows through it; the note's own writing
     colour (cardStyle) and a hairline of it. */
  .picker-note {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 52px;
    text-align: left;
    font: inherit;
    color: var(--card-text, inherit);
    background: transparent;
    border: 1px solid color-mix(in srgb, var(--card-text, currentColor) 22%, transparent);
    border-radius: 10px;
    padding: 6px 6px 6px 12px;
    cursor: pointer;
    text-shadow: inherit;
  }

  .picker-note:hover,
  .picker-note:focus-visible {
    border-color: color-mix(in srgb, var(--card-text, currentColor) 55%, transparent);
    outline: none;
  }

  .picker-note.current {
    border-color: var(--card-text, currentColor);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--card-text, currentColor) 45%, transparent);
  }

  .picker-words {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .picker-title {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .picker-snippet {
    font-size: 0.8rem;
    opacity: 0.7;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .picker-picture {
    flex: none;
    width: 44px;
    height: 44px;
    object-fit: cover;
    border-radius: 7px;
  }

  /* A category: the folder's wallpaper behind it all (groupStyle) -- on the
     theme's page colour, so nothing of the open folder shows through -- or,
     for a folder with no wallpaper, nothing, and the open folder does. */
  .picker-folder-group {
    position: relative;
    isolation: isolate;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 8px 8px;
    border-radius: 12px;
    background: var(--group-backdrop, transparent);
  }

  .picker-group-wall {
    position: absolute;
    z-index: -1;
    inset: var(--group-wall-bleed, 0px);
    pointer-events: none;
    background-image: var(--group-wall, none);
    background-size: var(--group-wall-size, cover);
    background-position: center;
    background-repeat: no-repeat;
    opacity: var(--group-wall-opacity, 1);
    filter: var(--group-wall-filter, none);
  }

  .picker-folder {
    margin: 0 2px 2px;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    opacity: 0.8;
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
