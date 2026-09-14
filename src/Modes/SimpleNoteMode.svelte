<script>
  import MarkdownIt from 'markdown-it';
  import { sanitizeRichText, looksLikeHtml } from '../utils/sanitizeRichText.js';

  // Tasks are saved as editor HTML so an image keeps the width it was dragged
  // to; anything written before that is still markdown. Either way the result
  // is sanitised — task text arrives through sync.
  const taskMd = new MarkdownIt({ html: false, linkify: true, breaks: true });
  function renderTaskText(text) {
    const value = String(text ?? '');
    return sanitizeRichText(looksLikeHtml(value) ? value : taskMd.render(value));
  }

  import { createEventDispatcher, onMount } from 'svelte';
  import TipTapEditor from '../components/TipTapEditor.svelte';
  import { htmlToText as htmlToPlainText } from '../utils/htmlToText.js';
  import Lightbox from '../components/Lightbox.svelte';
  import BlockContextMenu from '../components/BlockContextMenu.svelte';
  import { isPrimaryPointer } from '../utils/pointer.js';
  import MusicPlayer from '../components/MusicPlayer.svelte';
  import { ALL_MUSIC } from '../utils/playlistPlayback.js';

  export let blocks = [];
  export let focusedBlockId = null;
  export let canvasColors = {};
  export let leftControlColors = {};
  export let canvasRef;
  export let columnCount = 2;
  // The music library and what the app's one player is doing with it, so a
  // music block here is the same player as on the canvas.
  export let library = { tracks: [], playlists: [] };
  export let nowPlayingId = null;
  export let isPlaying = false;
  const dispatch = createEventDispatcher();

  const defaultCanvasColors = {
    outerBg: '#000000',
    innerBg: '#000000'
  };
  const defaultLeftControlColors = {
    textColor: '#f5f5f5',
    buttonBg: '#121212'
  };

  $: canvasTheme = { ...defaultCanvasColors, ...(canvasColors || {}) };
  $: leftTheme = { ...defaultLeftControlColors, ...(leftControlColors || {}) };
  $: modeTextColor = canvasTheme.textColor || getReadableTextColor(canvasTheme.innerBg);
  $: canvasCssVars = `--canvas-outer-bg: ${canvasTheme.outerBg}; --canvas-inner-bg: ${canvasTheme.innerBg}; --mode-text-color: ${modeTextColor}; --left-text-color: ${leftTheme.textColor}; --left-button-bg: ${leftTheme.buttonBg};`;

  function getReadableTextColor(color) {
    if (!color) return '#f5f5f5';
    const parsed = parseColor(color);
    if (!parsed) return '#f5f5f5';
    const [r, g, b] = parsed;
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? '#121212' : '#f5f5f5';
  }

  function parseColor(color) {
    const trimmed = color.trim();
    if (trimmed.startsWith('#')) {
      const hex = trimmed.slice(1);
      if (hex.length === 3) {
        return [
          parseInt(hex[0] + hex[0], 16),
          parseInt(hex[1] + hex[1], 16),
          parseInt(hex[2] + hex[2], 16)
        ];
      }
      if (hex.length === 6) {
        return [
          parseInt(hex.slice(0, 2), 16),
          parseInt(hex.slice(2, 4), 16),
          parseInt(hex.slice(4, 6), 16)
        ];
      }
    }
    const rgbMatch = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (rgbMatch) {
      return [
        Number(rgbMatch[1]),
        Number(rgbMatch[2]),
        Number(rgbMatch[3])
      ];
    }
    return null;
  }

  function deleteBlock(id) {
    dispatch('delete', { id });
  }

  let blockMenu = {
    blockId: null,
    x: 0,
    y: 0
  };
  let blockMenuMode = 'menu'; // 'menu' | 'editUrl'
  let blockMenuUrlDraft = '';
  let touchHoldTimer;
  let touchHoldTriggered = false;

  function openBlockMenu(blockId, x, y) {
    blockMenu = { blockId, x, y };
    blockMenuMode = 'menu';
  }

  function closeBlockMenu() {
    blockMenu = { blockId: null, x: 0, y: 0 };
    blockMenuMode = 'menu';
    blockMenuUrlDraft = '';
    blockMenuUrlField = 'src';
  }

  function handleContextMenu(event, blockId) {
    event.preventDefault();
    ensureFocus(blockId);
    openBlockMenu(blockId, event.clientX, event.clientY);
  }

  function startTouchHold(event, blockId) {
    if (event.touches?.length !== 1) return;

    // A drag still open when a new touch begins is one whose ending never
    // arrived: the card being carried was rebuilt underneath the finger, and
    // both touchend and touchcancel went to a node that no longer exists. Left
    // alone the state stays stuck — every later tap is treated as part of a
    // drag that finished long ago, which is why the mode could stop responding
    // until it was reopened. Finish it here, committing the swap it had
    // already chosen so the move is not lost as well.
    if (dragCardId) endDrag(Boolean(dragOverCardId));

    touchHoldTriggered = false;
    clearTimeout(touchHoldTimer);
    const touch = event.touches[0];
    touchHoldTimer = setTimeout(() => {
      touchHoldTriggered = true;
      ensureFocus(blockId);
      openBlockMenu(blockId, touch.clientX, touch.clientY);
    }, 550);
  }

  function cancelTouchHold() {
    clearTimeout(touchHoldTimer);
  }

  function handleTouchEndForMenu(event) {
    cancelTouchHold();
    if (dragCardId) {
      endDrag(true);
      touchHoldTriggered = false;
      event.preventDefault();
      return;
    }
    if (!touchHoldTriggered) return;
    event.preventDefault();
  }

  // ── Block rearranging: grab a card and drop it onto another to trade
  // places. This swaps the two rather than splicing one out and shifting
  // everything between them, so every block you didn't touch stays exactly
  // where it was. Desktop grabs with the left button; phones long-press
  // first (the same hold that opens the context menu) and then slide. ──
  const DRAG_THRESHOLD = 6;
  let pendingDragId = null;
  let dragCardId = null;
  let dragOverCardId = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let suppressNextClick = false;

  // Regions that own the pointer themselves: media controls and form fields
  // have to keep behaving normally instead of picking the card up.
  function isDragExcluded(target, blockId) {
    if (target?.closest?.('button, input, textarea, select, audio, video, a')) return true;
    // The editor only claims the pointer once you're actually editing this
    // block. Until then, dragging across its text rearranges the card — which
    // is the only way to grab a text card without aiming at its thin border.
    if (target?.closest?.('.tiptap-wrap')) return blockId === focusedBlockId;
    return false;
  }

  function updateDragTarget(clientX, clientY) {
    // elementsFromPoint (plural) walks the whole stack, so an overlay that is
    // still on screen — the context menu the long-press just opened, which
    // Svelte only removes a tick later — can't mask the card beneath it and
    // leave the drop with no target.
    let id = null;
    for (const el of document.elementsFromPoint(clientX, clientY)) {
      const card = el.closest?.('[data-simple-block]');
      if (card) { id = card.dataset.simpleBlock; break; }
    }

    const found = id && id !== dragCardId ? id : null;

    // A target once found is kept until another one replaces it. Recomputing
    // it on every move meant the very last move decided the drop, so lifting a
    // finger in the gap between two cards — or over the dragged card itself —
    // threw the target away and the drop did nothing. Holding the last one
    // makes releasing forgiving, which is what a finger needs.
    if (found) dragOverCardId = found;
  }

  function endDrag(commit) {
    if (commit && dragCardId && dragOverCardId) {
      dispatch('swapBlocks', { aId: dragCardId, bId: dragOverCardId });
    }
    // A finished drag would otherwise land as a click and toggle focus.
    if (dragCardId) suppressNextClick = true;
    pendingDragId = null;
    dragCardId = null;
    dragOverCardId = null;
  }

  function onBlockPointerDown(event, blockId) {
    if (event.pointerType === 'touch') return; // phones use the long-press path
    if (!isPrimaryPointer(event)) return;
    if (isDragExcluded(event.target, blockId)) return;
    pendingDragId = blockId;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    window.addEventListener('pointermove', onDragPointerMove);
    window.addEventListener('pointerup', onDragPointerUp);
  }

  function onDragPointerMove(event) {
    if (!pendingDragId) return;
    if (!dragCardId) {
      // Stay a plain click until the pointer actually travels, so tapping a
      // card to focus it (or double-clicking an image) still works.
      if (
        Math.abs(event.clientX - dragStartX) < DRAG_THRESHOLD &&
        Math.abs(event.clientY - dragStartY) < DRAG_THRESHOLD
      ) return;
      dragCardId = pendingDragId;
    }
    updateDragTarget(event.clientX, event.clientY);
  }

  function onDragPointerUp() {
    stopPointerDragListeners();
    endDrag(true);
  }

  function stopPointerDragListeners() {
    window.removeEventListener('pointermove', onDragPointerMove);
    window.removeEventListener('pointerup', onDragPointerUp);
  }

  function handleBlockTouchMove(event, blockId) {
    // Before the hold fires, a moving finger is just a scroll — let the page
    // scroll and drop the context menu that was about to open.
    if (!touchHoldTriggered) {
      cancelTouchHold();
      return;
    }
    const touch = event.touches?.[0];
    if (!touch) return;
    if (!dragCardId) {
      dragCardId = blockId;
      closeBlockMenu(); // the hold opened it; sliding means "move", not "menu"
    }
    event.preventDefault(); // don't scroll the grid while carrying a card
    updateDragTarget(touch.clientX, touch.clientY);
  }

  // A cancelled touch is usually not somebody changing their mind.
  //
  // The list is keyed by `${block.id}-${block._version}`, so anything that
  // bumps a version mid-gesture — a save, or a sync arriving — gives that card
  // a new key, and Svelte answers a new key by destroying the node and
  // building another. Touch events belong to the node the gesture started on,
  // so the browser cancels the touch, and this used to throw the drop away
  // with it. That is the whole of "sometimes it does nothing when I let go":
  // it depended on whether a save landed while the finger was down. The
  // pointer path never had the problem because its listeners are on window
  // rather than on the card.
  //
  // So a cancel that arrives with a target already chosen is treated as the
  // drop it was about to be. A cancel with no target still discards, which is
  // the case where somebody really did back out.
  function handleBlockTouchCancel() {
    cancelTouchHold();
    endDrag(Boolean(dragCardId && dragOverCardId));
  }

  function deleteFromMenu(blockId) {
    deleteBlock(blockId);
    closeBlockMenu();
  }

  function downloadSrc(src, name = 'media') {
    const a = document.createElement('a');
    a.href = src;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function copyImageSrc(src) {
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      if (blob.type.startsWith('image/')) {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        return;
      }
    } catch {}
    try { await navigator.clipboard.writeText(src); } catch {}
  }

  function buildMenuItems(block) {
    if (!block) return [];
    const items = [];
    if (block.type === 'image') {
      items.push({ id: 'edit', label: 'Edit image URL' });
      const src = getImageSource(block);
      if (src) {
        items.push({ id: 'changeImage', label: 'Change image' });
        items.push({ id: 'saveMedia', label: 'Save image' });
        items.push({ id: 'copyMedia', label: 'Copy to clipboard' });
      }
    }
    if (block.type === 'embed') {
      items.push({ id: 'editEmbed', label: 'Edit embed URL' });
    }
    if (block.type === 'text' || block.type === 'cleantext') {
      if (block.content) items.push({ id: 'copyText', label: 'Copy text' });
    }
    items.push({ id: 'delete', label: 'Delete block', variant: 'danger' });
    return items;
  }

  let blockMenuUrlField = 'src';

  async function handleMenuAction(actionId, block) {
    if (!block) { closeBlockMenu(); return; }
    if (actionId === 'edit') {
      blockMenuUrlField = 'src';
      blockMenuUrlDraft = getImageSource(block);
      blockMenuMode = 'editUrl';
      return;
    } else if (actionId === 'editEmbed') {
      blockMenuUrlField = 'content';
      blockMenuUrlDraft = block.content || '';
      blockMenuMode = 'editUrl';
      return;
    } else if (actionId === 'changeImage') {
      openImagePicker(block.id);
    } else if (actionId === 'saveMedia') {
      const src = getImageSource(block);
      if (src) downloadSrc(src, 'image');
    } else if (actionId === 'copyMedia') {
      const src = getImageSource(block);
      if (src) await copyImageSrc(src);
    } else if (actionId === 'copyText') {
      const text = htmlToPlainText(block.content);
      if (text) await navigator.clipboard.writeText(text).catch(() => {});
    } else if (actionId === 'delete') {
      deleteFromMenu(block.id);
      return;
    }
    closeBlockMenu();
  }

  function handleSimpleColorChange(detail, block) {
    if (!block) return;
    const changed = {};
    if (detail.bgColor !== undefined) changed.bgColor = detail.bgColor;
    if (detail.textColor !== undefined) changed.textColor = detail.textColor;
    const keys = Object.keys(changed);
    if (!keys.length) return;
    updateBlock(block.id, changed, { pushToHistory: !!detail.commit, changedKeys: keys });
  }

  function autoFocusInput(node) {
    requestAnimationFrame(() => { node.focus(); node.select(); });
  }

  function confirmUrlEdit() {
    const menuBlock = blocks.find(b => b.id === blockMenu.blockId);
    if (menuBlock) {
      updateBlock(menuBlock.id, { [blockMenuUrlField]: blockMenuUrlDraft });
    }
    closeBlockMenu();
  }

  function updateBlock(id, updates, { pushToHistory, changedKeys } = {}) {
    const detail = { id, ...updates };
    const effectiveKeys = Array.isArray(changedKeys) && changedKeys.length
      ? changedKeys
      : Object.keys(updates || {});

    if (effectiveKeys.length) detail.changedKeys = effectiveKeys;
    if (pushToHistory !== undefined) detail.pushToHistory = pushToHistory;

    dispatch('update', detail);
  }

  function toggleFocus(id) {
    dispatch('focusToggle', { id });
  }

  function ensureFocus(id) {
    if (focusedBlockId !== id) {
      dispatch('focusToggle', { id });
    }
  }

  function handleBlockClick(event, id) {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    if (event.defaultPrevented) return;
    if (event.target.closest('[data-focus-guard]')) {
      ensureFocus(id);
      return;
    }
    toggleFocus(id);
  }

  function handleBlockKeydown(event, id) {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    handleBlockClick(event, id);
  }


  // There was a focusScroll here that centred the editor on screen whenever it
  // took focus on a phone. It is gone, and this is why.
  //
  // The browser already puts the caret on screen when an editable is focused —
  // that is not something an app has to arrange. Doing it as well meant two
  // scrolls racing: ours, smooth, aimed at the middle of the *element*, and the
  // browser's, aimed at the *caret*, a moment later once the keyboard had
  // opened and the viewport had changed. The note jumped somewhere and came
  // back, once, the first time each note was touched — which is exactly how it
  // was reported.
  //
  // Only the first time because only the first focus opens the keyboard; after
  // that there is no viewport change for the browser to correct for.

  function blockKey(block) {
    return `${block.id}-${block._version || 0}`;
  }

  let imageInputRefs = {};
  let imageTapTracker = {};

  // ── Lightbox ──────────────────────────────────────────────────────
  let lbOpen = false;
  let lbImages = [];
  let lbStart = 0;

  function openLightbox(block) {
    const src = getImageSource(block);
    if (!src) return;
    const imageSrcs = blocks
      .filter(b => b.type === 'image' && hasImageSource(b))
      .map(getImageSource);
    lbStart = imageSrcs.indexOf(src);
    if (lbStart < 0) lbStart = 0;
    lbImages = imageSrcs;
    lbOpen = true;
  }

  function setImageInputRef(blockId, node) {
    if (node) {
      imageInputRefs[blockId] = node;
      return;
    }
    delete imageInputRefs[blockId];
  }

  function imageInputRef(node, blockId) {
    setImageInputRef(blockId, node);
    return {
      update(nextBlockId) {
        if (nextBlockId === blockId) return;
        setImageInputRef(blockId, null);
        blockId = nextBlockId;
        setImageInputRef(blockId, node);
      },
      destroy() {
        setImageInputRef(blockId, null);
      }
    };
  }

  function getImageSource(block) {
    if (!block) return '';
    if (typeof block.src === 'string') return block.src;
    if (block.src && typeof block.src === 'object') return block.resolvedSrc || '';
    return '';
  }

  function hasImageSource(block) {
    return Boolean(getImageSource(block));
  }

  function openImagePicker(blockId) {
    const input = imageInputRefs[blockId];
    if (!input) return;
    ensureFocus(blockId);
    input.click();
  }

  function handleImageChange(event, block) {
    ensureFocus(block.id);
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      updateBlock(
        block.id,
        {
          src: reader.result,
          resolvedSrc: null,
          attachmentRequiresAuth: false,
          _version: (block._version || 0) + 1
        },
        {
          changedKeys: ['src', 'resolvedSrc', 'attachmentRequiresAuth', '_version']
        }
      );
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  }

  function handleImageTouchEnd(event, block) {
    // Touching the image itself stops propagation before it reaches the
    // container's own touchend handler, so the long-press timer started by
    // touchstart never gets cancelled there — cancel it here instead, or a
    // quick tap ends up popping the context menu 550ms later on its own.
    const wasHoldTriggered = touchHoldTriggered;
    cancelTouchHold();
    if (wasHoldTriggered) {
      event.preventDefault();
      return;
    }
    if (!hasImageSource(block)) return;

    const currentTap = Date.now();
    const previousTap = imageTapTracker[block.id] || 0;
    imageTapTracker[block.id] = currentTap;

    if (currentTap - previousTap <= 300) {
      event.preventDefault();
      imageTapTracker[block.id] = 0;
      openLightbox(block);
    } else {
      ensureFocus(block.id);
    }
  }

  let newTaskTextByBlock = {};

  function addTask(block) {
    const trimmed = (newTaskTextByBlock[block.id] || '').trim();
    if (!trimmed) return;
    const nextTasks = [...(Array.isArray(block.tasks) ? block.tasks : []), { id: crypto.randomUUID(), text: trimmed, done: false }];
    updateBlock(block.id, { tasks: nextTasks }, { pushToHistory: true, changedKeys: ['tasks'] });
    newTaskTextByBlock[block.id] = '';
  }

  function handleAddTaskKeydown(event, block) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addTask(block);
  }

  function toggleTask(block, taskId) {
    const nextTasks = (block.tasks || []).map(task =>
      task.id === taskId ? { ...task, done: !task.done } : task
    );
    updateBlock(block.id, { tasks: nextTasks }, { pushToHistory: true, changedKeys: ['tasks'] });
  }

  function deleteTask(block, taskId) {
    const nextTasks = (block.tasks || []).filter(task => task.id !== taskId);
    updateBlock(block.id, { tasks: nextTasks }, { pushToHistory: true, changedKeys: ['tasks'] });
  }

  // ── Inline edit (double-click a task to rewrite it) ───────────────────
  let editingTaskId = null;
  let editText = '';

  function startEditTask(task) { editingTaskId = task.id; editText = task.text; }

  function commitEditTask(block) {
    if (!editingTaskId) return;
    const trimmed = editText.trim();
    const tasks = Array.isArray(block.tasks) ? block.tasks : [];
    if (trimmed) {
      updateBlock(block.id, { tasks: tasks.map(t => t.id === editingTaskId ? { ...t, text: trimmed } : t) }, { pushToHistory: true, changedKeys: ['tasks'] });
    }
    editingTaskId = null; editText = '';
  }

  function cancelEditTask() { editingTaskId = null; editText = ''; }

  function handleEditKeydown(event, block) {
    // Enter belongs to the editor now that a task can run to several lines.
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      commitEditTask(block);
    }
    else if (event.key === 'Escape') { event.preventDefault(); cancelEditTask(); }
  }


  // ── Reordering (drag the handle) — scoped per block since several task
  // lists can be visible at once in this grid. ──────────────────────────
  let dragBlockId = null;
  let draggingTaskId = null;
  let dragOverTaskId = null;
  let dragOverPos = null;

  function startTaskDrag(e, block, taskId) {
    e.preventDefault();
    e.stopPropagation();
    ensureFocus(block.id);
    dragBlockId = block.id;
    draggingTaskId = taskId;
    window.addEventListener('pointermove', onTaskDragMove);
    window.addEventListener('pointerup', onTaskDragEnd);
  }

  function onTaskDragMove(e) {
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

  function onTaskDragEnd() {
    window.removeEventListener('pointermove', onTaskDragMove);
    window.removeEventListener('pointerup', onTaskDragEnd);
    if (dragBlockId && draggingTaskId && dragOverTaskId && draggingTaskId !== dragOverTaskId) {
      const block = blocks.find(b => b.id === dragBlockId);
      if (block) reorderTask(block, draggingTaskId, dragOverTaskId, dragOverPos);
    }
    dragBlockId = null;
    draggingTaskId = null;
    dragOverTaskId = null;
    dragOverPos = null;
  }

  function reorderTask(block, draggedId, targetId, pos) {
    const list = [...(Array.isArray(block.tasks) ? block.tasks : [])];
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
    updateBlock(block.id, { tasks: list }, { pushToHistory: true, changedKeys: ['tasks'] });
  }

  $: normalizedColumnCount = Math.max(1, Number.parseInt(columnCount, 10) || 2);
  $: renderColumns = Array.from({ length: normalizedColumnCount }, (_, columnIndex) =>
    blocks.filter((_, blockIndex) => blockIndex % normalizedColumnCount === columnIndex)
  );

  onMount(() => {
    const handleGlobalPointerDown = (event) => {
      if (event.target?.closest?.('.ctx-menu, .url-edit-popup')) return;
      if (blockMenu.blockId) closeBlockMenu();
    };
    const handleEsc = (event) => {
      if (event.key === 'Escape') {
        if (lbOpen) return; // Lightbox component handles this via stopImmediatePropagation
        if (blockMenu.blockId) closeBlockMenu();
      }
    };

    window.addEventListener('pointerdown', handleGlobalPointerDown);
    window.addEventListener('keydown', handleEsc);

    return () => {
      cancelTouchHold();
      stopPointerDragListeners();
      window.removeEventListener('pointerdown', handleGlobalPointerDown);
      window.removeEventListener('keydown', handleEsc);
    };
  });
</script>






<style>
/* ========== MOBILE (default) ========== */
.simple-wrapper {
  display: grid;
  grid-template-columns: repeat(var(--simple-note-columns, 2), minmax(0, 1fr));
  gap: 0.55rem;
  align-items: flex-start;
  background: var(--canvas-inner-bg, #000000);
  padding: clamp(3px, 0.55vw, 6px);
  overflow-y: auto;
  overflow-x: hidden;
  width: 100%;
  max-width: none;
  margin: 0;
  min-width: 0;
  box-sizing: border-box;
  --sb-track: var(--canvas-inner-bg);
  --sb-thumb: var(--mode-text-color);
}

.simple-column {
  flex: 1 1 0;
  min-width: 0;
}

/* Card being carried, and the card it would trade places with. */
.canvas.drag-source {
  opacity: 0.45;
  cursor: grabbing;
}
.canvas.drag-target {
  outline: 2px dashed var(--mode-text-color, #f5f5f5);
  outline-offset: -2px;
  border-radius: 8px;
}

.canvas {
  background: var(--canvas-outer-bg, #00000041);
  border-radius: 8px;
  padding: 5px;
  margin: 0 0 0.45rem;
  display: block;
  width: auto;
  break-inside: avoid-column;
  page-break-inside: avoid;
  -webkit-column-break-inside: avoid;
  box-sizing: border-box;
  position: relative;
}

.container {
  background: var(--bg-color);
  color: var(--text-color);
  padding: 4px;
  width: 100%;
  box-sizing: border-box;
  border-radius: 20px;
  overflow: hidden;
  border: 2px solid var(--simple-note-border-color, var(--text-color));
  box-shadow: var(--simple-note-block-shadow, 0 0 2px 1px var(--text-color),
              0 0 6px 2px var(--text-color));
  display: flex;
  flex-direction: column;
  align-items: stretch;
  outline: 2px solid transparent;
  transition: box-shadow 0.15s ease, outline 0.15s ease;
}

.container.focused {
  outline: 4px solid transparent;

}

/* TipTap overrides for grid cards */
:global(.container .tiptap-wrap) {
  background: transparent;
  color: var(--text-color);
  /* The app's own face, which carries every weight between 100 and 900 —
     see the @font-face in app.css. Arial was named here and has two. */
  font-family: 'Inter', system-ui, Arial, Helvetica, sans-serif;
  font-size: 1em;
  /* Inherited, and emphatically not bold.

     This said `font-weight: bold`, so every word in every Simple Note text
     block was 700 and the bold inside it was 900 -- a quarter more ink, where
     everywhere else in the app it is two and a half times as much. Bold was
     reported as barely visible three times and this was the reason each time;
     the typeface was changed twice looking for it. Whatever a block is
     sitting in decides the weight, the same as the rest of the app. */
  font-weight: inherit;
  min-height: 50px;
  /* don't lock height in grid cards — grow with content */
  flex: unset;
  overflow-y: visible;
}
:global(.container .tiptap-inner) {
  color: var(--text-color);
  padding: 10px;
  min-height: 40px;
  flex: unset;
}

.container img {
  width: 100%;
  height: auto;
  max-height: 1080px;
  object-fit: contain;
  border-radius: 14px;
}

input[type="text"] {
  width: 100%;
  border-radius: 6px;
  border: none;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 1rem;
  margin-top: 8px;
}

.image-empty-state {
  width: 100%;
  min-height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed color-mix(in srgb, var(--text-color) 45%, transparent);
  border-radius: 14px;
  margin-bottom: 8px;
}

.image-select-button {
  border: 2px solid var(--text-color);
  background: transparent;
  color: var(--text-color);
  border-radius: 12px;
  padding: 10px 14px;
  font-weight: 700;
  cursor: pointer;
}

.task-list {
  width: 100%;
  margin: 6px 0;
  padding: 0 8px 8px;
  box-sizing: border-box;
}

.task-list-title {
  font-weight: 700;
  padding: 6px 8px 2px;
}

.task-item {
  padding: 4px 8px;
  border-radius: 8px;
  margin-top: 4px;
  background: color-mix(in srgb, var(--text-color) 10%, transparent);
  font-size: 0.95rem;
}

.task-add-row {
  display: flex;
  gap: 6px;
  width: 100%;
  padding: 0 8px;
  box-sizing: border-box;
}

.task-add-row input[type="text"] {
  flex: 1 1 auto;
  margin-top: 0;
}

.task-add-row button {
  border: none;
  border-radius: 6px;
  background: var(--bg-color);
  color: var(--text-color);
  padding: 6px 10px;
  cursor: pointer;
}

.task-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.task-item label {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 auto;
}

.task-item button {
  border: none;
  background: transparent;
  color: var(--text-color);
  cursor: pointer;
  font-size: 1rem;
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

.task-item.dragging { opacity: 0.5; position: relative; z-index: 2; }
.task-item.drag-over-before { box-shadow: inset 0 2px 0 0 var(--text-color); }
.task-item.drag-over-after  { box-shadow: inset 0 -2px 0 0 var(--text-color); }

.task-item button.drag-handle {
  flex-shrink: 0;
  width: 20px;
  min-height: 32px;
  padding: 0;
  cursor: grab;
  touch-action: none;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color);
  opacity: 0.35;
}
.task-item button.drag-handle:active { cursor: grabbing; opacity: 0.7; }

.task-editor {
  flex: 1;
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--text-color, #fff) 30%, transparent);
  background: color-mix(in srgb, var(--text-color, #fff) 8%, transparent);
  color: var(--text-color, inherit);
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

/* The row has to grow with a multi-line task instead of pinning it to one
   line's height. */
.task-text {
  flex: 1 1 auto;
  min-width: 0;
  white-space: normal;
  word-break: break-word;
  cursor: text;
}


.music-content, .embed-content {
  width: 100%;
  box-sizing: border-box;
  padding: 0 8px 8px;
}

/* The player draws its own rows and needs a height to scroll them in; without
   this it grows with the library instead. */
.music-content {
  display: flex;
  min-height: 0;
  max-height: 320px;
}

.url-edit-popup {
  position: fixed;
  z-index: 9100;
  background: #111111;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 10px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 240px;
}

.url-edit-input {
  width: 100%;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  color: #f0f0f0;
  padding: 8px 10px;
  font-size: 0.85rem;
  outline: none;
}

.url-edit-input:focus {
  border-color: rgba(255, 255, 255, 0.35);
}

.url-edit-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

.url-edit-cancel,
.url-edit-confirm {
  border: none;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 0.85rem;
  cursor: pointer;
}

.url-edit-cancel {
  background: rgba(255, 255, 255, 0.08);
  color: #aaa;
}

.url-edit-confirm {
  background: rgba(255, 255, 255, 0.15);
  color: #f0f0f0;
}

@media (max-width: 1023px) {
  .simple-wrapper {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.35rem;
    padding: 2px;
  }

  .canvas {
    margin-bottom: 0.3rem;
    padding: 3px;
    border-radius: 6px;
  }

  .container {
    padding: 3px;
    border-radius: 14px;
  }

  :global(.container .tiptap-inner) {
    padding: 8px;
  }

}

</style>









<div class="simple-wrapper" bind:this={canvasRef} style={`${canvasCssVars} --simple-note-columns: ${normalizedColumnCount};`}>
  {#each renderColumns as column}
    <div class="simple-column">
      {#each column as block (blockKey(block))}
      <div
        class="canvas"
        class:drag-source={block.id === dragCardId}
        class:drag-target={block.id === dragOverCardId}
        data-simple-block={block.id}
        on:pointerdown={(event) => onBlockPointerDown(event, block.id)}
      >
        <div
          class="container"
          class:focused={block.id === focusedBlockId}
          style="--bg-color: {block.bgColor}; --text-color: {block.textColor};"
          on:click={(event) => handleBlockClick(event, block.id)}
          on:contextmenu={(event) => handleContextMenu(event, block.id)}
          on:touchstart={(event) => startTouchHold(event, block.id)}
          on:touchend={(event) => handleTouchEndForMenu(event)}
          on:touchmove|nonpassive={(event) => handleBlockTouchMove(event, block.id)}
          on:touchcancel={handleBlockTouchCancel}
          role="button"
          tabindex="0"
          aria-pressed={block.id === focusedBlockId}
          on:keydown={(event) => handleBlockKeydown(event, block.id)}
        >
          {#if block.type === 'text' || block.type === 'cleantext'}
            <TipTapEditor
              content={block.content}
              historyKey={block.id}
              placeholder="Type your note here..."
              on:change={(e) => {
                updateBlock(block.id, { content: e.detail }, { pushToHistory: false, changedKeys: ['content'] });
              }}
              on:focus={() => ensureFocus(block.id)}
            />
          {:else if block.type === 'image'}
            {#if hasImageSource(block)}
              <img
                src={getImageSource(block)}
                alt=""
                data-focus-guard
                on:click|stopPropagation={() => ensureFocus(block.id)}
                on:dblclick|stopPropagation={() => openLightbox(block)}
                on:touchend|stopPropagation={(event) => handleImageTouchEnd(event, block)}
                style="cursor:zoom-in"
              />
            {:else}
              <div class="image-empty-state" data-focus-guard>
                <button
                  class="image-select-button"
                  on:click|stopPropagation={() => openImagePicker(block.id)}
                  data-focus-guard
                >
                  Add image
                </button>
              </div>
            {/if}
            <input
              type="file"
              accept="image/*"
              style="display:none;"
              use:imageInputRef={block.id}
              on:change={(event) => handleImageChange(event, block)}
              data-focus-guard
            />

          {:else if block.type === 'music'}
            <div class="music-content" data-focus-guard>
              <MusicPlayer
                playlistId={block.playlistId ?? ALL_MUSIC}
                ownPickerButton
                {library}
                {nowPlayingId}
                {isPlaying}
                on:change={(e) =>
                  updateBlock(block.id, { playlistId: e.detail.playlistId }, { changedKeys: ['playlistId'] })}
                on:play
                on:toggle
              />
            </div>
          {:else if block.type === 'embed'}
            <div class="embed-content" data-focus-guard>
              {#if block.content}
                <div>{@html block.content}</div>
              {:else}
                <p style="opacity:0.6;">No embed URL set</p>
              {/if}
            </div>
          {:else if block.type === 'task'}
            <div class="task-list-title">{block.title || 'Task List'}</div>
            <div class="task-add-row" role="presentation" data-focus-guard on:touchstart|stopPropagation on:contextmenu|stopPropagation>
              <input
                type="text"
                placeholder="Add task"
                value={newTaskTextByBlock[block.id] || ''}
                on:input={(e) => (newTaskTextByBlock[block.id] = e.target.value)}
                on:keydown={(e) => handleAddTaskKeydown(e, block)}
                on:focus={() => ensureFocus(block.id)}
                data-focus-guard
              />
              <button data-focus-guard on:click|stopPropagation={() => addTask(block)}>Add</button>
            </div>
            <div class="task-list">
              {#if Array.isArray(block.tasks) && block.tasks.length}
                {#each block.tasks as task (task.id)}
                  <div
                    class="task-item"
                    class:dragging={draggingTaskId === task.id}
                    class:drag-over-before={dragOverTaskId === task.id && dragOverPos === 'before'}
                    class:drag-over-after={dragOverTaskId === task.id && dragOverPos === 'after'}
                    data-task-id={task.id}
                    role="presentation"
                    data-focus-guard
                    on:touchstart|stopPropagation
                    on:contextmenu|stopPropagation
                  >
                    <button
                      class="drag-handle"
                      aria-label="Drag to reorder"
                      data-focus-guard
                      on:pointerdown={(e) => startTaskDrag(e, block, task.id)}
                    >
                      <svg viewBox="0 0 10 16" width="9" height="14" fill="currentColor">
                        <circle cx="2" cy="2" r="1.4"/><circle cx="8" cy="2" r="1.4"/>
                        <circle cx="2" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/>
                        <circle cx="2" cy="14" r="1.4"/><circle cx="8" cy="14" r="1.4"/>
                      </svg>
                    </button>
                    <label>
                      <!-- svelte-ignore a11y-click-events-have-key-events -->
                      <button
                        class="circle-check"
                        on:click|stopPropagation={() => toggleTask(block, task.id)}
                        data-focus-guard
                        aria-label={task.done ? 'Mark incomplete' : 'Mark complete'}
                      >
                        {#if task.done}
                          <svg viewBox="0 0 20 20" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="10" cy="10" r="9" fill="var(--text-color)" stroke="var(--text-color)" stroke-width="1"/>
                            <path d="M5.5 10.5 L8.5 13.5 L14.5 7" stroke="var(--bg-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                        {:else}
                          <svg viewBox="0 0 20 20" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="10" cy="10" r="8.5" fill="transparent" stroke="var(--text-color)" stroke-width="1.5" stroke-opacity="0.5"/>
                          </svg>
                        {/if}
                      </button>
                      {#if editingTaskId === task.id}
                        <div
                          class="task-editor"
                          data-focus-guard
                          on:click|stopPropagation
                          on:keydown|stopPropagation={(e) => handleEditKeydown(e, block)}
                        >
                          <TipTapEditor
                            content={editText}
                            emit="html"
                            variant="inline"
                            placeholder="Write the task…"
                            on:change={(e) => (editText = e.detail)}
                            on:blur={() => commitEditTask(block)}
                          />
                        </div>
                      {:else}
                        <span
                          class="task-text"
                          title="Double-click to edit"
                          on:dblclick|stopPropagation={() => startEditTask(task)}
                          on:click|stopPropagation
                        >{@html renderTaskText(task.text)}</span>
                      {/if}
                    </label>
                    <button
                      aria-label="Delete task"
                      data-focus-guard
                      on:click|stopPropagation={() => deleteTask(block, task.id)}
                    >
                      ×
                    </button>
                  </div>
                {/each}
              {:else}
                <div class="task-item">No tasks yet</div>
              {/if}
            </div>
          {/if}


        </div>
      </div>
      {/each}
    </div>
  {/each}
</div>

{#if blockMenu.blockId}
  {#if blockMenuMode === 'editUrl'}
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="url-edit-popup" style="left:{blockMenu.x}px; top:{blockMenu.y}px;">
      <input
        class="url-edit-input"
        type="text"
        bind:value={blockMenuUrlDraft}
        placeholder={blockMenuUrlField === 'content' ? 'Paste embed URL…' : 'Paste image URL…'}
        on:keydown={(e) => { if (e.key === 'Enter') confirmUrlEdit(); if (e.key === 'Escape') closeBlockMenu(); }}
        use:autoFocusInput
      />
      <div class="url-edit-actions">
        <button class="url-edit-cancel" on:click={closeBlockMenu}>Cancel</button>
        <button class="url-edit-confirm" on:click={confirmUrlEdit}>Done</button>
      </div>
    </div>
  {:else}
    {@const menuBlock = blocks.find(b => b.id === blockMenu.blockId)}
    <BlockContextMenu
      x={blockMenu.x}
      y={blockMenu.y}
      items={buildMenuItems(menuBlock)}
      colorEdit={true}
      bgColor={menuBlock?.bgColor || '#000000'}
      textColor={menuBlock?.textColor || '#ffffff'}
      on:action={(e) => handleMenuAction(e.detail, menuBlock)}
      on:colorChange={(e) => handleSimpleColorChange(e.detail, menuBlock)}
      on:close={() => { if (blockMenuMode !== 'editUrl') closeBlockMenu(); }}
    />
  {/if}
{/if}

{#if lbOpen}
  <Lightbox images={lbImages} startIndex={lbStart} on:close={() => lbOpen = false} />
{/if}
