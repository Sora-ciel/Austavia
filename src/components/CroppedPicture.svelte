<script>
  /**
   * A picture shown cut to its crop (utils/crop.js), at its own width, as
   * tall as the part kept. The picture itself is not changed: the crop is a
   * window on it, as everywhere else.
   *
   * Made for Simple Note, whose cards have no fixed box -- reported
   * 2026-11-17: "after cropping an image in lightbox, Simple Note doesn't
   * crop that image". ImgBlock draws its crop the same way (an SVG viewBox)
   * but over a box the block already has, so it keeps its own overlay.
   */
  import { createEventDispatcher } from 'svelte';
  import { normalizeCrop } from '../utils/crop.js';

  export let src = '';
  export let crop = null;

  const dispatch = createEventDispatcher();
  let natural = { w: 0, h: 0 };
  $: kept = normalizeCrop(crop);

  function noteNatural(event) {
    const img = event.currentTarget;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) natural = { w: img.naturalWidth, h: img.naturalHeight };
  }
</script>

{#if kept && natural.w}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <svg
    class="cropped-picture"
    viewBox="{kept.x * natural.w} {kept.y * natural.h} {kept.w * natural.w} {kept.h * natural.h}"
    style="aspect-ratio: {kept.w * natural.w} / {kept.h * natural.h};"
    data-focus-guard
    on:click|stopPropagation={(e) => dispatch('click', e)}
    on:dblclick|stopPropagation={(e) => dispatch('dblclick', e)}
    on:touchend|stopPropagation={(e) => dispatch('touchend', e)}
  >
    <image href={src} width={natural.w} height={natural.h} />
  </svg>
{:else}
  <!-- Until its size is known (or with no crop), the picture itself. -->
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <img
    {src}
    alt=""
    data-focus-guard
    on:load={noteNatural}
    on:click|stopPropagation={(e) => dispatch('click', e)}
    on:dblclick|stopPropagation={(e) => dispatch('dblclick', e)}
    on:touchend|stopPropagation={(e) => dispatch('touchend', e)}
    style="cursor:zoom-in"
  />
{/if}

<style>
  .cropped-picture {
    display: block;
    width: 100%;
    height: auto;
    cursor: zoom-in;
  }
</style>
