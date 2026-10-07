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
  import TransferOption from './TransferOption.svelte';
  import { describeMusic } from '../utils/musicTransfer.js';

  /** readExport's answer for the file. */
  export let file = { folders: [], themes: null };
  export let fileName = '';
  export let currentFolder = '';
  export let existingFolders = [];
  /** Every theme here, official and custom. */
  export let existingThemes = [];
  export let officialThemeIds = [];
  /** The music the file carries, when it is a zip with some. */
  export let music = null;
  export let themeStyle = '';
  export let busy = false;

  const dispatch = createEventDispatcher();

  let chosen = new Set((file.folders || []).map(folder => folder.name));
  let settings = true;
  let themes = true;
  let currentTheme = false;
  let withMusic = true;
  let target = 'new';

  $: hasSettings = (file.folders || []).some(folder => folder.modeSettings);
  $: customCount = file.themes?.custom?.length || 0;
  $: fileThemeName = themeNameInFile(file);
  $: canReplace = chosen.size === 1 && Boolean(currentFolder);
  $: if (!canReplace && target === 'replace') target = 'new';
  $: plan = planImport({
    file,
    folders: [...chosen],
    settings,
    themes,
    currentTheme,
    target,
    existingFolders,
    currentFolder,
    existingThemes,
    officialThemeIds
  });
  // The names each "Where" gives, shown under it before it is chosen --
  // asked for on 2026-10-06.
  $: newNames = chosen.size
    ? planImport({ file, folders: [...chosen], settings, themes: false, currentTheme: false, target: 'new', existingFolders }).writes?.map(write => write.name) || []
    : [];
  $: musicCount = music?.tracks?.length || 0;
  $: customAdded = plan.error ? 0 : plan.themes.filter(theme => (file.themes?.custom || []).some(c => c.id === theme.id)).length;
  $: nothingChosen = !chosen.size && !(themes && customAdded) && !(currentTheme && fileThemeName) && !(withMusic && musicCount);

  function themeNameInFile(f) {
    const id = f.themes?.selectedId;
    if (!id && !f.themes?.current) return '';
    return f.themes?.current?.name
      || (f.themes?.custom || []).find(theme => theme.id === id)?.name
      || existingThemes.find(theme => theme.id === id)?.name
      || '';
  }

  function toggle(name) {
    const next = new Set(chosen);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    chosen = next;
  }

  function folderDetail(folder) {
    return `${folder.blocks.length} ${folder.blocks.length === 1 ? 'block' : 'blocks'}`;
  }

  function quoted(names) {
    const shown = names.slice(0, 3).map(name => `“${name}”`).join(', ');
    return names.length > 3 ? `${shown} and ${names.length - 3} more` : shown;
  }

  function customDetail() {
    const same = customCount - customAdded;
    if (!same) return `${customCount}, added beside yours.`;
    if (!customAdded) return `You already have ${customCount === 1 ? 'it' : 'all of them'}.`;
    return `${customAdded} new, added beside yours; ${same} you already have.`;
  }

  function submit() {
    dispatch('import', { folders: [...chosen], settings, themes, currentTheme, music: withMusic && musicCount > 0, target });
  }
</script>

<div class="transfer-overlay" role="presentation" style={themeStyle} on:click={() => !busy && dispatch('close')}>
  <div class="transfer-dialog" role="dialog" aria-modal="true" aria-label="Import" on:click|stopPropagation>
    <h3>Import</h3>
    <p class="file-name">{fileName}</p>

    {#if (file.folders || []).length}
      <section>
        <h4>Folders in the file</h4>
        {#each file.folders as folder (folder.name)}
          <TransferOption checked={chosen.has(folder.name)} title={folder.name} detail={folderDetail(folder)} on:toggle={() => toggle(folder.name)} />
        {/each}
      </section>
    {/if}

    {#if hasSettings || customCount || fileThemeName}
      <section>
        <h4>With them</h4>
        {#if hasSettings}
          <TransferOption checked={settings} title="Folder settings" detail="Columns, habits, wallpaper and its dials." on:toggle={() => (settings = !settings)} />
        {/if}
        {#if customCount}
          <TransferOption checked={themes} title="Custom themes" detail={customDetail(customAdded, customCount)} on:toggle={() => (themes = !themes)} />
        {/if}
        {#if fileThemeName}
          <TransferOption checked={currentTheme} title="Switch to the theme it was using" detail={fileThemeName} on:toggle={() => (currentTheme = !currentTheme)} />
        {/if}
      </section>
    {:else if (file.folders || []).length}
      <p class="quiet">Only the folders' contents are in this file.</p>
    {/if}

    {#if musicCount}
      <section>
        <h4>Music</h4>
        <TransferOption checked={withMusic} title="Music for Playlist mode" detail={`${describeMusic(music)}, added to yours.`} on:toggle={() => (withMusic = !withMusic)} />
      </section>
    {/if}

    {#if chosen.size}
      <section>
        <h4>Where</h4>
        <TransferOption
          kind="radio"
          checked={target === 'new'}
          title={chosen.size === 1 ? 'Into a new folder' : 'Into new folders'}
          detail={newNames.length ? `Called ${quoted(newNames)}.` : ''}
          on:toggle={() => (target = 'new')}
        />
        <TransferOption
          kind="radio"
          checked={target === 'replace'}
          disabled={!canReplace}
          title={`In place of “${currentFolder}”`}
          detail={canReplace ? `Keeps the name “${currentFolder}”; a copy of what it holds now is kept first.` : 'Choose one folder for this.'}
          on:toggle={() => (target = 'replace')}
        />
      </section>
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
  /* The app's dialog, in its colours (themeStyle sets --dlg-*). */
  .transfer-overlay {
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

  .transfer-dialog {
    width: 100%;
    max-width: 440px;
    max-height: calc(100dvh - 32px);
    overflow-y: auto;
    box-sizing: border-box;
    padding: 18px;
    border-radius: 14px;
    border: 1px solid var(--dlg-border, #333333);
    background: var(--dlg-bg, #17171a);
    color: var(--dlg-text, #f0f0f0);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
    --sb-track: var(--dlg-bg, #17171a);
    --sb-thumb: var(--dlg-text, #f0f0f0);
  }

  h3 {
    margin: 0;
    font-size: 1.1rem;
  }

  .file-name {
    margin: 2px 0 14px;
    font-size: 0.8rem;
    opacity: 0.65;
    overflow-wrap: anywhere;
  }

  section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0 0 14px;
  }

  h4 {
    margin: 0 0 2px;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    opacity: 0.7;
  }

  .quiet,
  .problem {
    margin: 0 0 14px;
    font-size: 0.85rem;
    opacity: 0.75;
  }

  .transfer-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }

  .transfer-btn {
    border: 1px solid color-mix(in srgb, var(--dlg-text, #f0f0f0) 25%, transparent);
    border-radius: 8px;
    padding: 8px 16px;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    background: var(--dlg-btn-bg, #2a2a2a);
    color: var(--dlg-btn-text, #f0f0f0);
  }

  .transfer-btn.primary {
    border-color: var(--dlg-btn-text, #f0f0f0);
    background: var(--dlg-btn-text, #f0f0f0);
    color: var(--dlg-bg-solid, var(--dlg-bg, #17171a));
  }

  .transfer-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
</style>
