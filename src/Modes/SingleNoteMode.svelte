<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import TipTapEditor from '../components/TipTapEditor.svelte';
  import { htmlToText } from '../utils/htmlToText.js';
  import { getReadableTextColor } from '../utils/readableColor.js';
  import { surfaceColors } from '../utils/modeSurface.js';
  import {
    STORAGE_KEY as LAST_NOTE_KEY,
    chooseOpenNote,
    rememberedNote,
    withRememberedNote
  } from '../utils/lastNote.js';
  import { recallScroll, rememberScroll } from '../utils/scrollMemory.js';
  import {
    canReadClipboard,
    pictureAmong,
    pictureAction
  } from '../utils/clipboardPicture.js';
  import { usesPortraitBackground, noteImageFilterCss } from '../utils/modeBackground.js';

  const MOBILE_BREAKPOINT = 1024;

  export let blocks = [];
  export let focusedBlockId = null;
  export let canvasColors = {};
  export let canvasRef;
  /** The open file's name, used only to remember which note was last read. */
  export let fileKey = '';
  export let singleNoteSettings = {};
  /**
   * The on-screen keyboard is up.
   *
   * Asked for: "when the keyboard shows itself you should remove the footer,
   * because it stays and takes proportionally more space." Which it does — the
   * screen loses three hundred pixels to the keyboard and the footer goes on
   * claiming the same slice of what is left, so a bar worth a sliver of a full
   * screen becomes a noticeable band of a short one.
   *
   * Only hidden, never unmounted with the note: the wallpaper and the editor
   * are untouched, so the picture behind stays exactly where it was and the
   * footer comes back the moment the keyboard goes.
   */
  export let keyboardOpen = false;

  // ── Putting a picture in, without the keyboard ───────────────────
  let noteEditor;
  let pictureInput;

  /** A blob as something the editor can hold. */
  function asDataUrl(blob) {
    return new Promise((resolve) => {
      try {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => resolve('');
        reader.readAsDataURL(blob);
      } catch {
        resolve('');
      }
    });
  }

  /**
   * The clipboard first, the file picker if it will not oblige.
   *
   * Falling through rather than reporting a failure is deliberate: the button
   * means "put a picture here", and an old browser, a refused permission and a
   * clipboard holding only text all deserve the same answer. See
   * utils/clipboardPicture.js.
   */
  async function addPicture() {
    const clipboard = typeof navigator === 'undefined' ? null : navigator.clipboard;
    const canRead = canReadClipboard(clipboard);

    let src = '';
    let failed = false;
    if (canRead) {
      try {
        const found = pictureAmong(await clipboard.read());
        if (found) src = await asDataUrl(await found.item.getType(found.type));
      } catch {
        // Refused, unsupported, or nothing readable. All the same from here.
        failed = true;
      }
    }

    if (pictureAction({ canRead, found: Boolean(src), failed }) === 'insert') {
      if (noteEditor?.insertPicture(src)) return;
    }
    pictureInput?.click();
  }

  async function pictureChosen(event) {
    const file = event.currentTarget?.files?.[0];
    // Cleared so that choosing the same file twice in a row still counts.
    if (event.currentTarget) event.currentTarget.value = '';
    if (!file || !String(file.type || '').startsWith('image/')) return;
    const src = await asDataUrl(file);
    if (src) noteEditor?.insertPicture(src);
  }

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
  // The note's own colour, or the theme's for the mode when there is no note.
  // Shared with Playlist mode through utils/modeSurface.js: that mode was asked
  // to look "like in Single Note mode", and two copies of a rule that is meant
  // to match are two things to keep matching.
  $: noteSurface = surfaceColors(noteBlock, canvasTheme);
  $: activeNoteBg = noteSurface.bg;
  $: activeNoteText = noteSurface.text;
  // The scrollbar sits over the background image, so it tracks that image's
  // opacity — but never drops below 20%, or it would vanish entirely on a
  // faint background and leave nothing to grab.
  // Pictures pasted into the note, dimmed like the wallpaper. Handed down as a
  // variable rather than applied here, because the pictures live inside the
  // editor's own markup — this mode does not own them and should not reach in.
  $: noteImageFilter = noteImageFilterCss(singleNoteSettings);
  $: scrollbarAlpha = Math.max(0.2, bgImage ? bgOpacity : 1);
  $: canvasCssVars =
    `--canvas-outer-bg: ${canvasTheme.outerBg}; --canvas-inner-bg: ${canvasTheme.innerBg};` +
    ` --mode-text-color: ${modeTextColor}; --active-note-bg: ${activeNoteBg};` +
    ` --active-note-text: ${activeNoteText}; --sb-alpha: ${scrollbarAlpha};`;

  // Appended rather than folded in, so a note with nothing to dim carries no
  // --note-image-filter at all and the rule below stays inert.
  $: noteImageVars = noteImageFilter ? ` --note-image-filter: ${noteImageFilter};` : '';

  $: noteBlocks = blocks.filter(
    block => block.type === 'text' || block.type === 'cleantext'
  );
  // Which note was open last time, per file. Local to this device and never
  // synced — see utils/lastNote.js for why, and for the deciding.
  //
  // Read from storage at the moment it is needed and written straight back,
  // rather than kept in a variable here. A variable would put the store in the
  // reactive graph, where the statement that writes it feeds the statement that
  // reads it and Svelte refuses to compile the cycle. Re-reading also means a
  // second tab's choice is respected rather than overwritten from a stale copy.
  function readLastOpen() {
    try {
      const raw = localStorage.getItem(LAST_NOTE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function rememberOpenNote(noteId, key) {
    if (!noteId || !key) return;
    const store = readLastOpen();
    const next = withRememberedNote(store, key, noteId);
    if (next === store) return;
    try {
      localStorage.setItem(LAST_NOTE_KEY, JSON.stringify(next));
    } catch {
      // A browser with storage turned off simply opens the first note.
    }
  }

  let selectedNoteId = null;
  $: if (!noteBlocks.length) {
    selectedNoteId = null;
  }
  $: if (
    noteBlocks.length &&
    (!selectedNoteId || !noteBlocks.some(block => block.id === selectedNoteId))
  ) {
    selectedNoteId = chooseOpenNote({
      notes: noteBlocks,
      remembered: rememberedNote(readLastOpen(), fileKey)
    });
  }

  $: rememberOpenNote(selectedNoteId, fileKey);
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

  // A focusScroll that centred the editor on a phone used to live here; see the
  // note in SimpleNoteMode for why it is gone. In short: the browser already
  // scrolls the caret into view, and doing it again — smoothly, and aimed at
  // the middle of the element rather than the caret — is what made the note
  // jump away and come back the first time it was touched.


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
  /* Anchored to the top and drawn at the height the window has when nothing is
     being typed into -- not at the mode's own height.

     The phone keyboard really does shrink the page, on purpose, so the controls
     stay reachable and the caret stays on screen. A picture sized to cover a
     box that just got shorter is re-fitted into it, and a centred picture
     re-fitted shorter looks exactly like it jumped upwards. Holding the height
     still leaves the picture where it was, with its bottom behind the keyboard,
     which is what it looks like it should do.

     Falls back to the old behaviour wherever the variable is not set. */
  .note-bg-clip {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    height: var(--wallpaper-height, auto);
    min-height: 100%;
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
  /* Only when something is set — an unset variable leaves no filter, so a note
     with nothing to dim gets no stacking context it did not ask for. */
  .single-note :global(.tiptap-inner img) {
    filter: var(--note-image-filter);
  }
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

  /* Takes the note's own colours rather than picking any, which is the rule in
     CLAUDE.md: the writing's colour for the mark, and a tint of it for the
     surface, so it sits right on every theme without being told about any. */
  .note-picture {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, currentColor 28%, transparent);
    background: color-mix(in srgb, currentColor 10%, transparent);
    color: inherit;
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
    /* Comfortably past the 44px a thumb wants, since a phone is where this
       matters and there is nothing else to press. */
    min-height: 34px;
  }

  .note-picture:hover {
    background: color-mix(in srgb, currentColor 18%, transparent);
  }

  .note-picture-input {
    display: none;
  }

  :global(.single-note .tiptap-wrap) {
    background: var(--active-note-bg, var(--canvas-inner-bg, #000000));
    color: var(--active-note-text, var(--mode-text-color, #ffffff));
    /* The app's own face, which carries every weight between 100 and 900 —
       see the @font-face in app.css. Arial was named here and has two. */
    font-family: 'Inter', system-ui, Arial, Helvetica, sans-serif;
    font-size: 1.05rem;
    line-height: 1.6;
  }
  :global(.single-note .tiptap-inner) {
    color: var(--active-note-text, var(--mode-text-color, #ffffff));
    padding: 12px;
  }

  /* Half the height it was, on a computer and on a phone alike: 58px for one
     small button was most of a line of writing given over to nothing.

     The height was never really the footer's. A button carries about 10px of
     padding above and below from the browser, which is fine on a button with a
     word in it and absurd on a single character -- 21 of the 42 pixels the
     button occupied were that. So the padding comes off the button and the
     footer's own is evened out, which lands at 29px.

     The horizontal side is deliberately untouched: where the button sits and
     how much room it has across the footer were already right. */
  .note-footer {
    display: flex;
    justify-content: flex-end;
    padding: 4px 12px;
    background: var(--active-note-bg, var(--canvas-inner-bg, #000000));
  }

  /* Out of the way while the keyboard is up.
   *
   * `display: none` rather than a height of zero or a transform, because the
   * point is the space: the screen has just lost three hundred pixels and the
   * footer should stop occupying any of what is left. It is the only thing
   * removed — the wallpaper keeps the height it was already holding and the
   * editor is untouched, so the picture behind does not move while this
   * happens, and the footer is back the moment the keyboard goes. */
  .note-footer.keyboard-open {
    display: none;
  }

  .note-footer button {
    background: transparent;
    border: none;
    color: var(--active-note-text, var(--mode-text-color, #ffffff));
    font-size: 1.1rem;
    padding: 0 6px;
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
  style={canvasCssVars + noteImageVars}
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
      <!--
        The only way to put a picture in a note on a phone.

        Dragging one in needs a mouse, and the keyboard's own clipboard refuses:
        it does not paste a picture, it offers one, and the app has to have said
        it accepts them. In the Android app that is ours to declare and we do —
        but on the website it is Chrome's to declare, and Chrome says no. So
        this asks the clipboard directly, and falls back to choosing a file,
        neither of which goes through the keyboard at all.
      -->
      <button class="note-picture" on:click={addPicture} title="Put a picture in this note">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="8.5" cy="10.5" r="1.5" fill="currentColor" stroke="none" />
          <path d="M21 16l-5-5L6 19" />
        </svg>
        Picture
      </button>
      <input
        class="note-picture-input"
        type="file"
        accept="image/*"
        bind:this={pictureInput}
        on:change={pictureChosen}
      />
    </div>
    {#key noteBlock.id}
      <TipTapEditor
        bind:this={noteEditor}
        content={noteContent}
        historyKey={noteBlock.id}
        initialScrollTop={recallScroll(fileKey, noteBlock.id)}
        placeholder="Write your note here..."
        on:change={(e) => {
          updateBlock(noteBlock.id, { content: e.detail }, { pushToHistory: false, changedKeys: ['content'] });
        }}
        on:scroll={(e) => rememberScroll(fileKey, noteBlock.id, e.detail)}
        on:focus={() => ensureFocus(noteBlock.id)}
      />
    {/key}

    <div class="note-footer" class:keyboard-open={keyboardOpen}>
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
