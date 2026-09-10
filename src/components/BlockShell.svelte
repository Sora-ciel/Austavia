<script>
  /**
   * Everything a canvas block has regardless of what is inside it: where it
   * sits, how big it is, its two colours, its header, dragging, resizing,
   * focus, and the update it sends when any of that changes.
   *
   * This was written five times over — once in each block component — and the
   * copies were identical in behaviour and different in spelling, which is the
   * state a thing is in just before it starts being different in behaviour
   * too. A fix to dragging had to be made five times, and the fifth was the one
   * that got missed.
   *
   * A block type now supplies only what makes it that type: a label, whatever
   * fields it saves, and a body. The maths is in utils/blockGeometry.js where
   * it can be tested; the listening lives here, where there is a DOM.
   *
   * The body reaches what it needs through slot props rather than reaching back
   * into the shell:
   *
   *   commit(keys, opts)  save these fields — live edits pass
   *                       { pushToHistory: false }, releases pass nothing
   *   ensureFocus()       ask the parent to focus this block
   *   size, position      the live values, for a body that must lay itself out
   */
  import { createEventDispatcher } from 'svelte';
  import { isPrimaryPointer } from '../utils/pointer.js';
  import {
    MIN_WIDTH,
    MIN_HEIGHT,
    canvasPoint,
    grabOffset,
    draggedPosition,
    resizedSize
  } from '../utils/blockGeometry.js';
  import ColorField from './ColorField.svelte';

  export let id;
  export let initialPosition = { x: 100, y: 100 };
  export let initialSize = { width: 300, height: 200 };
  export let initialBgColor = '#000000';
  export let initialTextColor = '#ffffff';
  export let focused = false;
  export let canvasScale = 1;

  /** Shown in the header. The block's type, in the user's words. */
  export let label = '';
  /**
   * The fields this block type saves beyond the frame's own — `content` for
   * text, `src` for an image, `tasks` for a list. Passed in from the body so
   * that one update carries the whole block, whichever part of it moved.
   */
  export let fields = {};
  /** A type may refuse to be made as small as the default floor allows. */
  export let minWidth = MIN_WIDTH;
  export let minHeight = MIN_HEIGHT;
  /** Extra classes for a type that styles its own frame. */
  export let className = '';

  const dispatch = createEventDispatcher();

  let position = { ...initialPosition };
  let size = { ...initialSize };
  let bgColor = initialBgColor;
  let textColor = initialTextColor;

  let dragging = false;
  let resizing = false;
  let offset = { x: 0, y: 0 };
  let resizeStart = {};
  // A drag and a click arrive as the same gesture; without this, letting go
  // after moving a block would also count as clicking it.
  let suppressClick = false;
  let hasDragged = false;
  let hasResized = false;

  function commit(changedKeys, { pushToHistory } = {}) {
    const keys = Array.isArray(changedKeys) && changedKeys.length ? changedKeys : [];
    const detail = { id, position, size, bgColor, textColor, ...fields };

    if (keys.length) detail.changedKeys = keys;
    if (pushToHistory !== undefined) detail.pushToHistory = pushToHistory;

    dispatch('update', detail);
  }

  function ensureFocus() {
    if (!focused) dispatch('focusToggle', { id });
  }

  function settle() {
    suppressClick = true;
    requestAnimationFrame(() => (suppressClick = false));
  }

  function onDragStart(e) {
    // Right-click is canvas pan, not block drag.
    if (!isPrimaryPointer(e)) return;
    if (dragging) return;
    ensureFocus();
    dragging = true;
    hasDragged = false;

    offset = grabOffset(canvasPoint(e, canvasScale), position);

    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);
    window.addEventListener('touchmove', onDragMove, { passive: false });
    window.addEventListener('touchend', onDragEnd);
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd);

    if (typeof e.pointerId === 'number' && e.currentTarget?.setPointerCapture) {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  }

  function onDragMove(e) {
    if (!dragging) return;
    position = draggedPosition(canvasPoint(e, canvasScale), offset);
    hasDragged = true;
    if (e.cancelable) e.preventDefault(); // stop the page scrolling on mobile
  }

  function onDragEnd() {
    dragging = false;
    resizing = false;
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', onDragMove);
    window.removeEventListener('mouseup', onDragEnd);
    window.removeEventListener('touchmove', onDragMove);
    window.removeEventListener('touchend', onDragEnd);
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);
    commit(['position']);
    if (hasDragged) {
      hasDragged = false;
      settle();
    }
  }

  function onResizeStart(e) {
    e.stopPropagation();
    ensureFocus();
    resizing = true;
    hasResized = false;
    document.body.style.userSelect = 'none';

    const point = canvasPoint(e, canvasScale);
    resizeStart = { x: point.x, y: point.y, ...size };

    window.addEventListener('mousemove', onResizeMove);
    window.addEventListener('mouseup', onResizeEnd);
    window.addEventListener('touchmove', onResizeMove, { passive: false });
    window.addEventListener('touchend', onResizeEnd);
  }

  function onResizeMove(e) {
    if (!resizing) return;
    size = resizedSize(canvasPoint(e, canvasScale), resizeStart, { minWidth, minHeight });
    hasResized = true;
    if (e.cancelable) e.preventDefault();
  }

  function onResizeEnd() {
    resizing = false;
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', onResizeMove);
    window.removeEventListener('mouseup', onResizeEnd);
    window.removeEventListener('touchmove', onResizeMove);
    window.removeEventListener('touchend', onResizeEnd);
    commit(['size']);
    if (hasResized) {
      hasResized = false;
      settle();
    }
  }

  function deleteBlock() {
    dispatch('delete', { id });
  }

  function handleClick(event) {
    if (suppressClick) return;
    if (event.defaultPrevented) return;
    ensureFocus();
  }

  function handleKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    // Only the frame itself; a key pressed inside the body belongs to the body.
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    handleClick(event);
  }
</script>

<div
  class="note {className}"
  class:focused
  data-block-id={id}
  style="left:{position.x}px; top:{position.y}px; width:{size.width}px; height:{size.height}px; --bg: {bgColor}; --text: color-mix(in srgb, {textColor} var(--block-text-opacity, 100%), transparent);"
  role="button"
  tabindex="0"
  aria-pressed={focused}
  on:click={handleClick}
  on:keydown={handleKeydown}
>
  <div
    class="header"
    on:mousedown={onDragStart}
    on:pointerdown={onDragStart}
    on:touchstart={onDragStart}
    role="presentation"
  >
    <span>{label}</span>
    <div
      class="header-controls"
      on:mousedown|stopPropagation
      on:pointerdown|stopPropagation
      on:touchstart|stopPropagation
      role="presentation"
    >
      <slot name="header-controls" {commit} {ensureFocus} />
      <ColorField
        value={bgColor}
        title="Background"
        placement="side"
        on:input={(e) => { bgColor = e.detail; commit(['bgColor'], { pushToHistory: false }); }}
        on:change={(e) => { bgColor = e.detail; commit(['bgColor']); }}
      />
      <ColorField
        value={textColor}
        title="Text"
        placement="side"
        on:input={(e) => { textColor = e.detail; commit(['textColor'], { pushToHistory: false }); }}
        on:change={(e) => { textColor = e.detail; commit(['textColor']); }}
      />
      <button class="delete-btn" on:click|stopPropagation={deleteBlock}>×</button>
    </div>
  </div>

  <slot {commit} {ensureFocus} {size} {position} />

  <div
    class="resize-handle"
    role="presentation"
    on:mousedown={onResizeStart}
    on:touchstart={onResizeStart}
  ></div>
</div>

<style>
  .note {
    /* scrollbars inside the block follow the block's own colors */
    --sb-track: var(--bg);
    --sb-thumb: var(--text);
    position: absolute;
    border: var(--block-border-width, 1px) solid var(--block-border-color, var(--text));
    border-radius: var(--block-border-radius, 12px);
    box-shadow: var(--block-shadow, 0 0 2px 1px var(--text), 0 0 6px 2px var(--text));
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background-color: color-mix(in srgb, var(--block-surface, var(--bg)) var(--block-bg-opacity, 100%), transparent);
    color: var(--text);
    outline: 2px solid transparent;
    transition: box-shadow 0.15s ease, outline 0.15s ease;
    font-family: var(--block-body-font, inherit);
  }
  .note.focused {
    outline: 2px solid var(--block-focus-outline, rgba(110, 168, 255, 0.85));
    box-shadow: var(--block-focus-shadow, 0 0 0 2px rgba(110, 168, 255, 0.35), 0 0 12px rgba(110, 168, 255, 0.5));
  }
  .header {
    padding: 6px 10px;
    background: color-mix(in srgb, var(--block-header-bg, var(--bg)) var(--block-header-opacity, 100%), transparent);
    color: var(--block-header-text, var(--text));
    font-size: 0.85rem;
    cursor: move;
    touch-action: none;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: var(--block-header-font, var(--block-body-font, inherit));
    letter-spacing: var(--block-header-letter-spacing, 0.08em);
    text-transform: var(--block-header-transform, uppercase);
  }
  .header-controls {
    display: flex;
    gap: 4px;
  }
  /* No background or colour here any more. Both were overrides of what the
     editor imposed on itself, at the same specificity, so the winner depended
     on stylesheet order — the editor defaults to transparent and inherit now,
     and a block's own colours reach it the ordinary way. */
  /* A block only takes the finger while it is focused.
     The wheel is decided in CanvasMode, which can inspect what is under the
     pointer; touch scrolling is the browser's own and has to be settled here.
     Left scrollable, an unfocused block swallows every drag that begins over
     it — and on a full board that is most of the screen, so the canvas cannot
     be moved at all.

     Inert rather than `overflow: hidden`, which was tried first and is wrong:
     making a scroller unscrollable clamps it to the top, so clicking away from
     a long note threw away where you had read up to. Untouchable leaves the
     scroller exactly as it was — the position is still there when you come
     back. The drag falls through to the canvas, and a tap lands on the block
     itself, which is what focuses it. */
  .note:not(.focused) :global(.tiptap-wrap) {
    pointer-events: none;
  }

  :global(.note .tiptap-wrap) {
    font-size: 1.1rem;
    font-weight: 500;
    font-family: var(--block-body-font, inherit);
  }
  :global(.note .tiptap-inner) {
    color: var(--text);
    padding: 8px;
  }
  .resize-handle {
    position: absolute;
    bottom: 0px;
    right: 0px;
    width: 30px;
    height: 30px;
    cursor: se-resize;
    touch-action: none;
    z-index: 10;
  }
  .delete-btn {
    background: var(--block-accent-color, var(--text));
    border-color: transparent;
    font-size: 1.1rem;
    color: var(--block-accent-text, var(--bg));
    cursor: pointer;
    padding: 0px 8px;
    border-radius: var(--block-control-radius, 6px);
    transition: transform 0.15s ease, filter 0.2s ease;
  }

  .delete-btn:hover {
    transform: scale(1.05);
    filter: brightness(1.08);
  }
</style>
