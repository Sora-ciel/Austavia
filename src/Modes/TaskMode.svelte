<script>
  import { modeTextColor as modeTextColorFor } from '../utils/modeSurface.js';
  import ModeWallpaper from '../components/ModeWallpaper.svelte';
  // The folder's wallpaper -- Canvas's picture and settings; see hasWallpaper
  // in modeRegistry.js.
  export let backgroundSettings = {};
  import { createEventDispatcher, onMount, onDestroy, tick } from 'svelte';
  import ColorField from '../components/ColorField.svelte';
  import BlockContextMenu from '../components/BlockContextMenu.svelte';
  import MarkdownIt from 'markdown-it';
  import { sanitizeRichText, looksLikeHtml } from '../utils/sanitizeRichText.js';
  import TipTapEditor from '../components/TipTapEditor.svelte';
  // Open or closed, remembered on this device -- see the file.
  import { readDoneExpanded, writeDoneExpanded, readLastGoal, writeLastGoal, tabPress } from '../utils/taskModeView.js';
  import { drawnSurface } from '../utils/modeSurface.js';
  // Where a dragged task lands, and where its line goes -- see the file.
  import { moveToSlot } from '../utils/dropPlacement.js';
  import { createListReorder } from '../utils/listReorder.js';
  import { startGoalClock } from '../utils/goalClock.js';
  // Objective tasks -- a goal of time or of times; see utils/taskGoals.js.
  import TaskGoalLine from '../components/TaskGoalLine.svelte';
  import TaskGoalEditor from '../components/TaskGoalEditor.svelte';
  import { settleTask, startTimer, pauseTimer, addProgress, setGoal, removeGoal, goalNow } from '../utils/taskGoals.js';

  // Same renderer tiptap-markdown uses, so a task reads the way the same
  // markdown would anywhere else in the app. html:false leaves raw tags
  // escaped — task text arrives from sync, so it isn't trusted markup.
  // breaks:true so a task written across several lines still reads as several
  // lines once it's no longer being edited, rather than collapsing into one.
  const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

  // Tasks are saved as editor HTML so an image can keep the width it was
  // dragged to — markdown has no way to express that. Text written before this
  // is still markdown, so it keeps going through the markdown renderer.
  // Either way the result is sanitised: it arrives through sync.
  function renderTaskText(text) {
    const value = String(text ?? '');
    return sanitizeRichText(looksLikeHtml(value) ? value : md.render(value));
  }

  // A task is a plain text field, so a pasted image was dropped on the floor.
  // Turn it into the markdown the renderer above already understands. The
  // data: URL is swapped for a Storage link on the next sync, same as any
  // other attachment, so it doesn't sit in the database as base64.
  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function imageMarkdownFromPaste(event) {
    const items = [...(event.clipboardData?.files || [])];
    const image = items.find(file => file.type.startsWith('image/'));
    if (!image) return null;
    return `![](${await fileToDataUrl(image)})`;
  }

  function insertAtCaret(input, current, snippet) {
    const start = input?.selectionStart ?? current.length;
    const end = input?.selectionEnd ?? current.length;
    return `${current.slice(0, start)}${snippet}${current.slice(end)}`;
  }

  async function handleNewTaskPaste(event) {
    const snippet = await imageMarkdownFromPaste(event);
    if (!snippet) return;
    event.preventDefault();
    newTaskText = insertAtCaret(event.target, newTaskText, snippet);
  }


  export let blocks = [];
  export let focusedBlockId = null;
  export let canvasColors = {};
  export let canvasRef;
  export let addDirection = 'above';

  const dispatch = createEventDispatcher();

  // ── Keep the layout above the mobile keyboard ─────────────────────
  // Bind the mode height to the *visual* viewport. When the on-screen keyboard
  // opens it shrinks visualViewport.height, so the whole task mode shrinks with
  // it and the add-task bar stays pinned just above the keyboard instead of
  // being scrollable underneath it.
  let viewportH = null;
  function updateViewportH() {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    viewportH = vv ? Math.round(vv.height) : null;
  }
  $: viewportVar = viewportH ? `--tm-h: ${viewportH}px;` : '';

  onMount(() => {
    updateViewportH();
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', updateViewportH);
      vv.addEventListener('scroll', updateViewportH);
    }
  });
  onDestroy(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (vv) {
      vv.removeEventListener('resize', updateViewportH);
      vv.removeEventListener('scroll', updateViewportH);
    }
    reorder.destroy();
  });

  const defaultCanvasColors = { outerBg: '#000000', innerBg: '#000000' };
  $: canvasTheme = { ...defaultCanvasColors, ...(canvasColors || {}) };
  $: modeTextColor = modeTextColorFor(canvasTheme);
  $: canvasCssVars = `--canvas-outer-bg: ${canvasTheme.outerBg}; --canvas-inner-bg: ${canvasTheme.innerBg}; --mode-text-color: ${modeTextColor};`;

  $: taskBlocks = blocks.filter(b => b.type === 'task');
  let selectedTaskId = null;
  $: if (!selectedTaskId && taskBlocks.length) selectedTaskId = taskBlocks[0].id;
  $: if (!taskBlocks.length) selectedTaskId = null;
  $: if (selectedTaskId && !taskBlocks.some(b => b.id === selectedTaskId))
    selectedTaskId = taskBlocks[0]?.id ?? null;

  $: taskBlock = taskBlocks.find(b => b.id === selectedTaskId) || null;
  $: tasks = Array.isArray(taskBlock?.tasks) ? taskBlock.tasks : [];
  $: todoTasks = tasks.filter(t => !t.done);
  $: doneTasks = tasks.filter(t => t.done);

  // The selected list's own colors (same bgColor/textColor every other
  // block type carries) — layered in as --bg/--text so the section/item
  // backgrounds and text pick them up wherever the CSS below opts in,
  // falling back to the mode's usual theme when nothing's been set.
  // Only declare the variables the list actually sets. Emitting a black/white
  // fallback here would win over the theme, which is why an untouched list used
  // to ignore it entirely; leaving the variable undefined lets the CSS fall
  // through to --canvas-inner-bg / --mode-text-color instead.
  // The mode's own surface fades toward the theme's mode background as the
  // theme's dial goes down, never toward see-through -- the rule Single Note
  // and Playlist share (utils/modeSurface.js). The cards on it fade toward
  // see-through, like blocks on the canvas; see the styles.
  $: taskSurfaceVar = `--mode-surface: ${drawnSurface(taskBlock?.bgColor || canvasTheme.innerBg, canvasTheme.innerBg)};` +
    ` --mode-surface-text: ${taskBlock?.textColor || modeTextColor};`;

  $: taskColorVars = [
    taskBlock?.bgColor ? `--bg: ${taskBlock.bgColor};` : '',
    taskBlock?.textColor ? `--text: ${taskBlock.textColor};` : ''
  ].join(' ');

  function setTaskColor(field, value) {
    if (!selectedTaskId) return;
    updateBlock(selectedTaskId, { [field]: value }, { changedKeys: [field], pushToHistory: false });
  }

  function commitTaskColor(field, value) {
    if (!selectedTaskId) return;
    updateBlock(selectedTaskId, { [field]: value }, { changedKeys: [field], pushToHistory: true });
  }

  let newTaskText = '';
  let doneExpanded = readDoneExpanded(typeof localStorage === 'undefined' ? undefined : localStorage);

  function toggleDoneExpanded() {
    doneExpanded = !doneExpanded;
    writeDoneExpanded(typeof localStorage === 'undefined' ? undefined : localStorage, doneExpanded);
  }

  function updateBlock(id, updates, opts = {}) {
    if (!id) return;
    const detail = { id, ...updates };
    const keys = Array.isArray(opts.changedKeys) && opts.changedKeys.length
      ? opts.changedKeys : Object.keys(updates || {});
    if (keys.length) detail.changedKeys = keys;
    if (opts.pushToHistory !== undefined) detail.pushToHistory = opts.pushToHistory;
    dispatch('update', detail);
  }

  function updateTasks(next, opts = {}) {
    if (!selectedTaskId) return;
    updateBlock(selectedTaskId, { tasks: next }, { pushToHistory: true, changedKeys: ['tasks'], ...opts });
  }

  function addTask() {
    if (!selectedTaskId) return;
    const trimmed = newTaskText.trim();
    if (!trimmed) return;
    const item = { id: crypto.randomUUID(), text: trimmed, done: false };
    newTaskText = '';
    const next = addDirection === 'above' ? [item, ...tasks] : [...tasks, item];
    updateTasks(next);
  }

  function toggleDirection() {
    dispatch('modeSettingChange', { taskAddDirection: addDirection === 'above' ? 'below' : 'above' });
  }

  function toggleTask(taskId) {
    updateTasks(tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t));
  }

  function deleteTask(taskId) {
    updateTasks(tasks.filter(t => t.id !== taskId));
  }

  // ── Objective tasks ──────────────────────────────────────────────
  // The clock every bar reads. It only moves while a timer is running, so a
  // list with none costs nothing.
  let now = Date.now();
  $: anyRunning = tasks.some(t => t?.goal?.runningSince);

  // The pass that makes the stored state true: a daily objective on a new day
  // starts again, a timer that reached its goal stops and is done. Absolute,
  // from the tasks themselves (settleTask), so running it on open, every 30s
  // and twice is all the same -- CLAUDE.md's rule for anything kept by events.
  // Every list in the folder, not only the one on screen. Not an undo step:
  // nobody did it.
  function settleAll() {
    const at = Date.now();
    for (const block of taskBlocks) {
      const list = Array.isArray(block.tasks) ? block.tasks : [];
      let changed = false;
      const next = list.map(task => {
        const settled = settleTask(task, at);
        if (settled !== task) changed = true;
        return settled;
      });
      if (changed) updateBlock(block.id, { tasks: next }, { changedKeys: ['tasks'], pushToHistory: false });
    }
  }

  // The tick and the pass are the shared ones (utils/goalClock.js), which the
  // habit tracker uses too.
  onMount(() => startGoalClock({
    isRunning: () => anyRunning,
    onTick: at => {
      now = at;
      if (tasks.some(t => t?.goal?.runningSince && goalNow(t.goal, now)?.reached)) settleAll();
    },
    onSettle: settleAll
  }));

  function changeTask(taskId, change) {
    const at = Date.now();
    now = at;
    updateTasks(tasks.map(t => (t.id === taskId ? change(t, at) : t)));
  }

  const toggleTimer = task =>
    changeTask(task.id, (t, at) => (goalNow(t.goal, at)?.running ? pauseTimer(t, at) : startTimer(t, at)));
  const countOnce = task => changeTask(task.id, (t, at) => addProgress(t, 1, at));
  const uncountOnce = task => changeTask(task.id, (t, at) => addProgress(t, -1, at));
  const deviceStorage = () => (typeof localStorage === 'undefined' ? undefined : localStorage);
  const logGoal = (task, amount) => changeTask(task.id, (t, at) => addProgress(t, amount, at));

  // The task's own menu: right-click on a computer, hold and let go on a phone.
  let goalMenu = null;
  $: goalMenuTask = goalMenu ? tasks.find(t => t.id === goalMenu.taskId) : null;

  function openGoalMenu(taskId, x, y) {
    closeCtxMenu();
    goalMenu = { taskId, x, y, last: readLastGoal(deviceStorage()) };
  }

  function saveGoal(detail) {
    const id = goalMenu?.taskId;
    goalMenu = null;
    writeLastGoal(deviceStorage(), detail);
    if (id) changeTask(id, (t, at) => setGoal(t, detail, at));
  }

  function dropGoal() {
    const id = goalMenu?.taskId;
    goalMenu = null;
    if (id) changeTask(id, t => removeGoal(t));
  }

  function handleKeydown(e) {
    if (e.key === 'Enter') { e.preventDefault(); addTask(); }
  }

  // The open list's tab, pressed again, becomes its name to type into
  // (tabPress in taskModeView.js); Enter or leaving it keeps the name, Escape
  // puts the old one back.
  let renamingId = null;
  let renameInput;

  async function pressTab(id) {
    if (tabPress({ pressedId: id, selectedId: selectedTaskId }) === 'rename') {
      renamingId = id;
      await tick();
      renameInput?.focus();
      renameInput?.select();
      return;
    }
    selectTaskList(id);
  }

  function finishRename(event, keep = true) {
    if (!renamingId) return;
    const id = renamingId;
    renamingId = null;
    const block = taskBlocks.find(b => b.id === id);
    const value = event.target.value.trim();
    if (keep && block && value !== (block.title || '')) {
      updateBlock(id, { title: value }, { changedKeys: ['title'], pushToHistory: true });
    }
  }

  function renameKeydown(event) {
    if (event.key === 'Enter') { event.preventDefault(); finishRename(event); }
    else if (event.key === 'Escape') { event.preventDefault(); finishRename(event, false); }
  }

  function selectTaskList(id) {
    selectedTaskId = id;
    if (focusedBlockId !== id) dispatch('focusToggle', { id });
  }

  function deleteTaskList() {
    if (!selectedTaskId) return;
    dispatch('delete', { id: selectedTaskId });
  }

  function getTabLabel(block, i) {
    const t = (block?.title || '').trim();
    if (t) return t.length > 20 ? `${t.slice(0, 20)}…` : t;
    return `List ${i + 1}`;
  }

  // ── Reordering ────────────────────────────────────────────────────
  // The gestures -- the handle on a computer, press-and-hold on a phone, a
  // hold let go without moving opening the task's menu -- are the shared ones
  // in utils/listReorder.js, which the habit tracker uses too. Asked
  // 2026-10-26: decide above/below by the middle of a task, and show one thick
  // line in the text's colour right in the middle of the gap it will land in
  // (dropPlacement.js). Each list is its own: a task moves among its own kind.
  let draggingTaskId = null;
  let dropLine = null;

  const reorder = createListReorder({
    listOf: id => document.querySelector(`.task-item[data-task-id="${CSS.escape(id)}"]`)?.closest('.task-list'),
    itemsIn: list => [...list.querySelectorAll(':scope > .task-item')],
    idOf: element => element.dataset.taskId,
    onPick: id => { draggingTaskId = id; },
    onLine: line => {
      const dragged = line && tasks.find(t => t.id === line.id);
      dropLine = line ? { done: dragged?.done === true, y: line.y } : null;
    },
    onDrop: (id, groupIds, slot) => {
      const group = groupIds.map(gid => tasks.find(t => t.id === gid)).filter(Boolean);
      const next = moveToSlot(tasks, id, group, slot);
      if (next !== tasks) updateTasks(next);
    },
    onHeld: (id, point) => openGoalMenu(id, point.x, point.y)
  });


  // ── Inline edit ──────────────────────────────────────────────────
  let editingTaskId = null;
  let editText = '';

  // Asked 2026-10-26: the double-click that opens a task for editing should
  // also put the caret where it landed, and clicking anywhere outside should
  // end the editing. The editor used to open with no focus, which is both:
  // a second click to type, and an editor that could not lose a focus it never
  // had. So it is focused at the click (focusAt), and a press outside the task
  // being edited ends it directly, not via a blur that WebKit may not send.
  let taskEditorRef = null;

  async function startEditTask(task, event) {
    editingTaskId = task.id;
    editText = task.text;
    const x = event?.clientX;
    const y = event?.clientY;
    await tick();
    taskEditorRef?.focusAt(x, y);
  }

  function endEditOnOutsidePress(event) {
    if (!editingTaskId) return;
    if (event.target?.closest?.('.task-editor')) return;
    commitEditTask();
  }

  onMount(() => {
    window.addEventListener('pointerdown', endEditOnOutsidePress, true);
    return () => window.removeEventListener('pointerdown', endEditOnOutsidePress, true);
  });

  function commitEditTask() {
    if (!editingTaskId) return;
    const trimmed = editText.trim();
    if (trimmed) updateTasks(tasks.map(t => t.id === editingTaskId ? { ...t, text: trimmed } : t));
    editingTaskId = null; editText = '';
  }

  function cancelEditTask() { editingTaskId = null; editText = ''; }

  function handleEditKeydown(e) {
    // Enter belongs to the editor now that a task can be several lines.
    // Ctrl/Cmd+Enter commits, Escape cancels, and clicking away commits.
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commitEditTask(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancelEditTask(); }
  }


  // ── Right-click context menu (color edit + copy as markdown) ──────────
  let ctxMenu = { open: false, x: 0, y: 0 };

  function handleContextMenu(e) {
    if (!taskBlock) return;
    e.preventDefault();
    // A hold on a phone also fires this; the hold has its own path (endDrag).
    if (draggingTaskId) return;
    const item = e.target?.closest?.('.task-item');
    if (item?.dataset?.taskId) {
      openGoalMenu(item.dataset.taskId, e.clientX, e.clientY);
      return;
    }
    ctxMenu = { open: true, x: e.clientX, y: e.clientY };
  }

  function closeCtxMenu() { ctxMenu = { open: false, x: 0, y: 0 }; }

  function handleCtxColor(detail) {
    if (detail.bgColor !== undefined) {
      if (detail.commit) commitTaskColor('bgColor', detail.bgColor);
      else setTaskColor('bgColor', detail.bgColor);
    }
    if (detail.textColor !== undefined) {
      if (detail.commit) commitTaskColor('textColor', detail.textColor);
      else setTaskColor('textColor', detail.textColor);
    }
  }

  // Serialize the list to plain markdown — unchecked and checked tasks as
  // GitHub-style task items so it drops straight into any markdown editor.
  function tasksToMarkdown(block) {
    const title = (block?.title || 'Task List').trim();
    const list = Array.isArray(block?.tasks) ? block.tasks : [];
    const lines = [`# ${title}`, ''];
    for (const t of list) lines.push(`- [${t.done ? 'x' : ' '}] ${t.text}`);
    return lines.join('\n');
  }

  async function handleCtxAction(id) {
    if (id === 'copyMd' && taskBlock) {
      const md = tasksToMarkdown(taskBlock);
      try { await navigator.clipboard.writeText(md); } catch {}
    }
  }
</script>

<style>
  .task-mode {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: calc(var(--tm-h, 100dvh) - var(--controls-height, 56px));
    background: var(--mode-surface, var(--bg, var(--canvas-inner-bg, #000)));
    color: var(--text, var(--mode-text-color, #fff));
    box-sizing: border-box;
    font-family: var(--block-body-font, inherit);
  }

  /* ── Header ─────────────────────────────────────────────────────── */
  /* One line, asked 2026-10-25: "the two lines above turn into one line and
     use less height than one line". The list tabs on the left, the open
     list's name, colours and Delete on the rest of the row. */
  .task-header {
    flex-shrink: 0;
    padding: 3px 4px 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .task-tabs-row {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }
  .task-tabs-row::-webkit-scrollbar { display: none; }

  .task-tab {
    flex-shrink: 0;
    border: var(--block-border-width, 1px) solid color-mix(in srgb, var(--text, var(--mode-text-color, #fff)) 30%, transparent);
    background: var(--bg, transparent);
    color: var(--text, var(--mode-text-color, inherit));
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 0.72rem;
    cursor: pointer;
    white-space: nowrap;
    font-family: var(--block-header-font, inherit);
    letter-spacing: var(--block-header-letter-spacing, 0.04em);
    text-transform: var(--block-header-transform, uppercase);
    opacity: 0.55;
    transition: opacity 0.15s, border-color 0.15s, box-shadow 0.15s;
  }
  .task-tab:hover { opacity: 0.8; }
  .task-tab[aria-selected='true'] {
    opacity: 1;
    border-color: color-mix(in srgb, var(--text, var(--mode-text-color, #fff)) 80%, transparent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--text, var(--mode-text-color, #fff)) 35%, transparent);
  }

  .new-list-btn {
    flex-shrink: 0;
    border: var(--block-border-width, 1px) solid color-mix(in srgb, var(--text, var(--mode-text-color, #fff)) 25%, transparent);
    background: transparent;
    color: var(--text, var(--mode-text-color, inherit));
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 0.72rem;
    cursor: pointer;
    opacity: 0.65;
    transition: opacity 0.15s;
  }
  .new-list-btn:hover { opacity: 1; }

  .task-title-row {
    flex: 0 0 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  /* The open list's tab while its name is typed: the same pill, as wide as a
     name usually is, without the capitals so what is typed reads as typed. */
  .task-tab-rename {
    opacity: 1;
    width: 11em;
    cursor: text;
    text-transform: none;
    outline: none;
    border-color: color-mix(in srgb, var(--text, var(--mode-text-color, #fff)) 80%, transparent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--text, var(--mode-text-color, #fff)) 35%, transparent);
  }

  .delete-list-btn {
    flex-shrink: 0;
    border: var(--block-border-width, 1px) solid rgba(255,80,80,.45);
    background: transparent;
    color: rgba(255,110,110,.85);
    padding: 2px 8px;
    border-radius: 8px;
    font-size: 0.74rem;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s;
  }
  .delete-list-btn:hover { background: rgba(255,80,80,.12); }

  /* ── Body (scrollable) ──────────────────────────────────────────── */
  .task-body {
    flex: 1 1 auto;
    overflow-y: auto;
    padding: 3px 3px 2px;
    color: var(--text, var(--mode-text-color, inherit));
    --sb-track: transparent;
    --sb-thumb: var(--text, var(--mode-text-color, rgba(255,255,255,.18)));
    scrollbar-width: thin;
    scrollbar-color: var(--sb-thumb, rgba(255,255,255,.18)) transparent;
  }
  .task-body::-webkit-scrollbar { width: 5px; }
  .task-body::-webkit-scrollbar-thumb {
    background: var(--sb-thumb, rgba(255,255,255,.18));
    border-radius: 99px;
  }

  .task-columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
  }

  .task-section {
    border-radius: 14px;
    border: var(--block-border-width, 1px) solid color-mix(in srgb, var(--text, var(--mode-text-color, #fff)) 13%, transparent);
    /* See-through, always: asked 2026-10-26, "normally the background should
       be see-through like other modes, like Single Note". The mode's own
       surface (and its wallpaper) is the background, as Single Note's writing
       sits straight on its page; the card is only its outline. (On 2026-10-25
       it took the theme's dial, which left it solid on every solid theme.) */
    background: transparent;
    padding: 4px 4px 3px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-shadow: none;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    margin-bottom: 2px;
  }

  .section-title {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-family: var(--block-header-font, inherit);
    color: var(--text, var(--mode-text-color, inherit));
    opacity: 0.7;
  }

  .section-count {
    font-size: 0.72rem;
    padding: 2px 7px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--text, var(--mode-text-color, #fff)) 12%, transparent);
    color: var(--text, var(--mode-text-color, inherit));
    opacity: 0.75;
    font-variant-numeric: tabular-nums;
  }

  .section-toggle {
    border: none;
    background: none;
    color: var(--text, var(--mode-text-color, inherit));
    cursor: pointer;
    font-size: 0.8rem;
    padding: 2px 5px;
    opacity: 0.5;
    border-radius: 4px;
    line-height: 1;
  }
  .section-toggle:hover { opacity: 0.9; }

  /* ── Task list ──────────────────────────────────────────────────── */
  .task-list {
    /* The drop line is placed within the list. */
    position: relative;
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .task-item {
    display: flex;
    align-items: flex-start;
    gap: 2px;
    padding: 4px 6px 4px 2px;
    border-radius: 9px;
    background: color-mix(in srgb, var(--text, var(--mode-text-color, #fff)) 6%, transparent);
    border: var(--block-border-width, 1px) solid color-mix(in srgb, var(--text, var(--mode-text-color, #fff)) 10%, transparent);
    min-height: 44px;
    box-sizing: border-box;
    transition: box-shadow 0.1s, opacity 0.1s;
  }
  .task-item.dragging { opacity: 0.35; }
  /* Where a dragged task will land: one thick line in the text's colour, in
     the middle of the gap (dropPlacement.js says where). */

  /* Lined up with the round check beside it (asked 2026-10-26): the same 36px
     box and the same 4px from the top as .task-row gives the check, so their
     middles are one line. */
  .drag-handle {
    height: 36px;
    margin-top: 4px;
    align-self: flex-start;
    color: var(--text, var(--mode-text-color, inherit));
  }

  .task-row {
    display: flex;
    align-items: flex-start;
    gap: 4px;
    flex: 1 1 auto;
    min-width: 0;
    padding-top: 4px;
  }

  .circle-check {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .task-text :global(p) { margin: 0 0 0.35em; }
  .task-text :global(p:last-child) { margin-bottom: 0; }
  .task-text :global(img) {
    max-width: 100%;
    height: auto;
    border-radius: 6px;
    vertical-align: middle;
  }

  /* The task's writing, and its objective line under it when it has one. */
  .task-main {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .task-text {
    flex: 1 1 auto;
    min-width: 0;
    cursor: text;
    word-break: break-word;
    white-space: normal;
    line-height: 1.45;
    padding: 3px 1px 2px;
    font-size: 1.03rem;
  }

  /* Markdown rendered inside a task */
  .task-text :global(img) {
    max-width: 100%;
    max-height: 220px;
    height: auto;
    border-radius: 6px;
    display: block;
    margin: 4px 0;
  }
  .task-text :global(code) {
    font-family: monospace;
    font-size: 0.86em;
    padding: 1px 4px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--text, var(--mode-text-color, #ffffff)) 14%, transparent);
  }
  .task-text :global(a) {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  /* No weight here on purpose. This said 700, which made a task's bold a step
     weaker than a note's for no reason anybody chose, and saying 800 instead
     would only be the same mistake with today's number in it. `strong` is
     given its weight once, in app.css, and a task takes it like everything
     else does. */
  .task-text :global(em) { font-style: italic; }
  .task-text :global(s) { opacity: 0.7; }

  .task-text.done-text {
    opacity: 0.5;
    text-decoration: line-through;
  }

  /* The editor fills the row and grows with its content, so a five-line task
     still shows five lines while you're writing in it. */
  .task-editor {
    flex: 1;
    min-width: 0;
    border: var(--block-border-width, 1px) solid color-mix(in srgb, var(--text, var(--mode-text-color, #fff)) 30%, transparent);
    background: color-mix(in srgb, var(--text, var(--mode-text-color, #fff)) 8%, transparent);
    color: var(--text, var(--mode-text-color, inherit));
    border-radius: var(--block-control-radius, 6px);
    padding: 6px 8px;
  }
  .task-editor :global(img) {
    max-width: 100%;
    height: auto;
    border-radius: 6px;
  }
  .task-editor :global(p) { margin: 0 0 0.35em; }
  .task-editor :global(p:last-child) { margin-bottom: 0; }


  .delete-task-btn {
    flex-shrink: 0;
    border: none;
    background: transparent;
    color: var(--text, var(--mode-text-color, inherit));
    cursor: pointer;
    font-size: 1rem;
    width: 32px;
    min-height: 44px;
    opacity: 0.45;
    transition: opacity 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .delete-task-btn:hover { opacity: 0.9; }

  .task-empty {
    padding: 18px 4px;
    opacity: 0.45;
    font-size: 0.85rem;
    font-style: italic;
  }

  /* ── Add bar (always visible at bottom) ─────────────────────────── */
  .task-add-bar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 4px 4px;
    border-top: 1px solid color-mix(in srgb, var(--text, var(--mode-text-color, #fff)) 10%, transparent);
    background: transparent;
  }

  .add-input {
    flex: 1 1 auto;
    min-width: 0;
    padding: 9px 12px;
    border-radius: 10px;
    border: var(--block-border-width, 1px) solid color-mix(in srgb, var(--text, var(--mode-text-color, #fff)) 25%, transparent);
    background: color-mix(in srgb, var(--text, var(--mode-text-color, #fff)) 8%, transparent);
    color: var(--text, var(--mode-text-color, inherit));
    font-family: var(--block-body-font, inherit);
    font-size: 1rem;
  }
  .add-input::placeholder { color: var(--text, var(--mode-text-color, inherit)); opacity: 0.45; }

  .add-dir-btn {
    flex-shrink: 0;
    width: 38px;
    height: 38px;
    border-radius: 10px;
    border: var(--block-border-width, 1px) solid color-mix(in srgb, var(--text, var(--mode-text-color, #fff)) 25%, transparent);
    background: color-mix(in srgb, var(--text, var(--mode-text-color, #fff)) 8%, transparent);
    color: var(--text, var(--mode-text-color, inherit));
    cursor: pointer;
    font-size: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.75;
  }
  .add-dir-btn:hover { opacity: 1; }

  .add-btn {
    flex-shrink: 0;
    width: 38px;
    height: 38px;
    border-radius: 10px;
    border: var(--block-border-width, 1px) solid color-mix(in srgb, var(--text, var(--mode-text-color, #fff)) 30%, transparent);
    background: color-mix(in srgb, var(--text, var(--mode-text-color, #fff)) 14%, transparent);
    color: var(--text, var(--mode-text-color, inherit));
    cursor: pointer;
    font-size: 1.2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
  }
  .add-btn:hover { background: color-mix(in srgb, var(--text, var(--mode-text-color, #fff)) 24%, transparent); }

  .no-list-placeholder {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    opacity: 0.6;
    font-size: 1.07rem;
    padding: 32px;
    text-align: center;
  }

  /* ── Responsive ─────────────────────────────────────────────────── */
  @media (max-width: 600px) {
    .task-columns { grid-template-columns: 1fr; }
    .task-header { padding: 4px 3px 0; }
    .task-body { padding: 3px 3px 2px; }
    .task-add-bar { padding: 3px 3px 4px; }
    .task-tab { padding: 8px 14px; font-size: 0.85rem; }
    .task-text { font-size: 1.03rem; }
    .drag-handle { display: none; }

    /* Reorder by press-and-hold + slide (no handle on mobile). Allow vertical
       scrolling normally; the drag itself blocks scroll via a touchmove guard.
       Suppress the long-press text/callout selection so the hold feels clean. */
    .task-item {
      touch-action: pan-y;
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      user-select: none;
    }
    .task-item.dragging {
      opacity: 0.92;
      transform: scale(1.03);
      box-shadow: 0 8px 22px rgba(0, 0, 0, 0.4);
      position: relative;
      z-index: 2;
    }
  }

  /* Above the wallpaper, which sits at z-index 0 between this mode's own
     background and its content -- see ModeWallpaper.svelte. */
  .task-mode > :not(.mode-wallpaper) {
    position: relative;
    z-index: 1;
  }
</style>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="task-mode" bind:this={canvasRef} style={`${canvasCssVars} ${taskColorVars} ${taskSurfaceVar} ${viewportVar}`} on:contextmenu={handleContextMenu}>
  <ModeWallpaper settings={backgroundSettings} />
  {#if taskBlocks.length}
    <div class="task-header">
      <div class="task-tabs-row" role="tablist">
        {#each taskBlocks as block, i (block.id)}
          {#if renamingId === block.id}
            <input
              class="task-tab task-tab-rename"
              aria-label="List name"
              style="--bg: {block.bgColor || 'transparent'}; --text: {block.textColor || 'var(--mode-text-color, inherit)'};"
              value={block.title || ''}
              placeholder={`List ${i + 1}`}
              bind:this={renameInput}
              on:keydown={renameKeydown}
              on:blur={finishRename}
            />
          {:else}
            <button
              class="task-tab"
              role="tab"
              aria-selected={block.id === selectedTaskId}
              title={block.id === selectedTaskId ? 'Press again to rename' : undefined}
              style="--bg: {block.bgColor || 'transparent'}; --text: {block.textColor || 'var(--mode-text-color, inherit)'};"
              on:click={() => pressTab(block.id)}
            >{getTabLabel(block, i)}</button>
          {/if}
        {/each}
      </div>

      {#if taskBlock}
        <div class="task-title-row">
          <ColorField
            value={taskBlock.bgColor || '#000000'}
            title="Background Color"
            on:input={e => setTaskColor('bgColor', e.detail)}
            on:change={e => commitTaskColor('bgColor', e.detail)}
          />
          <ColorField
            value={taskBlock.textColor || '#ffffff'}
            title="Text Color"
            on:input={e => setTaskColor('textColor', e.detail)}
            on:change={e => commitTaskColor('textColor', e.detail)}
          />
          <button class="delete-list-btn" on:click={deleteTaskList}>Delete</button>
        </div>
      {/if}
    </div>

    <div class="task-body">
      <div class="task-columns">
        <!-- To Do column -->
        <section class="task-section">
          <div class="section-header">
            <span class="section-title">To Do</span>
            <span class="section-count">{todoTasks.length}</span>
          </div>
          {#if todoTasks.length}
            <ul class="task-list">
              {#if dropLine && !dropLine.done}
                <li class="drop-line" aria-hidden="true" style="top: {dropLine.y}px"></li>
              {/if}
              {#each todoTasks as task}
                <li
                  class="task-item"
                  class:dragging={draggingTaskId === task.id}
                  data-task-id={task.id}
                  on:pointerdown={(e) => reorder.itemDown(e, task.id)}
                >
                  <button
                    class="drag-handle"
                    aria-label="Drag to reorder"
                    on:pointerdown={e => reorder.handleDown(e, task.id)}
                  >
                    <svg viewBox="0 0 10 16" width="9" height="14" fill="currentColor">
                      <circle cx="2" cy="2" r="1.4"/><circle cx="8" cy="2" r="1.4"/>
                      <circle cx="2" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/>
                      <circle cx="2" cy="14" r="1.4"/><circle cx="8" cy="14" r="1.4"/>
                    </svg>
                  </button>
                  <div class="task-row">
                    <button
                      class="circle-check"
                      on:click={() => toggleTask(task.id)}
                      aria-label="Mark complete"
                    >
                      <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
                        <circle cx="10" cy="10" r="8.5" fill="transparent"
                          stroke="var(--text,#f5f5f5)" stroke-width="1.5" stroke-opacity="0.55"/>
                      </svg>
                    </button>
                    <div class="task-main">
                        {#if editingTaskId === task.id}
                        <div
                          class="task-editor"
                          on:click|stopPropagation
                          on:keydown|stopPropagation={handleEditKeydown}
                        >
                          <TipTapEditor
                            bind:this={taskEditorRef}
                            content={editText}
                            emit="html"
                            variant="inline"
                            placeholder="Write the task…"
                            on:change={(e) => (editText = e.detail)}
                            on:blur={commitEditTask}
                          />
                        </div>
                      {:else}
                        <span
                          class="task-text"
                          title="Double-click to edit"
                          on:dblclick|stopPropagation={(e) => startEditTask(task, e)}
                          on:click|stopPropagation
                        >{@html renderTaskText(task.text)}</span>
                      {/if}
                      {#if task.goal}
                        <TaskGoalLine
                          goal={task.goal}
                          {now}
                          on:timer={() => toggleTimer(task)}
                          on:count={() => countOnce(task)}
                    on:uncount={() => uncountOnce(task)}
                          on:log={(e) => logGoal(task, e.detail)}
                        />
                      {/if}
                    </div>
                  </div>
                  <button class="delete-task-btn" aria-label="Delete task" on:click={() => deleteTask(task.id)}>×</button>
                </li>
              {/each}
            </ul>
          {:else}
            <div class="task-empty">No pending tasks.</div>
          {/if}
        </section>

        <!-- Done column -->
        <section class="task-section">
          <div class="section-header">
            <span class="section-title">Done</span>
            <span class="section-count">{doneTasks.length}</span>
            <button class="section-toggle" on:click={toggleDoneExpanded}
              title={doneExpanded ? 'Collapse' : 'Expand'}
            >{doneExpanded ? '▲' : '▼'}</button>
          </div>
          {#if doneExpanded}
            {#if doneTasks.length}
              <ul class="task-list">
                {#if dropLine && dropLine.done}
                  <li class="drop-line" aria-hidden="true" style="top: {dropLine.y}px"></li>
                {/if}
                {#each doneTasks as task}
                  <li
                    class="task-item"
                    class:dragging={draggingTaskId === task.id}
                    data-task-id={task.id}
                    on:pointerdown={(e) => reorder.itemDown(e, task.id)}
                  >
                    <button
                      class="drag-handle"
                      aria-label="Drag to reorder"
                      on:pointerdown={e => reorder.handleDown(e, task.id)}
                    >
                      <svg viewBox="0 0 10 16" width="9" height="14" fill="currentColor">
                        <circle cx="2" cy="2" r="1.4"/><circle cx="8" cy="2" r="1.4"/>
                        <circle cx="2" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/>
                        <circle cx="2" cy="14" r="1.4"/><circle cx="8" cy="14" r="1.4"/>
                      </svg>
                    </button>
                    <div class="task-row">
                      <button
                        class="circle-check"
                        on:click={() => toggleTask(task.id)}
                        aria-label="Mark incomplete"
                      >
                        <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
                          <circle cx="10" cy="10" r="9"
                            fill="var(--text,#f5f5f5)"
                            stroke="var(--text,#f5f5f5)" stroke-width="1"/>
                          <path d="M5.5 10.5 L8.5 13.5 L14.5 7"
                            stroke="var(--bg,#000)" stroke-width="2"
                            stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                      </button>
                      <div class="task-main">
                          {#if editingTaskId === task.id}
                          <div
                            class="task-editor"
                            on:click|stopPropagation
                            on:keydown|stopPropagation={handleEditKeydown}
                          >
                            <TipTapEditor
                              bind:this={taskEditorRef}
                              content={editText}
                              emit="html"
                              variant="inline"
                              placeholder="Write the task…"
                              on:change={(e) => (editText = e.detail)}
                              on:blur={commitEditTask}
                            />
                          </div>
                        {:else}
                          <span
                            class="task-text done-text"
                            title="Double-click to edit"
                            on:dblclick|stopPropagation={(e) => startEditTask(task, e)}
                            on:click|stopPropagation
                          >{@html renderTaskText(task.text)}</span>
                        {/if}
                        {#if task.goal}
                          <TaskGoalLine
                            goal={task.goal}
                            {now}
                            on:timer={() => toggleTimer(task)}
                            on:count={() => countOnce(task)}
                    on:uncount={() => uncountOnce(task)}
                            on:log={(e) => logGoal(task, e.detail)}
                          />
                        {/if}
                      </div>
                    </div>
                    <button class="delete-task-btn" aria-label="Delete task" on:click={() => deleteTask(task.id)}>×</button>
                  </li>
                {/each}
              </ul>
            {:else}
              <div class="task-empty">No completed tasks yet.</div>
            {/if}
          {/if}
        </section>
      </div>
    </div>

    <!-- Sticky add bar -->
    <div class="task-add-bar">
      <button
        class="add-dir-btn"
        on:click={toggleDirection}
        title={addDirection === 'above' ? 'Adding at top' : 'Adding at bottom'}
      >{addDirection === 'above' ? '↑' : '↓'}</button>
      <input
        class="add-input"
        type="text"
        bind:value={newTaskText}
        on:keydown={handleKeydown}
        on:paste={handleNewTaskPaste}
        placeholder="Add a task…"
      />
      <button class="add-btn" on:click={addTask} aria-label="Add task">＋</button>
    </div>
  {:else}
    <div class="no-list-placeholder">
      No task lists yet.<br/>Use <strong>+ Task List</strong> from the menu to create one.
    </div>
  {/if}

  {#if goalMenu && goalMenuTask}
    <TaskGoalEditor
      x={goalMenu.x}
      y={goalMenu.y}
      goal={goalMenuTask.goal || null}
      last={goalMenu.last}
      taskLabel={(goalMenuTask.text || '').replace(/<[^>]*>/g, '').slice(0, 60)}
      on:save={(e) => saveGoal(e.detail)}
      on:remove={dropGoal}
      on:close={() => (goalMenu = null)}
    />
  {/if}
</div>

{#if ctxMenu.open && taskBlock}
  <BlockContextMenu
    x={ctxMenu.x}
    y={ctxMenu.y}
    items={[{ id: 'copyMd', label: 'Copy as Markdown' }]}
    colorEdit={true}
    bgColor={taskBlock.bgColor || '#000000'}
    textColor={taskBlock.textColor || '#ffffff'}
    on:action={(e) => handleCtxAction(e.detail)}
    on:colorChange={(e) => handleCtxColor(e.detail)}
    on:close={closeCtxMenu}
  />
{/if}
