<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import BlockContextMenu from './BlockContextMenu.svelte';
  import { fileNameForMedia } from '../utils/downloadNaming.js';
  import CropEditor from './CropEditor.svelte';
  import { croppedBlob, blobToDataUrl } from '../utils/cropImage.js';
  import { deliverFile, isNativeAndroid } from '../utils/fileDelivery.js';

  // Array of image/video URLs to display
  export let images = [];
  // Which image to show first
  export let startIndex = 0;
  /**
   * The picture block each image is, in the same order, where known: what
   * "Crop this picture" changes. Asked 2026-11-10: the viewer "can activate
   * the same block recropper that crops the block for canvas or crops the
   * block for download or creation of another image block".
   */
  export let blockIds = [];
  /** The crop each picture block has now, by id, for the crop editor to start from. */
  export let crops = {};
  /** Whether "New picture from it" is offered: a mode that can add a block listens for `newImage`. */
  export let canAddImage = true;

  const dispatch = createEventDispatcher();

  let index = startIndex;
  let scale = 1;
  let panX = 0;
  let panY = 0;
  let panning = false;
  let wasDrag = false;
  let panStartX = 0, panStartY = 0, panOriginX = 0, panOriginY = 0;
  let mouseRatio = 0.5; // 0–1 across viewport width

  $: src = images[index] ?? '';

  // Remote URLs carry a query string (`?alt=media&token=…` on synced files),
  // so testing the raw string with endsWith missed every video that had been
  // through the cloud and rendered it as an <img>.
  const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'm4v', 'ogv', 'ogg', 'mkv', 'avi', '3gp'];
  function looksLikeVideo(url) {
    if (typeof url !== 'string' || !url) return false;
    if (url.startsWith('data:video')) return true;
    const path = url.split(/[?#]/)[0];
    const extension = (path.split('.').pop() || '').toLowerCase();
    return VIDEO_EXTENSIONS.includes(extension);
  }
  $: isVideo = looksLikeVideo(src);

  let videoEl;
  function toggleVideo() {
    if (!videoEl) return;
    if (videoEl.paused) videoEl.play().catch(() => {});
    else videoEl.pause();
  }

  // A browser's own <video> only answers its control bar: clicking the picture
  // itself does nothing at all, which leaves a video sitting there looking
  // broken. Every video site treats a click on the picture as play/pause, so
  // this does too.
  //
  // The control bar is drawn inside the bottom strip of the element, so a click
  // down there belongs to the controls and is left alone — otherwise pressing
  // pause on the bar would toggle twice and appear to do nothing.
  const VIDEO_CONTROL_STRIP = 56;
  function onVideoClick(event) {
    event.stopPropagation();
    if (!videoEl) return;
    const bounds = videoEl.getBoundingClientRect();
    // Never let the strip eat the picture. A short clip can be barely taller
    // than the control bar, and a fixed height there would leave nothing left
    // to click; a degenerate rect would leave the whole element unclickable.
    const strip = Math.min(VIDEO_CONTROL_STRIP, bounds.height * 0.25);
    if (strip > 0 && event.clientY > bounds.bottom - strip) return;
    toggleVideo();
  }
  $: showLeft  = images.length > 1 && mouseRatio < 0.22;
  $: showRight = images.length > 1 && mouseRatio > 0.78;

  function resetMotion() { scale = 1; panX = 0; panY = 0; }

  function prev() {
    index = index > 0 ? index - 1 : images.length - 1;
    resetMotion();
  }

  function next() {
    index = index < images.length - 1 ? index + 1 : 0;
    resetMotion();
  }

  function close() { dispatch('close'); }

  function onWheel(event) {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    scale = Math.max(0.5, Math.min(8, scale * factor));
  }

  function trackMouse(event) {
    mouseRatio = event.clientX / window.innerWidth;
    if (panning) onPanMove(event);
  }

  function onMouseDown(event) {
    if (event.button !== 0) return;
    panning = true;
    wasDrag = false;
    panStartX = event.clientX; panStartY = event.clientY;
    panOriginX = panX; panOriginY = panY;
    document.addEventListener('mousemove', onPanMove);
    document.addEventListener('mouseup', stopPan);
  }

  function onPanMove(event) {
    if (!panning) return;
    clearTimeout(lbLongPressTimer);
    const dx = event.clientX - panStartX;
    const dy = event.clientY - panStartY;
    if (!wasDrag && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) wasDrag = true;
    if (wasDrag) { panX = panOriginX + dx; panY = panOriginY + dy; }
  }

  function stopPan() {
    panning = false;
    document.removeEventListener('mousemove', onPanMove);
    document.removeEventListener('mouseup', stopPan);
  }

  function onOverlayClick() {
    if (suppressNextClick) { suppressNextClick = false; return; }
    if (ctxMenu.open) return;
    if (wasDrag) { wasDrag = false; return; }
    close();
  }

  function onKeyDown(event) {
    // While cropping, the keys are the crop editor's.
    if (cropping) return;
    if (event.key === 'Escape') {
      // Stop other handlers (e.g. parent's block-menu handler) from also firing
      event.stopImmediatePropagation();
      close();
      return;
    }
    if (isVideo && (event.key === ' ' || event.key === 'Spacebar')) {
      // Otherwise space scrolls the page behind the overlay.
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleVideo();
      return;
    }
    if (event.key === 'ArrowLeft')  prev();
    if (event.key === 'ArrowRight') next();
  }

  // Context menu
  let ctxMenu = { open: false, x: 0, y: 0 };
  let lbLongPressTimer;
  let suppressNextClick = false;

  function openCtxMenu(x, y) {
    ctxMenu = { open: true, x, y };
  }

  function handleLbContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    openCtxMenu(event.clientX, event.clientY);
  }

  // Touch swipe (prev/next) — tracked alongside the long-press-to-menu
  // timer so a swipe cancels the long-press, and a completed swipe
  // suppresses the tap-to-close click that follows it.
  const SWIPE_THRESHOLD = 40;
  // Further than a sideways swipe: down is also how you scroll, so it has to be
  // deliberate to count as "put this away".
  const DISMISS_THRESHOLD = 80;
  let swipeStartX = 0;
  let swipeStartY = 0;
  let isSwipeGesture = false;
  let isDismissGesture = false;

  // The media swallows clicks on desktop so panning never closes the viewer.
  // On touch there is no pan, and with the sides given over to navigation the
  // centre has to stay an easy way out — so let the tap through there.
  let lastPointerWasTouch = false;
  function onMediaClick(event) {
    if (!lastPointerWasTouch) event.stopPropagation();
  }

  function handleLbPointerDown(event) {
    lastPointerWasTouch = event.pointerType === 'touch';
    if (event.pointerType === 'touch') {
      swipeStartX = event.clientX;
      swipeStartY = event.clientY;
      isSwipeGesture = false;
    } else if (event.button !== 0) {
      return;
    }
    clearTimeout(lbLongPressTimer);
    const cx = event.clientX, cy = event.clientY;
    lbLongPressTimer = setTimeout(() => {
      suppressNextClick = true;
      openCtxMenu(cx, cy);
    }, 550);
  }

  function handleLbPointerMove(event) {
    clearTimeout(lbLongPressTimer);
    if (event.pointerType !== 'touch') return;
    const dx = event.clientX - swipeStartX;
    const dy = event.clientY - swipeStartY;
    if (isSwipeGesture || isDismissGesture) return;
    // Whichever axis the finger commits to first wins, so a sideways swipe
    // between pictures is never mistaken for putting the viewer away.
    if (images.length > 1 && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      isSwipeGesture = true;
    } else if (dy > 10 && dy > Math.abs(dx)) {
      isDismissGesture = true;
    }
  }

  function handleLbPointerUp(event) {
    clearTimeout(lbLongPressTimer);
    if (event.pointerType === 'touch') {
      const dx = event.clientX - swipeStartX;
      const dy = event.clientY - swipeStartY;
      if (isDismissGesture && dy >= DISMISS_THRESHOLD) {
        suppressNextClick = true;
        close();
      } else if (isSwipeGesture && Math.abs(dx) >= SWIPE_THRESHOLD) {
        suppressNextClick = true;
        if (dx < 0) next(); else prev();
      }
    }
    isSwipeGesture = false;
    isDismissGesture = false;
  }

  function handleLbPointerCancel() {
    clearTimeout(lbLongPressTimer);
    isSwipeGesture = false;
    isDismissGesture = false;
  }

  $: ctxItems = [
    { id: 'saveMedia', label: isVideo ? 'Save video' : 'Save image' },
    { id: 'copyMedia', label: isVideo ? 'Copy URL' : 'Copy to clipboard' }
  ];

  // Saving used to point an <a download> straight at the attachment's URL. The
  // download attribute is ignored for cross-origin links, and attachments live
  // on Firebase Storage — so the browser navigated to the picture instead of
  // saving it, which is why saving meant leaving the app and saving again from
  // wherever it opened. Fetching it first makes it a blob: URL, which is
  // same-origin, and the attribute is honoured.
  async function saveMediaToDevice() {
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`fetch failed: ${response.status}`);
      await saveBlob(await response.blob());
    } catch (error) {
      console.warn('Could not save this attachment, opening it instead:', error);
      // Better to land somewhere the picture can be saved by hand than to do
      // nothing at all and look broken.
      window.open(src, '_blank', 'noopener');
    }
  }

  // ── Cropping (asked 2026-11-10) ──────────────────────────────────────
  let cropping = false;
  $: currentBlockId = blockIds[index] || null;
  $: cropActions = [
    { id: 'save', label: 'Save cropped' },
    ...(canAddImage ? [{ id: 'newImage', label: 'New picture from it' }] : []),
    ...(currentBlockId ? [{ id: 'block', label: 'Crop this picture' }] : [])
  ];

  async function onCropAction({ id, crop }) {
    cropping = false;
    if (id === 'block') {
      dispatch('cropBlock', { blockId: currentBlockId, crop });
      return;
    }
    try {
      const blob = await croppedBlob(src, crop);
      if (id === 'save') await saveBlob(blob, true);
      else if (id === 'newImage') dispatch('newImage', { src: await blobToDataUrl(blob) });
    } catch (error) {
      console.warn('Could not crop this picture:', error);
    }
  }

  /** A picture or video saved to the device, shared to Photos on a phone where that is the way there. */
  async function saveBlob(blob, cropped = false) {
    {
      const name = fileNameForMedia({
        url: cropped ? 'cropped.png' : src,
        contentType: blob.type,
        fallbackBase: isVideo ? 'arial-video' : (cropped ? 'arial-image-cropped' : 'arial-image'),
        isVideo
      });

      // In the apps, the way every other file leaves Austavia (fileDelivery.js):
      // a download on a computer, the share sheet in the Android app. "Save
      // cropped" saved nothing on Linux (2026-11-11): the Linux app's web
      // engine says it can share a file, then shares it nowhere, so the
      // browser's share below swallowed it.
      const inDesktopApp = typeof window !== 'undefined' && !!(window.__TAURI_INTERNALS__ || window.__TAURI__);
      if (inDesktopApp || isNativeAndroid()) {
        await deliverFile(blob, name, { title: name });
        return;
      }

      // In a phone's browser, a download lands in a Downloads folder the
      // gallery does not index, so the picture is saved and still not in Photos. Handing the file
      // to the system sheet instead offers "Save to Photos" — and on iOS it is
      // the only route a web page has to the camera roll at all.
      //
      // canShare is asked about this exact file: support for sharing text is
      // near-universal and support for sharing files is not, and a share that
      // is accepted and then silently drops the attachment looks like the save
      // simply did nothing.
      const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          return;
        } catch (error) {
          // Dismissing the sheet throws AbortError, and that is a decision
          // rather than a failure — falling through to a download would save
          // the file somebody just declined to save.
          if (error?.name === 'AbortError') return;
          console.warn('Sharing failed, falling back to a download:', error);
        }
      }

      const objectUrl = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Revoked on a delay rather than immediately: the click starts the save
      // asynchronously and revoking too early cancels it.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
    }
  }

  async function handleCtxAction(actionId) {
    if (actionId === 'saveMedia') {
      await saveMediaToDevice();
    } else if (actionId === 'copyMedia') {
      try {
        const res = await fetch(src);
        const blob = await res.blob();
        if (blob.type.startsWith('image/')) {
          await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
          return;
        }
      } catch {}
      try { await navigator.clipboard.writeText(src); } catch {}
    }
  }

  onMount(() => document.addEventListener('keydown', onKeyDown));
  onDestroy(() => {
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('mousemove', onPanMove);
    document.removeEventListener('mouseup', stopPan);
    clearTimeout(lbLongPressTimer);
  });
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="lb-overlay"
  class:lb-panning={panning}
  on:click={onOverlayClick}
  on:mousemove={trackMouse}
  on:mousedown={onMouseDown}
  on:wheel|preventDefault={onWheel}
  on:contextmenu={handleLbContextMenu}
  on:pointerdown={handleLbPointerDown}
  on:pointermove={handleLbPointerMove}
  on:pointerup={handleLbPointerUp}
  on:pointercancel={handleLbPointerCancel}
>
  {#if isVideo}
    <!-- svelte-ignore a11y-media-has-caption -->
    <video
      bind:this={videoEl}
      class="lb-media lb-video"
      src={src}
      controls
      playsinline
      preload="metadata"
      style="transform: translate({panX}px, {panY}px) scale({scale})"
      on:click={onVideoClick}
      on:pointerdown|stopPropagation
      on:mousedown|stopPropagation
      on:contextmenu|stopPropagation
      on:wheel|stopPropagation
      on:dblclick|stopPropagation={toggleVideo}
    ></video>
  {:else}
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <img
      class="lb-media"
      src={src}
      alt=""
      style="transform: translate({panX}px, {panY}px) scale({scale})"
      on:click={onMediaClick}
    />
  {/if}

  {#if images.length > 1}
    <button class="lb-arrow lb-left"  class:lb-arrow-visible={showLeft}  on:click|stopPropagation={prev}>‹</button>
    <button class="lb-arrow lb-right" class:lb-arrow-visible={showRight} on:click|stopPropagation={next}>›</button>
    <div class="lb-counter">{index + 1} / {images.length}</div>
  {/if}

  <button class="lb-close" on:click|stopPropagation={close}>✕</button>
  {#if !isVideo && src}
    <button class="lb-crop" title="Crop" aria-label="Crop" on:click|stopPropagation={() => (cropping = true)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2v14a2 2 0 0 0 2 2h14" /><path d="M2 6h14a2 2 0 0 1 2 2v14" /></svg>
    </button>
  {/if}

  {#if ctxMenu.open}
    <BlockContextMenu
      x={ctxMenu.x}
      y={ctxMenu.y}
      items={ctxItems}
      on:action={(e) => handleCtxAction(e.detail)}
      on:close={() => { ctxMenu = { open: false, x: 0, y: 0 }; }}
    />
  {/if}
</div>

{#if cropping}
  <CropEditor
    {src}
    crop={currentBlockId ? crops[currentBlockId] : null}
    actions={cropActions}
    on:action={(e) => onCropAction(e.detail)}
    on:close={() => (cropping = false)}
  />
{/if}

<style>
  .lb-overlay {
    position: fixed;
    inset: 0;
    z-index: 9000;
    background: rgba(0, 0, 0, 0.92);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: zoom-out;
    /* Without this the browser claims the touch gesture as a scroll/zoom and
       answers with pointercancel, so the swipe never reaches pointerup. */
    touch-action: none;
  }
  .lb-overlay.lb-panning { cursor: grabbing; }

  .lb-media {
    max-width: 90vw;
    max-height: 90vh;
    object-fit: contain;
    border-radius: 6px;
    transform-origin: center center;
    transition: transform 0.1s ease;
    cursor: default;
    user-select: none;
    /* Images stay inert so a drag pans and a click closes; a video has to take
       its own clicks or its controls can never be used. */
    pointer-events: none;
  }
  .lb-video {
    pointer-events: auto;
    /* Clicking the picture starts and stops it, so say so. */
    cursor: pointer;
  }
  .lb-panning .lb-media { transition: none; }

  .lb-crop {
    position: fixed;
    top: 16px;
    right: 64px;
    width: 36px;
    height: 36px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: rgba(255,255,255,0.12);
    color: #fff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
  }
  .lb-crop svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .lb-crop:hover { background: rgba(255,255,255,0.22); }

  .lb-close {
    position: fixed;
    top: 16px;
    right: 18px;
    background: rgba(255,255,255,0.12);
    border: none;
    color: #fff;
    font-size: 1.3rem;
    width: 36px;
    height: 36px;
    /* The app's own button rule sets padding, and a circle 36px across cannot
       hold 25px of it a side: the button came out 50 wide by 36 tall, an oval
       rather than the round one the border-radius promises. */
    padding: 0;
    box-sizing: border-box;
    flex: none;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.7;
    transition: opacity 0.15s;
  }
  .lb-close:hover { opacity: 1; }

  .lb-arrow {
    position: fixed;
    top: 50%;
    transform: translateY(-50%);
    background: rgba(255,255,255,0.12);
    border: none;
    color: #fff;
    font-size: 2.4rem;
    width: 54px;
    height: 80px;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.18s ease;
    line-height: 1;
  }
  .lb-arrow.lb-left  { left: 12px; }
  .lb-arrow.lb-right { right: 12px; }

  /* On touch there is no hover, so the arrows above could never be tapped.
     Replace them with two invisible columns running the full height of the
     screen and reaching its very edges — wide enough to hit without aiming,
     while the ~30% left in the middle still closes the lightbox on tap. */
  @media (max-width: 1024px) {
    .lb-arrow {
      top: 0;
      bottom: 0;
      height: auto;
      /* A fifth narrower than it was. Two columns at 35% left barely a third of
         the screen that was not navigation, and every miss changed the picture
         instead of doing what was meant. */
      width: 28%;
      transform: none;
      border-radius: 0;
      background: transparent;
      /* stays invisible in every state — the view has to remain clean */
      opacity: 0;
      color: transparent;
      font-size: 0;
      pointer-events: auto;
      z-index: 1;
    }
    .lb-arrow.lb-arrow-visible,
    .lb-arrow:hover { opacity: 0; }
    .lb-arrow.lb-left  { left: 0; }
    .lb-arrow.lb-right { right: 0; }

    /* Above the right-hand column so it stays reachable, and a little further
       down: at 16px it sat too close to the top edge to hit comfortably. */
    .lb-close {
      z-index: 2;
      top: 21px;
    }
  }
  .lb-arrow.lb-arrow-visible { opacity: 0.8; pointer-events: auto; }
  .lb-arrow:hover { opacity: 1 !important; }

  .lb-counter {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    color: rgba(255,255,255,0.6);
    font-size: 0.88rem;
    pointer-events: none;
  }
</style>
