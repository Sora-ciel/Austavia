<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { setCanvasScale, setCanvasRef } from '../canvasState.js';
  import ModeBackground from '../components/ModeBackground.svelte';
  import { MIN_CANVAS_WIDTH, MIN_ZOOM, MAX_ZOOM, getInitialCanvasScale } from '../utils/canvasFit.js';
  import { htmlToText as htmlToPlainText } from '../utils/htmlToText.js';
  import TextBlock from '../components/TextBlock.svelte';
  import ImgBlock from '../components/ImgBlock.svelte';
  import Music from '../components/MusicBlock.svelte';
  import Embed from '../components/EmbedBlock.svelte';
  import TaskBlock from '../components/TaskBlock.svelte';
  import Lightbox from '../components/Lightbox.svelte';
  import BlockContextMenu from '../components/BlockContextMenu.svelte';
  import { usesPortraitBackground } from '../utils/modeBackground.js';
  import { nestedScrollerTakesWheel } from '../utils/scrollOwnership.js';


  export let mode;
  // The folder currently open. Only used to notice when it changes, so the
  // zoom can go back to where a folder is meant to open at.
  export let openFolder = '';

  // The music library, and what the app's one player is doing with it. A
  // music block is a view onto these rather than a player of its own.
  export let library = { tracks: [], playlists: [] };
  export let nowPlayingId = null;
  export let isPlaying = false;
  // The folder's wallpaper, the same settings Single Note uses. Normalising is
  // in utils/modeBackground.js and the drawing is ModeBackground.svelte, so the
  // two modes cannot drift apart.
  export let backgroundSettings = {};
  export let blocks;

  export let canvasRef;
  export let focusedBlockId;
  export let canvasColors = {};

  // Keep shared state module in sync so App can read viewport without bind:this
  $: setCanvasScale(scale);
  $: setCanvasRef(canvasRef);

  const MIN_CANVAS_HEIGHT = 320;
  const BLOCK_MARGIN_LEFT = 5;
  const BLOCK_MARGIN_RIGHT = 5;
  const MOBILE_BREAKPOINT = 1024;
  const BLOCK_MARGIN_BOTTOM = 20;
  const WHEEL_ZOOM_SENSITIVITY = 0.0015;

  // Worked out here rather than passed in, the same way Single Note does it —
  // a wallpaper can differ between a phone and a desktop, and the mode that
  // draws it is the one that knows which screen it is on.
  let isMobileViewport =
    typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT;

  let scale = 1;
  let lastDistance = null;
  let lastMidpoint = null;
  let canvasWidth = MIN_CANVAS_WIDTH;
  let canvasHeight = MIN_CANVAS_HEIGHT;
  let contentOffsetX = 0;

  // ── Lightbox ─────────────────────────────────────────────────────
  let lbOpen = false;
  let lbImages = [];
  let lbStart = 0;

  function openCanvasLightbox(event) {
    const clickedSrc = event.detail.src;
    // Build gallery from all image blocks in their visual order
    const allSrcs = blocks
      .filter(b => b.type === 'image')
      .map(b => {
        if (typeof b.src === 'string') return b.src;
        if (b.resolvedSrc) return b.resolvedSrc;
        return null;
      })
      .filter(Boolean);
    lbImages = allSrcs.length ? allSrcs : [clickedSrc];
    lbStart = lbImages.indexOf(clickedSrc);
    if (lbStart < 0) lbStart = 0;
    lbOpen = true;
  }

  // Right-click grab pan
  let isPanning = false;
  let hasPanned = false;
  let panStartX = 0;
  let panStartY = 0;
  let panScrollLeft = 0;
  let panScrollTop = 0;
  const PAN_MOVE_THRESHOLD = 4;

  const dispatch = createEventDispatcher();


  function deleteBlockHandler(event) {
   dispatch ('delete', event.detail);
  }

  function updateBlockHandler(event) {
    const detail = { ...event.detail };
    const nextPosition = detail?.position;

    if (nextPosition) {
      const x = Number(nextPosition.x);
      const y = Number(nextPosition.y);

      detail.position = {
        ...nextPosition,
        ...(Number.isFinite(x) ? { x: Math.max(0, x) } : {}),
        ...(Number.isFinite(y) ? { y: Math.max(0, y) } : {})
      };
    }

    dispatch('update', detail);
  }

  function focusToggleHandler(event) {
    dispatch('focusToggle', event.detail);
  }


  function getDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function getMidpoint(touches) {
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    };
  }

  function getHorizontalMargins() {
    if (typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT) {
      return { left: 0, right: 0 };
    }

    return { left: BLOCK_MARGIN_LEFT, right: BLOCK_MARGIN_RIGHT };
  }

  function measureCanvasFromBlocks() {
    if (!Array.isArray(blocks) || blocks.length === 0) {
      return { width: MIN_CANVAS_WIDTH, height: MIN_CANVAS_HEIGHT, offsetX: 0 };
    }

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = 0;

    for (const block of blocks) {
      const x = Number(block?.position?.x ?? 0);
      const y = Number(block?.position?.y ?? 0);
      const width = Number(block?.size?.width ?? 220);
      const height = Number(block?.size?.height ?? 140);

      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x + width);
      maxY = Math.max(maxY, y + height);
    }

    const safeMinX = Number.isFinite(minX) ? minX : 0;
    const safeMaxX = Number.isFinite(maxX) ? maxX : 0;
    const contentWidth = Math.max(0, safeMaxX - safeMinX);
    const horizontalMargins = getHorizontalMargins();

    return {
      width: Math.max(MIN_CANVAS_WIDTH, contentWidth + horizontalMargins.left + horizontalMargins.right),
      height: Math.max(MIN_CANVAS_HEIGHT, maxY + BLOCK_MARGIN_BOTTOM),
      offsetX: horizontalMargins.left - safeMinX
    };
  }

  function getViewportScaleFloor() {
    const controlsHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--controls-height')) || 56;
    const availableWidth = Math.max(window.innerWidth, 1);
    const availableHeight = Math.max(window.innerHeight - controlsHeight, 1);
    const fittedScale = Math.min(availableWidth / canvasWidth, availableHeight / canvasHeight);
    return Math.min(1, fittedScale);
  }

  // Deterministic "home" zoom based purely on screen size (not content),
  // so first mount and the Ctrl+middle-click reset always land on the same
  // zoom. Shared with App.svelte's media-fit/placement math (canvasFit.js)
  // so both pieces always agree on what "the screen at opening zoom" means.
  function getInitialScale() {
    return getInitialCanvasScale();
  }

  function getMinAllowedScale() {
    return Math.min(MIN_ZOOM, getViewportScaleFloor());
  }

  function fitToViewport() {
    if (!canvasRef) return;
    scale = getInitialScale();
    canvasRef.scrollLeft = 0;
    canvasRef.scrollTop = 0;
  }

  function onTouchStart(event) {
    if (event.touches.length !== 2) return;
    lastDistance = getDistance(event.touches);
    lastMidpoint = getMidpoint(event.touches);
  }

  function onTouchMove(event) {
    if (event.touches.length !== 2 || !lastDistance || !canvasRef) return;
    if (event.cancelable) event.preventDefault();

    const newDistance = getDistance(event.touches);
    const newMidpoint = getMidpoint(event.touches);
    const oldScale = scale;
    const nextScale = Math.max(getMinAllowedScale(), Math.min(MAX_ZOOM, oldScale * (newDistance / lastDistance)));
    if (nextScale === oldScale) return;

    const rect = canvasRef.getBoundingClientRect();
    const anchorX = (lastMidpoint?.x ?? newMidpoint.x) - rect.left;
    const anchorY = (lastMidpoint?.y ?? newMidpoint.y) - rect.top;
    const contentX = (canvasRef.scrollLeft + anchorX) / oldScale;
    const contentY = (canvasRef.scrollTop + anchorY) / oldScale;

    scale = nextScale;
    canvasRef.scrollLeft = Math.max(0, contentX * scale - anchorX);
    canvasRef.scrollTop = Math.max(0, contentY * scale - anchorY);

    lastDistance = newDistance;
    lastMidpoint = newMidpoint;
  }


  function shouldLetNestedScrollerHandleWheel(event) {
    if (!canvasRef || !(event.target instanceof Element)) return false;

    // The rule itself is in utils/scrollOwnership.js, with tests named after
    // what was asked for. It is not here because it was deleted from here once
    // — it looked like the cause of a different scrolling complaint, nothing
    // failed when it went, and the only record that anyone had wanted it was a
    // conversation months earlier. Walking the DOM needs a DOM and stays here;
    // what gets decided does not.
    let current = event.target;
    while (current && current !== canvasRef) {
      const style = getComputedStyle(current);
      const overflowY = style.overflowY;
      const overflowX = style.overflowX;
      const canScrollY = (overflowY === 'auto' || overflowY === 'scroll') && current.scrollHeight > current.clientHeight;
      const canScrollX = (overflowX === 'auto' || overflowX === 'scroll') && current.scrollWidth > current.clientWidth;

      if (canScrollY || canScrollX) {
        const block = current.closest('[data-block-id]');
        return nestedScrollerTakesWheel({
          scroller: true,
          insideBlock: Boolean(block),
          blockFocused: Boolean(block && block.classList.contains('focused'))
        });
      }

      current = current.parentElement;
    }

    return nestedScrollerTakesWheel({ scroller: false });
  }

  function onWheel(event) {
    if (!canvasRef) return;

    if (!event.ctrlKey) {
      if (shouldLetNestedScrollerHandleWheel(event)) return;

      const canScrollHorizontally = canvasRef.scrollWidth > canvasRef.clientWidth;
      const canScrollVertically = canvasRef.scrollHeight > canvasRef.clientHeight;
      const hasSingleScrollableAxis = canScrollHorizontally !== canScrollVertically;

      if (!hasSingleScrollableAxis) return;

      if (event.cancelable) event.preventDefault();
      const scrollDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;

      if (canScrollVertically) {
        canvasRef.scrollTop += scrollDelta;
      } else if (canScrollHorizontally) {
        canvasRef.scrollLeft += scrollDelta;
      }

      return;
    }

    if (event.cancelable) event.preventDefault();

    const oldScale = scale;
    const zoomFactor = Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY);
    const nextScale = Math.max(getMinAllowedScale(), Math.min(MAX_ZOOM, oldScale * zoomFactor));

    if (nextScale === oldScale) return;

    const rect = canvasRef.getBoundingClientRect();
    const anchorX = event.clientX - rect.left;
    const anchorY = event.clientY - rect.top;
    const contentX = (canvasRef.scrollLeft + anchorX) / oldScale;
    const contentY = (canvasRef.scrollTop + anchorY) / oldScale;

    scale = nextScale;
    canvasRef.scrollLeft = Math.max(0, contentX * scale - anchorX);
    canvasRef.scrollTop = Math.max(0, contentY * scale - anchorY);
  }




  function startRightClickPan(event) {
    if (!canvasRef) return;
    isPanning = true;
    hasPanned = false;
    panStartX = event.clientX;
    panStartY = event.clientY;
    panScrollLeft = canvasRef.scrollLeft;
    panScrollTop = canvasRef.scrollTop;
    document.addEventListener('mousemove', onPanMove);
    document.addEventListener('mouseup', stopRightClickPan);
  }

  function onPanMove(event) {
    if (!isPanning || !canvasRef) return;
    const dx = event.clientX - panStartX;
    const dy = event.clientY - panStartY;
    if (!hasPanned && (Math.abs(dx) > PAN_MOVE_THRESHOLD || Math.abs(dy) > PAN_MOVE_THRESHOLD)) {
      hasPanned = true;
    }
    canvasRef.scrollLeft = panScrollLeft - dx;
    canvasRef.scrollTop  = panScrollTop  - dy;
  }

  function stopRightClickPan() {
    if (!isPanning) return;
    isPanning = false;
    document.removeEventListener('mousemove', onPanMove);
    document.removeEventListener('mouseup', stopRightClickPan);
  }

  function onMouseDown(event) {
    if (event.ctrlKey && event.button === 1) {
      if (event.cancelable) event.preventDefault();
      // Reset to the deterministic screen-based home zoom (same as first mount)
      if (canvasRef) {
        scale = getInitialScale();
        canvasRef.scrollLeft = 0;
        canvasRef.scrollTop = 0;
      }
      return;
    }
    if (event.button === 2) {
      event.preventDefault();
      startRightClickPan(event);
    }
  }

  // Canvas block context menu
  let canvasCtxMenu = { open: false, x: 0, y: 0 };
  let canvasCtxBlock = null;
  let canvasLongPressTimer;
  let canvasLongPressBlockId = null;

  function closeCanvasCtxMenu() {
    canvasCtxMenu = { open: false, x: 0, y: 0 };
    canvasCtxBlock = null;
  }

  function openCanvasCtxMenuForBlock(blockId, x, y) {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;
    canvasCtxBlock = block;
    canvasCtxMenu = { open: true, x, y };
  }

  function onContextMenu(event) {
    event.preventDefault();
    const wasPanning = hasPanned;
    stopRightClickPan();
    hasPanned = false;
    // A right-click-drag pan just ended — don't also pop the block menu.
    if (wasPanning) return;
    const blockEl = event.target?.closest?.('[data-block-id]');
    if (!blockEl) return;
    openCanvasCtxMenuForBlock(blockEl.dataset.blockId, event.clientX, event.clientY);
  }

  function onCanvasTouchStart(event) {
    if (event.touches?.length !== 1) return;
    const blockEl = event.target?.closest?.('[data-block-id]');
    if (!blockEl) return;
    const blockId = blockEl.dataset.blockId;
    const touch = event.touches[0];
    canvasLongPressBlockId = blockId;
    clearTimeout(canvasLongPressTimer);
    canvasLongPressTimer = setTimeout(() => {
      openCanvasCtxMenuForBlock(canvasLongPressBlockId, touch.clientX, touch.clientY);
    }, 550);
  }

  function onCanvasTouchMove() {
    clearTimeout(canvasLongPressTimer);
  }

  function onCanvasTouchEnd() {
    clearTimeout(canvasLongPressTimer);
  }

  function buildCanvasMenuItems(block) {
    if (!block) return [];
    const items = [];
    if (block.type === 'image') {
      const src = typeof block.src === 'string' ? block.src : (block.resolvedSrc || '');
      if (src) {
        items.push({ id: 'saveMedia', label: 'Save image' });
        items.push({ id: 'copyMedia', label: 'Copy to clipboard' });
      }
    }
    if (block.type === 'text' || block.type === 'cleantext') {
      if (block.content) items.push({ id: 'copyText', label: 'Copy text' });
    }
    items.push({ id: 'delete', label: 'Delete block', variant: 'danger' });
    return items;
  }

  function handleCanvasColorChange(detail) {
    if (!canvasCtxBlock) return;
    const changed = {};
    if (detail.bgColor !== undefined) changed.bgColor = detail.bgColor;
    if (detail.textColor !== undefined) changed.textColor = detail.textColor;
    const keys = Object.keys(changed);
    if (!keys.length) return;
    // Live drag = no history; release (commit) = snapshot. Bump either way so
    // the canvas block (which caches its colors) re-renders for live preview.
    updateBlockHandler({ detail: { id: canvasCtxBlock.id, ...changed, changedKeys: keys, pushToHistory: !!detail.commit, bumpVersion: true } });
    // keep the open menu's swatches in sync
    canvasCtxBlock = { ...canvasCtxBlock, ...changed };
  }

  async function handleCanvasMenuAction(actionId) {
    const block = canvasCtxBlock;
    closeCanvasCtxMenu();
    if (!block) return;

    if (actionId === 'delete') {
      deleteBlockHandler({ detail: { id: block.id } });
    } else if (actionId === 'saveMedia') {
      const src = typeof block.src === 'string' ? block.src : (block.resolvedSrc || '');
      if (src) {
        const a = document.createElement('a');
        a.href = src;
        a.download = 'image';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } else if (actionId === 'copyMedia') {
      const src = typeof block.src === 'string' ? block.src : (block.resolvedSrc || '');
      if (src) {
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
    } else if (actionId === 'copyText') {
      const text = htmlToPlainText(block.content);
      if (text) await navigator.clipboard.writeText(text).catch(() => {});
    }
  }

  function onTouchEnd(event) {
    if (event.touches.length < 2) {
      lastDistance = null;
      lastMidpoint = null;
    }
  }

  export function refitCanvas() {
    const measured = measureCanvasFromBlocks();
    canvasWidth = measured.width;
    canvasHeight = measured.height;
    contentOffsetX = measured.offsetX ?? 0;
    fitToViewport();
  }

  const defaultCanvasColors = {
    outerBg: '#000000',
    innerBg: '#000000'
  };

  $: canvasTheme = { ...defaultCanvasColors, ...(canvasColors || {}) };
  $: canvasCssVars = `--canvas-outer-bg: ${canvasTheme.outerBg}; --canvas-inner-bg: ${canvasTheme.innerBg};`;


  // Opening another folder used to keep whatever zoom the last one was left
  // at. The component is not rebuilt when the folder changes — only its blocks
  // are replaced — so the one refit on mount had already happened, and a folder
  // opened at 3x stayed at 3x while showing entirely different work.
  //
  // Guarded on the name having actually changed rather than on the blocks,
  // which change constantly while typing and would snap the zoom back
  // mid-edit.
  let fittedForFolder = null;
  $: if (canvasRef && openFolder !== fittedForFolder) {
    fittedForFolder = openFolder;
    refitCanvas();
  }

  onMount(() => {
    refitCanvas();

    const onResize = () => {
      isMobileViewport = usesPortraitBackground({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', onResize);
    // Some phones fire this before the new dimensions have settled into a
    // resize, so both are listened for and the handler is idempotent.
    window.addEventListener('orientationchange', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      stopRightClickPan();
    };
  });
</script>


<style>
.canvas {
  position: fixed;
  top: var(--controls-height, 56px);
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--canvas-outer-bg, rgb(0, 0, 0));
  overflow: auto;
  touch-action: pan-x pan-y;
  --sb-track: var(--canvas-outer-bg, #000000);
  --sb-thumb: var(--canvas-inner-bg, #1a1a1a);
}

.canvas.panning {
  cursor: grabbing;
}
.canvas.panning * {
  pointer-events: none;
  user-select: none;
}



/* The board paints nothing at all.
 *
 * It used to fill itself with the inner background, which put an opaque sheet
 * between the viewport and everything behind it — so a wallpaper was covered
 * up, and the canvas showed two colours meeting at the board's edge whenever
 * the inner and outer ones differed at all.
 *
 * With the board transparent there is exactly one colour on the canvas, the
 * outer one, and a wallpaper is seen whole rather than through a hole the
 * shape of the board.
 */
.canvas-inner {
  position: absolute;
  inset: 0 auto auto 0;
  transform-origin: top left;
  background: transparent;
}

 .canvas-zoom-shell {
  position: relative;
  /* Above the wallpaper, which sits at the bottom of the viewport's stack. */
  z-index: 1;
  /* Transparent for the same reason the board is: it is the same sheet, one
     layer out. */
  background: transparent;
}

/* Pinned to the canvas viewport and deliberately outside everything the zoom
   transforms, so the wallpaper neither scales with the board nor scrolls with
   it — it stays filling the screen the way Single Note's does. Clipped,
   because the layer inside bleeds past its edges to hide the soft border a
   blur would otherwise leave. */
.canvas-bg-holder {
  position: fixed;
  top: var(--controls-height, 56px);
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}

.canvas-content {
  width: 100%;
  height: 100%;
}



@media (max-width: 1024px) {
  .canvas {
  position: fixed;
  top: var(--controls-height, 56px);
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--canvas-outer-bg, #141414);
  overflow: auto;
  }

  .canvas-zoom-shell {
    min-width: 100%;
  }
}

</style>




<div
  class="canvas"
  class:simple-note={mode === 'simple'}
  class:panning={isPanning}
  role="region"
  aria-label="Canvas viewport"
  bind:this={canvasRef}
  style={canvasCssVars}
  on:touchstart={(e) => { onTouchStart(e); onCanvasTouchStart(e); }}
  on:touchmove={(e) => { onTouchMove(e); onCanvasTouchMove(); }}
  on:touchend={(e) => { onTouchEnd(e); onCanvasTouchEnd(); }}
  on:wheel|nonpassive={onWheel}
  on:mousedown={onMouseDown}
  on:contextmenu={onContextMenu}
>
    <!-- Fixed to the canvas viewport rather than placed on the board, which is
         the whole point: the board is what the zoom scales, so a wallpaper
         inside it would grow and shrink with every zoom step. Out here it
         stays exactly where it is and keeps filling the screen, the way Single
         Note's does. -->
    <div class="canvas-bg-holder" aria-hidden="true">
      <ModeBackground settings={backgroundSettings} isMobile={isMobileViewport} />
    </div>

    <div
      class="canvas-zoom-shell"
      style:width={`${canvasWidth * scale}px`}
      style:height={`${canvasHeight * scale}px`}
      >
      <div
        class="canvas-inner"
        style:width={`${canvasWidth}px`}
        style:height={`${canvasHeight}px`}
        style:transform={`scale(${scale})`}
      >
      <div class="canvas-content" style:transform={`translateX(${contentOffsetX}px)`}>
      {#each blocks as block (`${block.id}-${block._version || 0}`)}
        {#if block.type === 'text' || block.type === 'cleantext'}
          <TextBlock
            id={block.id}
            initialPosition={block.position}
            initialSize={block.size}
            initialBgColor={block.bgColor}
            initialTextColor={block.textColor}
            initialContent={block.content}
            initialScrollTop={block.scrollTop}
            focused={block.id === focusedBlockId}
            canvasScale={scale}
            on:delete={deleteBlockHandler}
            on:update={updateBlockHandler}
            on:focusToggle={focusToggleHandler}

          />
        {:else if block.type === 'image'}
          <ImgBlock
            id={block.id}
            initialPosition={block.position}
            initialSize={block.size}
            initialBgColor={block.bgColor}
            initialTextColor={block.textColor}
            initialSrc={block.src}
            initialResolvedSrc={block.resolvedSrc}
            initialAttachmentRequiresAuth={block.attachmentRequiresAuth}
            focused={block.id === focusedBlockId}
            canvasScale={scale}
            on:delete={deleteBlockHandler}
            on:update={updateBlockHandler}
            on:focusToggle={focusToggleHandler}
            on:lightbox={openCanvasLightbox}
          />
        {:else if block.type === 'music'}
          <Music
            id={block.id}
            initialPosition={block.position}
            initialSize={block.size}
            initialBgColor={block.bgColor}
            initialTextColor={block.textColor}
            initialPlaylistId={block.playlistId}
            initialTrackUrl={block.trackUrl}
            {library}
            {nowPlayingId}
            {isPlaying}
            focused={block.id === focusedBlockId}
            canvasScale={scale}
            on:delete={deleteBlockHandler}
            on:update={updateBlockHandler}
            on:focusToggle={focusToggleHandler}
            on:play
            on:toggle
          />
        {:else if block.type === 'embed'}
          <Embed
            id={block.id}
            initialPosition={block.position}
            initialSize={block.size}
            initialBgColor={block.bgColor}
            initialTextColor={block.textColor}
            initialContent={block.content}
            focused={block.id === focusedBlockId}
            canvasScale={scale}
            on:delete={deleteBlockHandler}
            on:update={updateBlockHandler}
            on:focusToggle={focusToggleHandler}
          />
        {:else if block.type === 'task'}
          <TaskBlock
            id={block.id}
            initialPosition={block.position}
            initialSize={block.size}
            initialBgColor={block.bgColor}
            initialTextColor={block.textColor}
            initialTasks={block.tasks}
            initialTitle={block.title}
            focused={block.id === focusedBlockId}
            canvasScale={scale}
            on:delete={deleteBlockHandler}
            on:update={updateBlockHandler}
            on:focusToggle={focusToggleHandler}
          />
        {/if}
      {/each}
      </div>
      </div>
    </div>
</div>

{#if lbOpen}
  <Lightbox images={lbImages} startIndex={lbStart} on:close={() => lbOpen = false} />
{/if}

{#if canvasCtxMenu.open}
  <BlockContextMenu
    x={canvasCtxMenu.x}
    y={canvasCtxMenu.y}
    items={buildCanvasMenuItems(canvasCtxBlock)}
    colorEdit={true}
    bgColor={canvasCtxBlock?.bgColor || '#000000'}
    textColor={canvasCtxBlock?.textColor || '#ffffff'}
    on:action={(e) => handleCanvasMenuAction(e.detail)}
    on:colorChange={(e) => handleCanvasColorChange(e.detail)}
    on:close={closeCanvasCtxMenu}
  />
{/if}
