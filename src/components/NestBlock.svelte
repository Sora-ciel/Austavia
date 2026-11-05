<script>
  /**
   * A nest: a block that holds links to folders, drawn as tiles -- the
   * folder's name over its cover -- each opening its folder.
   *
   * Asked 2026-10-27 (PENDING, "Page mode, and nests"): Notion's databases
   * are called nests here, "because you'll be able to nest a bunch of things,
   * not just other folders", and folders are found in them "using a link to
   * folders instead of actually being inside, so that in another folder you
   * can also have that link". Built 2026-11-04, after the page: "and then i
   * want the nest we talked about".
   *
   * So a link is only `{ folderId, name }`: a folder can be in any number of
   * nests, and taking a link out of a nest, or deleting the nest, deletes
   * nothing in the folder. The id survives a rename (utils/folderIdentity.js);
   * the name is only what to call it if the folder cannot be found. Which
   * folder a link leads to, and what it looks like, is looked up each time
   * from the folders themselves (the 'folders' context, App.svelte).
   *
   * A block like any other: on the Canvas, and on a page, where "/" offers it.
   * Holding page blocks and pictures, then web links, is PENDING step 6.
   */
  import { getContext } from 'svelte';
  import { readable } from 'svelte/store';
  import BlockShell from './BlockShell.svelte';
  import SlashMenu from './SlashMenu.svelte';
  import { followLink } from '../utils/folderIdentity.js';
  import { stepChoice } from '../utils/slashMenu.js';

  export let id;
  export let initialPosition = { x: 100, y: 100 };
  export let initialSize = { width: 380, height: 260 };
  export let initialBgColor = '#000000';
  export let initialTextColor = '#ffffff';
  export let initialLinks = [];
  export let initialTitle = 'Nest';
  export let focused = false;
  export let canvasScale = 1;
  export let placement = 'canvas';

  const folders = getContext('folders') || { directory: readable([]), current: readable(''), open: () => {} };
  const directory = folders.directory;
  const currentFolder = folders.current;

  let shell;
  let links = Array.isArray(initialLinks) ? initialLinks.filter(link => link?.folderId) : [];
  let title = initialTitle || 'Nest';

  $: tiles = links.map(link => ({ link, folder: followLink(link, $directory) }));

  function save(next) {
    links = next;
    shell?.commit(['links'], {}, { links, title });
  }

  function removeLink(folderId) {
    save(links.filter(link => link.folderId !== folderId));
  }

  function openTile(tile) {
    if (tile.folder) folders.open(tile.folder.name);
  }

  // ── Adding a folder: the same menu as "/" on a page, listing folders ──
  let picker = null; // { x, y, query }
  let pickerActive = 0;

  $: linked = new Set(links.map(link => link.folderId));
  $: pickerRows = picker
    ? $directory
        .filter(folder => folder.name !== $currentFolder && !linked.has(folder.id))
        .filter(folder => !picker.query || folder.name.toLocaleLowerCase().includes(picker.query.toLocaleLowerCase()))
        .map(folder => ({ id: folder.id, kind: 'folder', group: 'Folders', name: folder.name, hint: folder.blocks ? `${folder.blocks}` : '' }))
    : [];

  function openPicker(event) {
    shell?.ensureFocus();
    const box = event.currentTarget.getBoundingClientRect();
    picker = { x: box.left, y: box.bottom, query: '' };
    pickerActive = 0;
  }

  function pick(item) {
    picker = null;
    if (!item) return;
    save([...links, { folderId: item.id, name: item.name }]);
  }

  function pickerKey(key) {
    if (key === 'ArrowUp' || key === 'ArrowDown') pickerActive = stepChoice(pickerActive, pickerRows.length, key);
    else if (key === 'Enter' || key === 'Tab') pick(pickerRows[pickerActive]);
    else if (key === 'Escape') picker = null;
  }

  function closePickerOutside(event) {
    if (picker && !event.target.closest?.('.slash-menu, .nest-add')) picker = null;
  }
</script>

<svelte:window on:pointerdown={closePickerOutside} />

<BlockShell
  bind:this={shell}
  {id}
  {initialPosition}
  {initialSize}
  {initialBgColor}
  {initialTextColor}
  {focused}
  {canvasScale}
  {placement}
  label={title}
  minWidth={200}
  minHeight={140}
  fields={{ links, title }}
  on:update
  on:delete
  on:focusToggle
>
  <div class="nest" class:on-page={placement === 'page'}>
    {#if placement === 'page'}
      <div class="nest-title">{title}</div>
    {/if}
    <div class="nest-tiles">
      {#each tiles as tile (tile.link.folderId)}
        <div class="nest-tile" class:missing={!tile.folder}>
          <button
            class="nest-open"
            title={tile.folder ? `Open ${tile.folder.name}` : 'This folder was deleted, or is not on this device'}
            disabled={!tile.folder}
            on:click|stopPropagation={() => openTile(tile)}
          >
            <span class="nest-cover" style={tile.folder?.cover ? `background-image: url("${tile.folder.cover.replace(/"/g, '%22')}")` : ''}></span>
            <span class="nest-name">{tile.folder?.name || tile.link.name || 'Folder'}</span>
            {#if !tile.folder}<span class="nest-note">Not found</span>{/if}
          </button>
          <button class="nest-remove" title="Take out of this nest" aria-label="Take out of this nest" on:click|stopPropagation={() => removeLink(tile.link.folderId)}>×</button>
        </div>
      {/each}
      <button class="nest-tile nest-add" on:click|stopPropagation={openPicker}>＋ Folder</button>
    </div>
  </div>
</BlockShell>

{#if picker}
  <SlashMenu
    items={pickerRows}
    active={pickerActive}
    x={picker.x}
    y={picker.y}
    search
    searchLabel="Search folders…"
    emptyLabel="No other folder"
    on:hover={(e) => (pickerActive = e.detail)}
    on:pick={(e) => pick(e.detail)}
    on:key={(e) => pickerKey(e.detail)}
    on:query={(e) => { picker = { ...picker, query: e.detail }; pickerActive = 0; }}
  />
{/if}

<style>
  .nest {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: 8px;
    box-sizing: border-box;
    color: var(--text);
  }

  .nest.on-page {
    overflow: visible;
    padding: 2px 0;
  }

  .nest-title {
    font-weight: 700;
    font-size: 1.05rem;
    margin-bottom: 8px;
  }

  .nest-tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 10px;
  }

  .nest-tile {
    position: relative;
    min-height: 110px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--text) 22%, transparent);
    overflow: hidden;
  }

  .nest-open {
    width: 100%;
    height: 100%;
    min-height: 110px;
    display: flex;
    flex-direction: column;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .nest-open:hover:not(:disabled) {
    background: color-mix(in srgb, var(--text) 6%, transparent);
  }

  .nest-cover {
    flex: 1 1 auto;
    min-height: 64px;
    background: color-mix(in srgb, var(--text) 10%, transparent) center / cover no-repeat;
  }

  .nest-name {
    padding: 7px 9px;
    font-weight: 600;
    font-size: 0.9rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nest-note {
    padding: 0 9px 7px;
    font-size: 0.75rem;
    opacity: 0.6;
  }

  .nest-tile.missing {
    opacity: 0.55;
  }

  .nest-remove {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: color-mix(in srgb, var(--canvas-inner-bg, #000) 70%, transparent);
    color: inherit;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.12s;
  }

  .nest-tile:hover .nest-remove,
  .nest-remove:focus-visible {
    opacity: 1;
  }

  .nest-add {
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border-style: dashed;
    color: inherit;
    font: inherit;
    font-size: 0.9rem;
    opacity: 0.65;
    cursor: pointer;
  }

  .nest-add:hover {
    opacity: 1;
  }

  /* No hover on a phone: the remove button is always there, faintly. */
  @media (hover: none) {
    .nest-remove {
      opacity: 0.7;
    }
  }
</style>
