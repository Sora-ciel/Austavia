<script>
  /**
   * Controls layout: where the controls are on this device, as a page of its
   * own over the whole mode area.
   *
   * Asked 2026-11-10: "In advanced settings we'll have another button that
   * will be called controls layout where for phone and pc we can change the
   * layout and basically go back to the way things were before our update
   * ... saved per device for now", and then: "the layout part should be a
   * page that takes up the whole mode space because it will have a lot of
   * settings". The rules are utils/controlsLayout.js; this only shows them.
   */
  import { createEventDispatcher } from 'svelte';
  import ModeIcon from '../components/ModeIcon.svelte';
  import { normalizeLayout, orderedModes, movedMode, withModeHidden } from '../utils/controlsLayout.js';

  export let layout = { phone: 'bottom', computer: 'rail', order: [], hidden: [], statusBar: 'shown' };
  export let allModes = [];
  export let modeLabels = {};

  const dispatch = createEventDispatcher();
  const set = next => dispatch('change', normalizeLayout(next));

  $: modes = orderedModes(allModes, layout);

  const PHONE = [
    { id: 'bottom', title: 'The bar at the bottom', note: 'Within reach of a thumb, the same height as before. The modes in a sheet; slide along the bar to change mode.' },
    { id: 'top', title: 'The bar at the top', note: 'As it was before.' }
  ];
  // Two ways to change mode from the bar, to try both (asked 2026-11-10).
  const GESTURES = [
    { id: 'strip', title: 'Slide along the bar', note: 'Every mode in a strip above the bar, each at its own place; back where you started keeps the mode you are in.' },
    { id: 'sheet', title: 'Slide up from the bar', note: 'Every mode rises from the bar; let go on the one you want.' }
  ];
  const STATUS = [
    { id: 'shown', title: 'Shown', note: 'The time and battery stay; the mode reaches up under them, its writing kept clear.' },
    { id: 'hidden', title: 'Hidden', note: 'More room. A swipe down from the top edge shows them for a moment.' }
  ];
  const COMPUTER = [
    { id: 'rail', title: 'Modes in a column on the left', note: 'Every mode one click away; Ctrl+1 to Ctrl+9.' },
    { id: 'auto', title: 'The column, hidden until needed', note: 'Out of the way; it slides out when the pointer reaches the left edge.' },
    { id: 'top', title: 'Modes in the bar only', note: 'As it was before.' }
  ];
</script>

<div class="layout-page" role="dialog" aria-label="Controls layout">
  <header class="layout-head">
    <button class="layout-back" on:click={() => dispatch('close')}>‹ Back</button>
    <h2>Controls layout</h2>
  </header>
  <p class="layout-intro">Where the controls are on this device. Kept on this device; another phone or computer keeps its own.</p>

  <div class="layout-grid">
    <section class="layout-card">
      <h3>Phone</h3>
      <div class="choice-group" role="radiogroup" aria-label="The bar on a phone">
        {#each PHONE as option}
          <button class="choice" class:on={layout.phone === option.id} role="radio" aria-checked={layout.phone === option.id} on:click={() => set({ ...layout, phone: option.id })}>
            <span class="choice-title">{option.title}</span>
            <span class="choice-note">{option.note}</span>
          </button>
        {/each}
      </div>
      <h4>Changing mode with a finger on the bar</h4>
      <div class="choice-group" role="radiogroup" aria-label="Changing mode from the bar">
        {#each GESTURES as option}
          <button class="choice" class:on={layout.modeGesture === option.id} role="radio" aria-checked={layout.modeGesture === option.id} on:click={() => set({ ...layout, modeGesture: option.id })}>
            <span class="choice-title">{option.title}</span>
            <span class="choice-note">{option.note}</span>
          </button>
        {/each}
      </div>
      <h4>The phone's status bar</h4>
      <div class="choice-group" role="radiogroup" aria-label="The phone's status bar">
        {#each STATUS as option}
          <button class="choice" class:on={layout.statusBar === option.id} role="radio" aria-checked={layout.statusBar === option.id} on:click={() => set({ ...layout, statusBar: option.id })}>
            <span class="choice-title">{option.title}</span>
            <span class="choice-note">{option.note}</span>
          </button>
        {/each}
      </div>
    </section>

    <section class="layout-card">
      <h3>Computer</h3>
      <div class="choice-group" role="radiogroup" aria-label="The modes on a computer">
        {#each COMPUTER as option}
          <button class="choice" class:on={layout.computer === option.id} role="radio" aria-checked={layout.computer === option.id} on:click={() => set({ ...layout, computer: option.id })}>
            <span class="choice-title">{option.title}</span>
            <span class="choice-note">{option.note}</span>
          </button>
        {/each}
      </div>
    </section>

    <section class="layout-card">
      <h3>Modes</h3>
      <p class="layout-note">Their order in the column, the sheet and the slide, and which are shown.</p>
      <ul class="mode-list">
        {#each modes as id, i (id)}
          <li class:hidden-mode={layout.hidden.includes(id)}>
            <label class="mode-name">
              <input type="checkbox" checked={!layout.hidden.includes(id)} on:change={(e) => set(withModeHidden(allModes, layout, id, !e.target.checked))} />
              <ModeIcon mode={id} size={20} />
              <span>{modeLabels[id] || id}</span>
            </label>
            <button class="move" aria-label="Move {modeLabels[id] || id} up" disabled={i === 0} on:click={() => set(movedMode(allModes, layout, id, -1))}>↑</button>
            <button class="move" aria-label="Move {modeLabels[id] || id} down" disabled={i === modes.length - 1} on:click={() => set(movedMode(allModes, layout, id, 1))}>↓</button>
          </li>
        {/each}
      </ul>
    </section>
  </div>
</div>

<style>
  /* Over the whole mode area, in the app's colours. */
  .layout-page {
    position: absolute;
    inset: 0;
    z-index: 950;
    overflow-y: auto;
    padding: calc(16px + var(--safe-top, 0px)) 18px 40px;
    box-sizing: border-box;
    background: var(--app-bg, #0b0b0d);
    color: var(--app-text, #fff);
    --sb-thumb: var(--app-text, #fff);
    --sb-track: var(--app-bg, #0b0b0d);
  }

  /* The way back at the left edge of the page, as in the app's other pages
     (asked 2026-11-10). */
  .layout-head {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .layout-head h2 {
    margin: 0;
    font-size: 1.4rem;
  }

  .layout-back {
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid var(--app-border, color-mix(in srgb, currentColor 30%, transparent));
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .layout-intro,
  .layout-note {
    max-width: 980px;
    margin: 8px auto 0;
    opacity: 0.7;
    font-size: 0.9rem;
  }

  .layout-note {
    margin: 0 0 10px;
  }

  .layout-grid {
    max-width: 980px;
    margin: 18px auto 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 14px;
    align-items: start;
  }

  .layout-card {
    padding: 16px;
    border-radius: 14px;
    border: 1px solid var(--app-border, color-mix(in srgb, currentColor 18%, transparent));
    background: var(--app-surface, color-mix(in srgb, currentColor 5%, transparent));
  }

  .layout-card h3 {
    margin: 0 0 12px;
    font-size: 1.05rem;
  }

  .layout-card h4 {
    margin: 16px 0 8px;
    font-size: 0.9rem;
    opacity: 0.8;
  }

  .choice-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .choice {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .choice.on {
    border-color: currentColor;
    box-shadow: inset 0 0 0 1px currentColor;
    background: color-mix(in srgb, currentColor 8%, transparent);
  }

  .choice-title {
    font-weight: 600;
  }

  .choice-note {
    font-size: 0.82rem;
    opacity: 0.7;
  }

  .mode-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .mode-list li {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 4px 4px 8px;
    border-radius: 10px;
  }

  .mode-list li:hover {
    background: color-mix(in srgb, currentColor 5%, transparent);
  }

  .mode-list li.hidden-mode .mode-name {
    opacity: 0.45;
  }

  .mode-name {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
  }

  .move {
    width: 32px;
    height: 32px;
    padding: 0;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .move:disabled {
    opacity: 0.25;
    cursor: default;
  }
</style>
