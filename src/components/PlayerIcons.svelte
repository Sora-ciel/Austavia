<script>
  // The player's icons as inline SVG rather than emoji: emoji render in their
  // own fixed colours, so they never followed the theme. Everything here is
  // drawn with currentColor, which means it inherits whatever text colour the
  // surrounding control uses.
  export let name;
  export let size = 16;
</script>

<svg
  class="pi"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
>
  {#if name === 'music'}
    <path d="M9 18V5l11-2v13" />
    <circle cx="6" cy="18" r="3" fill="currentColor" stroke="none" />
    <circle cx="17" cy="16" r="3" fill="currentColor" stroke="none" />
  {:else if name === 'play'}
    <path d="M6 4l14 8-14 8z" fill="currentColor" stroke="none" />
  {:else if name === 'pause'}
    <rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" />
    <rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" />
  {:else if name === 'next'}
    <path d="M5 4l11 8-11 8z" fill="currentColor" stroke="none" />
    <rect x="17" y="4" width="3" height="16" rx="1" fill="currentColor" stroke="none" />
  {:else if name === 'prev'}
    <path d="M19 4L8 12l11 8z" fill="currentColor" stroke="none" />
    <rect x="4" y="4" width="3" height="16" rx="1" fill="currentColor" stroke="none" />
  {:else if name === 'stop'}
    <rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" stroke="none" />
  {:else if name === 'chevron'}
    <!-- Points down when the panel is open, up when it is shut; the button
         rotates it rather than swapping the drawing. -->
    <path d="M6 15l6-6 6 6" />
  {:else if name === 'shuffle'}
    <path d="M16 4l4 4-4 4" />
    <path d="M16 12l4 4-4 4" />
    <path d="M4 8h3.5c1.4 0 2.2.7 3 1.8l4 6c.8 1.1 1.6 1.8 3 1.8H20" />
    <path d="M4 16h3.5c1.4 0 2.2-.7 3-1.8" />
    <path d="M17.5 9.5c.8-1.1 1.6-1.5 3-1.5H20" />
  {:else if name === 'volume'}
    <path d="M5 9v6h3.5L13 19V5L8.5 9z" fill="currentColor" stroke="none" />
    <path d="M16.5 8.5a5 5 0 0 1 0 7" />
    <path d="M19 6a8.5 8.5 0 0 1 0 12" />
  {:else if name === 'mute'}
    <path d="M5 9v6h3.5L13 19V5L8.5 9z" fill="currentColor" stroke="none" />
    <path d="M17 9.5l4 5" />
    <path d="M21 9.5l-4 5" />
  {/if}
</svg>

<style>
  .pi {
    display: block;
    flex-shrink: 0;
    color: inherit;
  }
</style>
