<script>
  /**
   * Choosing what to take from a file, and where it goes. Asked for on
   * 2026-10-05: choose what is imported, and into a new folder by default --
   * named as it was exported, or "Damn 1", "Damn 2" when that name is taken.
   * The deciding is planImport in utils/folderTransfer.js; this shows its
   * answer as it will be, names included.
   */
  import { createEventDispatcher } from 'svelte';
  import { planImport } from '../utils/folderTransfer.js';

  /** readExport's answer for the file. */
  export let file = { folders: [], themes: null };
  export let fileName = '';
  export let currentFolder = '';
  export let existingFolders = [];
  export let existingThemeNames = [];
  export let themeStyle = '';
  export let busy = false;

  const dispatch = createEventDispatcher();

  let chosen = new Set((file.folders || []).map(folder => folder.name));
  let settings = true;
  let themes = true;
  let switchTheme = false;
  let target = 'new';

  $: hasSettings = (file.folders || []).some(folder => folder.modeSettings);
  $: themeCount = file.themes?.custom?.length || 0;
  $: canReplace = chosen.size === 1 && Boolean(currentFolder);
  $: if (!canReplace && target === 'replace') target = 'new';
  $: plan = planImport({
    file,
    folders: [...chosen],
    settings,
    themes,
    target,
    existingFolders,
    currentFolder,
    existingThemeNames
  });
  $: namesAfter = new Map(target === 'new' && !plan.error
    ? (file.folders || []).filter(f => chosen.has(f.name)).map((f, i) => [f.name, plan.writes[i]?.name])
    : []);
  $: nothingChosen = !chosen.size && !(themes && themeCount);

  function toggle(name) {
    const next = new Set(chosen);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    chosen = next;
  }

  function submit() {
    dispatch('import', { folders: [...chosen], settings, themes, switchTheme, target });
  }
</script>

<div class="transfer-overlay" role="presentation" style={themeStyle} on:click={() => !busy && dispatch('close')}>
  <div class="transfer-dialog" role="dialog" aria-modal="true" aria-label="Import" on:click|stopPropagation>
    <h3>Import <span class="quiet">— {fileName}</span></h3>

    {#if (file.folders || []).length}
      <fieldset>
        <legend>Folders in the file</legend>
        {#each file.folders as folder (folder.name)}
          <label>
            <input type="checkbox" checked={chosen.has(folder.name)} on:change={() => toggle(folder.name)} />
            {folder.name}
            <span class="quiet">— {folder.blocks.length} {folder.blocks.length === 1 ? 'block' : 'blocks'}{#if chosen.has(folder.name) && namesAfter.get(folder.name) && namesAfter.get(folder.name) !== folder.name}, will be called “{namesAfter.get(folder.name)}”{/if}</span>
          </label>
        {/each}
      </fieldset>
    {/if}

    <fieldset>
      <legend>With them</legend>
      {#if hasSettings}
        <label><input type="checkbox" bind:checked={settings} /> Folder settings <span class="quiet">— columns, habits, wallpaper and its dials</span></label>
      {/if}
      {#if themeCount}
        <label><input type="checkbox" bind:checked={themes} /> Themes <span class="quiet">— {themeCount}, added beside yours</span></label>
        {#if themes}
          <label class="indent"><input type="checkbox" bind:checked={switchTheme} /> Switch to the theme it was using</label>
        {/if}
      {/if}
      {#if !hasSettings && !themeCount}
        <span class="quiet">Only the folders' contents are in this file.</span>
      {/if}
    </fieldset>

    {#if chosen.size}
      <fieldset>
        <legend>Where</legend>
        <label><input type="radio" bind:group={target} value="new" /> Into new folders</label>
        <label class:disabled={!canReplace}>
          <input type="radio" bind:group={target} value="replace" disabled={!canReplace} />
          In place of “{currentFolder}” <span class="quiet">— a copy of it is kept first{!canReplace ? '; choose one folder' : ''}</span>
        </label>
      </fieldset>
    {/if}

    {#if plan.error && chosen.size}
      <p class="problem">{plan.error}</p>
    {/if}

    <div class="transfer-actions">
      <button type="button" class="transfer-btn" disabled={busy} on:click={() => dispatch('close')}>Cancel</button>
      <button type="button" class="transfer-btn primary" disabled={busy || nothingChosen || (plan.error && chosen.size)} on:click={submit}>{busy ? 'Importing…' : 'Import'}</button>
    </div>
  </div>
</div>

<style>
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
    max-width: 440px;
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
    overflow-wrap: anywhere;
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
    overflow-wrap: anywhere;
  }

  label.indent {
    padding-left: 24px;
  }

  label.disabled {
    opacity: 0.5;
    cursor: default;
  }

  .quiet {
    opacity: 0.65;
    font-size: 0.82rem;
    font-weight: 400;
  }

  .problem {
    margin: 0 0 10px;
    font-size: 0.85rem;
    opacity: 0.85;
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
