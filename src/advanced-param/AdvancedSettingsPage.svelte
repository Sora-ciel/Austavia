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
  import {
    DEFAULT_SCALES,
    MIN_SCALE,
    MAX_SCALE,
    deviceFor
  } from '../utils/typeScale.js';

  export let typeScales = DEFAULT_SCALES;

  const dispatch = createEventDispatcher();

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
</script>

<svelte:window bind:innerWidth={viewportWidth} />

<div class="advanced-page">
  <button class="back-btn" type="button" on:click={() => dispatch('back')}>
    ‹ Settings
  </button>

  <div class="tab-section">
    <h4>🔠 Text size</h4>
    <p class="advanced-note">
      The size of the writing, in every mode at once. Which of the two is in use
      follows the width of the window, so narrowing this one shows you the
      phone's.
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
</div>

<style>
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
</style>
