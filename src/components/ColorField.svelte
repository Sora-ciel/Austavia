<script>
  import { portal } from '../utils/portal.js';
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import ColorPicker from './ColorPicker.svelte';

  export let value = '#000000';
  export let title = 'Color';
  export let placement = 'below'; // 'below' | 'side'

  const dispatch = createEventDispatcher();

  // Move the popover to <body>. A `position: fixed` element is normally
  // relative to the viewport, but a scaled/transformed ancestor (e.g. the
  // zoomed canvas) becomes its containing block instead — which throws the
  // popover's position and size off by the canvas zoom factor. Rendering it
  // straight on <body> keeps it correctly viewport-fixed at any zoom level.
  // The shared one (utils/portal.js). It used to move the picker to <body>; it
  // now goes to .app, still clear of the Canvas's transform.

  let open = false;
  let btnEl, popEl;
  let px = 0, py = 0;

  const POP_W = 216;
  const POP_H = 320;

  function position() {
    requestAnimationFrame(() => {
      if (!btnEl) return;
      const r = btnEl.getBoundingClientRect();
      if (placement === 'side') {
        // Open beside the block so it doesn't cover the image/text.
        let x = r.right + 6;
        if (x + POP_W > window.innerWidth - 8) {
          x = r.left - POP_W - 6;            // flip to the left
          if (x < 8) x = window.innerWidth - POP_W - 8;
        }
        let y = r.top;
        if (y + POP_H > window.innerHeight - 8) y = window.innerHeight - POP_H - 8;
        px = Math.max(8, x);
        py = Math.max(8, y);
      } else {
        px = Math.min(Math.max(8, r.left), window.innerWidth - POP_W - 8);
        py = r.bottom + 6;
        if (py + POP_H > window.innerHeight - 8) {
          py = Math.max(8, r.top - POP_H - 6);
        }
      }
    });
  }

  function toggle() {
    open = !open;
    if (open) position();
  }

  function onDocPointerDown(e) {
    if (!open) return;
    if (btnEl?.contains(e.target) || popEl?.contains(e.target)) return;
    open = false;
  }
  function onKey(e) {
    if (e.key === 'Escape' && open) { e.stopImmediatePropagation(); open = false; }
  }
  function onResize() { if (open) position(); }

  onMount(() => {
    document.addEventListener('pointerdown', onDocPointerDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
  });
  onDestroy(() => {
    document.removeEventListener('pointerdown', onDocPointerDown, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
  });

  function onInput(e) { value = e.detail; dispatch('input', e.detail); }
  function onChange(e) { value = e.detail; dispatch('change', e.detail); }
</script>

<button
  class="color-field"
  bind:this={btnEl}
  style="background:{value}"
  title={title}
  aria-label={title}
  on:click|stopPropagation={toggle}
></button>

{#if open}
  <div class="cp-popover" bind:this={popEl} use:portal style="left:{px}px; top:{py}px;">
    <ColorPicker {value} on:input={onInput} on:change={onChange} />
  </div>
{/if}

<style>
  .color-field {
    width: var(--color-field-width, 28px);
    height: var(--color-field-height, 22px);
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    padding: 0;
    cursor: pointer;
    box-sizing: border-box;
  }

  .cp-popover {
    position: fixed;
    z-index: 9300;
    background: #141414;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 12px;
    padding: 6px;
    box-shadow: 0 14px 32px rgba(0, 0, 0, 0.6);
  }
</style>
