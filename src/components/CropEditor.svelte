<script>
  /**
   * Cropping a picture: the whole picture, with a frame over the part kept --
   * drag inside it to move it, a corner to stretch it. Page mode's edit mode
   * opens it (asked 2026-11-10: "change the images size even crop it"); the
   * rules are utils/crop.js. Apply dispatches `apply` with the crop, or null
   * for the whole picture.
   */
  import { createEventDispatcher, onMount } from 'svelte';
  import { portal } from '../utils/portal.js';
  import { normalizeCrop, movedCrop, resizedCrop } from '../utils/crop.js';

  export let src = '';
  export let crop = null;
  /**
   * What the crop can be used for, as buttons: `{ id, label }`, each sending
   * `action` with `{ id, crop }`. None: the one "Crop" button, sending
   * `apply` -- as Page mode uses it.
   */
  export let actions = [];

  const dispatch = createEventDispatcher();
  let frame = normalizeCrop(crop) || { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
  let imgEl;
  let drag = null; // { kind: 'move' | corner, x, y, start }

  function down(event, kind) {
    event.preventDefault();
    event.stopPropagation();
    drag = { kind, x: event.clientX, y: event.clientY, start: frame };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function move(event) {
    if (!drag || !imgEl) return;
    const box = imgEl.getBoundingClientRect();
    const dx = (event.clientX - drag.x) / box.width;
    const dy = (event.clientY - drag.y) / box.height;
    frame = drag.kind === 'move' ? movedCrop(drag.start, dx, dy) : resizedCrop(drag.start, drag.kind, dx, dy);
  }

  function up() {
    drag = null;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  }

  function onKey(event) {
    if (event.key === 'Escape') dispatch('close');
    if (event.key === 'Enter') {
      if (actions.length) dispatch('action', { id: actions[actions.length - 1].id, crop: normalizeCrop(frame) });
      else dispatch('apply', normalizeCrop(frame));
    }
  }

  onMount(() => () => up());
</script>

<svelte:window on:keydown={onKey} />

<div class="crop-overlay" use:portal role="dialog" aria-label="Crop the picture">
  <div class="crop-stage">
    <div class="crop-picture">
      <img src={src} alt="" bind:this={imgEl} draggable="false" />
      <!-- The parts left out, dimmed, and the frame of the part kept. -->
      <div class="crop-shade" style="left:0; top:0; width:100%; height:{frame.y * 100}%;"></div>
      <div class="crop-shade" style="left:0; top:{(frame.y + frame.h) * 100}%; width:100%; bottom:0;"></div>
      <div class="crop-shade" style="left:0; top:{frame.y * 100}%; width:{frame.x * 100}%; height:{frame.h * 100}%;"></div>
      <div class="crop-shade" style="left:{(frame.x + frame.w) * 100}%; right:0; top:{frame.y * 100}%; height:{frame.h * 100}%;"></div>
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="crop-frame"
        style="left:{frame.x * 100}%; top:{frame.y * 100}%; width:{frame.w * 100}%; height:{frame.h * 100}%;"
        on:pointerdown={(e) => down(e, 'move')}
      >
        {#each ['nw', 'ne', 'sw', 'se'] as corner}
          <div class="crop-corner {corner}" on:pointerdown={(e) => down(e, corner)}></div>
        {/each}
      </div>
    </div>
  </div>
  <div class="crop-bar">
    <!-- The frame back round the whole picture, to start again or keep it
         whole; nothing is saved until one of the buttons after it (asked
         2026-11-10). -->
    <button on:click={() => (frame = { x: 0, y: 0, w: 1, h: 1 })}>Reset</button>
    <span class="crop-gap"></span>
    <button on:click={() => dispatch('close')}>Cancel</button>
    {#if actions.length}
      {#each actions as action, i}
        <button class:crop-apply={i === actions.length - 1} on:click={() => dispatch('action', { id: action.id, crop: normalizeCrop(frame) })}>{action.label}</button>
      {/each}
    {:else}
      <button class="crop-apply" on:click={() => dispatch('apply', normalizeCrop(frame))}>Crop</button>
    {/if}
  </div>
</div>

<style>
  /* Black and white on purpose, not the theme's colours: the frame is drawn
     over a photograph, whatever its colours, and has to show on all of them
     (CLAUDE.md, "if something should differ ... say what it is for"). */
  .crop-overlay {
    position: fixed;
    inset: 0;
    z-index: 9500;
    display: flex;
    flex-direction: column;
    background: rgba(0, 0, 0, 0.82);
    color: var(--app-text, #fff);
  }

  .crop-stage {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .crop-picture {
    position: relative;
    line-height: 0;
    user-select: none;
    touch-action: none;
  }

  .crop-picture img {
    max-width: calc(100vw - 48px);
    max-height: calc(100vh - 120px);
    display: block;
  }

  .crop-shade {
    position: absolute;
    background: rgba(0, 0, 0, 0.55);
    pointer-events: none;
  }

  .crop-frame {
    position: absolute;
    box-sizing: border-box;
    border: 2px solid #fff;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6);
    cursor: move;
  }

  .crop-corner {
    position: absolute;
    width: 18px;
    height: 18px;
    background: #fff;
    border-radius: 3px;
  }

  .crop-corner.nw { left: -9px; top: -9px; cursor: nwse-resize; }
  .crop-corner.ne { right: -9px; top: -9px; cursor: nesw-resize; }
  .crop-corner.sw { left: -9px; bottom: -9px; cursor: nesw-resize; }
  .crop-corner.se { right: -9px; bottom: -9px; cursor: nwse-resize; }

  .crop-bar {
    display: flex;
    gap: 8px;
    padding: 12px 16px 18px;
    justify-content: center;
  }

  .crop-gap {
    flex: 0 0 24px;
  }

  /* Squarer than pills (asked 2026-11-10: "less radius on buttons"). */
  .crop-bar button {
    padding: 8px 16px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.4);
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .crop-bar .crop-apply {
    background: #fff;
    color: #000;
    border-color: #fff;
  }
</style>
