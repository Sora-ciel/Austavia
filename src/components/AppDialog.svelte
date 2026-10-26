<script>
  /**
   * The app's dialog: a dimmed screen, and a panel in the theme's pop-up
   * colours with whatever is put inside it.
   *
   * Bin, Export and Import each carried their own copy of this -- the same
   * overlay, the same panel, the same buttons, differing only in width -- and
   * the habit page (2026-10-26) would have been a fourth. One of everything
   * (CLAUDE.md): they are all this now.
   *
   * The colours are the --dlg-* the app sets from the theme (overlayThemeStyle
   * in App.svelte), on its root as well as on dialogs it places itself, so a
   * dialog opened from inside a mode is themed without being handed them.
   *
   * Buttons inside take `dialog-btn` (and `primary`, or `small` for one inside
   * a list), and the row of them at the bottom `dialog-actions`.
   */
  import { createEventDispatcher } from 'svelte';

  /** Read to a screen reader as the dialog's name. */
  export let label = '';
  /** Shown at the top, when given. */
  export let title = '';
  /** How wide the panel may grow, in px. */
  export let width = 440;
  /** While true, a click outside does not close it -- something is running. */
  export let busy = false;
  /** --dlg-* for a dialog placed outside the app's root. */
  export let themeStyle = '';

  const dispatch = createEventDispatcher();

  function key(event) {
    if (event.key === 'Escape' && !busy) dispatch('close');
  }
</script>

<svelte:window on:keydown={key} />

<!-- svelte-ignore a11y-click-events-have-key-events -->
<div class="dialog-overlay" role="presentation" style={themeStyle} on:click={() => !busy && dispatch('close')}>
  <div
    class="dialog-panel"
    role="dialog"
    aria-modal="true"
    aria-label={label || title}
    style="max-width: {width}px"
    on:click|stopPropagation
  >
    {#if title}<h3 class="dialog-title">{title}</h3>{/if}
    <slot />
  </div>
</div>

<style>
  .dialog-overlay {
    position: fixed;
    inset: 0;
    z-index: 3000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    box-sizing: border-box;
    background: rgba(0, 0, 0, 0.55);
  }

  .dialog-panel {
    width: 100%;
    max-height: calc(100dvh - 32px);
    overflow-y: auto;
    box-sizing: border-box;
    padding: 18px;
    border-radius: 14px;
    border: 1px solid var(--dlg-border, #333333);
    background: var(--dlg-bg, #17171a);
    color: var(--dlg-text, #f0f0f0);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
    /* Its scrollbar in its own writing, per CLAUDE.md. */
    --sb-track: var(--dlg-bg, #17171a);
    --sb-thumb: var(--dlg-text, #f0f0f0);
  }

  .dialog-title {
    margin: 0 0 14px;
    font-size: 1.1rem;
  }

  .dialog-panel :global(.dialog-actions) {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }

  .dialog-panel :global(.dialog-btn) {
    border: 1px solid color-mix(in srgb, var(--dlg-text, #f0f0f0) 25%, transparent);
    border-radius: 8px;
    padding: 8px 16px;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    background: var(--dlg-btn-bg, #2a2a2a);
    color: var(--dlg-btn-text, #f0f0f0);
  }

  .dialog-panel :global(.dialog-btn.small) {
    padding: 7px 12px;
    font-size: 0.85rem;
  }

  .dialog-panel :global(.dialog-btn.primary) {
    border-color: var(--dlg-btn-text, #f0f0f0);
    background: var(--dlg-btn-text, #f0f0f0);
    color: var(--dlg-bg-solid, var(--dlg-bg, #17171a));
  }

  .dialog-panel :global(.dialog-btn:disabled) {
    opacity: 0.6;
    cursor: default;
  }
</style>
