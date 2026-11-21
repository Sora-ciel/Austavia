<script>
  /**
   * What to put in an export. Asked for on 2026-10-05: "you can't export the
   * themes and mode settings along with the folder information ... also the
   * background images". The file itself is built in utils/folderTransfer.js.
   *
   * The theme in use and your custom themes are two choices, not one -- asked
   * for on 2026-10-06 -- with the theme in use ticked and the custom ones not.
   */
  import { createEventDispatcher } from 'svelte';
  import AppDialog from './AppDialog.svelte';
  import TransferOption from './TransferOption.svelte';
  import { describeMusic } from '../utils/musicTransfer.js';

  export let currentFolder = '';
  export let folderCount = 1;
  /**
   * How many levels of nests this folder has (utils/nestedExport.js), null
   * while they are counted. Asked 2026-11-21: export with no nests, one
   * level, up to a chosen level, or all of them, the most shown.
   */
  export let nestLevels = null;
  export let themeCount = 0;
  /** The name of the theme on screen. */
  export let currentThemeName = '';
  /** Playlist mode's library -- asked for on 2026-10-06. */
  export let musicLibrary = { tracks: [], playlists: [] };
  /** The app's dialog colours. */
  export let themeStyle = '';
  export let busy = false;

  const dispatch = createEventDispatcher();

  let scope = 'this';
  let nesting = 'none'; // 'none' | 'one' | 'chosen' | 'all'
  let chosenLevels = 2;
  $: if (nestLevels && chosenLevels > nestLevels) chosenLevels = nestLevels;
  $: nestDepth = nesting === 'one' ? 1 : nesting === 'chosen' ? chosenLevels : nesting === 'all' ? Infinity : 0;
  const levelWord = n => `${n} ${n === 1 ? 'level' : 'levels'}`;
  let settings = true;
  let pictures = true;
  let currentTheme = true;
  let customThemes = false;
  // Off by default: audio is large, and it makes the file a zip.
  let music = false;

  $: trackCount = musicLibrary?.tracks?.length || 0;

  function submit() {
    dispatch('export', { scope, nestDepth: scope === 'this' ? nestDepth : 0, settings, pictures, currentTheme, customThemes: customThemes && themeCount > 0, music: music && trackCount > 0 });
  }
</script>

<AppDialog title="Export" width={420} {busy} {themeStyle} on:close={() => dispatch('close')}>

    <section>
      <h4>Which folders</h4>
      <TransferOption kind="radio" checked={scope === 'this'} title="This folder" detail={currentFolder || 'Unnamed'} on:toggle={() => (scope = 'this')} />
      <TransferOption kind="radio" checked={scope === 'all'} title="All folders" detail={`${folderCount} ${folderCount === 1 ? 'folder' : 'folders'}`} on:toggle={() => (scope = 'all')} />
    </section>

    {#if scope === 'this' && nestLevels !== 0}
      <section>
        <h4>Nested folders</h4>
        {#if nestLevels === null}
          <p class="counting">Counting the folders in its nests…</p>
        {:else}
          <TransferOption kind="radio" checked={nesting === 'none'} title="No nested folders" detail="Only this folder." on:toggle={() => (nesting = 'none')} />
          <TransferOption kind="radio" checked={nesting === 'one'} title="Nested, 1 level" detail="And the folders its nests lead to." on:toggle={() => (nesting = 'one')} />
          {#if nestLevels > 2}
            <TransferOption kind="radio" checked={nesting === 'chosen'} title="Nested, up to a level" detail="Folders in nests of nested folders, as deep as you choose." on:toggle={() => (nesting = 'chosen')} />
            {#if nesting === 'chosen'}
              <label class="levels">
                Up to
                <select bind:value={chosenLevels}>
                  {#each Array.from({ length: nestLevels - 1 }, (_, i) => i + 2) as n}
                    <option value={n}>{levelWord(n)}</option>
                  {/each}
                </select>
              </label>
            {/if}
          {/if}
          {#if nestLevels > 1}
            <TransferOption kind="radio" checked={nesting === 'all'} title={`All nested, ${levelWord(nestLevels)}`} detail="Every folder its nests lead to, however deep." on:toggle={() => (nesting = 'all')} />
          {/if}
        {/if}
      </section>
    {/if}

    <section>
      <h4>With them</h4>
      <TransferOption checked={settings} title="Folder settings" detail="Columns, habits, wallpaper and its dials." on:toggle={() => (settings = !settings)} />
      <TransferOption checked={pictures} title="Pictures inside the file" detail="Bigger, but it shows them anywhere." on:toggle={() => (pictures = !pictures)} />
    </section>

    <section>
      <h4>Themes</h4>
      <TransferOption checked={currentTheme} title="The theme you use" detail={currentThemeName || 'The one on screen now.'} on:toggle={() => (currentTheme = !currentTheme)} />
      <TransferOption
        checked={customThemes && themeCount > 0}
        disabled={!themeCount}
        title="Your custom themes"
        detail={themeCount ? `${themeCount} ${themeCount === 1 ? 'theme' : 'themes'}.` : 'You have none yet.'}
        on:toggle={() => (customThemes = !customThemes)}
      />
    </section>

    <section>
      <h4>Music</h4>
      <TransferOption
        checked={music && trackCount > 0}
        disabled={!trackCount}
        title="Your music from Playlist mode"
        detail={trackCount ? `${describeMusic(musicLibrary)}. The file becomes a .zip, as big as the audio.` : 'Nothing in Playlist mode yet.'}
        on:toggle={() => (music = !music)}
      />
    </section>

    <div class="dialog-actions">
      <button type="button" class="dialog-btn" disabled={busy} on:click={() => dispatch('close')}>Cancel</button>
      <button type="button" class="dialog-btn primary" disabled={busy} on:click={submit}>{busy ? 'Preparing…' : 'Export'}</button>
    </div>
</AppDialog>

<style>
  /* The app's dialog, in its colours (themeStyle sets --dlg-*). */



  section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0 0 14px;
  }

  .counting {
    margin: 0;
    font-size: 0.85rem;
    opacity: 0.7;
  }

  .levels {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: 28px;
    font-size: 0.85rem;
  }

  h4 {
    margin: 0 0 2px;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    opacity: 0.7;
  }




</style>
