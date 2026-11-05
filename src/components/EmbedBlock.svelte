<script>
  /**
   * A web page shown inside a block. The frame -- where it sits, its size, its
   * colours, its header, dragging, resizing, focus -- is BlockShell's, as for
   * every block (moved onto it 2026-11-04, so that a page can draw it without a
   * frame: PENDING, "Page mode"). What is left here is the embed.
   *
   * The gear and its "Settings area (put options here)" panel went with the
   * move: it was a placeholder that held nothing.
   */
  import BlockShell from './BlockShell.svelte';

  export let id;
  export let initialPosition = { x: 100, y: 100 };
  export let initialSize = { width: 560, height: 315 };
  export let initialBgColor = '#ffffff';
  export let initialTextColor = '#000000';
  export let initialContent = '';
  export let focused = false;
  export let canvasScale = 1;
  export let placement = 'canvas';

  export let initialTitle = 'Embed Block';

  let content = initialContent;
  let title = initialTitle;
</script>

<BlockShell
  {id}
  {initialPosition}
  {initialSize}
  {initialBgColor}
  {initialTextColor}
  {focused}
  {canvasScale}
  {placement}
  label={title}
  fields={{ content, title }}
  on:update
  on:delete
  on:focusToggle
  let:commit
  let:ensureFocus
>
  <div class="content">
    {#if content}
      <div class="embed-wrapper">
        {@html content}
      </div>
    {:else}
      <p style="opacity: 0.6; padding: 8px;">No embed URL set</p>
    {/if}

    <label style="padding: 6px;">
      Embed URL:
      <input
        type="text"
        bind:value={content}
        on:input={() => commit(['content'], {}, { content })}
        on:focus={ensureFocus}
        placeholder="https://example.com/embed"
        data-focus-guard
      />
    </label>
  </div>
</BlockShell>

<style>
  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    padding: 0;
    box-sizing: border-box;
  }
</style>
