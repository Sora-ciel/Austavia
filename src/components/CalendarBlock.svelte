<script>
  /**
   * A calendar: hours down the side and time blocks of what will be done in
   * them, a day or 7 days at a time.
   *
   * Asked 2026-11-10: "put time blocks easily of what you will do at a certain
   * hour ... maybe 12min till the next hour. maybe it's a clean 1h block. or
   * maybe 30. be able to have the day blocked ... and you will be able to see
   * the calendar on other modes." A block first (CLAUDE.md, "a block works on
   * its own"): on the Canvas, in Simple Note, on a page, and full size in
   * Calendar mode, which only mounts it.
   *
   * Then, the same day: a 7-day view; Ctrl and the wheel to change the height
   * of an hour, kept per device; a colour for each block, the last one chosen
   * used for the next; blocks outlined all round in the writing's colour; the
   * pop-ups as opaque as the right controls' panel.
   *
   * Making a block: click an empty hour for an hour; drag down a day for any
   * length, to 5 minutes; then type a name. Its edges stretch it, its middle
   * moves it -- to another day too, in the 7-day view -- and a press opens it
   * to type the times to the minute, pick a length and a colour, block the
   * whole day, or delete it. The rules are utils/calendar.js; how it is shown
   * on this device is utils/calendarView.js.
   */
  import { onMount, tick } from 'svelte';
  import BlockShell from './BlockShell.svelte';
  import ColorField from './ColorField.svelte';
  import { portal } from '../utils/portal.js';
  import {
    DAY_MINUTES, dateKey, addDays, dayLabel, eventsOn, layoutDay, normalizeEvents,
    clickedSlot, draggedSlot, movedBy, resizedTo, withTypedTime, formatTime, formatLength,
    weekOf, shortDayLabel, weekLabel, onDay
  } from '../utils/calendar.js';
  import { readHourHeight, writeHourHeight, zoomedHour, readView, writeView } from '../utils/calendarView.js';

  export let id;
  export let initialPosition = { x: 100, y: 100 };
  export let initialSize = { width: 340, height: 480 };
  export let initialBgColor = '#000000';
  export let initialTextColor = '#ffffff';
  export let initialEvents = [];
  export let initialTitle = 'Calendar';
  /** The colour the next block is made in: the last one chosen (asked 2026-11-10). */
  export let initialNextColor = '';
  export let focused = false;
  export let canvasScale = 1;
  export let placement = 'canvas';
  /** Drawn full size by Calendar mode. */
  export let big = false;

  const storage = typeof localStorage !== 'undefined' ? localStorage : null;

  let shell;
  let events = normalizeEvents(initialEvents);
  let title = initialTitle || 'Calendar';
  let nextColor = initialNextColor || '';

  let day = dateKey();
  let today = dateKey();
  let view = readView(storage, id);
  let hourHeight = readHourHeight(storage, big);

  $: days = view === 'week' ? weekOf(day) : [day];
  $: columns = days.map(key => {
    const on = eventsOn(events, key);
    return { key, allDay: on.allDay, laid: layoutDay(on.timed) };
  });

  function save(next, opts = {}, extra = {}) {
    events = normalizeEvents(next);
    shell?.commit(['events', ...Object.keys(extra)], opts, { events, title, nextColor, ...extra });
  }

  const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `e${Date.now()}${Math.random()}`);

  function setView(next) {
    view = next;
    writeView(storage, id, next);
  }

  function step(direction) {
    day = addDays(day, direction * (view === 'week' ? 7 : 1));
  }

  // ── Ctrl and the wheel: the height of an hour, kept on this device ───
  function onWheel(event) {
    if (!event.ctrlKey) return;
    event.preventDefault();
    // The minute under the pointer stays under it while the hours grow.
    const box = scrollEl.getBoundingClientRect();
    const offset = event.clientY - box.top;
    const minuteThere = ((scrollEl.scrollTop + offset - headerHeight()) / hourHeight) * 60;
    hourHeight = zoomedHour(hourHeight, event.deltaY);
    writeHourHeight(storage, big, hourHeight);
    tick().then(() => {
      scrollEl.scrollTop = (minuteThere / 60) * hourHeight + headerHeight() - offset;
    });
  }

  const headerHeight = () => 0;

  // ── The time now, as a line across today ─────────────────────────────
  let now = new Date();
  $: nowMinutes = now.getHours() * 60 + now.getMinutes();

  // ── Pointer: make, move, stretch ─────────────────────────────────────
  let scrollEl;
  let dayHeadEl;
  let gridEls = [];
  let gesture = null; // { kind, from, y, dayKey, event, moved, pointerType }
  let draft = null;   // { dayKey, start, end } while making
  let preview = null; // the event as it is being moved or stretched

  function minutesAt(clientY) {
    const box = gridEls[0]?.getBoundingClientRect();
    if (!box) return 0;
    return Math.max(0, Math.min(DAY_MINUTES, ((clientY - box.top) / hourHeight) * 60));
  }

  /** The day under a point, in the 7-day view; the one shown otherwise. */
  function dayAt(clientX) {
    for (let i = 0; i < gridEls.length; i++) {
      const box = gridEls[i]?.getBoundingClientRect();
      if (box && clientX >= box.left && clientX < box.right) return days[i];
    }
    return null;
  }

  function startGesture(event, kind, dayKey, calEvent = null) {
    if (event.button !== undefined && event.button !== 0) return;
    shell?.ensureFocus();
    // On a phone a finger dragging on the empty day scrolls it, and a tap
    // makes an hour; the blocks themselves take the finger.
    if (!(kind === 'make' && event.pointerType === 'touch')) event.preventDefault();
    gesture = { kind, from: minutesAt(event.clientY), y: event.clientY, x: event.clientX, dayKey, event: calEvent, moved: false, pointerType: event.pointerType };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }

  function onMove(event) {
    if (!gesture) return;
    if (Math.abs(event.clientY - gesture.y) > 4 || Math.abs(event.clientX - gesture.x) > 4) gesture.moved = true;
    if (!gesture.moved) return;
    if (gesture.pointerType === 'touch' && gesture.kind === 'make') return;
    const at = minutesAt(event.clientY);
    if (gesture.kind === 'make') {
      const slot = draggedSlot(gesture.from, at);
      draft = slot ? { dayKey: gesture.dayKey, ...slot } : null;
    } else if (gesture.kind === 'move') {
      const moved = movedBy(gesture.event, at - gesture.from);
      preview = onDay(moved, dayAt(event.clientX) || gesture.event.date);
    } else {
      preview = resizedTo(gesture.event, gesture.kind, at);
    }
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
      const made = { id: newId(), date: g.dayKey, start: slot.start, end: slot.end, title: '', color: nextColor };
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
    if (changed) save(events.map(e => (e.id === changed.id ? { ...e, date: changed.date, start: changed.start, end: changed.end } : e)));
  }

  function onCancel() {
    stop();
    gesture = null;
    draft = null;
    preview = null;
  }

  // ── The editor: name, times to the minute, length, colour, whole day ──
  let editing = null; // event id
  let editorPos = { x: 0, y: 0 };
  let startText = '';
  let endText = '';
  let titleInput;
  let calEl;

  $: editingEvent = editing ? events.find(e => e.id === editing) || null : null;

  async function openEditor(eventId) {
    const target = events.find(e => e.id === eventId);
    if (!target) return;
    editing = eventId;
    startText = formatTime(target.start);
    endText = formatTime(target.end);
    await tick();
    const el = calEl?.querySelector(`[data-event="${eventId}"]`) || calEl;
    const box = el?.getBoundingClientRect();
    if (box) {
      editorPos = {
        x: Math.max(8, Math.min(box.left, window.innerWidth - 290)),
        y: Math.max(8, Math.min(box.bottom + 6, window.innerHeight - 380))
      };
    }
    await tick();
    titleInput?.focus();
  }

  function closeEditor() {
    editing = null;
  }

  function edit(change, opts = {}, extra = {}) {
    if (!editingEvent) return;
    save(events.map(e => (e.id === editing ? { ...e, ...change } : e)), opts, extra);
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

  /** A colour for the block being edited, and for the next one made. */
  function setColor(color, opts = {}) {
    nextColor = color;
    edit({ color }, opts, { nextColor: color });
  }

  function removeEditing() {
    const gone = editing;
    editing = null;
    save(events.filter(e => e.id !== gone));
  }

  async function addWholeDay(key) {
    const made = { id: newId(), date: key, start: 0, end: DAY_MINUTES, title: '', allDay: true, color: nextColor };
    save([...events, made]);
    await tick();
    openEditor(made.id);
  }

  function editorKey(event) {
    if (event.key === 'Escape' || (event.key === 'Enter' && event.target.classList?.contains('cal-title-input'))) {
      event.preventDefault();
      closeEditor();
    }
  }

  function closeOutside(event) {
    if (editing && !event.target.closest?.('.cal-editor, .cal-event, .cal-allday-chip, .color-popover, .cp-popover')) closeEditor();
  }

  const LENGTHS = [15, 30, 45, 60, 90, 120];
  // A few to pick in one press; the field beside them for any other.
  const SWATCHES = ['', '#e5484d', '#f76b15', '#ffc53d', '#46a758', '#12a594', '#3e63dd', '#8e4ec6', '#d6409f'];

  onMount(() => {
    // Opened on the morning, or on now when it is later, rather than at midnight.
    const hour = Math.max(7, now.getHours() - 1);
    if (scrollEl) scrollEl.scrollTop = Math.min(23, hour) * hourHeight;
    const timer = setInterval(() => {
      now = new Date();
      today = dateKey(now);
    }, 30000);
    return () => {
      clearInterval(timer);
      stop();
    };
  });

  // Reactive, not a plain function: a template only redraws what it reads,
  // and a function that reads hourHeight inside it is not redrawn when the
  // height changes. Blocks stayed where they were in pixels while the hours
  // grew under them, so something at 11:00 showed at 6:00 (reported
  // 2026-11-10, after Ctrl and the wheel were added).
  $: top = minutes => (minutes / 60) * hourHeight;
  // A block's own colour as its fill, with the writing's colour round it.
  const fill = color => (color
    ? `color-mix(in srgb, ${color} 55%, transparent)`
    : 'color-mix(in srgb, var(--text) 18%, transparent)');
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
  fields={{ events, title, nextColor }}
  on:update
  on:delete
  on:focusToggle
>
  <div class="cal" class:big class:week={view === 'week'} bind:this={calEl}>
    <!-- The arrows either side of the date, at its height (asked 2026-11-10:
         "the arrows to change days or week are not inline with the date"). -->
    <div class="cal-head">
      <button class="cal-nav" title={view === 'week' ? 'Previous week' : 'Previous day'} aria-label="Previous" on:click|stopPropagation={() => step(-1)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
      </button>
      <button class="cal-day-label" title="Back to today" on:click|stopPropagation={() => (day = today)}>
        {#if view === 'week'}
          {weekLabel(days)}
        {:else}
          {day === today ? 'Today · ' : ''}{dayLabel(day, { today })}
        {/if}
      </button>
      <button class="cal-nav" title={view === 'week' ? 'Next week' : 'Next day'} aria-label="Next" on:click|stopPropagation={() => step(1)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
      </button>
      <span class="cal-head-gap"></span>
      <div class="cal-views" role="group" aria-label="Days shown">
        <button class:on={view === 'day'} on:click|stopPropagation={() => setView('day')}>Day</button>
        <button class:on={view === 'week'} on:click|stopPropagation={() => setView('week')}>7 days</button>
      </div>
    </div>

    <!-- The days' names and whole-day blocks stay above the hours rather
         than scrolling over them, so they need no background of their own
         (asked 2026-11-10: the 7-day row's background "destroys the
         styling"). -->
    {#if view === 'week'}
      <div class="cal-day-heads" bind:this={dayHeadEl}>
        <div class="cal-gutter-space"></div>
        {#each columns as col (col.key)}
          <div class="cal-day-head" class:today={col.key === today}>
            <button class="cal-day-name" on:click|stopPropagation={() => { day = col.key; setView('day'); }}>{shortDayLabel(col.key)}</button>
            {#each col.allDay as e (e.id)}
              <button class="cal-allday-chip" style="background: {fill(e.color)};" class:open={editing === e.id} on:click|stopPropagation={() => openEditor(e.id)}>{e.title || 'Whole day'}</button>
            {/each}
            <button class="cal-allday-add small" title="Block the whole day" on:click|stopPropagation={() => addWholeDay(col.key)}>＋</button>
          </div>
        {/each}
      </div>
    {:else}
      <div class="cal-allday">
        {#each columns[0].allDay as e (e.id)}
          <button class="cal-allday-chip" style="background: {fill(e.color)};" class:open={editing === e.id} on:click|stopPropagation={() => openEditor(e.id)}>{e.title || 'Whole day'}</button>
        {/each}
        <button class="cal-allday-add" on:click|stopPropagation={() => addWholeDay(day)}>＋ Whole day</button>
      </div>
    {/if}

    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="cal-scroll" bind:this={scrollEl} on:wheel={onWheel}>
      <div class="cal-day" style="height: {24 * hourHeight}px;">
        <div class="cal-gutter">
          {#each Array(24) as _, h}
            <span class="cal-hour-label" style="top: {h * hourHeight}px;">{h === 0 ? '' : `${h}:00`}</span>
          {/each}
        </div>
        {#each columns as col, i (col.key)}
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div
            class="cal-grid"
            class:today={view === 'week' && col.key === today}
            bind:this={gridEls[i]}
            on:pointerdown={(e) => { if (e.target === gridEls[i] || e.target.classList.contains('cal-line')) startGesture(e, 'make', col.key); }}
          >
            {#each Array(24) as _, h}
              <div class="cal-line" style="top: {h * hourHeight}px;"></div>
              <div class="cal-line half" style="top: {h * hourHeight + hourHeight / 2}px;"></div>
            {/each}

            {#each col.laid as { event: e, column, columns: shared } (e.id)}
              {#if !(preview && preview.id === e.id && preview.date !== col.key)}
                {@const at = preview && preview.id === e.id ? preview : e}
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <div
                  class="cal-event"
                  class:open={editing === e.id}
                  class:short={at.end - at.start < 30 || top(at.end) - top(at.start) < 30}
                  data-event={e.id}
                  style="top: {top(at.start)}px; height: {Math.max(top(at.end) - top(at.start), 14)}px; left: calc({(column / shared) * 100}% + 2px); width: calc({100 / shared}% - 4px); background: {fill(e.color)};"
                  on:pointerdown|stopPropagation={(ev) => startGesture(ev, 'move', col.key, e)}
                >
                  <div class="cal-edge top" on:pointerdown|stopPropagation={(ev) => startGesture(ev, 'start', col.key, e)}></div>
                  <span class="cal-event-title">{e.title || 'Untitled'}</span>
                  <span class="cal-event-time">{formatTime(at.start)}–{formatTime(at.end)}</span>
                  <div class="cal-edge bottom" on:pointerdown|stopPropagation={(ev) => startGesture(ev, 'end', col.key, e)}></div>
                </div>
              {/if}
            {/each}

            <!-- A block being moved onto this day from another. -->
            {#if preview && preview.date === col.key && !col.laid.some(l => l.event.id === preview.id)}
              <div class="cal-event moving" style="top: {top(preview.start)}px; height: {Math.max(top(preview.end) - top(preview.start), 14)}px; left: 2px; width: calc(100% - 4px); background: {fill(preview.color)};">
                <span class="cal-event-title">{preview.title || 'Untitled'}</span>
              </div>
            {/if}

            {#if draft && draft.dayKey === col.key}
              <div class="cal-event draft" style="top: {top(draft.start)}px; height: {top(draft.end) - top(draft.start)}px; left: 2px; width: calc(100% - 4px);">
                <span class="cal-event-time">{formatTime(draft.start)}–{formatTime(draft.end)} · {formatLength(draft.end - draft.start)}</span>
              </div>
            {/if}

            {#if col.key === today}
              <div class="cal-now" style="top: {top(nowMinutes)}px;">
                <span class="cal-now-time">{formatTime(nowMinutes)}</span>
              </div>
            {/if}
          </div>
        {/each}
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
    <div class="cal-colors" role="group" aria-label="Colour">
      {#each SWATCHES as color}
        <button
          class="cal-swatch"
          class:on={(editingEvent.color || '') === color}
          title={color ? color : 'The writing\'s colour'}
          aria-label={color ? `Colour ${color}` : 'No colour of its own'}
          style={color ? `background: ${color};` : ''}
          on:click={() => setColor(color)}
        ></button>
      {/each}
      <ColorField
        value={editingEvent.color || '#3e63dd'}
        title="Any colour"
        on:input={(e) => setColor(e.detail, { pushToHistory: false })}
        on:change={(e) => setColor(e.detail)}
      />
    </div>
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
    /* The line between the days and the hours, thicker than the hours' own
       so it reads as a different thing (asked 2026-11-10). */
    --cal-divide: 2px solid color-mix(in srgb, var(--text) 55%, transparent);
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
    border-radius: 8px;
  }

  .cal-nav {
    width: 30px;
    height: 30px;
    padding: 0;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cal-nav svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .cal-day-label {
    flex: 0 1 auto;
    min-width: 0;
    height: 30px;
    padding: 0 8px;
    font-weight: 700;
    line-height: 30px;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cal-head-gap {
    flex: 1;
  }

  .cal.big .cal-day-label {
    font-size: 1.25rem;
  }

  .cal-nav:hover,
  .cal-day-label:hover {
    background: color-mix(in srgb, var(--text) 9%, transparent);
  }

  .cal-views {
    display: flex;
    flex: none;
    border: 1px solid color-mix(in srgb, var(--text) 30%, transparent);
    border-radius: 999px;
    overflow: hidden;
  }

  .cal-views button {
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.78rem;
    padding: 3px 10px;
    cursor: pointer;
    opacity: 0.6;
  }

  .cal-views button.on {
    opacity: 1;
    background: color-mix(in srgb, var(--text) 16%, transparent);
  }

  .cal-allday {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 0 6px 6px 50px;
    border-bottom: var(--cal-divide);
  }

  .cal-allday-chip,
  .cal-allday-add {
    border-radius: 999px;
    padding: 3px 8px;
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
    color: inherit;
  }

  .cal-allday-chip {
    border: 1.5px solid var(--text);
    font-weight: 600;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cal-allday-add {
    border: 1px dashed color-mix(in srgb, var(--text) 30%, transparent);
    background: transparent;
    opacity: 0.6;
  }

  .cal-allday-add.small {
    padding: 0 6px;
    align-self: flex-start;
  }

  .cal-allday-add:hover {
    opacity: 1;
  }

  .cal-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
  }

  /* Above the hours, outside their scroll, with room kept for the hours'
     scrollbar so the days line up with their columns. */
  .cal-day-heads {
    flex: none;
    display: flex;
    overflow-y: hidden;
    scrollbar-gutter: stable;
    border-bottom: var(--cal-divide);
  }

  .cal-gutter-space {
    flex: none;
    width: 44px;
  }

  .cal-day-head {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 2px 2px 5px;
  }

  .cal-day-name {
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.8rem;
    font-weight: 600;
    padding: 2px 4px;
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
    opacity: 0.75;
  }

  .cal-day-head.today .cal-day-name {
    opacity: 1;
    text-decoration: underline;
    text-underline-offset: 3px;
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
    flex: 1 1 0;
    min-width: 0;
    cursor: cell;
    touch-action: pan-y;
  }

  .cal.week .cal-grid + .cal-grid {
    border-left: 1px solid var(--line);
  }

  .cal-grid.today {
    background: color-mix(in srgb, var(--text) 4%, transparent);
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

  /* Outlined all round in the writing's colour, filled with its own
     (asked 2026-11-10). */
  .cal-event {
    position: absolute;
    box-sizing: border-box;
    padding: 3px 7px;
    border-radius: 10px;
    border: 1.5px solid var(--text);
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
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--text) 45%, transparent);
  }

  .cal-event.short {
    flex-direction: row;
    gap: 6px;
    align-items: center;
    padding-top: 0;
    padding-bottom: 0;
  }

  .cal-event.draft {
    border-style: dashed;
    background: color-mix(in srgb, var(--text) 12%, transparent);
    pointer-events: none;
  }

  .cal-event.moving {
    opacity: 0.75;
    pointer-events: none;
  }

  .cal-event-title {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cal-event-time {
    opacity: 0.75;
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

  /* Now, in the app's own colours rather than an agenda's red (asked
     2026-11-10): a line in the writing's colour, and the time on a pill of
     it, written in the colour behind -- the writing's opposite. */
  .cal-now {
    position: absolute;
    left: 0;
    right: 0;
    /* Thicker than a block's outline, which is the same colour, so it is not
       taken for one (asked 2026-11-10). */
    border-top: 3px solid var(--calendar-now, var(--text));
    pointer-events: none;
    z-index: 2;
  }

  /* In the hours' margin on a day; inside the column among 7 days, where
     the margin belongs to Monday. */
  .cal.week .cal-now-time {
    left: 2px;
  }

  .cal-now-time {
    position: absolute;
    left: -46px;
    top: -10px;
    padding: 1px 5px;
    border-radius: 999px;
    background: var(--calendar-now, var(--text));
    color: var(--canvas-inner-bg, #000);
    font-size: 0.68rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1.4;
  }

  /* As the right controls' panel: the same colour and opacity (asked
     2026-11-10, "it is not opaque enough"). */
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
    border: 1px solid var(--right-border-color, #444444);
    background: var(--app-popup-bg, var(--right-panel-bg, #222222));
    --sb-track: var(--app-popup-bg, var(--right-panel-bg, #222222));
    color: var(--right-text-color, #ffffff);
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

  .cal-colors {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
  }

  .cal-swatch {
    width: 20px;
    height: 20px;
    padding: 0;
    border-radius: 50%;
    border: 1.5px solid color-mix(in srgb, currentColor 45%, transparent);
    background: transparent;
    cursor: pointer;
  }

  .cal-swatch.on {
    border-color: currentColor;
    box-shadow: 0 0 0 2px color-mix(in srgb, currentColor 40%, transparent);
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
    color: var(--danger-color, #e5484d) !important;
    border-color: color-mix(in srgb, var(--danger-color, #e5484d) 50%, transparent) !important;
  }
</style>
