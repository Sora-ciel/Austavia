<script>
  import MarkdownIt from 'markdown-it';
  import { sanitizeRichText, looksLikeHtml } from '../utils/sanitizeRichText.js';
  import TipTapEditor from './TipTapEditor.svelte';

  // html:false because task text arrives through sync — it isn't trusted
  // markup. breaks:true keeps a multi-line task looking multi-line.
  const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
  // Tasks are saved as editor HTML so an image can keep the width it was
  // dragged to — markdown has no way to express that. Text written before this
  // is still markdown, so it keeps going through the markdown renderer.
  // Either way the result is sanitised: it arrives through sync.
  function renderTaskText(text) {
    const value = String(text ?? '');
    return sanitizeRichText(looksLikeHtml(value) ? value : md.render(value));
  }

  import { createEventDispatcher } from 'svelte';
  import { isPrimaryPointer } from '../utils/pointer.js';
  import ColorField from './ColorField.svelte';

  export let id;
  export let initialPosition = { x: 100, y: 100 };
  export let initialSize = { width: 320, height: 260 };
  export let initialBgColor = '#000000';
  export let initialTextColor = '#ffffff';
  export let initialTasks = [];
  export let initialTitle = 'Task List';
  export let focused = false;
  export let canvasScale = 1;

  const dispatch = createEventDispatcher();

  let position = { ...initialPosition };
  let size = { ...initialSize };
  let bgColor = initialBgColor;
  let textColor = initialTextColor;
  let tasks = Array.isArray(initialTasks) ? [...initialTasks] : [];
  let title = initialTitle || 'Task List';
  let newTaskText = '';

  let dragging = false;
  let resizing = false;
  let suppressClick = false;
  let hasDragged = false;
  let hasResized = false;
  let offset = { x: 0, y: 0 };
  let resizeStart = { x: 0, y: 0, width: 0, height: 0 };

  function getCanvasPoint(event) {
    const source = event.touches ? event.touches[0] : event;
    const safeScale = Number(canvasScale) > 0 ? Number(canvasScale) : 1;
    return {
      x: source.clientX / safeScale,
      y: source.clientY / safeScale
    };
  }

  const todoTasks = () => tasks.filter(task => !task.done);

  function sendUpdate(changedKeys, { pushToHistory } = {}) {
    const detail = {
      id,
      position,
      size,
      bgColor,
      textColor,
      tasks,
      title
    };
    const effectiveKeys = Array.isArray(changedKeys) && changedKeys.length ? changedKeys : [];

    if (effectiveKeys.length) detail.changedKeys = effectiveKeys;
    if (pushToHistory !== undefined) detail.pushToHistory = pushToHistory;

    dispatch('update', detail);
  }

  function onDragStart(e) {
    // Right-click is canvas pan, not block drag.
    if (!isPrimaryPointer(e)) return;
    if (dragging) return;
    ensureFocus();
    dragging = true;
    hasDragged = false;

    const point = getCanvasPoint(e);

    offset = { x: point.x - position.x, y: point.y - position.y };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onMouseMove, { passive: false });
    window.addEventListener('touchend', onMouseUp);
    window.addEventListener('pointermove', onMouseMove);
    window.addEventListener('pointerup', onMouseUp);

    if (typeof e.pointerId === 'number' && e.currentTarget?.setPointerCapture) {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  }

  function onMouseMove(e) {
    if (!dragging) return;

    const point = getCanvasPoint(e);

    position.x = Math.max(0, point.x - offset.x);
    position.y = Math.max(0, point.y - offset.y);
    hasDragged = true;

    if (e.cancelable) e.preventDefault();
  }

  function onMouseUp() {
    dragging = false;
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('touchmove', onMouseMove);
    window.removeEventListener('touchend', onMouseUp);
    window.removeEventListener('pointermove', onMouseMove);
    window.removeEventListener('pointerup', onMouseUp);
    sendUpdate(['position']);
    if (hasDragged) {
      suppressClick = true;
      hasDragged = false;
      requestAnimationFrame(() => (suppressClick = false));
    }
  }

  function onResizeStart(e) {
    e.stopPropagation();
    ensureFocus();
    resizing = true;
    hasResized = false;
    document.body.style.userSelect = 'none';

    const point = getCanvasPoint(e);

    resizeStart = {
      x: point.x,
      y: point.y,
      width: size.width,
      height: size.height
    };

    window.addEventListener('mousemove', onResizing);
    window.addEventListener('mouseup', onResizeEnd);
    window.addEventListener('touchmove', onResizing, { passive: false });
    window.addEventListener('touchend', onResizeEnd);
  }

  function onResizing(e) {
    if (!resizing) return;

    const point = getCanvasPoint(e);

    const deltaX = point.x - resizeStart.x;
    const deltaY = point.y - resizeStart.y;

    size.width = Math.max(220, resizeStart.width + deltaX);
    size.height = Math.max(200, resizeStart.height + deltaY);
    hasResized = true;

    if (e.cancelable) e.preventDefault();
  }

  function onResizeEnd() {
    resizing = false;
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', onResizing);
    window.removeEventListener('mouseup', onResizeEnd);
    window.removeEventListener('touchmove', onResizing);
    window.removeEventListener('touchend', onResizeEnd);
    sendUpdate(['size']);
    if (hasResized) {
      suppressClick = true;
      hasResized = false;
      requestAnimationFrame(() => (suppressClick = false));
    }
  }

  function deleteBlock() {
    dispatch('delete', { id });
  }

  function ensureFocus() {
    if (!focused) {
      dispatch('focusToggle', { id });
    }
  }

  function handleWrapperClick(event) {
    if (suppressClick) return;
    if (event.defaultPrevented) return;
    if (event.target.closest('[data-focus-guard]')) {
      ensureFocus();
      return;
    }
    ensureFocus();
  }

  function handleWrapperKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    if (event.target !== event.currentTarget) {
      return;
    }

    event.preventDefault();
    handleWrapperClick(event);
  }

  function updateTasks(nextTasks, { pushToHistory = true } = {}) {
    tasks = nextTasks;
    sendUpdate(['tasks'], { pushToHistory });
  }

  function addTask() {
    const trimmed = newTaskText.trim();
    if (!trimmed) return;
    updateTasks(
      [...tasks, { id: crypto.randomUUID(), text: trimmed, done: false }],
      { pushToHistory: true }
    );
    newTaskText = '';
  }

  function toggleTask(taskId) {
    const nextTasks = tasks.map(task =>
      task.id === taskId ? { ...task, done: !task.done } : task
    );
    updateTasks(nextTasks, { pushToHistory: true });
  }

  function deleteTask(taskId) {
    updateTasks(tasks.filter(task => task.id !== taskId), { pushToHistory: true });
  }

  function handleAddTaskKeydown(event) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addTask();
  }

  // ── Reordering (drag the handle) ────────────────────────────────
  let draggingTaskId = null;
  let dragOverTaskId = null;
  let dragOverPos = null;

  function startDrag(e, taskId) {
    e.preventDefault();
    e.stopPropagation();
    ensureFocus();
    draggingTaskId = taskId;
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd);
  }

  function onDragMove(e) {
    if (!draggingTaskId) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const itemEl = el?.closest('.task-item');
    if (!itemEl) { dragOverTaskId = null; dragOverPos = null; return; }
    const overId = itemEl.dataset.taskId;
    if (!overId || overId === draggingTaskId) return;
    const rect = itemEl.getBoundingClientRect();
    dragOverPos = (e.clientY - rect.top) < rect.height / 2 ? 'before' : 'after';
    dragOverTaskId = overId;
  }

  function onDragEnd() {
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);
    if (draggingTaskId && dragOverTaskId && draggingTaskId !== dragOverTaskId) {
      reorderTask(draggingTaskId, dragOverTaskId, dragOverPos);
    }
    draggingTaskId = null;
    dragOverTaskId = null;
    dragOverPos = null;
  }

  function reorderTask(draggedId, targetId, pos) {
    const list = [...tasks];
    const fromIdx = list.findIndex(t => t.id === draggedId);
    if (fromIdx === -1) return;
    const [moved] = list.splice(fromIdx, 1);
    let toIdx = list.findIndex(t => t.id === targetId);
    if (toIdx === -1) {
      list.push(moved);
    } else {
      if (pos === 'after') toIdx++;
      list.splice(toIdx, 0, moved);
    }
    updateTasks(list);
  }

  // ── Inline edit (double-click a task to rewrite it) ─────────────
  let editingTaskId = null;
  let editText = '';

  function startEditTask(task) { editingTaskId = task.id; editText = task.text; }

  function commitEditTask() {
    if (!editingTaskId) return;
    const trimmed = editText.trim();
    if (trimmed) {
      updateTasks(tasks.map(t => t.id === editingTaskId ? { ...t, text: trimmed } : t));
    }
    editingTaskId = null; editText = '';
  }

  function cancelEditTask() { editingTaskId = null; editText = ''; }

  function handleEditKeydown(e) {
    // Enter belongs to the editor now that a task can run to several lines.
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commitEditTask(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancelEditTask(); }
  }


  $: title = initialTitle || 'Task List';

</script>

<style>
  .wrapper {
    /* scrollbars inside the block follow the block's own colors */
    --sb-track: var(--bg);
    --sb-thumb: var(--text);
    position: absolute;
    border: var(--block-border-width, 1px) solid var(--block-border-color, rgba(255, 255, 255, 0.2));
    border-radius: var(--block-border-radius, 12px);
    background: color-mix(in srgb, var(--block-surface, var(--bg)) var(--block-bg-opacity, 100%), transparent);
    text-shadow: var(--block-text-shadow, none);
    box-shadow: var(--block-shadow, 0 0 2px 1px var(--text), 0 0 6px 2px var(--text));
    color: var(--text);
    outline: 2px solid transparent;
    transition: box-shadow 0.15s ease, outline 0.15s ease, transform 0.2s ease;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    font-family: var(--block-body-font, inherit);
  }

  .wrapper.focused {
    outline: 2px solid var(--block-focus-outline, rgba(110, 168, 255, 0.85));
    box-shadow: var(--block-focus-shadow, 0 0 0 2px rgba(110, 168, 255, 0.35), 0 0 12px rgba(110, 168, 255, 0.5));
  }

  .header {
    background: color-mix(in srgb, var(--block-header-bg, var(--bg)) var(--block-header-opacity, 100%), transparent);
    height: 30px;
    padding: 4px 8px;
    cursor: move;
    touch-action: none;
    user-select: none;
    font-size: 0.8rem;
    color: var(--block-header-text, var(--text));
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    font-family: var(--block-header-font, var(--block-body-font, inherit));
    letter-spacing: var(--block-header-letter-spacing, 0.08em);
    text-transform: var(--block-header-transform, uppercase);
  }


  .header-controls {
    display: flex;
    gap: 6px;
    align-items: center;
  }


  button.delete-btn {
    background: var(--block-accent-color, var(--text));
    border-color: transparent;
    font-size: 1.1rem;
    color: var(--block-accent-text, var(--bg));
    cursor: pointer;
    padding: 0px 8px;
    border-radius: var(--block-control-radius, 6px);
    transition: transform 0.15s ease, filter 0.2s ease;
  }

  .content {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    height: 100%;
    box-sizing: border-box;
    color: var(--text);
  }

  .task-input {
    display: flex;
    gap: 6px;
  }

  .task-input input {
    flex: 1 1 auto;
    border: 1px solid var(--text);
    border-radius: 8px;
    background: transparent;
    color: var(--text);
    padding: 6px 8px;
  }

  .task-input input::placeholder{
    color: var(--text);
  }

  .task-input button {
    border: 1px solid var(--text);
    border-radius: 8px;
    background: transparent;
    color: var(--text);
    padding: 6px 10px;
    cursor: pointer;
  }

  .task-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow-y: auto;
  }

  /* Nothing in here repaints the block's own colour.
   *
   * A row, the new-task field and its button each filled themselves with
   * var(--bg) — the same colour the block is already painting behind them. At
   * full opacity that is invisible and harmless. Once a theme fades the block
   * background it is neither: the block goes translucent and the rows stay
   * solid, so a task list ends up a grid of opaque tiles floating on a
   * see-through card.
   *
   * They are part of the block's background, so they let it show through and
   * fade with it. Their shape comes from borders and spacing, not from a fill,
   * which is why removing it changes nothing at 100%.
   */
  .task-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 4px 6px;
    border-radius: 8px;
    background: transparent;
    border: 1px solid var(--text);
    box-sizing: border-box;
    transition: box-shadow 0.1s ease, opacity 0.1s ease;
  }

  .task-item.dragging { opacity: 0.4; }
  .task-item.drag-over-before { box-shadow: inset 0 2px 0 0 var(--text); }
  .task-item.drag-over-after { box-shadow: inset 0 -2px 0 0 var(--text); }

  .drag-handle {
    flex-shrink: 0;
    width: 18px;
    align-self: stretch;
    padding: 0;
    border: none;
    background: none;
    cursor: grab;
    touch-action: none;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text);
    opacity: 0.35;
  }
  .drag-handle:active { cursor: grabbing; opacity: 0.75; }

  .task-item label {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1 1 auto;
    min-width: 0;
    font-size: 0.85rem;
  }

  .task-editor {
    flex: 1;
    min-width: 0;
    border: 1px solid color-mix(in srgb, var(--text, #fff) 30%, transparent);
    /* A veil rather than a colour: 8% of the text colour over whatever the
       block is, instead of 8% mixed into an opaque copy of it. It looks the
       same at full opacity and fades with the block at any other. */
    background: color-mix(in srgb, var(--text, #fff) 8%, transparent);
    color: var(--text, inherit);
    border-radius: 6px;
    padding: 5px 7px;
  }
  .task-editor :global(img),
  .task-text :global(img) {
    max-width: 100%;
    height: auto;
    border-radius: 6px;
    vertical-align: middle;
  }
  .task-editor :global(p),
  .task-text :global(p) { margin: 0 0 0.35em; }
  .task-editor :global(p:last-child),
  .task-text :global(p:last-child) { margin-bottom: 0; }

  .task-text {
    flex: 1 1 auto;
    min-width: 0;
    word-break: break-word;
    white-space: normal;
    line-height: 1.4;
    cursor: text;
  }


  .circle-check {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .task-item button {
    border: none;
    background: transparent;
    color: var(--text);
    cursor: pointer;
  }

  .resize-handle {
    position: absolute;
    width: 30px;
    height: 30px;
    background: rgba(253, 253, 253, 0);
    right: 0;
    bottom: 0;
    cursor: se-resize;
    touch-action: none;
  }
</style>

<div
  class="wrapper"
  class:focused={focused}
  data-block-id={id}
  style="left: {position.x}px; top: {position.y}px; width: {size.width}px; height: {size.height}px; --bg: {bgColor}; --text: color-mix(in srgb, {textColor} var(--block-text-opacity, 100%), transparent);"
  role="button"
  tabindex="0"
  aria-pressed={focused}
  on:click={handleWrapperClick}
  on:keydown={handleWrapperKeydown}
>
  <div
    class="header"
    on:mousedown={onDragStart}
    on:pointerdown={onDragStart}
    on:touchstart={onDragStart}
    role="presentation"
  >
    <div class="header-title">{title || 'Task List'}</div>
    <div class="header-controls" on:mousedown|stopPropagation on:pointerdown|stopPropagation on:touchstart|stopPropagation role="presentation">
      <ColorField
        value={bgColor}
        title="Background Color"
        placement="side"
        on:input={(e) => { bgColor = e.detail; sendUpdate(['bgColor'], { pushToHistory: false }); }}
        on:change={(e) => { bgColor = e.detail; sendUpdate(['bgColor']); }}
      />
      <ColorField
        value={textColor}
        title="Text Color"
        placement="side"
        on:input={(e) => { textColor = e.detail; sendUpdate(['textColor'], { pushToHistory: false }); }}
        on:change={(e) => { textColor = e.detail; sendUpdate(['textColor']); }}
      />
      <button class="delete-btn" on:click|stopPropagation={deleteBlock}>×</button>
    </div>
  </div>

  <div class="content">
    <div class="task-input">
      <input
        type="text"
        bind:value={newTaskText}
        on:keydown={handleAddTaskKeydown}
        placeholder="add task"
        data-focus-guard
      />
      <button on:click={addTask} data-focus-guard>Add</button>
    </div>
    <ul class="task-list">
      {#each todoTasks() as task (task.id)}
        <li
          class="task-item"
          data-task-id={task.id}
          class:dragging={draggingTaskId === task.id}
          class:drag-over-before={dragOverTaskId === task.id && dragOverPos === 'before'}
          class:drag-over-after={dragOverTaskId === task.id && dragOverPos === 'after'}
        >
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <button
            class="drag-handle"
            data-focus-guard
            aria-label="Drag to reorder"
            on:pointerdown={(e) => startDrag(e, task.id)}
          >
            <svg viewBox="0 0 10 16" width="8" height="13" fill="currentColor">
              <circle cx="2" cy="2" r="1.3"/><circle cx="8" cy="2" r="1.3"/>
              <circle cx="2" cy="8" r="1.3"/><circle cx="8" cy="8" r="1.3"/>
              <circle cx="2" cy="14" r="1.3"/><circle cx="8" cy="14" r="1.3"/>
            </svg>
          </button>
          <label>
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <button
              class="circle-check"
              on:click|stopPropagation={() => toggleTask(task.id)}
              data-focus-guard
              aria-label={task.done ? 'Mark incomplete' : 'Mark complete'}
            >
              {#if task.done}
                <svg viewBox="0 0 20 20" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="10" cy="10" r="9" fill="var(--text)" stroke="var(--text)" stroke-width="1"/>
                  <path d="M5.5 10.5 L8.5 13.5 L14.5 7" stroke="var(--bg)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              {:else}
                <svg viewBox="0 0 20 20" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="10" cy="10" r="8.5" fill="transparent" stroke="var(--text)" stroke-width="1.5" stroke-opacity="0.6"/>
                </svg>
              {/if}
            </button>
            {#if editingTaskId === task.id}
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <div
                class="task-editor"
                data-focus-guard
                on:click|stopPropagation
                on:keydown|stopPropagation={handleEditKeydown}
              >
                <TipTapEditor
                  content={editText}
                  emit="html"
                  variant="inline"
                  placeholder="Write the task…"
                  on:change={(e) => (editText = e.detail)}
                  on:blur={commitEditTask}
                />
              </div>
            {:else}
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <span
                class="task-text"
                data-focus-guard
                title="Double-click to edit"
                on:dblclick|stopPropagation={() => startEditTask(task)}
                on:click|stopPropagation
              >{@html renderTaskText(task.text)}</span>
            {/if}
          </label>
          <button
            aria-label="Delete task"
            on:click={() => deleteTask(task.id)}
            data-focus-guard
          >
            ×
          </button>
        </li>
      {/each}
    </ul>
  </div>

  <div
    class="resize-handle"
    role="presentation"
    on:mousedown={onResizeStart}
    on:touchstart={onResizeStart}
  ></div>
</div>
