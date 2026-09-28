<script>
  /**
   * The folder's wallpaper, for a mode that has no place of its own to hold
   * one -- Simple Note, Habit Tracker and Task.
   *
   * Asked for on 2026-09-27: "make other modes (apart from Birthday) have as
   * background the background Canvas mode uses -- the same background and
   * settings as the image background in Canvas mode." The picture and its
   * settings are Canvas's; see modeRegistry.js for which modes have one.
   *
   * Pinned to the window from the top, behind the toolbar, as the others are
   * (see .note-bg-clip in SingleNoteMode.svelte), and at z-index 0: above the
   * mode's own background, so its opacity fades toward the mode's colour, and
   * below the mode's content, which the mode lifts to z-index 1.
   */
  import { onMount, onDestroy } from 'svelte';
  import ModeBackground from './ModeBackground.svelte';

  export let settings = {};

  // The same breakpoint the other modes use to pick the phone picture.
  let isMobile = typeof window !== 'undefined' && window.innerWidth <= 1024;
  const measure = () => { isMobile = window.innerWidth <= 1024; };

  onMount(() => window.addEventListener('resize', measure));
  onDestroy(() => {
    if (typeof window !== 'undefined') window.removeEventListener('resize', measure);
  });
</script>

<div class="mode-wallpaper" aria-hidden="true">
  <ModeBackground {settings} {isMobile} />
</div>

<style>
  .mode-wallpaper {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    /* The height the window has when nothing is being typed into, so the
       phone keyboard does not re-fit the picture -- see wallpaperViewport.js. */
    height: var(--wallpaper-height, 100%);
    min-height: 100%;
    overflow: hidden;
    pointer-events: none;
    z-index: 0;
  }
</style>
