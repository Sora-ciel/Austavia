<script>
  /**
   * The playing part of a music block, without the block.
   *
   * Canvas mode wraps this in BlockShell — a frame that drags, resizes and has
   * a header to put the playlist button in. Simple Note mode has no such frame:
   * its blocks are rows in a column and it draws each type itself. It was still
   * drawing the music block the way it looked before this was a playlist player
   * at all — a bare `<audio>`, a "Title" field and a "Track URL" field, with a
   * file picker that stored a `blob:` address good only until the page
   * reloaded. That is what "broken" meant: it could not play anything from the
   * library, and anything added through it was gone on the next open.
   *
   * So the player lives here and both modes show the same one. The frame is
   * what differs between them, which is the part that should differ.
   */
  import { createEventDispatcher } from 'svelte';
  import {
    ALL_MUSIC,
    resolveQueue,
    playlistLabel,
    stepTrack,
    isQueuePlaying
  } from '../utils/playlistPlayback.js';

  /** Which playlist to play. Bindable; `change` fires when it moves. */
  export let playlistId = ALL_MUSIC;
  /** The library, and what the app's one player is doing with it. */
  export let library = { tracks: [], playlists: [] };
  export let nowPlayingId = null;
  export let isPlaying = false;

  /** Whether the playlist list is showing. Bindable, so a header button can
      drive it from outside — that is how the canvas block does it. */
  export let picking = false;
  /** Draw a button for that, for a mode with no header to put one in. */
  export let ownPickerButton = false;

  const dispatch = createEventDispatcher();

  $: resolved = resolveQueue(library, playlistId);
  $: queue = resolved.tracks;
  $: label = playlistLabel(library, playlistId);
  $: playingHere = isQueuePlaying(queue, nowPlayingId, isPlaying);
  $: currentIndex = queue.findIndex((t) => t.id === nowPlayingId);
  $: playlists = Array.isArray(library?.playlists) ? library.playlists : [];

  function play(track) {
    if (!track) return;
    dispatch('play', { trackId: track.id, queue: queue.map((t) => t.id) });
  }

  // The transport button does the thing that makes sense from where the block
  // is: pause what is playing here, resume it, or — if this block's music is
  // not what is playing at all — start this block from its first track.
  function onPlayPause() {
    if (currentIndex !== -1) {
      dispatch('toggle');
      return;
    }
    play(queue[0]);
  }

  function step(delta) {
    play(stepTrack(queue, nowPlayingId, delta));
  }

  function choose(nextId) {
    playlistId = nextId;
    picking = false;
    dispatch('change', { playlistId: nextId });
  }
</script>

<div class="player">
  {#if ownPickerButton}
    <div class="chooser">
      <button
        class="pick-btn"
        title="Choose a playlist"
        aria-expanded={picking}
        data-focus-guard
        on:click={() => (picking = !picking)}
      >☰ {label}</button>
    </div>
  {/if}

  {#if picking}
    <div class="picker">
      <button
        class="picker-row"
        class:chosen={playlistId === ALL_MUSIC}
        data-focus-guard
        on:click={() => choose(ALL_MUSIC)}
      >All music</button>
      {#each playlists as playlist (playlist.id)}
        <button
          class="picker-row"
          class:chosen={playlist.id === playlistId}
          data-focus-guard
          on:click={() => choose(playlist.id)}
        >{playlist.name}</button>
      {/each}
      {#if !playlists.length}
        <p class="empty">No playlists yet. Make one in Playlist mode.</p>
      {/if}
    </div>
  {:else if resolved.missing}
    <p class="empty">That playlist is gone. Pick another with ☰.</p>
  {:else if !queue.length}
    <p class="empty">Nothing here yet. Import music in Playlist mode.</p>
  {:else}
    <div class="transport">
      <button on:click={() => step(-1)} aria-label="Previous track" data-focus-guard>⏮</button>
      <button class="play" on:click={onPlayPause} aria-label={playingHere ? 'Pause' : 'Play'} data-focus-guard>
        {playingHere ? '⏸' : '▶'}
      </button>
      <button on:click={() => step(1)} aria-label="Next track" data-focus-guard>⏭</button>
      <span class="count">{queue.length} track{queue.length === 1 ? '' : 's'}</span>
    </div>

    <ul class="tracks">
      {#each queue as track (track.id)}
        <li>
          <button
            class="track"
            class:current={track.id === nowPlayingId}
            on:click={() => play(track)}
            data-focus-guard
          >
            <span class="mark">{track.id === nowPlayingId ? (playingHere ? '▶' : '❚❚') : ''}</span>
            <span class="title">{track.title || 'Untitled'}</span>
            {#if track.artist}<span class="artist">{track.artist}</span>{/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .player {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 6px 8px 8px;
    box-sizing: border-box;
    gap: 6px;
  }

  .empty {
    margin: 0;
    padding: 8px 2px;
    opacity: 0.65;
    font-size: 0.85rem;
    line-height: 1.4;
  }

  .chooser {
    flex: 0 0 auto;
    display: flex;
  }

  .pick-btn {
    background: color-mix(in srgb, var(--text, currentColor) 10%, transparent);
    color: inherit;
    border: none;
    border-radius: var(--block-control-radius, 8px);
    padding: 4px 10px;
    font-size: 0.8rem;
    cursor: pointer;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .transport {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 0 0 auto;
  }

  .transport button {
    background: var(--block-media-button-bg, color-mix(in srgb, var(--text, currentColor) 10%, transparent));
    color: var(--block-media-button-text, var(--text, inherit));
    border: none;
    border-radius: var(--block-control-radius, 8px);
    padding: 4px 10px;
    font-size: 0.9rem;
    line-height: 1.2;
    cursor: pointer;
  }

  .transport .play {
    background: var(--block-accent-color, color-mix(in srgb, var(--text, currentColor) 22%, transparent));
    color: var(--block-accent-text, var(--bg, inherit));
  }

  .count {
    margin-left: auto;
    font-size: 0.7rem;
    opacity: 0.6;
  }

  .tracks {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .track {
    display: flex;
    align-items: baseline;
    gap: 6px;
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    color: inherit;
    padding: 3px 4px;
    border-radius: var(--block-control-radius, 6px);
    cursor: pointer;
    font-size: 0.8rem;
  }

  .track:hover {
    background: color-mix(in srgb, var(--text, currentColor) 10%, transparent);
  }

  .track.current {
    background: color-mix(in srgb, var(--text, currentColor) 16%, transparent);
  }

  /* Fixed width so the titles line up whether or not a row is playing. */
  .mark {
    flex: 0 0 auto;
    width: 1.1em;
    font-size: 0.7rem;
    opacity: 0.8;
  }

  .title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .artist {
    flex: 0 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0.6;
    font-size: 0.72rem;
  }

  .picker {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .picker-row {
    display: block;
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    color: inherit;
    padding: 5px 4px;
    border-radius: var(--block-control-radius, 6px);
    cursor: pointer;
    font-size: 0.82rem;
  }

  .picker-row:hover {
    background: color-mix(in srgb, var(--text, currentColor) 10%, transparent);
  }

  .picker-row.chosen {
    background: color-mix(in srgb, var(--text, currentColor) 18%, transparent);
  }
</style>
