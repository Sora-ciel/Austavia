<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import TipTapEditor from '../components/TipTapEditor.svelte';
  import { htmlToText } from '../utils/htmlToText.js';
  import { getReadableTextColor } from '../utils/readableColor.js';
  import { usesPortraitBackground } from '../utils/modeBackground.js';

  const MOBILE_BREAKPOINT = 1024;

  export let blocks = [];
  export let focusedBlockId = null;
  export let canvasColors = {};
  export let canvasRef;
  export let singleNoteSettings = {};

  const dispatch = createEventDispatcher();

  // Per-file background image settings — desktop and phone can each have
  // their own image, picked by the same breakpoint the toolbar uses.
  // Which of the two images to show is decided by the shape of the screen, not
  // its width: a phone turned sideways is still narrower than a desktop, so a
  // width threshold never reached the wide picture. See modeBackground.js.
  let isMobileViewport =
    typeof window !== 'undefined' &&
    usesPortraitBackground({ width: window.innerWidth, height: window.innerHeight });
  function updateViewport() {
    isMobileViewport = usesPortraitBackground({ width: window.innerWidth, height: window.innerHeight });
  }
  // ── Idle-hiding scrollbar ────────────────────────────────────────
  // Fades the thumb out after a few seconds of not scrolling so it stops
  // cluttering the page, and brings it back on scroll or when the pointer
  // comes near the right edge. Only the colour changes — the gutter stays
  // reserved, so nothing reflows as it appears and disappears.
  const SCROLLBAR_IDLE_MS = 5000;
  const SCROLLBAR_EDGE_PX = 60;
  let scrollbarIdle = true;
  let scrollbarIdleTimer;

  function wakeScrollbar() {
    scrollbarIdle = false;
    clearTimeout(scrollbarIdleTimer);
    scrollbarIdleTimer = setTimeout(() => { scrollbarIdle = true; }, SCROLLBAR_IDLE_MS);
  }

  function handleNotePointerMove(event) {
    if (!canvasRef) return;
    const nearRightEdge =
      event.clientX >= canvasRef.getBoundingClientRect().right - SCROLLBAR_EDGE_PX;
    if (nearRightEdge) wakeScrollbar();
  }

  onMount(() => {
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      clearTimeout(scrollbarIdleTimer);
    };
  });

  $: bgImage = (isMobileViewport ? singleNoteSettings?.backgroundImageMobile : singleNoteSettings?.backgroundImage) || '';
  // 0–100: 100 shows the image fully opaque, 0 hides it entirely.
  $: bgOpacity = Math.min(100, Math.max(0, Number(singleNoteSettings?.bgOpacity ?? 100))) / 100;
  $: bgBlur = singleNoteSettings?.bgBlur ?? 0;
  // 0–200 luminosity of the image itself: 100 leaves it as-is, 0 is black,
  // 200 is double brightness. Opacity stays a separate control.
  $: bgLuminosity = singleNoteSettings?.bgLuminosity ?? 100;
  $: bgSize = singleNoteSettings?.bgSize || 'cover';
  $: bgBrightness = Math.min(200, Math.max(0, Number(bgLuminosity) || 0)) / 100;
  // blur() and brightness() must share one filter chain — a second `filter`
  // declaration replaces the first rather than adding to it.
  $: bgFilter = `blur(${bgBlur}px) brightness(${bgBrightness})`;
  // blur() samples transparency from beyond the element's edges, which is what
  // washes the borders out. Oversize the layer by a few blur radii and clip it
  // back, so only fully-sampled pixels are ever visible.
  $: bgBleed = Math.ceil(Number(bgBlur) || 0) * 3;

  const defaultCanvasColors = {
    outerBg: '#000000',
    innerBg: '#000000'
  };

  $: canvasTheme = { ...defaultCanvasColors, ...(canvasColors || {}) };
  $: modeTextColor = canvasTheme.textColor || getReadableTextColor(canvasTheme.innerBg);
  $: activeNoteBg = noteBlock?.bgColor || canvasTheme.innerBg;
  $: activeNoteText = noteBlock?.textColor || getReadableTextColor(activeNoteBg);
  // The scrollbar sits over the background image, so it tracks that image's
  // opacity — but never drops below 20%, or it would vanish entirely on a
  // faint background and leave nothing to grab.
  $: scrollbarAlpha = Math.max(0.2, bgImage ? bgOpacity : 1);
  $: canvasCssVars =
    `--canvas-outer-bg: ${canvasTheme.outerBg}; --canvas-inner-bg: ${canvasTheme.innerBg};` +
    ` --mode-text-color: ${modeTextColor}; --active-note-bg: ${activeNoteBg};` +
    ` --active-note-text: ${activeNoteText}; --sb-alpha: ${scrollbarAlpha};`;

  $: noteBlocks = blocks.filter(
    block => block.type === 'text' || block.type === 'cleantext'
  );
  let selectedNoteId = null;
  $: if (!selectedNoteId && noteBlocks.length) {
    selectedNoteId = noteBlocks[0].id;
  }
  $: if (!noteBlocks.length) {
    selectedNoteId = null;
  }
  $: if (
    selectedNoteId &&
    !noteBlocks.some(block => block.id === selectedNoteId)
  ) {
    selectedNoteId = noteBlocks[0]?.id ?? null;
  }
  $: noteBlock =
    noteBlocks.find(block => block.id === selectedNoteId) || null;
  $: noteContent = noteBlock?.content ?? '';
  $: notePlainText = htmlToText(noteContent);
  $: wordCount = countWords(notePlainText);
  $: characterCount = notePlainText.length;
  $: hasHiddenBlocks = blocks.some(
    block => block.type !== 'text' && block.type !== 'cleantext'
  );
  $: noteCount = noteBlocks.length;

  function countWords(text) {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }

  function updateBlock(id, updates, { pushToHistory, changedKeys } = {}) {
    const detail = { id, ...updates };
    const effectiveKeys = Array.isArray(changedKeys) && changedKeys.length
      ? changedKeys
      : Object.keys(updates || {});

    if (effectiveKeys.length) detail.changedKeys = effectiveKeys;
    if (pushToHistory !== undefined) detail.pushToHistory = pushToHistory;

    dispatch('update', detail);
  }

  function deleteBlock(id) {
    dispatch('delete', { id });
  }

  function ensureFocus(id) {
    if (focusedBlockId !== id) {
      dispatch('focusToggle', { id });
    }
  }

  function focusScroll(el) {
    if (!el) return;
    if (window.innerWidth <= 1024) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }


  function getNoteLabel(block, index) {
    const content = htmlToText(block?.content || '');
    const firstLine = content.split('\n')[0]?.trim();
    if (firstLine) {
      const trimmed = firstLine.length > 28 ? `${firstLine.slice(0, 28)}…` : firstLine;
      return trimmed;
    }
    return `Note ${index + 1}`;
  }

  function getTabStyle(block) {
    const bg = block?.bgColor || canvasTheme.outerBg;
    const text = block?.textColor || getReadableTextColor(bg);
    return `--tab-bg: ${bg}; --tab-text: ${text};`;
  }
</script>

<style>
  .single-note {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background: var(--active-note-bg, var(--canvas-inner-bg, #000000));
    color: var(--mode-text-color, #ffffff);
    box-sizing: border-box;
    position: relative;
    /* Scrollbars here match the note surface they sit on, at the background's
       own opacity (floored at 20% by --sb-alpha so they never fully vanish). */
    --sb-track: transparent;
    --sb-thumb: color-mix(
      in srgb,
      var(--active-note-text, var(--mode-text-color, #ffffff)) calc(var(--sb-alpha, 1) * 100%),
      transparent
    );
  }

  /* Untouched for a few seconds: fade the thumb away but keep the gutter, so
     the page never reflows when it comes back. */
  .single-note.sb-idle {
    --sb-thumb: transparent;
  }
  .single-note :global(*) {
    transition: scrollbar-color 0.35s ease;
  }

  .note-tabs {
    display: flex;
    gap: 8px;
    padding: 4px 6px 4px;
    overflow-x: auto;
    /* A scrollbar in this strip would add to its height and make the row
       jump the moment the tabs overflow. Swipe/drag it instead. */
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .note-tabs::-webkit-scrollbar { display: none; }

  .note-tab {
    /* Flex items shrink by default, so with several tabs the box narrowed
       while nowrap kept the label full width — the text spilled out past the
       tab's own background. Never shrink below the label. */
    flex: 0 0 auto;
    border: 1px solid color-mix(in srgb, var(--tab-text, #ffffff) 50%, transparent);
    background: color-mix(in srgb, var(--tab-bg, #000000) 88%, #000000 12%);
    color: var(--tab-text, inherit);
    padding: 6px 12px;
    border-radius: 9px;
    font-size: 0.85rem;
    cursor: pointer;
    white-space: nowrap;
  }

  .note-tab[aria-selected='true'] {
    border-color: var(--tab-text);
    background: var(--tab-bg, rgba(255, 255, 255, 0.12));
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--tab-text, #ffffff) 55%, transparent);
  }

  .note-tab:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.7);
    outline-offset: 2px;
  }

  /* Per-file background image sitting behind the text */
  /* Crops the oversized blurred layer back to the note's bounds. */
  .note-bg-clip {
    position: absolute;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
  }
  .note-bg-layer {
    position: absolute;
    inset: 0;
    background-position: center;
    background-repeat: no-repeat;
    pointer-events: none;
  }
  /* When a bg image is set, let it show through the note surfaces */
  .single-note.has-bg-image .note-meta,
  .single-note.has-bg-image .note-footer { background: transparent; }
  .single-note.has-bg-image :global(.tiptap-wrap) { background: transparent; }
  .single-note > .note-tabs,
  .single-note > .note-meta,
  .single-note > :global(.tiptap-wrap),
  .single-note > .note-footer { position: relative; z-index: 1; }

  /* Only the editor flexes. Without this the tabs, the word count and the
     footer all default to flex-shrink: 1, so a growing note squeezed them a
     little further with every line instead of scrolling inside the editor. */
  .single-note > .note-tabs,
  .single-note > .note-meta,
  .single-note > .note-footer { flex: 0 0 auto; }

  .note-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 8px 12px;
    box-sizing: border-box;
    background: var(--active-note-bg);
    color: var(--active-note-text, inherit);
  }

  .note-stats {
    display: flex;
    gap: 12px;
    font-size: 0.85rem;
    letter-spacing: 0.02em;
    color: inherit;
  }

  .note-stats span {
    background: transparent;
    padding: 0;
    border-radius: 0;
  }

  :global(.single-note .tiptap-wrap) {
    background: var(--active-note-bg, var(--canvas-inner-bg, #000000));
    color: var(--active-note-text, var(--mode-text-color, #ffffff));
    font-family: Arial, Helvetica, sans-serif;
    font-size: 1.05rem;
    line-height: 1.6;
  }
  :global(.single-note .tiptap-inner) {
    color: var(--active-note-text, var(--mode-text-color, #ffffff));
    padding: 12px;
  }

  .note-footer {
    display: flex;
    justify-content: flex-end;
    padding: 6px 12px 10px;
    background: var(--active-note-bg, var(--canvas-inner-bg, #000000));
  }

  .note-footer button {
    background: transparent;
    border: none;
    color: var(--active-note-text, var(--mode-text-color, #ffffff));
    font-size: 1.1rem;
    cursor: pointer;
  }

  .note-warning {
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.7);
    background: transparent;
    padding: 8px 12px 16px;
    border-radius: 0;
    text-align: left;
  }

  .empty-state {
    border: 1px dashed rgba(255, 255, 255, 0.4);
    border-radius: 12px;
    padding: 16px;
    margin: 12px;
    text-align: left;
    color: rgba(255, 255, 255, 0.8);
  }
</style>

<div
  class="single-note"
  class:has-bg-image={bgImage}
  class:sb-idle={scrollbarIdle}
  bind:this={canvasRef}
  style={canvasCssVars}
  on:scroll|capture={wakeScrollbar}
  on:pointermove={handleNotePointerMove}
  on:wheel|passive={wakeScrollbar}
>
  {#if bgImage}
    <div class="note-bg-clip">
      <div
        class="note-bg-layer"
        style="background-image:url('{bgImage}'); opacity:{bgOpacity}; filter:{bgFilter}; background-size:{bgSize}; inset:-{bgBleed}px;"
      ></div>
    </div>
  {/if}
  {#if noteBlock}
    {#if noteCount > 1}
      <div class="note-tabs" role="tablist" aria-label="Notes">
        {#each noteBlocks as block, index (block.id)}
          <button
            class="note-tab"
            role="tab"
            aria-selected={block.id === selectedNoteId}
            style={getTabStyle(block)}
            on:click={() => {
              selectedNoteId = block.id;
            }}
          >
            {getNoteLabel(block, index)}
          </button>
        {/each}
      </div>
    {/if}
    <div class="note-meta">
      <div class="note-stats">
        <span>Words: {wordCount}</span>
        <span>Characters: {characterCount}</span>
      </div>
    </div>
    {#key noteBlock.id}
      <TipTapEditor
        content={noteContent}
        historyKey={noteBlock.id}
        placeholder="Write your note here..."
        on:change={(e) => {
          updateBlock(noteBlock.id, { content: e.detail }, { pushToHistory: false, changedKeys: ['content'] });
        }}
        on:focus={(e) => {
          focusScroll(e.detail?.target);
          ensureFocus(noteBlock.id);
        }}
      />
    {/key}

    <div class="note-footer">
      <button on:click={() => deleteBlock(noteBlock.id)} aria-label="Delete note">
        ×
      </button>
    </div>


  {:else}
    <div class="empty-state">
      No text note found yet. Add a text or clean text block to start a note
      file.
    </div>
  {/if}
</div>
