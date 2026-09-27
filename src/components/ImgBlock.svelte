<script>
  import { createEventDispatcher, getContext } from 'svelte';
  import { isPrimaryPointer } from '../utils/pointer.js';
  import ColorField from './ColorField.svelte';

  const appDialogs = getContext('appDialogs');

  export let id;
  export let initialPosition = { x: 100, y: 100 };
  export let initialSize = { width: 300, height: 200 };
  export let initialBgColor = '#ffffff';
  export let initialTextColor = '#ffffff';
  export let initialSrc = '';
  export let initialResolvedSrc = null;
  export let initialAttachmentRequiresAuth = false;
  export let focused = false;
  export let canvasScale = 1;

  const dispatch = createEventDispatcher();
  const HEADER_HEIGHT = 30;
  const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
  const DEFAULT_BLOCK_WIDTH = 300;
  const DEFAULT_BLOCK_HEIGHT = 200;
  const MAX_MEDIA_WIDTH = 400;
  const MAX_MEDIA_HEIGHT = 300;
  

  let position = { ...initialPosition };
  let size = { ...initialSize };
  let bgColor = initialBgColor;
  let textColor = initialTextColor || '#000000';
  let src = initialSrc;
  let resolvedSrc = initialResolvedSrc;
  let attachmentRequiresAuth = initialAttachmentRequiresAuth;
  let headerRef;
  let aspectRatio = size.width / (size.height - HEADER_HEIGHT);


  let dragging = false;
  let resizing = false;
  let offset = { x: 0, y: 0 };
  let resizeStart = { x: 0, y: 0, width: 0, height: 0 };

  function getCanvasPoint(event) {
    const source = event.touches ? event.touches[0] : event;
    const safeScale = Number(canvasScale) > 0 ? Number(canvasScale) : 1;
    return {
      x: source.clientX / safeScale,
      y: source.clientY / safeScale
    };
  }

  $: mediaSrc = typeof src === 'string' ? src : resolvedSrc || '';
  $: hasStorageAttachment = src && typeof src === 'object' && src.type === 'storage';
  let suppressClick = false;
  let hasDragged = false;
  let hasResized = false;
  let attemptedInitialAutoFit = false;


  function sendUpdate(changedKeys, { pushToHistory } = {}) {
    const effectiveKeys = Array.isArray(changedKeys) && changedKeys.length ? changedKeys : [];
    const detail = { id, position, size, bgColor, textColor, src };

    if (effectiveKeys.length) detail.changedKeys = effectiveKeys;
    if (pushToHistory !== undefined) detail.pushToHistory = pushToHistory;

    dispatch('update', detail);
  }


  async function onMediaChange(e) {
    ensureFocus();
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith('video/') && file.size > MAX_VIDEO_BYTES) {
      await appDialogs.alert('Video files must be 100MB or smaller to render.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      src = reader.result;
      resolvedSrc = null;
      attachmentRequiresAuth = false;
      attemptedInitialAutoFit = true;

      const isVideo = file.type.startsWith('video/');

      if (!isVideo) {
        const img = new Image();
        img.src = src;
        img.onload = () => {
          const { width: targetWidth, height: targetHeight } = getFittedMediaSize(img.width, img.height);
          size.width = targetWidth;
          size.height = targetHeight + getHeaderHeight();
          aspectRatio = targetWidth / targetHeight;


          sendUpdate(['src', 'size']);
        };
      } else {
        const videoEl = document.createElement('video');
        videoEl.src = src;
        videoEl.onloadedmetadata = () => {
          const { width: targetWidth, height: targetHeight } = getFittedMediaSize(videoEl.videoWidth, videoEl.videoHeight);
          aspectRatio = targetWidth / targetHeight;
          size.width = targetWidth;
          size.height = targetHeight + getHeaderHeight();

          sendUpdate(['src', 'size']);
        };
      }
    };

    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function getFittedMediaSize(width, height) {
    if (!width || !height) {
      return { width: DEFAULT_BLOCK_WIDTH, height: DEFAULT_BLOCK_HEIGHT - HEADER_HEIGHT };
    }

    const naturalRatio = width / height;
    let targetWidth = MAX_MEDIA_WIDTH;
    let targetHeight = targetWidth / naturalRatio;

    if (targetHeight > MAX_MEDIA_HEIGHT) {
      targetHeight = MAX_MEDIA_HEIGHT;
      targetWidth = targetHeight * naturalRatio;
    }

    return { width: targetWidth, height: targetHeight };
  }

  function getHeaderHeight() {
    return headerRef?.offsetHeight || HEADER_HEIGHT;
  }

  function isAtDefaultSize() {
    return (
      Math.abs(size.width - DEFAULT_BLOCK_WIDTH) < 0.5 &&
      Math.abs(size.height - DEFAULT_BLOCK_HEIGHT) < 0.5
    );
  }

  function autoFitFromExistingSource() {
    if (!mediaSrc || attemptedInitialAutoFit || !isAtDefaultSize()) return;

    attemptedInitialAutoFit = true;
    const mediaLooksLikeVideo = mediaSrc.startsWith('data:video') || mediaSrc.endsWith('.mp4');

    if (mediaLooksLikeVideo) {
      const videoEl = document.createElement('video');
      videoEl.src = mediaSrc;
      videoEl.onloadedmetadata = () => {
        const { width: targetWidth, height: targetHeight } = getFittedMediaSize(videoEl.videoWidth, videoEl.videoHeight);
        size.width = targetWidth;
        size.height = targetHeight + getHeaderHeight();
        aspectRatio = targetWidth / targetHeight;
        sendUpdate(['size'], { pushToHistory: false });
      };
      return;
    }

    const img = new Image();
    img.src = mediaSrc;
    img.onload = () => {
      const { width: targetWidth, height: targetHeight } = getFittedMediaSize(img.width, img.height);
      size.width = targetWidth;
      size.height = targetHeight + getHeaderHeight();
      aspectRatio = targetWidth / targetHeight;
      sendUpdate(['size'], { pushToHistory: false });
    };
  }

  $: autoFitFromExistingSource();



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

  position.x = Math.max(0, point.x - offset.x);
  position.y = Math.max(0, point.y - offset.y);
  hasDragged = true;

  // Prevent scrolling when dragging on mobile
  if (e.cancelable) e.preventDefault();
}

function onMouseUp() {
  dragging = false;
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


function onResizeStart(e) {
  e.stopPropagation();
  ensureFocus();
  resizing = true;
  hasResized = false;
  document.body.style.userSelect = 'none';

  const point = getCanvasPoint(e);

  resizeStart = {
    x: point.x,
    y: point.y,
    width: size.width,
    height: size.height
  };

  window.addEventListener('mousemove', onResizing);
  window.addEventListener('mouseup', onResizeEnd);
  window.addEventListener('touchmove', onResizing, { passive: false });
  window.addEventListener('touchend', onResizeEnd);
}

function onResizing(e) {
  if (!resizing) return;

  const point = getCanvasPoint(e);
  const deltaX = point.x - resizeStart.x;

  const newWidth = Math.max(50, resizeStart.width + deltaX);
  const contentHeight = newWidth / aspectRatio;
  const totalHeight = contentHeight + getHeaderHeight();

  if (contentHeight < 20) return;

  size.width = newWidth;
  size.height = totalHeight;
  hasResized = true;

  if (e.cancelable) e.preventDefault(); // stop scrolling on mobile
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


  // Delete
  function deleteBlock() {
    dispatch('delete', { id });
  }

  function ensureFocus() {
    if (!focused) {
      dispatch('focusToggle', { id });
    }
  }

  // Click on the media content:
  //   - When NOT focused: focus the block (next click will open lightbox)
  //   - When focused: open lightbox if there's a source
  function handleMediaClick() {
    if (!focused) {
      ensureFocus();
    } else if (mediaSrc) {
      dispatch('lightbox', { src: mediaSrc });
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
  .wrapper {
    /* scrollbars inside the block follow the block's own colors */
    --sb-track: var(--bg);
    --sb-thumb: var(--text);
    position: absolute;
    border: var(--block-border-width, 1px) solid var(--block-border-color, var(--text));
    border-radius: var(--block-border-radius, 12px);
    background: color-mix(in srgb, var(--block-surface, var(--bg)) var(--block-bg-opacity, 100%), transparent);
    text-shadow: var(--block-text-shadow, none);
    box-shadow: var(--block-shadow, 0 0 2px 1px var(--text), 0 0 6px 2px var(--text));
    overflow: hidden;
    display: flex;
    flex-direction: column;
    outline: 2px solid transparent;
    transition: box-shadow 0.15s ease, outline 0.15s ease;
    font-family: var(--block-body-font, inherit);
  }

  .wrapper.focused {
    outline: 2px solid var(--block-focus-outline, rgba(110, 168, 255, 0.85));
    box-shadow: var(--block-focus-shadow, 0 0 0 2px rgba(110, 168, 255, 0.35), 0 0 12px rgba(110, 168, 255, 0.5));
  }

  .header {
    background: color-mix(in srgb, var(--block-header-bg, var(--bg)) var(--block-header-opacity, 100%), transparent);
    height: 30px;
    box-sizing: border-box;
    padding: 4px 8px;
    cursor: move;
    touch-action: none;
    user-select: none;
    font-size: 0.8rem;
    color: var(--block-header-text, var(--text));
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    font-family: var(--block-header-font, var(--block-body-font, inherit));
    letter-spacing: var(--block-header-letter-spacing, 0.08em);
    text-transform: var(--block-header-transform, uppercase);
  }

  .header-controls {

    display: flex;
    gap: 8px;
    align-items: center;
  }

  input[type="file"] {
    display: none;
  }

  
/* Style the emoji container */
  .media-btn .emoji {
    display: inline-block;
    color: var(--block-media-button-text, var(--block-header-text, var(--text)));
    background: var(--block-media-button-bg, transparent);
    padding: 4px 6px;
    border-radius: var(--block-control-radius, 6px);
    cursor: pointer;
    font-size: 1.25rem;
  }

  button.delete-btn {
    background: var(--block-accent-color, var(--text));
    border-color: transparent;
    font-size: 1.1rem;
    color: var(--block-accent-text, var(--bg));
    cursor: pointer;
    padding: 0px 8px;
    border-radius: var(--block-control-radius, 6px);
    transition: transform 0.15s ease, filter 0.2s ease;
  }

  button.delete-btn:hover {
    transform: scale(1.05);
    filter: brightness(1.08);
  }

  .media-container {
    flex: 1 1 0;
    min-height: 0;
    position: relative;
  }

  /* Use absolute fill so height:100% resolves correctly regardless of parent sizing method */
  .media-container img,
  .media-container video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
    cursor: default;
  }

  .media-container img.clickable,
  .media-container video.clickable {
    cursor: zoom-in;
  }

  .resize-handle {
    position: absolute;
    width: 50px;
    height: 50px;
    background: rgba(253, 253, 253, 0);
    right: 0;
    bottom: 0;
    cursor: se-resize;
    touch-action: none;
    z-index: 10;
  }
  
</style>

<div
  class="wrapper"
  class:focused={focused}
  data-block-id={id}
  style="left: {position.x}px; top: {position.y}px; width: {size.width}px; height: {size.height}px; --bg: {bgColor}; --text: color-mix(in srgb, {textColor} var(--block-text-opacity, 100%), transparent)"
  role="button"
  tabindex="0"
  aria-pressed={focused}
  on:click={handleWrapperClick}
  on:keydown={handleWrapperKeydown}
>
  <div class="header" bind:this={headerRef} role="presentation" on:mousedown={onDragStart}
    on:pointerdown={onDragStart} on:touchstart={onDragStart}>
    <div>image</div>
    <div class="header-controls" on:mousedown|stopPropagation on:pointerdown|stopPropagation on:touchstart|stopPropagation role="presentation">

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

      <label title="Change Image" class="media-btn" data-focus-guard on:click|stopPropagation on:pointerdown|stopPropagation on:touchstart|stopPropagation>
        <input type="file" accept="image/*,video/mp4" on:change={onMediaChange} data-focus-guard />
        <span class="emoji" data-focus-guard>⏏</span>
      </label>

      <button class="delete-btn" on:click|stopPropagation={deleteBlock}>×</button>
    </div>
  </div>

  <div class="media-container">
    {#if mediaSrc}
      {#if mediaSrc.startsWith('data:video')}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <!-- svelte-ignore a11y-media-has-caption -->
        <video
          src={mediaSrc}
          class:clickable={true}
          autoplay loop muted playsinline
          on:click|stopPropagation={handleMediaClick}
        ></video>
      {:else}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <img
          src={mediaSrc}
          alt=""
          class:clickable={true}
          on:click|stopPropagation={handleMediaClick}
        />
      {/if}
    {:else if hasStorageAttachment}
      <div style="flex-grow:1; display:flex; align-items:center; justify-content:center; color:#777; text-align:center; padding: 8px;">
        {#if attachmentRequiresAuth}
          Sign in to view this attachment
        {:else}
          Attachment unavailable
        {/if}
      </div>
    {:else}
      <div style="flex-grow:1; display:flex; align-items:center; justify-content:center; color:#777;">
        No image loaded
      </div>
    {/if}
  </div>
  <div class="resize-handle" role="presentation" on:mousedown={onResizeStart} on:touchstart={onResizeStart}></div>
</div>
