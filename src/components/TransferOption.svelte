<script>
  /**
   * One choice in the export and import dialogs: a tick or a dot, what it is,
   * and a line under it saying what it means. The explanation sits under the
   * title rather than beside it -- beside it, it was squeezed into a narrow
   * column and broke over several lines (2026-10-06). In the dialog's own
   * colours, as everything there is.
   */
  import { createEventDispatcher } from 'svelte';

  /** 'checkbox' or 'radio'. */
  export let kind = 'checkbox';
  export let checked = false;
  export let disabled = false;
  export let title = '';
  export let detail = '';
  /** Set under another option it depends on. */
  export let indent = false;

  const dispatch = createEventDispatcher();
</script>

<button
  type="button"
  class="option"
  class:checked
  class:indent
  role={kind}
  aria-checked={checked}
  {disabled}
  on:click={() => dispatch('toggle')}
>
  <span class="mark" class:round={kind === 'radio'} aria-hidden="true"></span>
  <span class="words">
    <span class="title">{title}</span>
    {#if detail}<span class="detail">{detail}</span>{/if}
  </span>
</button>

<style>
  .option {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    width: 100%;
    box-sizing: border-box;
    padding: 9px 12px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--dlg-text, #f0f0f0) 18%, transparent);
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .option:hover:not(:disabled) {
    background: color-mix(in srgb, var(--dlg-text, #f0f0f0) 6%, transparent);
  }

  .option.checked {
    border-color: color-mix(in srgb, var(--dlg-text, #f0f0f0) 45%, transparent);
    background: color-mix(in srgb, var(--dlg-text, #f0f0f0) 10%, transparent);
  }

  .option:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .option:focus-visible {
    outline: 2px solid var(--dlg-text, #f0f0f0);
    outline-offset: 2px;
  }

  .option.indent {
    width: calc(100% - 28px);
    margin-left: 28px;
  }

  .mark {
    flex: none;
    position: relative;
    width: 16px;
    height: 16px;
    margin-top: 2px;
    border-radius: 4px;
    border: 2px solid currentColor;
    box-sizing: border-box;
  }

  .mark.round {
    border-radius: 50%;
  }

  .checked .mark {
    background: var(--dlg-text, #f0f0f0);
    border-color: var(--dlg-text, #f0f0f0);
  }

  /* The tick, drawn in the dialog's background over the filled box. */
  .checked .mark:not(.round)::after {
    content: '';
    position: absolute;
    left: 3.5px;
    top: 0.5px;
    width: 4px;
    height: 8px;
    border: solid var(--dlg-bg-solid, var(--dlg-bg, #17171a));
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }

  .checked .mark.round::after {
    content: '';
    position: absolute;
    inset: 3px;
    border-radius: 50%;
    background: var(--dlg-bg-solid, var(--dlg-bg, #17171a));
  }

  .words {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .title {
    font-size: 0.92rem;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .detail {
    font-size: 0.8rem;
    line-height: 1.35;
    opacity: 0.7;
  }
</style>
