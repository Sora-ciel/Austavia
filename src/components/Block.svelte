<script>
  /**
   * Any block, drawn by its own component: the one place a block's stored
   * fields are turned into that component's props. The Canvas and Page mode
   * both draw blocks through it (2026-11-04), so a new field or a new kind of
   * block is wired once (CLAUDE.md, "one of everything").
   *
   * `placement` is BlockShell's: 'canvas' where it was dragged, framed, or
   * 'page' in the flow of a page with nothing drawn round it.
   */
  import TextBlock from './TextBlock.svelte';
  import ImgBlock from './ImgBlock.svelte';
  import MusicBlock from './MusicBlock.svelte';
  import EmbedBlock from './EmbedBlock.svelte';
  import ClockBlock from './ClockBlock.svelte';
  import TaskBlock from './TaskBlock.svelte';
  import NestBlock from './NestBlock.svelte';
  import PageBlock from './PageBlock.svelte';
  import CalendarBlock from './CalendarBlock.svelte';
  import { recallScroll } from '../utils/scrollMemory.js';

  export let block;
  export let focused = false;
  export let canvasScale = 1;
  export let placement = 'canvas';
  /** The open folder, for remembering how far a note was read. */
  export let fileKey = '';
  export let library = { tracks: [], playlists: [] };
  export let nowPlayingId = null;
  export let isPlaying = false;
  /** Drawn full size by a mode of its own (a calendar in Calendar mode). */
  export let big = false;

  $: common = {
    id: block.id,
    initialPosition: block.position,
    initialSize: block.size,
    initialBgColor: block.bgColor,
    initialTextColor: block.textColor,
    focused,
    canvasScale,
    placement
  };
</script>

{#if block.type === 'text' || block.type === 'cleantext'}
  <!-- Scroll comes from this device's memory and nowhere else. It used to
       fall back to `block.scrollTop`, a field older builds saved into the
       block -- and the fallback ran whenever nothing was remembered, including
       after scrolling back to the top, which deletes the entry. A theme change
       redraws every block, so that was when an old position came back:
       reported on 2026-09-28 as the scroll being saved "by theme". See
       utils/scrollMemory.js. -->
  <TextBlock
    {...common}
    initialContent={block.content}
    initialScrollTop={recallScroll(fileKey, block.id)}
    {fileKey}
    on:delete
    on:update
    on:focusToggle
    on:slash
    on:slashKey
  />
{:else if block.type === 'image'}
  <ImgBlock
    {...common}
    initialSrc={block.src}
    initialResolvedSrc={block.resolvedSrc}
    initialAttachmentRequiresAuth={block.attachmentRequiresAuth}
    on:delete
    on:update
    on:focusToggle
    on:lightbox
  />
{:else if block.type === 'music'}
  <MusicBlock
    {...common}
    initialPlaylistId={block.playlistId}
    initialTrackUrl={block.trackUrl}
    {library}
    {nowPlayingId}
    {isPlaying}
    on:delete
    on:update
    on:focusToggle
    on:play
    on:toggle
  />
{:else if block.type === 'embed'}
  <EmbedBlock
    {...common}
    initialContent={block.content}
    on:delete
    on:update
    on:focusToggle
  />
{:else if block.type === 'task'}
  <TaskBlock
    {...common}
    initialTasks={block.tasks}
    initialTitle={block.title}
    on:delete
    on:update
    on:focusToggle
  />
{:else if block.type === 'nest'}
  <NestBlock
    {...common}
    initialLinks={block.links}
    initialTitle={block.title}
    on:delete
    on:update
    on:focusToggle
  />
{:else if block.type === 'calendar'}
  <CalendarBlock
    {...common}
    initialEvents={block.events}
    initialTitle={block.title}
    initialNextColor={block.nextColor}
    {big}
    on:delete
    on:update
    on:focusToggle
  />
{:else if block.type === 'page'}
  <PageBlock
    {...common}
    initialTitle={block.title}
    initialRows={block.rows}
    on:delete
    on:update
    on:focusToggle
  />
{:else if block.type === 'clock'}
  <ClockBlock
    {...common}
    initialHour12={block.hour12 === true}
    initialShowSeconds={block.showSeconds === true}
    initialShowDate={block.showDate !== false}
    initialAlarmTime={block.alarmTime || ''}
    initialAlarmEnabled={block.alarmEnabled === true}
    on:delete
    on:update
    on:focusToggle
  />
{/if}
