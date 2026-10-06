<script>
  /**
   * What to put in an export. Asked for on 2026-10-05: "you can't export the
   * themes and mode settings along with the folder information ... also the
   * background images". The file itself is built in utils/folderTransfer.js.
   */
  import { createEventDispatcher } from 'svelte';

  export let currentFolder = '';
  export let folderCount = 1;
  export let themeCount = 0;
  /** The app's dialog colours. */
  export let themeStyle = '';
  export let busy = false;

  const dispatch = createEventDispatcher();

  let scope = 'this';
  let settings = true;
  let pictures = true;
  let themes = true;

  function submit() {
    dispatch('export', { scope, settings, pictures, themes });
  }
</script>

<div class="transfer-overlay" role="presentation" style={themeStyle} on:click={() => !busy && dispatch('close')}>
  <div class="transfer-dialog" role="dialog" aria-modal="true" aria-label="Export" on:click|stopPropagation>
    <h3>Export</h3>

    <fieldset>
      <legend>Which folders</legend>
      <label><input type="radio" bind:group={scope} value="this" /> This folder <span class="quiet">— {currentFolder || 'unnamed'}</span></label>
      <label><input type="radio" bind:group={scope} value="all" /> All folders <span class="quiet">— {folderCount}</span></label>
    </fieldset>

    <fieldset>
      <legend>With them</legend>
      <label><input type="checkbox" bind:checked={settings} /> Folder settings <span class="quiet">— columns, habits, wallpaper and its dials</span></label>
      <label><input type="checkbox" bind:checked={pictures} /> Pictures and wallpapers inside the file <span class="quiet">— bigger, but it shows them anywhere</span></label>
      <label><input type="checkbox" bind:checked={themes} /> Your themes <span class="quiet">— {themeCount} custom, and the one in use</span></label>
    </fieldset>

    <div class="transfer-actions">
      <button type="button" class="transfer-btn" disabled={busy} on:click={() => dispatch('close')}>Cancel</button>
      <button type="button" class="transfer-btn primary" disabled={busy} on:click={submit}>{busy ? 'Preparing…' : 'Export'}</button>
    </div>
  </div>
</div>

<style>
  /* The app's dialog, in its colours (themeStyle sets --dlg-*). */
  .transfer-overlay {
    position: fixed;
    inset: 0;
    z-index: 3000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    box-sizing: border-box;
    background: rgba(0, 0, 0, 0.55);
  }

  .transfer-dialog {
    width: 100%;
    max-width: 420px;
    max-height: calc(100vh - 40px);
    overflow-y: auto;
    box-sizing: border-box;
    padding: 18px;
    border-radius: 12px;
    border: 1px solid var(--dlg-border, #333333);
    background: var(--dlg-bg, #17171a);
    color: var(--dlg-text, #f0f0f0);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
    --sb-track: var(--dlg-bg, #17171a);
    --sb-thumb: var(--dlg-text, #f0f0f0);
  }

  h3 {
    margin: 0 0 12px;
    font-size: 1.1rem;
  }

  fieldset {
    margin: 0 0 12px;
    padding: 0;
    border: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  legend {
    margin-bottom: 6px;
    font-size: 0.8rem;
    font-weight: 700;
    opacity: 0.75;
  }

  label {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 0.92rem;
    cursor: pointer;
  }

  .quiet {
    opacity: 0.65;
    font-size: 0.82rem;
  }

  .transfer-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }

  .transfer-btn {
    border: none;
    border-radius: 8px;
    padding: 8px 14px;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    background: var(--dlg-btn-bg, #2a2a2a);
    color: var(--dlg-btn-text, #f0f0f0);
  }

  .transfer-btn.primary {
    background: var(--dlg-btn-text, #f0f0f0);
    color: var(--dlg-bg, #17171a);
  }

  .transfer-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
</style>
