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
  let settings = true;
  let pictures = true;
  let currentTheme = true;
  let customThemes = false;
  // Off by default: audio is large, and it makes the file a zip.
  let music = false;

  $: trackCount = musicLibrary?.tracks?.length || 0;

  function submit() {
    dispatch('export', { scope, settings, pictures, currentTheme, customThemes: customThemes && themeCount > 0, music: music && trackCount > 0 });
  }
</script>

<AppDialog title="Export" width={420} {busy} {themeStyle} on:close={() => dispatch('close')}>

    <section>
      <h4>Which folders</h4>
      <TransferOption kind="radio" checked={scope === 'this'} title="This folder" detail={currentFolder || 'Unnamed'} on:toggle={() => (scope = 'this')} />
      <TransferOption kind="radio" checked={scope === 'all'} title="All folders" detail={`${folderCount} ${folderCount === 1 ? 'folder' : 'folders'}`} on:toggle={() => (scope = 'all')} />
    </section>

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

  h4 {
    margin: 0 0 2px;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    opacity: 0.7;
  }




</style>
