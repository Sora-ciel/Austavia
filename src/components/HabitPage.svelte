<script>
  /**
   * One habit, looked back over: its streaks, how often it was kept this week,
   * month and year, and a year of days.
   *
   * Agreed 2026-10-26, item 11 of the habit tracker plan: "A page for each
   * habit: a year grid like GitHub's, your completion rate for the week, month
   * and year, current and best streak." The numbers are decided in
   * utils/habitStats.js and utils/habitStreaks.js; this only shows them.
   *
   * A day in the grid can be tapped like a day in the tracker -- the same
   * cycle, the same change (`tap`), so a day further back than the tracker
   * shows can still be put right. Built on the app's one dialog, AppDialog.
   */
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import AppDialog from './AppDialog.svelte';
  import { habitRates, yearGrid } from '../utils/habitStats.js';
  import { habitStreaks } from '../utils/habitStreaks.js';
  import { describeSchedule } from '../utils/habitSchedule.js';

  export let habit;
  export let today = new Date();

  const dispatch = createEventDispatcher();

  $: rates = habitRates(habit, { today });
  $: streaks = habitStreaks(habit, { today });
  $: grid = yearGrid(habit, { today });
  $: schedule = describeSchedule(habit?.schedule) || 'Every day';

  const plural = (n, unit) => `${n} ${n === 1 ? unit.slice(0, -1) : unit}`;
  const percent = r => (r.rate === null ? '–' : `${Math.round(r.rate * 100)}%`);
  const detail = r => (r.rate === null ? 'nothing owed yet' : `${r.done} of ${plural(r.owed, r.unit)}`);

  // A month's short name above the week it starts in.
  const monthLabel = (column, index) => {
    const first = column.days.find(day => day.date.getDate() === 1);
    if (!first && index !== 0) return '';
    return (first ? first.date : column.start).toLocaleDateString(undefined, { month: 'short' });
  };

  const label = day =>
    `${day.date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}` +
    (day.mark === 'done' ? ' -- done' : day.mark === 'missed' ? ' -- missed' : day.mark === 'skipped' ? ' -- skipped' : day.rest ? ' -- a rest day' : '');

  let scroller;
  // Opened at today's end of the year: that is what anybody looks at first.
  onMount(async () => {
    await tick();
    if (scroller) scroller.scrollLeft = scroller.scrollWidth;
  });
</script>

<AppDialog title={habit?.name || 'Habit'} width={760} on:close={() => dispatch('close')}>
  <p class="schedule">{schedule}</p>

  <div class="tiles">
    <div class="tile">
      <span class="big">🔥 {streaks.current}</span>
      <span class="small">{streaks.unit === 'weeks' ? 'weeks' : 'days'} in a row</span>
    </div>
    <div class="tile">
      <span class="big">{streaks.best}</span>
      <span class="small">best, in {streaks.unit}</span>
    </div>
    <div class="tile">
      <span class="big">{percent(rates.week)}</span>
      <span class="small">this week · {detail(rates.week)}</span>
    </div>
    <div class="tile">
      <span class="big">{percent(rates.month)}</span>
      <span class="small">this month · {detail(rates.month)}</span>
    </div>
    <div class="tile">
      <span class="big">{percent(rates.year)}</span>
      <span class="small">this year · {detail(rates.year)}</span>
    </div>
  </div>

  <div class="year" bind:this={scroller}>
    <div class="year-grid" style="--weeks: {grid.length}">
      {#each grid as column, index}
        <div class="month">{monthLabel(column, index)}</div>
      {/each}
      {#each grid as column}
        <div class="week">
          {#each column.days as day (day.key)}
            <button
              type="button"
              class="cell {day.mark || 'none'}"
              class:rest={day.rest && day.mark !== 'done'}
              class:future={day.future}
              class:today={day.isToday}
              disabled={day.future}
              title={label(day)}
              aria-label={label(day)}
              on:click={() => dispatch('tap', day.key)}
            ></button>
          {/each}
        </div>
      {/each}
    </div>
  </div>

  <p class="legend">
    <span class="cell done"></span> done
    <span class="cell missed"></span> missed
    <span class="cell skipped"></span> skipped
    <span class="cell rest"></span> rest day
    · tap a day to change it
  </p>

  <div class="dialog-actions">
    <button type="button" class="dialog-btn" on:click={() => dispatch('close')}>Close</button>
  </div>
</AppDialog>

<style>
  .schedule {
    margin: -8px 0 14px;
    opacity: 0.7;
    font-size: 0.85rem;
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
    gap: 8px;
    margin-bottom: 16px;
  }

  /* Surfaces take the dialog's background tinted with its writing, per
     CLAUDE.md. */
  .tile {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 12px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--dlg-text, currentColor) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--dlg-text, currentColor) 18%, transparent);
  }

  .big {
    font-size: 1.35rem;
    font-weight: 700;
  }

  .small {
    font-size: 0.72rem;
    opacity: 0.7;
  }

  .year {
    overflow-x: auto;
    padding-bottom: 6px;
    /* Its scrollbar in the writing's colour, as the panel's is. */
    scrollbar-color: var(--sb-thumb) transparent;
  }

  .year-grid {
    display: grid;
    grid-template-columns: repeat(var(--weeks), 13px);
    grid-auto-flow: row;
    column-gap: 3px;
    row-gap: 4px;
    width: max-content;
  }

  .month {
    font-size: 0.62rem;
    opacity: 0.7;
    height: 12px;
    white-space: nowrap;
    overflow: visible;
  }

  .week {
    display: grid;
    grid-template-rows: repeat(7, 13px);
    row-gap: 3px;
  }

  .cell {
    display: inline-block;
    width: 13px;
    height: 13px;
    padding: 0;
    border-radius: 3px;
    border: 1px solid color-mix(in srgb, var(--dlg-text, currentColor) 22%, transparent);
    background: color-mix(in srgb, var(--dlg-text, currentColor) 6%, transparent);
    cursor: pointer;
    box-sizing: border-box;
  }

  .cell.done {
    background: var(--dlg-text, currentColor);
    border-color: var(--dlg-text, currentColor);
  }

  .cell.missed {
    background: transparent;
    border-color: color-mix(in srgb, var(--dlg-text, currentColor) 70%, transparent);
  }

  .cell.skipped {
    background: transparent;
    border-style: dashed;
  }

  .cell.rest {
    opacity: 0.35;
  }

  .cell.future {
    opacity: 0.12;
    cursor: default;
  }

  .cell.today {
    outline: 2px solid var(--dlg-text, currentColor);
    outline-offset: 1px;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
    opacity: 0.8;
    margin: 10px 0 14px;
  }

  .legend .cell {
    cursor: default;
    margin-left: 6px;
  }
</style>
