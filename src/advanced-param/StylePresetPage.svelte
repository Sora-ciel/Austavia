<script>
  import { createEventDispatcher } from 'svelte';

  export let themes = [];
  export let selectedThemeId = 'default-dark';

  const dispatch = createEventDispatcher();

  function toCssVarName(key) {
    return key
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/_/g, '-')
      .toLowerCase();
  }

  function buildPreviewStyle(theme) {
    const entries = Object.entries(theme?.blockTheme || {});
    const blockVars = entries
      .map(([key, value]) => `--block-${toCssVarName(key)}: ${value}`)
      .join('; ');
    const previewBg = theme?.previewBg ?? 'rgba(20, 20, 24, 0.8)';
    const previewText = theme?.blockTheme?.headerText ?? '#ffffff';
    return `${blockVars}; --bg: ${previewBg}; --text: ${previewText};`;
  }

  function applyTheme(theme) {
    if (!theme?.id) return;
    dispatch('selectTheme', { id: theme.id });
  }
</script>

<style>
  /* One layout on every screen: the card *is* a sample block, and its header
     carries the theme's name. This was the phone layout; asked for on
     2026-09-27 on the desktop too -- "make the preview of the themes like the
     mobile one on PC, so it takes less space and we can have more" -- since
     the larger desktop card showed a third as many themes for the same
     height. The description is still there, as the card's tooltip. */
  .preset-grid {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .preset-card {
    width: 100%;
    display: flex;
    flex-direction: column;
    padding: 0;
    border: none;
    background: none;
    border-radius: 0;
    text-align: left;
    cursor: pointer;
    transition: transform 0.2s ease;
  }

  .preset-card:hover {
    transform: translateY(-1px);
  }

  .card-preview {
    border-radius: var(--block-border-radius, 12px);
    border: var(--block-border-width, 1px) solid var(--block-border-color, rgba(255, 255, 255, 0.22));
    box-shadow: var(--block-shadow, 0 12px 32px rgba(0, 0, 0, 0.4));
    overflow: hidden;
    background: var(--bg, rgba(10, 10, 10, 0.55));
  }

  .preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    background: var(--block-header-bg, rgba(28, 28, 28, 0.85));
    color: var(--block-header-text, #ffffff);
    font-family: var(--block-header-font, 'Inter', sans-serif);
    letter-spacing: var(--block-header-letter-spacing, 0.08em);
    text-transform: var(--block-header-transform, uppercase);
    font-size: 0.7rem;
    padding: 5px 9px;
  }

  .preview-theme-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* A custom theme is marked on the card itself, now there is no row above
     it to hold a tag. */
  .tag {
    flex: none;
    padding: 1px 6px;
    border-radius: 999px;
    border: 1px solid currentColor;
    font-size: 0.58rem;
    letter-spacing: 0.08em;
    opacity: 0.8;
  }

  .preview-body-row {
    display: flex;
    align-items: center;
    min-height: 30px;
    padding: 0 9px;
  }

  .preview-body {
    font-family: var(--block-body-font, 'Inter', sans-serif);
    color: var(--block-header-text, #ffffff);
    text-shadow: var(--block-text-shadow, none);
    font-size: 0.72rem;
    opacity: 0.9;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .preset-card.active .card-preview {
    outline: 2px solid var(--right-accent, #8bb7ff);
    outline-offset: 1px;
  }

  .custom-note {
    margin-top: 6px;
    font-size: 0.68rem;
    line-height: 1.3;
    opacity: 0.7;
    text-align: center;
  }
</style>

<div class="preset-grid">
  {#each themes as theme (theme.id)}
    <button
      type="button"
      class="preset-card"
      class:active={selectedThemeId === theme.id}
      style={buildPreviewStyle(theme)}
      title={theme.description || theme.name}
      aria-pressed={selectedThemeId === theme.id}
      on:click={() => applyTheme(theme)}
    >
      <div class="card-preview">
        <div class="preview-header">
          <span class="preview-theme-name">{theme.name}</span>
          {#if theme.isCustom}<span class="tag">Custom</span>{/if}
        </div>
        <div class="preview-body-row">
          <div class="preview-body">Aa · 123 · Lorem</div>
        </div>
      </div>
    </button>
  {/each}
</div>

{#if selectedThemeId === 'custom'}
  <p class="custom-note">
    Using a custom style — choose a preset above to replace it.
  </p>
{/if}
