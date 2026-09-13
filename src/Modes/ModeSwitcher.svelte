<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import DefaultCanvasMode from './CanvasMode.svelte';
  import SimpleNoteMode from './SimpleNoteMode.svelte';
  import SingleNoteMode from './SingleNoteMode.svelte';
  import HabitTrackerMode from './HabitTrackerMode.svelte';
  import TaskMode from './TaskMode.svelte';
  import PlaylistMode from './PlaylistMode.svelte';
  import BirthdayMode from './BirthdayMode.svelte';

  export let mode; // 'default' or 'simple'
  // Which folder is open. Canvas mode uses it to know when to go back to the
  // home zoom; nothing else needs it.
  export let openFolder = '';
  export let blocks;
  export let canvasRef;
  export let onTouchStart;
  export let onTouchMove;
  export let onTouchEnd;
  export let focusedBlockId;
  export let canvasColors = {};
  export let leftControlColors = {};
  export let modeLabels = {};
  export let simpleNoteColumnCount = 2;
  export let singleNoteSettings = {};
  // Canvas mode's wallpaper. Same shape as singleNoteSettings; see
  // utils/modeBackground.js.
  export let canvasBackgroundSettings = {};
  export let taskAddDirection = 'above';
  export let musicLibrary = { tracks: [], playlists: [] };
  export let nowPlayingId = null;
  export let isPlaying = false;
  export let shuffle = false;

  let width = 0;

  const dispatch = createEventDispatcher();

  function deleteBlockHandler(event) {
    dispatch('delete', event.detail);
  }

  function updateBlockHandler(event) {
    dispatch('update', event.detail);
  }

  function focusToggleHandler(event) {
    dispatch('focusToggle', event.detail);
  }

  function swapBlocksHandler(event) {
    dispatch('swapBlocks', event.detail);
  }

  function updateWidth() {
    width = window.innerWidth;
  }

  onMount(() => {
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  });


</script>

{#if mode === 'default'}
  <DefaultCanvasMode
    {mode}
    {openFolder}
    backgroundSettings={canvasBackgroundSettings}
    {blocks}
    {focusedBlockId}
    library={musicLibrary}
    {nowPlayingId}
    {isPlaying}
    bind:canvasRef
    {canvasColors}
    on:touchstart={onTouchStart}
    on:touchmove={onTouchMove}
    on:touchend={onTouchEnd}
    on:update={updateBlockHandler}
    on:delete={deleteBlockHandler}
    on:focusToggle={focusToggleHandler}
    on:play
    on:toggle
  />
{:else if mode === 'simple'}
    <SimpleNoteMode
      {blocks}
      {focusedBlockId}
      columnCount={simpleNoteColumnCount}
      bind:canvasRef
      {canvasColors}
      {leftControlColors}
      library={musicLibrary}
      {nowPlayingId}
      {isPlaying}
      on:play
      on:toggle
      on:touchstart={onTouchStart}
      on:touchmove={onTouchMove}
      on:touchend={onTouchEnd}
      on:update={updateBlockHandler}
      on:delete={deleteBlockHandler}
      on:focusToggle={focusToggleHandler}
      on:swapBlocks={swapBlocksHandler}
    />

  {:else if mode === 'habit'}
    <HabitTrackerMode {modeLabels} activeMode={mode} {canvasColors} />
  {:else if mode === 'task'}
    <TaskMode
      {blocks}
      {focusedBlockId}
      bind:canvasRef
      {canvasColors}
      addDirection={taskAddDirection}
      on:update={updateBlockHandler}
      on:delete={deleteBlockHandler}
      on:focusToggle={focusToggleHandler}
      on:modeSettingChange
    />
  {:else if mode === 'playlist'}
    <PlaylistMode
      bind:canvasRef
      {canvasColors}
      {blocks}
      backgroundSettings={singleNoteSettings}
      library={musicLibrary}
      {nowPlayingId}
      {isPlaying}
      {shuffle}
      on:libraryChange
      on:play
      on:toggle
      on:stop
      on:toggleShuffle
      on:notify
    />
  {:else if mode === 'birthday'}
    <BirthdayMode />
  {:else}
    <SingleNoteMode
      {blocks}
      {focusedBlockId}
      bind:canvasRef
      {canvasColors}
      {singleNoteSettings}
      fileKey={openFolder}
      on:touchstart={onTouchStart}
      on:touchmove={onTouchMove}
      on:touchend={onTouchEnd}
      on:update={updateBlockHandler}
      on:delete={deleteBlockHandler}
      on:focusToggle={focusToggleHandler}
      on:modeSettingChange
    />
{/if}
