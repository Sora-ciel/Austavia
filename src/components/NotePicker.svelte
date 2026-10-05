<script>
  /**
   * Single Note's search page: this folder's notes first, then every other
   * folder's after a separator. What it lists and in what order is decided in
   * utils/noteSearch.js; this draws it, in the mode's own colours.
   *
   * Opened from the note's title, which now shares one line with the word
   * count instead of a row of tabs above it -- asked for on 2026-10-05.
   *
   * Two ways to show it, with a switch between them that this device
   * remembers: the list of folder categories, and a shelf of folders over a
   * grid of tiles (shelfView). Both asked for the same day, "to see both
   * styles".
   */
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import { searchNotes, shelfView } from '../utils/noteSearch.js';

  /** This folder's notes, in the order the mode shows them. */
  export let notes = [];
  export let currentFolder = '';
  export let currentNoteId = null;
  /** Every other folder's notes: async () => [{ folder, notes }]. */
  export let loadElsewhere = async () => [];
  /**
   * A category's background from its folder's wallpaper settings:
   * (wallpaper) => css variables. See groupStyle in SingleNoteMode.
   */
  export let groupStyle = () => '';
  /** This folder's wallpaper settings, for the cards of its own notes. */
  export let hereWallpaper = null;
  /** The notes last opened, newest first: [{ folder, id }]. See recentNotes. */
  export let recentlyOpened = [];

  // Which way to show the page, kept on this device.
  const LAYOUT_KEY = 'singleNotePickerLayout';
  let layout = 'list';
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(LAYOUT_KEY) === 'grid') layout = 'grid';
  } catch { /* the list, then */ }
  function toggleLayout() {
    layout = layout === 'grid' ? 'list' : 'grid';
    try { localStorage.setItem(LAYOUT_KEY, layout); } catch { /* for this time only */ }
  }

  // The grid's chosen folder: 'all', or a folder's name.
  let chosenFolder = 'all';

  const dispatch = createEventDispatcher();

  let query = '';
  let input;
  let elsewhere = [];
  let loadingElsewhere = true;

  $: results = searchNotes({ currentFolder, here: notes, hereWallpaper, elsewhere, query });
  $: nothingFound = !results.here.length && !results.elsewhere.length && !loadingElsewhere;
  $: view = shelfView({ currentFolder, here: notes, hereWallpaper, elsewhere, query, folder: chosenFolder, recentlyOpened });
  // A chosen folder that the list no longer has goes back to every folder.
  $: keepChosenFolder(view, loadingElsewhere);
  function keepChosenFolder(current, loading) {
    if (chosenFolder !== 'all' && !loading && !current.folders.some(f => f.folder === chosenFolder)) chosenFolder = 'all';
  }
  $: totalNotes = view.folders.reduce((sum, f) => sum + f.count, 0);
  $: gridLabel = query.trim()
    ? `${view.notes.length} ${view.notes.length === 1 ? 'note matches' : 'notes match'}`
    : chosenFolder === 'all' ? 'Every note, this folder first' : chosenFolder;
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
      const first = layout === 'grid'
        ? view.notes[0]
        : results.here[0] || results.elsewhere[0]?.notes[0];
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
      placeholder="Search notes and folders"
      aria-label="Search notes and folders"
      bind:this={input}
      bind:value={query}
      on:keydown={onKeydown}
    />
    <button
      class="picker-layout"
      title={layout === 'grid' ? 'Show as a list of folders' : 'Show as a grid'}
      aria-label={layout === 'grid' ? 'Show as a list of folders' : 'Show as a grid'}
      on:click={toggleLayout}
    >
      {#if layout === 'grid'}
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" /></svg>
      {:else}
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" /></svg>
      {/if}
    </button>
    <button class="picker-close" title="Back to the note" aria-label="Back to the note" on:click={() => dispatch('close')}>×</button>
  </div>

  {#if layout === 'grid'}
  <!-- The shelf and grid: folders along the top, each with a circle of its
       wallpaper and how many notes it holds; the notes as tiles under it,
       each with a strip of its folder's wallpaper. -->
  <div class="picker-list">
    <div class="shelf" role="tablist" aria-label="Folders">
      <button class="shelf-chip" class:on={chosenFolder === 'all'} role="tab" aria-selected={chosenFolder === 'all'} on:click={() => (chosenFolder = 'all')}>
        <span class="shelf-swatch shelf-all" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="14" height="14"><path d="M4 7l8-4 8 4-8 4zM4 12l8 4 8-4M4 17l8 4 8-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" /></svg>
        </span>
        <span>All folders</span>
        <span class="shelf-count">{totalNotes}</span>
      </button>
      {#each view.folders as f (f.folder)}
        <button class="shelf-chip" class:on={chosenFolder === f.folder} role="tab" aria-selected={chosenFolder === f.folder} on:click={() => (chosenFolder = f.folder)}>
          <span class="shelf-swatch" style={groupStyle(f.wallpaper)} aria-hidden="true"><span class="picker-group-wall"></span></span>
          <span>{f.folder}{f.here ? ' (here)' : ''}</span>
          <span class="shelf-count">{f.count}</span>
        </button>
      {/each}
    </div>

    {#if view.recent.length}
      <h3 class="grid-label">Recently opened</h3>
      <div class="tiles">
        {#each view.recent as entry (`recent/${entry.folder}/${entry.id}`)}
          <button
            class="tile"
            class:current={entry.folder === currentFolder && entry.id === currentNoteId}
            on:click={() => pick(entry)}
          >
            <span class="tile-band" style={groupStyle(entry.wallpaper)}>
              <span class="picker-group-wall" aria-hidden="true"></span>
              <span class="tile-folder">{entry.folder}{entry.folder === currentFolder ? ' · this folder' : ''}</span>
            </span>
            <span class="tile-body">
              <span class="picker-words">
                <span class="picker-title">{entry.title}</span>
                {#if entry.snippet}<span class="tile-snippet">{entry.snippet}</span>{/if}
              </span>
              {#if entry.picture && !brokenPictures.has(entry.picture)}
                <img class="picker-picture" src={entry.picture} alt="" loading="lazy" on:error={() => pictureFailed(entry.picture)} />
              {/if}
            </span>
          </button>
        {/each}
      </div>
    {/if}

    <h3 class="grid-label">{gridLabel}</h3>
    {#if loadingElsewhere}
      <div class="picker-quiet">Looking through the other folders…</div>
    {/if}
    <div class="tiles">
      {#each view.notes as entry (`${entry.folder}/${entry.id}`)}
          <button
            class="tile"
            class:current={entry.folder === currentFolder && entry.id === currentNoteId}
            on:click={() => pick(entry)}
          >
            <span class="tile-band" style={groupStyle(entry.wallpaper)}>
              <span class="picker-group-wall" aria-hidden="true"></span>
              <span class="tile-folder">{entry.folder}{entry.folder === currentFolder ? ' · this folder' : ''}</span>
            </span>
            <span class="tile-body">
              <span class="picker-words">
                <span class="picker-title">{entry.title}</span>
                {#if entry.snippet}<span class="tile-snippet">{entry.snippet}</span>{/if}
              </span>
              {#if entry.picture && !brokenPictures.has(entry.picture)}
                <img class="picker-picture" src={entry.picture} alt="" loading="lazy" on:error={() => pictureFailed(entry.picture)} />
              {/if}
            </span>
          </button>
      {/each}
    </div>
    {#if !view.notes.length && !loadingElsewhere}
      <div class="picker-quiet">No note or folder has “{query}” in it.</div>
    {/if}
  </div>
  {:else}

  <div class="picker-list">
    <!-- Each folder is a category: its wallpaper behind the whole of it, its
         name, and its notes on top with no background of their own. Asked
         for on 2026-10-05: "easier to see and cleaner". -->
    {#if results.here.length}
      <!-- This folder's own notes: no category background -- the mode's own
           shows through, which is already this folder's (2026-10-05). -->
      <section class="picker-folder-group" aria-label={currentFolder}>
        <span class="picker-group-wall" aria-hidden="true"></span>
        <h3 class="picker-folder">{currentFolder}</h3>
        {#each results.here as entry (entry.id)}
          <button
            class="picker-note"
            class:current={entry.id === currentNoteId}
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
      <div class="picker-quiet">No note or folder has “{query}” in it.</div>
    {/if}
  </div>
  {/if}
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

  .picker-layout {
    flex: none;
    display: grid;
    place-items: center;
    padding: 0;
    width: 34px;
    height: 34px;
    color: inherit;
    background: transparent;
    border: 1px solid color-mix(in srgb, currentColor 28%, transparent);
    border-radius: 8px;
    cursor: pointer;
  }

  /* ── The shelf and grid ─────────────────────────────────────── */
  .shelf {
    flex: none;
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding: 2px 0 6px;
    scrollbar-width: thin;
  }

  .shelf-chip {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px 4px 4px;
    border-radius: 999px;
    border: 2px solid color-mix(in srgb, currentColor 25%, transparent);
    background: color-mix(in srgb, currentColor 6%, transparent);
    color: inherit;
    font: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .shelf-chip.on {
    border-color: currentColor;
    background: color-mix(in srgb, currentColor 14%, transparent);
  }

  .shelf-swatch {
    position: relative;
    isolation: isolate;
    overflow: hidden;
    flex: none;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--group-backdrop, color-mix(in srgb, currentColor 14%, transparent));
  }

  .shelf-all {
    display: grid;
    place-items: center;
  }

  .shelf-count {
    font-size: 0.75rem;
    font-weight: 500;
    opacity: 0.7;
  }

  .grid-label {
    flex: none;
    margin: 12px 2px 6px;
    font-size: 1rem;
    font-weight: 800;
  }

  .tiles {
    flex: none;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    gap: 10px;
  }

  .tile {
    display: flex;
    flex-direction: column;
    text-align: left;
    font: inherit;
    color: inherit;
    padding: 0;
    overflow: hidden;
    border-radius: 12px;
    border: 2px solid color-mix(in srgb, currentColor 22%, transparent);
    background: color-mix(in srgb, currentColor 6%, transparent);
    cursor: pointer;
  }

  .tile:hover,
  .tile:focus-visible {
    border-color: color-mix(in srgb, currentColor 55%, transparent);
    outline: none;
  }

  .tile.current {
    border-color: currentColor;
  }

  /* The strip of the folder's wallpaper across the top, its name on it. */
  .tile-band {
    position: relative;
    isolation: isolate;
    overflow: hidden;
    display: flex;
    align-items: flex-end;
    height: 36px;
    padding: 0 10px 5px;
    background: var(--group-backdrop, color-mix(in srgb, currentColor 12%, transparent));
    color: var(--group-text, inherit);
  }

  .tile-folder {
    font-size: 0.75rem;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tile-body {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px 10px;
    min-height: 74px;
  }

  .tile-snippet {
    font-size: 0.8rem;
    line-height: 1.3;
    opacity: 0.75;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
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
     wallpaper behind the category shows through it; the category's writing
     colour (the theme's, over a wallpaper) or the page's, and a hairline of
     it. */
  .picker-note {
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    /* Ten pixels more than a title and one line, asked for on 2026-10-05:
       room for a second line of what the note says. */
    min-height: 62px;
    text-align: left;
    font: inherit;
    color: var(--group-text, inherit);
    background: transparent;
    border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
    border-radius: 10px;
    padding: 4px 6px 4px 12px;
    cursor: pointer;
  }

  .picker-note:hover,
  .picker-note:focus-visible {
    border-color: color-mix(in srgb, currentColor 55%, transparent);
    outline: none;
  }

  .picker-note.current {
    border-color: currentColor;
    box-shadow: 0 0 0 1px color-mix(in srgb, currentColor 45%, transparent);
  }

  /* Centred in the card when the note has too little to say to fill it. */
  .picker-words {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
  }

  .picker-title {
    font-weight: 600;
    line-height: 1.25;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Up to two lines of what follows the title, cut with an ellipsis. */
  .picker-snippet {
    font-size: 0.8rem;
    /* Tight enough that a title and two lines fit the 62px. */
    line-height: 1.2;
    opacity: 0.7;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .picker-picture {
    flex: none;
    width: 44px;
    height: 44px;
    object-fit: cover;
    border-radius: 7px;
  }

  /* A category: the folder's wallpaper and its dials behind it all
     (groupStyle), on the theme's page colour; for a folder with no wallpaper,
     nothing, and the open folder shows through. Colours and the theme's text
     glow are the theme in use, as everywhere else on the page. */
  .picker-folder-group {
    position: relative;
    isolation: isolate;
    overflow: hidden;
    /* Never squeezed: the list scrolls instead. overflow: hidden takes away a
       flex item's floor at its content, and the list was shrinking the
       categories to fit the page, cutting notes off the bottom. */
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 10px 10px;
    border-radius: 12px;
    background: var(--group-backdrop, transparent);
    /* A frame in the category's own writing colour, so where one folder ends
       and the next begins reads at a glance -- wallpaper or not. Asked for on
       2026-10-05: "make each difference of the category easier to see". */
    border: 3px solid color-mix(in srgb, var(--group-text, currentColor) 50%, transparent);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.22);
  }

  /* Room between one category and the next. */
  .picker-folder-group + .picker-folder-group,
  .picker-separator + .picker-folder-group,
  .picker-quiet + .picker-folder-group {
    margin-top: 10px;
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

  /* The folder's name, bold, with a rule under it between it and its notes. */
  .picker-folder {
    color: var(--group-text, inherit);
    margin: 0 2px 5px;
    padding-bottom: 6px;
    font-size: 1.15rem;
    font-weight: 800;
    letter-spacing: 0.01em;
    border-bottom: 2px solid color-mix(in srgb, var(--group-text, currentColor) 45%, transparent);
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
