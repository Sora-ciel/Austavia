<script>
  /**
   * A calendar, a day at a time: hours down the side and time blocks of what
   * will be done in them.
   *
   * Asked 2026-11-10: "put time blocks easily of what you will do at a certain
   * hour ... maybe 12min till the next hour. maybe it's a clean 1h block. or
   * maybe 30. be able to have the day blocked ... focus on the day by day way
   * of showing the calendar for now. and you will be able to see the
   * calendar on other modes." A block first (CLAUDE.md, "a block works on its
   * own"): on the Canvas, in Simple Note, on a page, and full size in
   * Calendar mode, which only mounts it.
   *
   * Making a block: click an empty hour for an hour; drag down the day for
   * any length, to 5 minutes; then type a name. Its edges stretch it, its
   * middle moves it, and a press opens it to type the times to the minute
   * (10:48 to 11:00), pick a length, block the whole day, or delete it. The
   * rules are utils/calendar.js; the day shown is this device's, not saved.
   */
  import { onMount, tick } from 'svelte';
  import BlockShell from './BlockShell.svelte';
  import { portal } from '../utils/portal.js';
  import {
    DAY_MINUTES, dateKey, addDays, dayLabel, eventsOn, layoutDay, normalizeEvents,
    clickedSlot, draggedSlot, movedBy, resizedTo, withTypedTime, formatTime, formatLength
  } from '../utils/calendar.js';

  export let id;
  export let initialPosition = { x: 100, y: 100 };
  export let initialSize = { width: 340, height: 480 };
  export let initialBgColor = '#000000';
  export let initialTextColor = '#ffffff';
  export let initialEvents = [];
  export let initialTitle = 'Calendar';
  export let focused = false;
  export let canvasScale = 1;
  export let placement = 'canvas';
  /** Drawn full size by Calendar mode: taller hours. */
  export let big = false;

  let shell;
  let events = normalizeEvents(initialEvents);
  let title = initialTitle || 'Calendar';

  let day = dateKey();
  let today = dateKey();
  $: hourHeight = big ? 64 : 44;
  $: shown = eventsOn(events, day);
  $: laid = layoutDay(shown.timed);

  function save(next, opts = {}) {
    events = normalizeEvents(next);
    shell?.commit(['events'], opts, { events, title });
  }

  const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `e${Date.now()}${Math.random()}`);

  // ── The time now, as a line across today ─────────────────────────────
  let now = new Date();
  $: nowMinutes = now.getHours() * 60 + now.getMinutes();

  // ── Pointer: make, move, stretch ─────────────────────────────────────
  let gridEl;
  let scrollEl;
  let gesture = null; // { kind: 'make' | 'move' | 'start' | 'end', from, event?, moved, pointerType }
  let draft = null;   // { start, end } while making
  let preview = null; // the event as it is being moved or stretched

  function minutesAt(clientY) {
    const box = gridEl.getBoundingClientRect();
    return Math.max(0, Math.min(DAY_MINUTES, ((clientY - box.top) / hourHeight) * 60));
  }

  function startGesture(event, kind, calEvent = null) {
    if (event.button !== undefined && event.button !== 0) return;
    shell?.ensureFocus();
    // On a phone, a finger dragging on the empty day scrolls it; a tap makes
    // an hour. Blocks themselves take the finger, to move or stretch.
    if (kind === 'make' && event.pointerType === 'touch') {
      gesture = { kind, from: minutesAt(event.clientY), y: event.clientY, moved: false, pointerType: 'touch' };
    } else {
      event.preventDefault();
      gesture = { kind, from: minutesAt(event.clientY), y: event.clientY, event: calEvent, moved: false, pointerType: event.pointerType };
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }

  function onMove(event) {
    if (!gesture) return;
    if (Math.abs(event.clientY - gesture.y) > 4) gesture.moved = true;
    if (!gesture.moved) return;
    if (gesture.pointerType === 'touch' && gesture.kind === 'make') return;
    const at = minutesAt(event.clientY);
    if (gesture.kind === 'make') draft = draggedSlot(gesture.from, at);
    else if (gesture.kind === 'move') preview = movedBy(gesture.event, at - gesture.from);
    else preview = resizedTo(gesture.event, gesture.kind, at);
  }

  function stop() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
  }

  async function onUp() {
    stop();
    const g = gesture;
    gesture = null;
    if (!g) return;
    if (g.kind === 'make') {
      if (g.pointerType === 'touch' && g.moved) { draft = null; return; }
      const slot = draft || clickedSlot(g.from);
      draft = null;
      const made = { id: newId(), date: day, start: slot.start, end: slot.end, title: '' };
      save([...events, made]);
      await tick();
      openEditor(made.id);
      return;
    }
    if (!g.moved) {
      preview = null;
      openEditor(g.event.id);
      return;
    }
    const changed = preview;
    preview = null;
    if (changed) save(events.map(e => (e.id === changed.id ? { ...e, start: changed.start, end: changed.end } : e)));
  }

  function onCancel() {
    stop();
    gesture = null;
    draft = null;
    preview = null;
  }

  // ── The editor: name, times to the minute, length, whole day ─────────
  let editing = null; // event id
  let editorPos = { x: 0, y: 0 };
  let startText = '';
  let endText = '';
  let titleInput;

  $: editingEvent = editing ? events.find(e => e.id === editing) || null : null;

  async function openEditor(eventId) {
    const target = events.find(e => e.id === eventId);
    if (!target) return;
    editing = eventId;
    startText = formatTime(target.start);
    endText = formatTime(target.end);
    await tick();
    const el = gridEl?.closest('.cal')?.querySelector(`[data-event="${eventId}"]`) || gridEl?.closest('.cal');
    const box = el?.getBoundingClientRect();
    if (box) {
      editorPos = {
        x: Math.max(8, Math.min(box.left, window.innerWidth - 290)),
        y: Math.max(8, Math.min(box.bottom + 6, window.innerHeight - 330))
      };
    }
    await tick();
    titleInput?.focus();
  }

  function closeEditor() {
    editing = null;
  }

  function edit(change, opts = {}) {
    if (!editingEvent) return;
    save(events.map(e => (e.id === editing ? { ...e, ...change } : e)), opts);
  }

  function typedTime(edge, text) {
    if (!editingEvent) return;
    const next = withTypedTime(editingEvent, edge, text);
    if (next) edit({ start: next.start, end: next.end });
    startText = formatTime((next || editingEvent).start);
    endText = formatTime((next || editingEvent).end);
  }

  function setLength(minutes) {
    if (!editingEvent) return;
    const end = Math.min(DAY_MINUTES, editingEvent.start + minutes);
    edit({ end });
    endText = formatTime(end);
  }

  function removeEditing() {
    const gone = editing;
    editing = null;
    save(events.filter(e => e.id !== gone));
  }

  async function addWholeDay() {
    const made = { id: newId(), date: day, start: 0, end: DAY_MINUTES, title: '', allDay: true };
    save([...events, made]);
    await tick();
    openEditor(made.id);
  }

  function editorKey(event) {
    if (event.key === 'Escape' || (event.key === 'Enter' && event.target.tagName === 'INPUT' && event.target.classList.contains('cal-title-input'))) {
      event.preventDefault();
      closeEditor();
    }
  }

  function closeOutside(event) {
    if (editing && !event.target.closest?.('.cal-editor, .cal-event, .cal-allday-chip')) closeEditor();
  }

  const LENGTHS = [15, 30, 45, 60, 90, 120];

  onMount(() => {
    // Opened on the morning, or on now when it is later, rather than at midnight.
    const hour = Math.max(0, Math.min(23, Math.max(7, now.getHours() - 1)));
    if (scrollEl) scrollEl.scrollTop = hour * hourHeight;
    const timer = setInterval(() => {
      now = new Date();
      today = dateKey(now);
    }, 30000);
    return () => {
      clearInterval(timer);
      stop();
    };
  });

  const top = minutes => (minutes / 60) * hourHeight;
</script>

<svelte:window on:pointerdown={closeOutside} />

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
  pageKeepsHeight
  label={title}
  minWidth={240}
  minHeight={260}
  fields={{ events, title }}
  on:update
  on:delete
  on:focusToggle
>
  <div class="cal" class:big>
    <div class="cal-head">
      <button class="cal-nav" title="Previous day" aria-label="Previous day" on:click|stopPropagation={() => (day = addDays(day, -1))}>‹</button>
      <button class="cal-day-label" title="Back to today" on:click|stopPropagation={() => (day = today)}>
        {day === today ? 'Today · ' : ''}{dayLabel(day, { today })}
      </button>
      <button class="cal-nav" title="Next day" aria-label="Next day" on:click|stopPropagation={() => (day = addDays(day, 1))}>›</button>
    </div>

    <div class="cal-allday">
      {#each shown.allDay as e (e.id)}
        <button class="cal-allday-chip" class:open={editing === e.id} on:click|stopPropagation={() => openEditor(e.id)}>
          {e.title || 'Whole day'}
        </button>
      {/each}
      <button class="cal-allday-add" on:click|stopPropagation={addWholeDay}>＋ Whole day</button>
    </div>

    <div class="cal-scroll" bind:this={scrollEl}>
      <div class="cal-day" style="height: {24 * hourHeight}px;">
        <div class="cal-gutter">
          {#each Array(24) as _, h}
            <span class="cal-hour-label" style="top: {h * hourHeight}px;">{h === 0 ? '' : `${h}:00`}</span>
          {/each}
        </div>
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div class="cal-grid" bind:this={gridEl} on:pointerdown={(e) => { if (e.target === gridEl || e.target.classList.contains('cal-line')) startGesture(e, 'make'); }}>
          {#each Array(24) as _, h}
            <div class="cal-line" style="top: {h * hourHeight}px;"></div>
            <div class="cal-line half" style="top: {h * hourHeight + hourHeight / 2}px;"></div>
          {/each}

          {#each laid as { event: e, column, columns } (e.id)}
            {@const at = preview && preview.id === e.id ? preview : e}
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
              class="cal-event"
              class:open={editing === e.id}
              class:short={at.end - at.start < 30}
              data-event={e.id}
              style="top: {top(at.start)}px; height: {Math.max(top(at.end) - top(at.start), 14)}px; left: calc({(column / columns) * 100}% + 2px); width: calc({100 / columns}% - 4px);"
              on:pointerdown|stopPropagation={(ev) => startGesture(ev, 'move', e)}
            >
              <div class="cal-edge top" on:pointerdown|stopPropagation={(ev) => startGesture(ev, 'start', e)}></div>
              <span class="cal-event-title">{e.title || 'Untitled'}</span>
              <span class="cal-event-time">{formatTime(at.start)}–{formatTime(at.end)}</span>
              <div class="cal-edge bottom" on:pointerdown|stopPropagation={(ev) => startGesture(ev, 'end', e)}></div>
            </div>
          {/each}

          {#if draft}
            <div class="cal-event draft" style="top: {top(draft.start)}px; height: {top(draft.end) - top(draft.start)}px; left: 2px; width: calc(100% - 4px);">
              <span class="cal-event-time">{formatTime(draft.start)}–{formatTime(draft.end)} · {formatLength(draft.end - draft.start)}</span>
            </div>
          {/if}

          {#if day === today}
            <div class="cal-now" style="top: {top(nowMinutes)}px;"></div>
          {/if}
        </div>
      </div>
    </div>
  </div>
</BlockShell>

{#if editingEvent}
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="cal-editor" use:portal style="left: {editorPos.x}px; top: {editorPos.y}px;" on:keydown={editorKey}>
    <input
      class="cal-title-input"
      placeholder="What will you do?"
      bind:this={titleInput}
      value={editingEvent.title}
      on:input={(e) => edit({ title: e.target.value }, { pushToHistory: false })}
      on:change={(e) => edit({ title: e.target.value })}
    />
    <label class="cal-check">
      <input type="checkbox" checked={editingEvent.allDay} on:change={(e) => edit(e.target.checked ? { allDay: true } : { allDay: false, start: 9 * 60, end: 10 * 60 })} />
      Whole day
    </label>
    {#if !editingEvent.allDay}
      <div class="cal-times">
        <input aria-label="Starts" bind:value={startText} on:change={() => typedTime('start', startText)} on:keydown={(e) => e.key === 'Enter' && typedTime('start', startText)} />
        <span>to</span>
        <input aria-label="Ends" bind:value={endText} on:change={() => typedTime('end', endText)} on:keydown={(e) => e.key === 'Enter' && typedTime('end', endText)} />
        <span class="cal-length">{formatLength(editingEvent.end - editingEvent.start)}</span>
      </div>
      <div class="cal-lengths">
        {#each LENGTHS as minutes}
          <button class:on={editingEvent.end - editingEvent.start === minutes} on:click={() => setLength(minutes)}>{formatLength(minutes)}</button>
        {/each}
      </div>
    {/if}
    <div class="cal-editor-foot">
      <button class="cal-delete" on:click={removeEditing}>Delete</button>
      <button class="cal-done" on:click={closeEditor}>Done</button>
    </div>
  </div>
{/if}

<style>
  .cal {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    color: var(--text);
    --line: color-mix(in srgb, var(--text) 14%, transparent);
    --sb-thumb: var(--text);
    --sb-track: transparent;
  }

  .cal-head {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 6px 4px;
  }

  .cal-nav,
  .cal-day-label {
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    border-radius: 6px;
  }

  .cal-nav {
    width: 28px;
    height: 28px;
    font-size: 1.2rem;
    line-height: 1;
  }

  .cal-day-label {
    flex: 1;
    min-width: 0;
    padding: 4px 6px;
    font-weight: 700;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cal.big .cal-day-label {
    font-size: 1.25rem;
  }

  .cal-nav:hover,
  .cal-day-label:hover {
    background: color-mix(in srgb, var(--text) 9%, transparent);
  }

  .cal-allday {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 0 6px 6px 50px;
    border-bottom: 1px solid var(--line);
  }

  .cal-allday-chip,
  .cal-allday-add {
    border-radius: 6px;
    padding: 3px 8px;
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
    color: inherit;
  }

  .cal-allday-chip {
    border: 1px solid color-mix(in srgb, var(--text) 40%, transparent);
    background: color-mix(in srgb, var(--text) 22%, transparent);
    font-weight: 600;
  }

  .cal-allday-add {
    border: 1px dashed color-mix(in srgb, var(--text) 30%, transparent);
    background: transparent;
    opacity: 0.6;
  }

  .cal-allday-add:hover {
    opacity: 1;
  }

  .cal-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .cal-day {
    position: relative;
    display: flex;
  }

  .cal-gutter {
    position: relative;
    flex: none;
    width: 44px;
  }

  .cal-hour-label {
    position: absolute;
    right: 6px;
    transform: translateY(-50%);
    font-size: 0.7rem;
    opacity: 0.55;
    font-variant-numeric: tabular-nums;
  }

  .cal-grid {
    position: relative;
    flex: 1;
    min-width: 0;
    cursor: cell;
    touch-action: pan-y;
  }

  .cal-line {
    position: absolute;
    left: 0;
    right: 0;
    border-top: 1px solid var(--line);
  }

  .cal-line.half {
    border-top-style: dashed;
    opacity: 0.5;
  }

  .cal-event {
    position: absolute;
    box-sizing: border-box;
    padding: 2px 6px;
    border-radius: 6px;
    border-left: 3px solid var(--text);
    background: color-mix(in srgb, var(--text) 24%, transparent);
    overflow: hidden;
    cursor: grab;
    touch-action: none;
    display: flex;
    flex-direction: column;
    font-size: 0.8rem;
    line-height: 1.2;
    user-select: none;
  }

  .cal-event.open {
    background: color-mix(in srgb, var(--text) 36%, transparent);
  }

  .cal-event.short {
    flex-direction: row;
    gap: 6px;
    align-items: center;
    padding-top: 0;
    padding-bottom: 0;
  }

  .cal-event.draft {
    border-left-style: dashed;
    background: color-mix(in srgb, var(--text) 14%, transparent);
    pointer-events: none;
  }

  .cal-event-title {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cal-event-time {
    opacity: 0.7;
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .cal-edge {
    position: absolute;
    left: 0;
    right: 0;
    height: 6px;
    cursor: ns-resize;
  }

  .cal-edge.top { top: 0; }
  .cal-edge.bottom { bottom: 0; }

  .cal-now {
    position: absolute;
    left: 0;
    right: 0;
    border-top: 2px solid var(--calendar-now, #e5484d);
    pointer-events: none;
  }

  .cal-now::before {
    content: '';
    position: absolute;
    left: -5px;
    top: -6px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--calendar-now, #e5484d);
  }

  .cal-editor {
    position: fixed;
    z-index: 1000;
    width: 280px;
    box-sizing: border-box;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    border-radius: 10px;
    border: 1px solid var(--app-border, rgba(255, 255, 255, 0.2));
    background: var(--app-surface, #161616);
    color: var(--app-text, #fff);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  }

  .cal-editor input:not([type='checkbox']) {
    box-sizing: border-box;
    min-width: 0;
    padding: 6px 8px;
    border-radius: 6px;
    border: 1px solid color-mix(in srgb, currentColor 28%, transparent);
    background: color-mix(in srgb, currentColor 6%, transparent);
    color: inherit;
    font: inherit;
  }

  .cal-title-input {
    font-weight: 600;
  }

  .cal-check {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 0.9rem;
  }

  .cal-times {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .cal-times input {
    width: 66px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .cal-length {
    margin-left: auto;
    opacity: 0.6;
    font-size: 0.85rem;
  }

  .cal-lengths {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .cal-lengths button,
  .cal-editor-foot button {
    padding: 4px 9px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, currentColor 28%, transparent);
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.82rem;
    cursor: pointer;
  }

  .cal-lengths button.on {
    background: color-mix(in srgb, currentColor 18%, transparent);
  }

  .cal-editor-foot {
    display: flex;
    justify-content: space-between;
  }

  .cal-delete {
    color: #e5484d !important;
    border-color: color-mix(in srgb, #e5484d 50%, transparent) !important;
  }
</style>
