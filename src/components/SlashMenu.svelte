<script>
  /**
   * The menu of blocks to put on a page: a new one of each kind, then the
   * folder's blocks not on the page yet. Opened by "/" in the writing, where
   * what is typed after the "/" filters it and the editor hands over the
   * arrows, Enter and Escape; or by the "＋ Block…" button, with a search
   * field of its own. The rows are utils/slashMenu.js's slashItems.
   *
   * Asked 2026-11-04: "i want the typing to insert a block and the if you
   * want to add a block that already exist."
   *
   * Pressing a row keeps the focus where it was (pointerdown is cancelled),
   * so the writing the "/" was typed in is still there to split.
   */
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import { portal } from '../utils/portal.js';
  import { menuPlacement, MENU_MAX_HEIGHT } from '../utils/slashMenu.js';

  export let items = [];
  export let active = 0;
  export let x = 0;
  export let y = 0;
  /** The menu's own search field, for when it was opened by a button. */
  export let search = false;
  export let query = '';
  /** The colours of the page it opens over. */
  export let themeStyle = '';
  /** What the search field says before anything is typed. */
  export let searchLabel = 'Search blocks…';
  /** Shown when nothing matches. */
  export let emptyLabel = 'No block matches';

  // Rows come in groups -- `group` when a row names its own, else new blocks
  // and blocks already in the folder.
  const groupOf = item => item.group ?? (item.kind === 'new' ? 'New' : 'Already in this folder');

  const dispatch = createEventDispatcher();
  let menuEl;
  let searchEl;

  // Kept where it can be seen: under the caret, or above it, inside the part
  // of the screen a phone's keyboard leaves (menuPlacement in
  // utils/slashMenu.js), and placed again when the keyboard opens or shuts.
  let left = x;
  let top = y;
  let maxHeight = MENU_MAX_HEIGHT;
  async function place() {
    await tick();
    if (!menuEl) return;
    const vv = window.visualViewport;
    const view = vv
      ? { top: vv.offsetTop, bottom: vv.offsetTop + vv.height, left: vv.offsetLeft, right: vv.offsetLeft + vv.width }
      : { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth };
    const box = menuEl.getBoundingClientRect();
    ({ left, top, maxHeight } = menuPlacement({ x, y, width: box.width, height: menuEl.scrollHeight, view }));
  }
  $: x, y, items.length, place();

  // The highlighted row stays in view as the arrows move it.
  $: if (menuEl) menuEl.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });

  function onSearchKey(event) {
    if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(event.key)) {
      event.preventDefault();
      dispatch('key', event.key);
    }
  }

  onMount(() => {
    if (search) searchEl?.focus();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', place);
    vv?.addEventListener('scroll', place);
    return () => {
      vv?.removeEventListener('resize', place);
      vv?.removeEventListener('scroll', place);
    };
  });
</script>

<div
  class="slash-menu"
  role="listbox"
  aria-label="Blocks"
  bind:this={menuEl}
  use:portal
  style="{themeStyle} left:{left}px; top:{top}px; max-height:{maxHeight}px;"
>
  {#if search}
    <input
      class="slash-search"
      placeholder={searchLabel}
      aria-label={searchLabel}
      bind:this={searchEl}
      bind:value={query}
      on:input={() => dispatch('query', query)}
      on:keydown={onSearchKey}
    />
  {/if}
  {#each items as item, i (item.id)}
    {#if i === 0 || groupOf(item) !== groupOf(items[i - 1])}
      <div class="slash-group">{groupOf(item)}</div>
    {/if}
    <button
      class="slash-row"
      class:active={i === active}
      role="option"
      aria-selected={i === active}
      data-index={i}
      on:pointerdown|preventDefault
      on:mouseenter={() => dispatch('hover', i)}
      on:click={() => dispatch('pick', item)}
    >
      <span class="slash-name">{item.name}</span>
      {#if item.hint && item.kind !== 'new'}<span class="slash-hint">{item.hint}</span>{/if}
    </button>
  {:else}
    <div class="slash-none">{emptyLabel}</div>
  {/each}
</div>

<style>
  .slash-menu {
    position: fixed;
    z-index: 1000;
    width: 260px;
    max-height: 340px;
    overflow-y: auto;
    padding: 6px;
    box-sizing: border-box;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--mode-text-color, #fff) 22%, transparent);
    background: var(--canvas-inner-bg, #111);
    color: var(--mode-text-color, #fff);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
    --sb-thumb: var(--mode-text-color, #fff);
    --sb-track: var(--canvas-inner-bg, #111);
  }

  .slash-search {
    width: 100%;
    box-sizing: border-box;
    margin-bottom: 4px;
    padding: 6px 8px;
    border-radius: 6px;
    border: 1px solid color-mix(in srgb, currentColor 28%, transparent);
    background: color-mix(in srgb, currentColor 6%, transparent);
    color: inherit;
    font: inherit;
    outline: none;
  }

  .slash-group {
    padding: 6px 8px 2px;
    font-size: 0.72rem;
    opacity: 0.55;
  }

  .slash-row {
    width: 100%;
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 7px 8px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .slash-row.active {
    background: color-mix(in srgb, currentColor 12%, transparent);
  }

  .slash-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .slash-hint {
    flex: none;
    font-size: 0.75rem;
    opacity: 0.55;
  }

  .slash-none {
    padding: 8px;
    opacity: 0.55;
  }
</style>
