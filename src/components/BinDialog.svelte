<script>
  /**
   * The bin: folders deleted on this device in the last 15 days, each with
   * Restore and Delete for ever. Asked for on 2026-10-06; the rules are in
   * utils/folderBin.js.
   */
  import { createEventDispatcher } from 'svelte';
  import { BIN_DAYS, daysLeft } from '../utils/folderBin.js';

  /** What is in the bin, newest first. */
  export let entries = [];
  export let themeStyle = '';
  export let busy = false;

  const dispatch = createEventDispatcher();
  const now = Date.now();

  function when(entry) {
    const days = Math.floor((now - Number(entry.deletedAt)) / (24 * 60 * 60 * 1000));
    const ago = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
    const left = daysLeft(entry, now);
    return `Deleted ${ago} · ${left} ${left === 1 ? 'day' : 'days'} left`;
  }
</script>

<div class="transfer-overlay" role="presentation" style={themeStyle} on:click={() => !busy && dispatch('close')}>
  <div class="transfer-dialog" role="dialog" aria-modal="true" aria-label="Bin" on:click|stopPropagation>
    <h3>Bin</h3>
    <p class="lead">Deleted folders stay here {BIN_DAYS} days, then go for good — from the cloud too.</p>

    {#if entries.length}
      <ul>
        {#each entries as entry (entry.id)}
          <li>
            <div class="words">
              <span class="title">{entry.name || '(unnamed folder)'}</span>
              <span class="detail">{entry.blockCount} {entry.blockCount === 1 ? 'block' : 'blocks'} · {when(entry)}</span>
            </div>
            <div class="row-actions">
              <button type="button" class="transfer-btn" disabled={busy} on:click={() => dispatch('restore', entry)}>Restore</button>
              <button type="button" class="transfer-btn" disabled={busy} on:click={() => dispatch('forget', entry)}>Delete for ever</button>
            </div>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="empty">Nothing in the bin.</p>
    {/if}

    <div class="transfer-actions">
      <button type="button" class="transfer-btn" disabled={busy} on:click={() => dispatch('close')}>Close</button>
    </div>
  </div>
</div>

<style>
  /* The app's dialog, in its colours (themeStyle sets --dlg-*). */
  .transfer-overlay {
    position: fixed;
    inset: 0;
    z-index: 3000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    box-sizing: border-box;
    background: rgba(0, 0, 0, 0.55);
  }

  .transfer-dialog {
    width: 100%;
    max-width: 460px;
    max-height: calc(100dvh - 32px);
    overflow-y: auto;
    box-sizing: border-box;
    padding: 18px;
    border-radius: 14px;
    border: 1px solid var(--dlg-border, #333333);
    background: var(--dlg-bg, #17171a);
    color: var(--dlg-text, #f0f0f0);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
    --sb-track: var(--dlg-bg, #17171a);
    --sb-thumb: var(--dlg-text, #f0f0f0);
  }

  h3 {
    margin: 0;
    font-size: 1.1rem;
  }

  .lead,
  .empty {
    margin: 4px 0 14px;
    font-size: 0.82rem;
    opacity: 0.7;
  }

  ul {
    list-style: none;
    margin: 0 0 14px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 12px;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--dlg-text, #f0f0f0) 18%, transparent);
  }

  .words {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1 1 160px;
  }

  .title {
    font-size: 0.92rem;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .detail {
    font-size: 0.8rem;
    opacity: 0.7;
  }

  .row-actions {
    display: flex;
    gap: 6px;
    flex: none;
  }

  .transfer-actions {
    display: flex;
    justify-content: flex-end;
  }

  .transfer-btn {
    border: 1px solid color-mix(in srgb, var(--dlg-text, #f0f0f0) 25%, transparent);
    border-radius: 8px;
    padding: 7px 12px;
    font: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    background: var(--dlg-btn-bg, #2a2a2a);
    color: var(--dlg-btn-text, #f0f0f0);
  }


  .transfer-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
</style>
