<script>
  import { createEventDispatcher } from 'svelte';
  import { isPrimaryPointer } from '../utils/pointer.js';
  import ColorField from './ColorField.svelte';

  export let id;
  export let initialPosition = { x: 100, y: 100 };
  export let initialSize = { width: 560, height: 315 };
  export let initialBgColor = '#ffffff';
  export let initialTextColor = '#000000';
  export let initialContent = '';
  export let focused = false;
  export let canvasScale = 1;

  export let initialTitle = 'Embed Block';

  const dispatch = createEventDispatcher();

  let position = { ...initialPosition };
  let size = { ...initialSize };
  let bgColor = initialBgColor;
  let textColor = initialTextColor;
  let content = initialContent;
  let title = initialTitle;

  let dragging = false, resizing = false;
  let offset = { x: 0, y: 0 }, resizeStart = {};

  function getCanvasPoint(event) {
    const source = event.touches ? event.touches[0] : event;
    const safeScale = Number(canvasScale) > 0 ? Number(canvasScale) : 1;
    return {
      x: source.clientX / safeScale,
      y: source.clientY / safeScale
    };
  }
  let suppressClick = false;
  let hasDragged = false;
  let hasResized = false;
  let showSettings = false;

  function sendUpdate(changedKeys, { pushToHistory } = {}) {
    const effectiveKeys = Array.isArray(changedKeys) && changedKeys.length ? changedKeys : [];
    const detail = {
      id,
      position,
      size,
      bgColor,
      textColor,
      content,
      title
    };

    if (effectiveKeys.length) detail.changedKeys = effectiveKeys;
    if (pushToHistory !== undefined) detail.pushToHistory = pushToHistory;

    dispatch('update', detail);
  }

  // Dragging
  function onDragStart(e) {
    // Right-click is canvas pan, not block drag.
    if (!isPrimaryPointer(e)) return;
    if (dragging) return;
    ensureFocus();
    dragging = true;
    hasDragged = false;
    const point = getCanvasPoint(e);
    offset = { x: point.x - position.x, y: point.y - position.y };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onMouseMove, { passive: false });
    window.addEventListener('touchend', onMouseUp);
    window.addEventListener('pointermove', onMouseMove);
    window.addEventListener('pointerup', onMouseUp);

    if (typeof e.pointerId === 'number' && e.currentTarget?.setPointerCapture) {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  }

  function onMouseMove(e) {
    if (!dragging) return;
    const point = getCanvasPoint(e);
    position = {
      x: Math.max(0, point.x - offset.x),
      y: Math.max(0, point.y - offset.y)
    };
    hasDragged = true;
    if (e.cancelable) e.preventDefault();
  }

  function onMouseUp() {
    dragging = false;
    resizing = false;
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('touchmove', onMouseMove);
    window.removeEventListener('touchend', onMouseUp);
    window.removeEventListener('pointermove', onMouseMove);
    window.removeEventListener('pointerup', onMouseUp);
    sendUpdate(['position']);
    if (hasDragged) {
      suppressClick = true;
      hasDragged = false;
      requestAnimationFrame(() => (suppressClick = false));
    }
  }

  // Resizing
  function onResizeStart(e) {
    e.stopPropagation();
    ensureFocus();
    resizing = true;
    hasResized = false;
    document.body.style.userSelect = 'none';
    const point = getCanvasPoint(e);
    resizeStart = { x: point.x, y: point.y, ...size };

    window.addEventListener('mousemove', onResizing);
    window.addEventListener('mouseup', onResizeEnd);
    window.addEventListener('touchmove', onResizing, { passive: false });
    window.addEventListener('touchend', onResizeEnd);
  }

  function onResizing(e) {
    if (!resizing) return;
    const point = getCanvasPoint(e);
    size.width = Math.max(200, resizeStart.width + (point.x - resizeStart.x));
    size.height = Math.max(100, resizeStart.height + (point.y - resizeStart.y));
    hasResized = true;
    if (e.cancelable) e.preventDefault();
  }

  function onResizeEnd() {
    resizing = false;
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', onResizing);
    window.removeEventListener('mouseup', onResizeEnd);
    window.removeEventListener('touchmove', onResizing);
    window.removeEventListener('touchend', onResizeEnd);
    sendUpdate(['size']);
    if (hasResized) {
      suppressClick = true;
      hasResized = false;
      requestAnimationFrame(() => (suppressClick = false));
    }
  }

  function deleteBlock() {
    dispatch('delete', { id });
  }

  function ensureFocus() {
    if (!focused) {
      dispatch('focusToggle', { id });
    }
  }

  function handleWrapperClick(event) {
    if (suppressClick) return;
    if (event.defaultPrevented) return;
    if (event.target.closest('[data-focus-guard]')) {
      ensureFocus();
      return;
    }
    ensureFocus();
  }

  function handleWrapperKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    if (event.target !== event.currentTarget) {
      return;
    }

    event.preventDefault();
    handleWrapperClick(event);
  }
</script>

<style>
  .player {
    position: absolute;
    /* scrollbars inside the block follow the block's own colors */
    --sb-track: var(--bg);
    --sb-thumb: var(--text);
    border: var(--block-border-width, 1px) solid var(--block-border-color, var(--text));
    border-radius: var(--block-border-radius, 12px);
    box-shadow: var(--block-shadow, 0 0 2px 1px var(--text), 0 0 6px 2px var(--text));
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background-color: color-mix(in srgb, var(--block-surface, var(--bg)) var(--block-bg-opacity, 100%), transparent);
    text-shadow: var(--block-text-shadow, none);
    color: var(--text);
    outline: 2px solid transparent;
    transition: box-shadow 0.15s ease, outline 0.15s ease;
    font-family: var(--block-body-font, inherit);
  }
  .player.focused {
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
  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    padding: 0;
    box-sizing: border-box;
  }
  .resize-handle {
    position: absolute;
    bottom: 0px;
    right: 0px;
    width: 30px;
    height: 30px;
    cursor: se-resize;
    touch-action: none;
    z-index: 30;
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

  .gear-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 2px 6px;
    font-size: 1.4rem;
    line-height: 1;
    color: var(--block-header-text, var(--text));
  }

  .settings-area {
    padding: 0.75em;
    border-top: 1px solid var(--block-border-color, var(--text));
    font-size: 0.9em;
    background: rgba(0, 0, 0, 0.25);
    color: var(--block-header-text, var(--text));
  }
</style>

<div
  class="player"
  class:focused={focused}
  data-block-id={id}
  style="left:{position.x}px; top:{position.y}px; width:{size.width}px; height:{size.height}px; --bg: {bgColor}; --text: color-mix(in srgb, {textColor} var(--block-text-opacity, 100%), transparent);"
  role="button"
  tabindex="0"
  aria-pressed={focused}
  on:click={handleWrapperClick}
  on:keydown={handleWrapperKeydown}
>
  <div
    class="header"
    on:mousedown={onDragStart}
    on:pointerdown={onDragStart}
    on:touchstart={onDragStart}
    role="presentation"
  >
    <span>{title}</span>
    <div class="header-controls" on:mousedown|stopPropagation on:pointerdown|stopPropagation on:touchstart|stopPropagation role="presentation">
      <button
        on:click={() => { ensureFocus(); showSettings = !showSettings; }}
        class="gear-btn"
        data-focus-guard
      >⚙︎</button>
      <ColorField
        value={bgColor}
        title="Background Color"
        placement="side"
        on:input={(e) => { bgColor = e.detail; sendUpdate(['bgColor'], { pushToHistory: false }); }}
        on:change={(e) => { bgColor = e.detail; sendUpdate(['bgColor']); }}
      />
      <ColorField
        value={textColor}
        title="Text Color"
        placement="side"
        on:input={(e) => { textColor = e.detail; sendUpdate(['textColor'], { pushToHistory: false }); }}
        on:change={(e) => { textColor = e.detail; sendUpdate(['textColor']); }}
      />
      <button class="delete-btn" on:click|stopPropagation={deleteBlock}>×</button>
    </div>
  </div>

  <div class="content">
    {#if content}
      <div class="embed-wrapper">
        {@html content}

      </div>
    {:else}
      <p style="opacity: 0.6; padding: 8px;">No embed URL set</p>
    {/if}

    <label style="padding: 6px;">
      Embed URL:
      <input
        type="text"
        bind:value={content}
        on:input={() => sendUpdate(['content'])}
        on:focus={ensureFocus}
        placeholder="https://example.com/embed"
        data-focus-guard
      />
    </label>
  </div>



  {#if showSettings}
    <div class="settings-area">
        <p>Settings area (put options here)</p>
    </div>
  {/if}
  <div
    class="resize-handle"
    role="presentation"
    on:mousedown={onResizeStart}
    on:touchstart={onResizeStart}
  ></div>
</div>
