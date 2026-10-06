<script>
  /**
   * One colour in the theme editor: a picker, the value as text, and how
   * see-through it is. Anything that is not a plain colour -- a gradient, a
   * CSS variable -- is edited as text. See utils/cssColor.js.
   */
  import { createEventDispatcher } from 'svelte';
  import { parseCssColor, formatCssColor } from '../utils/cssColor.js';

  export let label = '';
  export let value = '';
  /** Shown in the picker when nothing is set. */
  export let fallback = '#000000';
  /** Whether it may be left empty -- "the theme does not set this". */
  export let optional = false;

  const dispatch = createEventDispatcher();

  $: parsed = parseCssColor(value) || (value ? null : parseCssColor(fallback));
  $: alphaPercent = Math.round((parsed?.alpha ?? 1) * 100);

  function set(next) {
    dispatch('change', next);
  }
</script>

<label class="color-field">
  <span>{label}</span>
  <div class="color-input-row">
    <input
      type="color"
      value={parsed?.hex || '#ffffff'}
      disabled={!parsed}
      title={parsed ? '' : 'Not a plain colour -- edit it as text.'}
      on:input={(event) => set(formatCssColor(event.target.value, parsed?.alpha ?? 1, parsed?.form))}
    />
    <input
      class="color-text-input"
      type="text"
      {value}
      placeholder={optional ? 'not set' : ''}
      on:change={(event) => set(event.target.value.trim())}
    />
  </div>
  {#if parsed}
    <div class="opacity-row">
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        value={alphaPercent}
        aria-label={`${label} opacity`}
        on:input={(event) => set(formatCssColor(parsed.hex, Number(event.target.value) / 100, parsed.form))}
      />
      <span class="opacity-value">{alphaPercent}%</span>
    </div>
  {/if}
</label>

<style>
  /* The theme editor's own field look -- see AdvancedCssPage. */
  .color-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.85rem;
    letter-spacing: 0.03em;
  }

  .color-field > span {
    opacity: 0.75;
  }

  input[type='color'],
  input[type='text'] {
    background: rgba(10, 12, 18, 0.75);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    color: inherit;
    padding: 10px;
    font-family: inherit;
    font-size: 0.85rem;
  }

  input[type='color'] {
    flex: none;
    width: 52px;
    height: 36px;
    padding: 0;
    cursor: pointer;
  }

  input[type='color']:disabled {
    cursor: default;
    opacity: 0.5;
  }

  .color-input-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .color-text-input {
    flex: 1;
    min-width: 0;
  }

  .opacity-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.75rem;
    opacity: 0.7;
  }

  .opacity-row input {
    flex: 1;
  }

  .opacity-value {
    min-width: 36px;
    text-align: right;
  }
</style>
