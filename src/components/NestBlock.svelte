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
   *
   * It also holds pages of this folder (2026-11-10: "you should be able to
   * choose new folder or new page too. so that pages can be nested in pages
   * instead of always being a different folder"): a link `{ pageId, name }`
   * to a page block (PageBlock.svelte). "＋ Add" offers a new folder, a new
   * page, this folder's pages and the other folders. Pictures and web links
   * are PENDING step 6.
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
  /** The tiles' width on a page, set in its edit mode (per layout); the default when none. */
  export let tileSize = undefined;

  const appDialogs = getContext('appDialogs');
  const folders = getContext('folders') || {
    directory: readable([]), current: readable(''), pages: readable([]),
    open: () => {}, openPage: () => {}, newFolder: async () => null, newPage: () => null
  };
  const directory = folders.directory;
  const currentFolder = folders.current;
  const pages = folders.pages;

  let shell;
  const linkKey = link => (link.pageId ? `page:${link.pageId}` : link.folderId);
  let links = Array.isArray(initialLinks) ? initialLinks.filter(link => link?.folderId || link?.pageId) : [];
  let title = initialTitle || 'Nest';

  // What each link leads to now, looked up each time: a folder by its id, a
  // page by its block in this folder.
  $: tiles = links.map(link => {
    if (link.pageId) {
      const page = $pages.find(p => p.id === link.pageId);
      return { link, key: linkKey(link), page, name: page?.title || link.name || 'Page', found: Boolean(page) };
    }
    const folder = followLink(link, $directory);
    return { link, key: linkKey(link), folder, name: folder?.name || link.name || 'Folder', found: Boolean(folder) };
  });

  function save(next) {
    links = next;
    shell?.commit(['links'], {}, { links, title });
  }

  function removeLink(key) {
    save(links.filter(link => linkKey(link) !== key));
  }

  function openTile(tile) {
    if (tile.page) folders.openPage(tile.page.id);
    else if (tile.folder) folders.open(tile.folder.name);
  }

  // ── Adding a folder: the same menu as "/" on a page, listing folders ──
  let picker = null; // { x, y, query }
  let pickerActive = 0;

  $: linked = new Set(links.map(linkKey));
  const matches = (name, query) => !query || name.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  $: pickerRows = picker
    ? [
        { id: '__newPage', kind: 'make', group: 'New', name: 'New page' },
        { id: '__newFolder', kind: 'make', group: 'New', name: 'New folder' },
        ...$pages
          .filter(page => !linked.has(`page:${page.id}`) && matches(page.title || 'Untitled page', picker.query))
          .map(page => ({ id: `page:${page.id}`, pageId: page.id, kind: 'page', group: 'Pages in this folder', name: page.title || 'Untitled page' })),
        ...$directory
          .filter(folder => folder.name !== $currentFolder && !linked.has(folder.id) && matches(folder.name, picker.query))
          .map(folder => ({ id: folder.id, kind: 'folder', group: 'Folders', name: folder.name, hint: folder.blocks ? `${folder.blocks}` : '' }))
      ]
    : [];

  function openPicker(event) {
    shell?.ensureFocus();
    const box = event.currentTarget.getBoundingClientRect();
    picker = { x: box.left, y: box.bottom, query: '' };
    pickerActive = 0;
  }

  async function pick(item) {
    picker = null;
    if (!item) return;
    if (item.id === '__newPage' || item.id === '__newFolder') {
      const isPage = item.id === '__newPage';
      const typed = await appDialogs?.prompt(isPage ? 'Name of the new page:' : 'Name of the new folder:', '');
      const name = String(typed ?? '').trim();
      if (!name) return;
      if (isPage) {
        const pageId = folders.newPage(name);
        if (pageId) save([...links, { pageId, name }]);
      } else {
        const made = await folders.newFolder(name);
        if (made) save([...links, { folderId: made.id, name: made.name }]);
      }
      return;
    }
    if (item.kind === 'page') save([...links, { pageId: item.pageId, name: item.name }]);
    else save([...links, { folderId: item.id, name: item.name }]);
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
  <div class="nest" class:on-page={placement === 'page'} class:sized={Boolean(tileSize)} style={tileSize ? `--tile: ${tileSize}px;` : ''}>
    {#if placement === 'page'}
      <div class="nest-title">{title}</div>
    {/if}
    <div class="nest-tiles">
      {#each tiles as tile (tile.key)}
        <div class="nest-tile" class:missing={!tile.found} class:is-page={Boolean(tile.link.pageId)}>
          <button
            class="nest-open"
            title={tile.found ? `Open ${tile.name}` : (tile.link.pageId ? 'This page was deleted' : 'This folder was deleted, or is not on this device')}
            disabled={!tile.found}
            on:click|stopPropagation={() => openTile(tile)}
          >
            {#if tile.link.pageId && tile.page?.cover}
              <span class="nest-cover" style={`background-image: url("${tile.page.cover.replace(/"/g, '%22')}")`}></span>
            {:else if tile.link.pageId}
              <span class="nest-cover nest-page-cover" aria-hidden="true">▤</span>
            {:else}
              <span class="nest-cover" style={tile.folder?.cover ? `background-image: url("${tile.folder.cover.replace(/"/g, '%22')}")` : ''}></span>
            {/if}
            <span class="nest-name">{tile.name}</span>
            {#if !tile.found}<span class="nest-note">Not found</span>{/if}
          </button>
          <button class="nest-remove" title="Take out of this nest" aria-label="Take out of this nest" on:click|stopPropagation={() => removeLink(tile.key)}>×</button>
        </div>
      {/each}
      <button class="nest-tile nest-add" on:click|stopPropagation={openPicker}>＋ Add</button>
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
    searchLabel="Search pages and folders…"
    emptyLabel="Nothing else to add"
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

  .nest-page-cover {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2rem;
    opacity: 0.55;
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

  /* On a page on a computer, bigger tiles: asked 2026-11-10, "the default
     size of each nest block is a bit bigger than that for pcs. right now
     it's a bit small". A phone keeps the smaller ones, two to a row. */
  @media (min-width: 701px) {
    .nest.on-page .nest-tiles {
      grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
      gap: 14px;
    }
    .nest.on-page .nest-tile,
    .nest.on-page .nest-open {
      min-height: 190px;
    }
    .nest.on-page .nest-cover {
      min-height: 140px;
    }
    .nest.on-page .nest-name {
      font-size: 1rem;
      padding: 9px 11px;
    }
  }

  /* A size chosen in Page mode's edit mode, on any screen. */
  .nest.sized .nest-tiles {
    grid-template-columns: repeat(auto-fill, minmax(var(--tile), 1fr)) !important;
  }
  .nest.sized .nest-tile,
  .nest.sized .nest-open {
    min-height: calc(var(--tile) * 0.9) !important;
  }
  .nest.sized .nest-cover {
    min-height: calc(var(--tile) * 0.65) !important;
  }

  /* No hover on a phone: the remove button is always there, faintly. */
  @media (hover: none) {
    .nest-remove {
      opacity: 0.7;
    }
  }
</style>
