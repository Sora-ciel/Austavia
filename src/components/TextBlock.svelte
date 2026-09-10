<script>
  /**
   * A block of writing. Everything that makes it a *block* — where it sits, how
   * big it is, its colours, its header, dragging, resizing — is BlockShell's;
   * what is left here is what makes it text.
   */
  import BlockShell from './BlockShell.svelte';
  import TipTapEditor from './TipTapEditor.svelte';

  export let id;
  export let initialPosition = { x: 100, y: 100 };
  export let initialSize = { width: 300, height: 200 };
  export let initialBgColor = '#ffffff';
  export let initialTextColor = '#000000';
  export let initialContent = '';
  export let initialScrollTop = 0;
  export let focused = false;
  export let canvasScale = 1;

  let content = initialContent;
  let scrollTop = initialScrollTop;
</script>

<BlockShell
  {id}
  {initialPosition}
  {initialSize}
  {initialBgColor}
  {initialTextColor}
  {focused}
  {canvasScale}
  label="Text"
  fields={{ content, scrollTop }}
  on:update
  on:delete
  on:focusToggle
  let:commit
  let:ensureFocus
>
  <TipTapEditor
    {content}
    {initialScrollTop}
    historyKey={id}
    placeholder=""
    on:change={(e) => { content = e.detail; commit(['content'], { pushToHistory: false }); }}
    on:scroll={(e) => {
      // Only while focused. An unfocused block is not scrollable, and the
      // browser reports a scroll to 0 as it becomes so — saving that would
      // throw away where somebody had read up to, every time they clicked away.
      if (!focused) return;
      scrollTop = e.detail;
      commit(['scrollTop'], { pushToHistory: false });
    }}
    on:focus={ensureFocus}
  />
</BlockShell>
