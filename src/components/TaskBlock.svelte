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

  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import TaskGoalLine from './TaskGoalLine.svelte';
  import TaskGoalEditor from './TaskGoalEditor.svelte';
  import { goalNow, startTimer, pauseTimer, addProgress, setGoal, removeGoal } from '../utils/taskGoals.js';
  import { startGoalClock } from '../utils/goalClock.js';
  import { readLastGoal, writeLastGoal } from '../utils/taskModeView.js';
  import { createListReorder } from '../utils/listReorder.js';
  import { moveToSlot } from '../utils/dropPlacement.js';
  import { portal } from '../utils/portal.js';
  import BlockShell from './BlockShell.svelte';

  export let id;
  export let initialPosition = { x: 100, y: 100 };
  export let initialSize = { width: 320, height: 260 };
  export let initialBgColor = '#000000';
  export let initialTextColor = '#ffffff';
  export let initialTasks = [];
  export let initialTitle = 'Task List';
  export let focused = false;
  export let canvasScale = 1;
  export let placement = 'canvas';

  const dispatch = createEventDispatcher();

  // The frame -- where it sits, its size, its colours, its header, dragging,
  // resizing, focus -- is BlockShell's, as for every block (moved onto it
  // 2026-11-04, so that a page can draw it without a frame: PENDING, "Page
  // mode"). What is left here is the list.
  let shell;
  let tasks = Array.isArray(initialTasks) ? [...initialTasks] : [];
  let title = initialTitle || 'Task List';
  let newTaskText = '';

  // Reactive, not a function: a template that calls a function only redraws
  // when the function itself changes, so the list drawn from it never saw a
  // task added, ticked or deleted. It used to get redrawn anyway, because every
  // change rebuilt the whole block; since a block's own changes stopped
  // rebuilding it (2026-10-05, utils/blockVersions.js), the list stayed as it
  // was until the folder was opened again -- reported 2026-10-26: "you add them
  // but you see the added tasks only after clicking at the folder again".
  $: todoTasks = tasks.filter(task => !task.done);

  function sendUpdate(changedKeys, { pushToHistory } = {}) {
    shell?.commit(changedKeys, pushToHistory === undefined ? {} : { pushToHistory }, { tasks, title });
  }

  function ensureFocus() {
    shell?.ensureFocus();
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

  // ── Reordering ──────────────────────────────────────────────────
  // The shared gestures (utils/listReorder.js), as in Task mode: the handle on
  // a computer, hold and slide on a phone, the line in the middle of the gap.
  // This block had a reordering of its own, a third copy; asked 2026-10-27
  // that a block can do everything its mode can (CLAUDE.md, "A block works on
  // its own"). Only the tasks still to do are drawn here, so a task moves
  // among those and the done ones keep their places (moveToSlot).
  let listEl;
  let draggingTaskId = null;
  let dropLine = null;

  const reorder = createListReorder({
    listOf: () => listEl,
    itemsIn: list => [...list.querySelectorAll(':scope > .task-item')],
    idOf: element => element.dataset.taskId,
    onPick: taskId => { draggingTaskId = taskId; if (taskId) ensureFocus(); },
    // Measured on screen, drawn inside the Canvas's zoom: back to the block's
    // own pixels, and past however far the list has been scrolled.
    onLine: line => {
      const scale = Number(canvasScale) > 0 ? Number(canvasScale) : 1;
      dropLine = line ? { y: line.y / scale + (listEl?.scrollTop || 0) } : null;
    },
    onDrop: (taskId, groupIds, slot) => {
      const group = groupIds.map(gid => tasks.find(t => t.id === gid)).filter(Boolean);
      const next = moveToSlot(tasks, taskId, group, slot);
      if (next !== tasks) updateTasks(next);
    },
    onHeld: (taskId, point) => openGoalMenu(taskId, point.x, point.y)
  });

  // ── Objectives ──────────────────────────────────────────────────
  // Time and amounts, as in Task mode -- the same goal, line, editor and ring
  // -- so the block does not need the mode for them. Asked 2026-10-27: "a
  // block ... should be able to work even if the mode isn't there". The menu
  // is a right-click on a computer, a hold let go on a phone.
  let now = Date.now();
  $: anyRunning = tasks.some(t => t?.goal?.runningSince);

  function changeTask(taskId, change) {
    const at = Date.now();
    updateTasks(tasks.map(t => (t.id === taskId ? change(t, at) : t)));
  }
  const toggleTimer = task =>
    changeTask(task.id, (t, at) => (goalNow(t.goal, at)?.running ? pauseTimer(t, at) : startTimer(t, at)));
  const countOnce = task => changeTask(task.id, (t, at) => addProgress(t, 1, at));
  const uncountOnce = task => changeTask(task.id, (t, at) => addProgress(t, -1, at));
  const logGoal = (task, amount) => changeTask(task.id, (t, at) => addProgress(t, amount, at));

  // The clock moves the bars; settling is App.svelte's 15s pass over every
  // task block, so nothing is settled twice from here.
  let stopClock = () => {};
  onMount(() => { stopClock = startGoalClock({ isRunning: () => anyRunning, onTick: at => { now = at; } }); });
  onDestroy(() => { stopClock(); reorder.destroy(); });

  const deviceStorage = () => (typeof localStorage === 'undefined' ? undefined : localStorage);
  let goalMenu = null;
  $: goalMenuTask = goalMenu ? tasks.find(t => t.id === goalMenu.taskId) : null;

  function openGoalMenu(taskId, x, y) {
    goalMenu = { taskId, x, y, last: readLastGoal(deviceStorage()) };
  }

  function taskContextMenu(event, taskId) {
    event.preventDefault();
    event.stopPropagation();
    if (reorder.draggingId) return;
    openGoalMenu(taskId, event.clientX, event.clientY);
  }

  function saveGoal(detail) {
    const taskId = goalMenu?.taskId;
    goalMenu = null;
    writeLastGoal(deviceStorage(), detail);
    if (taskId) changeTask(taskId, (t, at) => setGoal(t, detail, at));
  }

  function dropGoal() {
    const taskId = goalMenu?.taskId;
    goalMenu = null;
    if (taskId) changeTask(taskId, t => removeGoal(t));
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
    /* The drop line is placed from the top of the list. */
    position: relative;
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
    /* So an objective's line can take a row of its own under the task. */
    flex-wrap: wrap;
  }

  .task-item.dragging { opacity: 0.4; }

  /* The drop line takes the block's writing colour (app.css draws it in
     currentColor). */
  .task-list :global(.drop-line) { color: var(--text); }

  /* An objective: Task mode's line, across the row under the task. */
  .task-goal {
    flex-basis: 100%;
    min-width: 0;
  }

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

</style>

<BlockShell
  bind:this={shell}
  {id}
  {initialPosition}
  {initialSize}
  {initialBgColor}
  {initialTextColor}
  {focused}
  {canvasScale}
  {placement}
  label={title || 'Task List'}
  minWidth={220}
  minHeight={200}
  fields={{ tasks, title }}
  on:update
  on:delete
  on:focusToggle
>
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
    <ul class="task-list" bind:this={listEl}>
      {#if dropLine}
        <li class="drop-line" aria-hidden="true" style="top: {dropLine.y}px"></li>
      {/if}
      {#each todoTasks as task (task.id)}
        <li
          class="task-item"
          data-task-id={task.id}
          class:dragging={draggingTaskId === task.id}
          on:pointerdown={(e) => reorder.itemDown(e, task.id)}
          on:contextmenu={(e) => taskContextMenu(e, task.id)}
        >
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <button
            class="drag-handle"
            data-focus-guard
            aria-label="Drag to reorder"
            on:pointerdown={(e) => { e.stopPropagation(); ensureFocus(); reorder.handleDown(e, task.id); }}
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
          {#if task.goal}
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div class="task-goal" data-focus-guard on:pointerdown|stopPropagation>
              <TaskGoalLine
                goal={task.goal}
                {now}
                on:timer={() => toggleTimer(task)}
                on:count={() => countOnce(task)}
                on:uncount={() => uncountOnce(task)}
                on:log={(e) => logGoal(task, e.detail)}
              />
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  </div>

  {#if goalMenu && goalMenuTask}
    <!-- Out to the app's root: inside the Canvas's zoom a fixed pop-up is drawn
         scaled and in the wrong place (utils/portal.js). -->
    <div use:portal>
      <TaskGoalEditor
        x={goalMenu.x}
        y={goalMenu.y}
        goal={goalMenuTask.goal || null}
        taskLabel={goalMenuTask.text?.replace(/<[^>]*>/g, '').slice(0, 60) || ''}
        last={goalMenu.last}
        on:save={(e) => saveGoal(e.detail)}
        on:remove={dropGoal}
        on:close={() => (goalMenu = null)}
      />
    </div>
  {/if}

</BlockShell>
