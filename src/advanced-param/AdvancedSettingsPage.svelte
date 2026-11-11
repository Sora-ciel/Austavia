<script>
  /**
   * The Advanced settings page of the Settings panel.
   *
   * ## What was asked for
   *
   * "The text size thing should have been in the settings area, after clicking
   * an advanced setting button that changed the setting area page and showed
   * other settings, and that would be the first setting we add in there."
   *
   * Text size was first put on the control bar next to Bg, which was the wrong
   * reading of "the settings that are in the controls": the bar is where you
   * reach for the things you do, and a size you set once and live with is not
   * one of them. It also cost a button on a bar that had just been made to fit.
   *
   * So this is a page rather than a panel, it replaces the settings list rather
   * than floating over it, and it is built to hold the settings that come after
   * this one instead of only the one that is here.
   */
  import { createEventDispatcher } from 'svelte';
  import ModeIcon from '../components/ModeIcon.svelte';
  import { normalizeLayout, orderedModes, movedMode, withModeHidden } from '../utils/controlsLayout.js';
  import {
    DEFAULT_SCALES,
    MIN_SCALE,
    MAX_SCALE,
    deviceFor
  } from '../utils/typeScale.js';

  export let typeScales = DEFAULT_SCALES;
  /** The replaced copies kept for the folder that is open, newest first. */
  export let folderSnapshots = [];
  export let currentSaveName = '';
  /** How the controls are laid out on this device (utils/controlsLayout.js). */
  export let controlsLayout = { phone: 'bottom', computer: 'rail', order: [], hidden: [] };
  /** Every mode, by id, and its name. */
  export let allModes = [];
  export let modeLabels = {};

  const dispatch = createEventDispatcher();

  // ── Controls layout (asked 2026-11-10) ─────────────────────────────────
  // "for phone and pc we can change the layout and basically go back to the
  // way things were before our update ... saved per device for now."
  let showLayout = false;
  $: layoutModes = orderedModes(allModes, controlsLayout);
  const setLayout = next => dispatch('controlsLayoutChange', normalizeLayout(next));

  // Which of the two numbers this window is currently using, so the page can
  // mark it. Read from the window rather than assumed, and the same breakpoint
  // the module decides on.
  let viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth;
  $: liveDevice = deviceFor({ width: viewportWidth });

  const percentAlong = (value) => ((value - MIN_SCALE) / (MAX_SCALE - MIN_SCALE)) * 100;

  function setScale(device, value) {
    dispatch('typeScaleChange', { device, value: Number(value) });
  }

  function resetScales() {
    setScale('desktop', DEFAULT_SCALES.desktop);
    setScale('mobile', DEFAULT_SCALES.mobile);
  }

  $: isDefaultPair =
    typeScales.desktop === DEFAULT_SCALES.desktop &&
    typeScales.mobile === DEFAULT_SCALES.mobile;

  // The wording lives here rather than in the module, which is the only place
  // that knows nothing about a language or the width it has to fit.
  const when = (takenAt) =>
    new Date(Number(takenAt) || 0).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });

  const sizeLabel = (snapshot) => {
    const blocks = snapshot.blockCount === 1 ? '1 block' : `${snapshot.blockCount} blocks`;
    return `${blocks}, ${Number(snapshot.characterCount || 0).toLocaleString()} characters`;
  };

  // Asked for once, and only then done. Putting a folder back is a rewrite of
  // everything in it, which is exactly the kind of thing that should not
  // happen on a stray click.
  let confirmingTakenAt = null;

  function restore(takenAt) {
    confirmingTakenAt = null;
    dispatch('restoreSnapshot', { takenAt });
  }
</script>

<svelte:window bind:innerWidth={viewportWidth} />

<div class="advanced-page">
  <button class="back-btn" type="button" on:click={() => dispatch('back')}>
    ‹ Settings
  </button>

  <div class="tab-section">
    <h4>🧭 Controls</h4>
    <button class="create-theme-btn" type="button" aria-expanded={showLayout} on:click={() => (showLayout = !showLayout)}>
      Controls layout {showLayout ? '▾' : '›'}
    </button>
    {#if showLayout}
      <p class="advanced-note">
        Where the controls are on this device. The new way is the default; the
        way it was before is still here. Kept on this device.
      </p>
      <div class="layout-group" role="radiogroup" aria-label="On a phone">
        <span class="scale-name">Phone</span>
        <label><input type="radio" name="phone-layout" checked={controlsLayout.phone === 'bottom'} on:change={() => setLayout({ ...controlsLayout, phone: 'bottom' })} /> The bar at the bottom</label>
        <label><input type="radio" name="phone-layout" checked={controlsLayout.phone === 'top'} on:change={() => setLayout({ ...controlsLayout, phone: 'top' })} /> The bar at the top, as before</label>
      </div>
      <div class="layout-group" role="radiogroup" aria-label="On a computer">
        <span class="scale-name">Computer</span>
        <label><input type="radio" name="computer-layout" checked={controlsLayout.computer === 'rail'} on:change={() => setLayout({ ...controlsLayout, computer: 'rail' })} /> Modes in a column on the left</label>
        <label><input type="radio" name="computer-layout" checked={controlsLayout.computer === 'top'} on:change={() => setLayout({ ...controlsLayout, computer: 'top' })} /> Modes in the bar only, as before</label>
      </div>
      <span class="scale-name">Modes: their order, and which are shown</span>
      <ul class="layout-modes">
        {#each layoutModes as id, i (id)}
          <li class:hidden-mode={controlsLayout.hidden.includes(id)}>
            <label class="layout-mode-name">
              <input
                type="checkbox"
                checked={!controlsLayout.hidden.includes(id)}
                on:change={(e) => setLayout(withModeHidden(allModes, controlsLayout, id, !e.target.checked))}
              />
              <ModeIcon mode={id} size={18} />
              {modeLabels[id] || id}
            </label>
            <button type="button" title="Up" aria-label="Move {modeLabels[id] || id} up" disabled={i === 0} on:click={() => setLayout(movedMode(allModes, controlsLayout, id, -1))}>↑</button>
            <button type="button" title="Down" aria-label="Move {modeLabels[id] || id} down" disabled={i === layoutModes.length - 1} on:click={() => setLayout(movedMode(allModes, controlsLayout, id, 1))}>↓</button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <div class="tab-section">
    <h4>🔠 Text size</h4>
    <p class="advanced-note">
      The size of the writing, in every mode at once. 100% is the size each kind
      of screen is meant to be read at, so it is the same starting point on
      both. Which of the two is in use follows the width of the window, so
      narrowing this one shows you the phone's.
    </p>

    <label class="scale-row" class:live={liveDevice === 'desktop'}>
      <span class="scale-name">Computer</span>
      <span class="scale-slider" style="--fill: {percentAlong(typeScales.desktop)}%">
        <input
          type="range"
          min={MIN_SCALE}
          max={MAX_SCALE}
          step="1"
          value={typeScales.desktop}
          aria-label="Text size on a computer"
          on:input={(event) => setScale('desktop', event.target.value)}
        />
      </span>
      <span class="scale-value">{typeScales.desktop}%</span>
    </label>

    <label class="scale-row" class:live={liveDevice === 'mobile'}>
      <span class="scale-name">Phone</span>
      <span class="scale-slider" style="--fill: {percentAlong(typeScales.mobile)}%">
        <input
          type="range"
          min={MIN_SCALE}
          max={MAX_SCALE}
          step="1"
          value={typeScales.mobile}
          aria-label="Text size on a phone"
          on:input={(event) => setScale('mobile', event.target.value)}
        />
      </span>
      <span class="scale-value">{typeScales.mobile}%</span>
    </label>

    <button
      class="create-theme-btn"
      type="button"
      disabled={isDefaultPair}
      on:click={resetScales}
    >
      Back to the defaults
    </button>
  </div>

  <div class="tab-section">
    <h4>⏮️ Replaced copies</h4>
    <p class="advanced-note">
      When a folder is replaced by a copy from the cloud, what was here is kept.
      {#if currentSaveName}
        These are for <strong>{currentSaveName}</strong>, on this device only.
      {/if}
    </p>

    {#if !folderSnapshots.length}
      <p class="advanced-note empty">
        Nothing has been replaced in this folder. Copies appear here on their own.
      </p>
    {:else}
      <ul class="snapshot-list">
        {#each folderSnapshots as snapshot (snapshot.takenAt)}
          <li class="snapshot">
            <div class="snapshot-when">{when(snapshot.takenAt)}</div>
            <div class="snapshot-size">{sizeLabel(snapshot)}</div>
            {#if confirmingTakenAt === snapshot.takenAt}
              <div class="snapshot-confirm">
                <span>Replace the folder with this?</span>
                <div class="snapshot-actions">
                  <button
                    class="create-theme-btn"
                    type="button"
                    on:click={() => restore(snapshot.takenAt)}
                  >
                    Yes, put it back
                  </button>
                  <button
                    class="create-theme-btn"
                    type="button"
                    on:click={() => (confirmingTakenAt = null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            {:else}
              <div class="snapshot-actions">
                <button
                  class="create-theme-btn"
                  type="button"
                  on:click={() => (confirmingTakenAt = snapshot.takenAt)}
                >
                  Restore
                </button>
                <button
                  class="create-theme-btn"
                  type="button"
                  on:click={() => dispatch('forgetSnapshot', { takenAt: snapshot.takenAt })}
                >
                  Forget
                </button>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
      <p class="advanced-note">
        Putting one back is itself kept, so choosing the wrong one is not the end
        of it.
      </p>
    {/if}
  </div>
</div>

<style>
  .layout-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 6px 0 10px;
  }

  .layout-group label {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .layout-modes {
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .layout-modes li {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .layout-modes li.hidden-mode .layout-mode-name {
    opacity: 0.5;
  }

  .layout-mode-name {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .layout-modes button {
    width: 26px;
    height: 26px;
    padding: 0;
    border-radius: 6px;
    border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .layout-modes button:disabled {
    opacity: 0.3;
    cursor: default;
  }

  /* Every colour here is taken rather than chosen: the writing is whatever the
     panel's writing is, and the surfaces are that colour mixed into nothing.
     A theme moves all of it without this file being told. */
  .advanced-page {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .back-btn {
    align-self: flex-start;
    background: transparent;
    border: none;
    color: inherit;
    font: inherit;
    opacity: 0.75;
    padding: 2px 0;
    cursor: pointer;
  }
  .back-btn:hover {
    opacity: 1;
  }

  .advanced-note {
    margin: 0;
    font-size: 0.72rem;
    line-height: 1.45;
    opacity: 0.65;
  }

  .scale-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8rem;
  }

  /* The one in force right now. Marked rather than hidden: seeing the other
     number is the point of both being on one page, and a slider you can move
     without seeing the effect needs to say so. */
  .scale-row.live {
    background: color-mix(in srgb, currentColor 10%, transparent);
    border-radius: 8px;
    margin: 0 -5px;
    padding: 3px 5px;
  }

  .scale-name {
    min-width: 4.5rem;
  }

  .scale-slider {
    flex: 1;
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .scale-slider input[type='range'] {
    width: 100%;
    cursor: pointer;
  }

  .scale-value {
    min-width: 2.9rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .create-theme-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .advanced-note.empty {
    opacity: 0.5;
  }

  .snapshot-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .snapshot {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 7px 8px;
    border-radius: 8px;
    /* Taken, not chosen: the panel's own writing mixed into nothing, so a
       theme moves this with everything else. */
    background: color-mix(in srgb, currentColor 9%, transparent);
  }

  .snapshot-when {
    font-size: 0.8rem;
  }

  .snapshot-size {
    font-size: 0.7rem;
    opacity: 0.6;
  }

  .snapshot-confirm {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 0.72rem;
  }

  .snapshot-actions {
    display: flex;
    gap: 5px;
    margin-top: 3px;
  }

  .snapshot-actions .create-theme-btn {
    flex: 1;
    font-size: 0.72rem;
    padding: 4px 6px;
  }
</style>
