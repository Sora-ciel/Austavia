<script>
  /**
   * A playlist, playable from the canvas.
   *
   * This block used to hold a single `trackUrl` and a bare `<audio controls>`.
   * Two things were wrong with that. The small one is that it knew nothing
   * about the music library, so a block could not play anything you had
   * actually imported. The larger one is that its "choose a file" button stored
   * `URL.createObjectURL(file)` — a blob: address that is only valid for the
   * page that made it — so a track added that way was gone on the next reload,
   * and the block had been quietly forgetting music the whole time.
   *
   * It is a view onto the library now: it stores a playlist id and nothing
   * else, so a track renamed or deleted in Playlist mode changes here too. And
   * it drives the app's one audio element rather than opening a second — two
   * players would fight over the same speakers, and pausing one would leave the
   * other playing.
   *
   * `trackUrl` is left in the saved data, untouched. It is dead here, but it is
   * the user's, and an older build still knows what to do with it.
   *
   * What is left in this file is the frame: the canvas block, its header and
   * the button in it. The player itself is MusicPlayer.svelte, because Simple
   * Note mode draws its blocks without a frame and needs the same player.
   */
  import BlockShell from './BlockShell.svelte';
  import MusicPlayer from './MusicPlayer.svelte';
  import { ALL_MUSIC, playlistLabel } from '../utils/playlistPlayback.js';

  export let id;
  export let initialPosition = { x: 100, y: 100 };
  export let initialSize = { width: 320, height: 240 };
  export let initialBgColor = '#ffffff';
  export let initialTextColor = '#000000';
  export let focused = false;
  export let canvasScale = 1;

  /** Which playlist this block plays. Empty means the whole library. */
  export let initialPlaylistId = ALL_MUSIC;
  /** Kept so it survives a save; see the note above. */
  export let initialTrackUrl = '';

  /** The library, and what the app's player is doing with it. */
  export let library = { tracks: [], playlists: [] };
  export let nowPlayingId = null;
  export let isPlaying = false;

  let playlistId = initialPlaylistId;
  const trackUrl = initialTrackUrl;
  let picking = false;

  $: label = playlistLabel(library, playlistId);
</script>

<BlockShell
  {id}
  {initialPosition}
  {initialSize}
  {initialBgColor}
  {initialTextColor}
  {focused}
  {canvasScale}
  {label}
  fields={{ playlistId, trackUrl }}
  minHeight={140}
  on:update
  on:delete
  on:focusToggle
  let:commit
  let:ensureFocus
>
  <button
    slot="header-controls"
    let:ensureFocus={focusBlock}
    class="pick-btn"
    title="Choose a playlist"
    aria-label="Choose a playlist"
    data-focus-guard
    on:click={() => { focusBlock(); picking = !picking; }}
  >☰</button>

  <MusicPlayer
    bind:playlistId
    bind:picking
    {library}
    {nowPlayingId}
    {isPlaying}
    on:change={() => commit(['playlistId'])}
    on:play
    on:toggle
  />
</BlockShell>

<style>
  .pick-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 2px 6px;
    font-size: 1rem;
    line-height: 1;
    outline: none;
    color: var(--block-header-text, var(--text));
  }
</style>
