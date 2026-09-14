<script>
  import ControlIcon from '../components/ControlIcon.svelte';
  import AdvancedSettingsPage from './AdvancedSettingsPage.svelte';
  import { DEFAULT_SCALES } from '../utils/typeScale.js';
  export let typeScales = DEFAULT_SCALES;
  export let folderSnapshots = [];
  export let currentSaveName = '';
  export let savedList = [];
  // The server's stored-byte record for this account: { bytes, limit, full }.
  // Null when signed out, or before the first snapshot arrives.
  export let storageUsage = null;
  export let load;
  export let deleteSave;
  export let createNewFile;
  export let controlColors = {};
  export let themes = [];
  export let selectedThemeId = 'default-dark';
  export let firebaseReady = false;
  export let authUser = null;
  export let uploadInProgress = false;
  export let downloadInProgress = false;
  export let autoSyncEnabled = false;
  // Supplied by App, which is the only place that knows the whole picture.
  export let collectDiagnostics = () => 'diagnostics unavailable';
  export let blocksFollowTheme = false;
  export let blocksFollowThemeAll = false;

  import { createEventDispatcher, onMount, onDestroy } from "svelte";
  import { subscribeSyncLog, clearSyncLog, formatSyncLog } from '../utils/syncLog.js';
  import { describeStorageUsage, storageMessageFor } from '../utils/storageUsage.js';

  // Sync writes down what it decided; this is where you read it. There is no
  // console in the packaged app, and the questions that matter — what did it
  // think changed, which side sent what — can only be answered by looking.
  let syncLogEntries = [];
  let showSyncLog = false;
  let syncLogCopied = false;
  let stopSyncLog = () => {};
  onMount(() => { stopSyncLog = subscribeSyncLog(list => { syncLogEntries = list; }); });
  onDestroy(() => stopSyncLog());

  // Newest first: a loop is happening now, not at the start of the session.
  $: recentSyncLog = [...syncLogEntries].reverse();

  // The whole state in one paste. The app knows all of this about itself;
  // before this button the only way to get it was to ask, one fact at a time,
  // and the fact that mattered was usually the one nobody thought to mention.
  let diagnosticsCopied = false;
  async function copyDiagnostics() {
    const text = collectDiagnostics();
    try {
      await navigator.clipboard.writeText(text);
      diagnosticsCopied = true;
      setTimeout(() => { diagnosticsCopied = false; }, 1800);
    } catch {
      // Clipboard refused (an insecure origin, or a webview that says no).
      // Better to hand it over some other way than to fail silently.
      dispatch('showDiagnostics', text);
    }
  }
  async function copySyncLog() {
    try {
      await navigator.clipboard.writeText(formatSyncLog(syncLogEntries));
      syncLogCopied = true;
      setTimeout(() => { syncLogCopied = false; }, 1800);
    } catch { /* clipboard refused; the lines are on screen to read anyway */ }
  }

  function syncLogTime(at) {
    return new Date(at).toLocaleTimeString();
  }
  import StylePresetPage from "./StylePresetPage.svelte";

  const dispatch = createEventDispatcher();

  let pc = true; // default until detected
  let isOpen = true;
  // Which page the settings area is showing. The panel is a place rather than
  // a list now: 'main' is what it has always shown, 'advanced' replaces it with
  // the settings that are set once and lived with.
  let settingsPage = 'main';
  let hasMounted = false;
  let resizeHandler;
  let outsideClickHandler;
  let rightControlsRef;
  const RIGHT_CONTROLS_OPEN_KEY = "rightControlsOpen";

  const defaultColors = {
    panelBg: "#222222",
    textColor: "#ffffff",
    buttonBg: "#222222",
    buttonText: "#ffffff",
    borderColor: "#444444"
  };

  $: rightTheme = {
    ...defaultColors,
    ...((controlColors && controlColors.right) || {})
  };

  $: rightCssVars = Object.entries({
    "--right-panel-bg": rightTheme.panelBg,
    "--right-text-color": rightTheme.textColor,
    "--right-button-bg": rightTheme.buttonBg,
    "--right-button-text": rightTheme.buttonText,
    "--right-border-color": rightTheme.borderColor
  })
    .map(([name, value]) => `${name}: ${value}`)
    .join("; ");

  function loadStoredOpenState() {
    if (typeof localStorage === "undefined") return null;
    try {
      const stored = localStorage.getItem(RIGHT_CONTROLS_OPEN_KEY);
      if (stored === null) return null;
      return JSON.parse(stored);
    } catch (error) {
      return null;
    }
  }

  function persistOpenState(open) {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(RIGHT_CONTROLS_OPEN_KEY, JSON.stringify(open));
    } catch (error) {
      /* ignore persistence failures */
    }
  }

  $: if (hasMounted) {
    persistOpenState(isOpen);
  }

  // Detect PC vs mobile
  onMount(() => {
    const storedOpenState = loadStoredOpenState();
    if (typeof storedOpenState === "boolean") {
      isOpen = storedOpenState;
    }
    const evaluate = () => {
      pc = window.innerWidth > 1024;
    };
    evaluate();
    resizeHandler = () => evaluate();
    outsideClickHandler = (event) => {
      if (!isOpen) return;
      if (!rightControlsRef) return;

      // Asked where the click *started*, not where its target is now.
      //
      // `contains(event.target)` reads the DOM after the fact, and by the time
      // a window listener runs the clicked button may not be in the document
      // any more: pressing "Advanced settings" swaps the panel's page, which
      // removes the very button that was pressed. A detached node is contained
      // by nothing, so the panel decided the click had been outside itself and
      // shut -- every time, from the one button whose whole job is to stay in
      // there. The same for "< Settings" coming back.
      //
      // composedPath() is taken when the event is dispatched, so it still
      // holds the panel whatever the click went on to change. `contains` is
      // kept after it for anything that does not implement composedPath.
      const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
      if (path.includes(rightControlsRef)) return;
      if (rightControlsRef.contains(event.target)) return;

      isOpen = false;
    };
    window.addEventListener("resize", resizeHandler);
    window.addEventListener("click", outsideClickHandler);
    hasMounted = true;
  });

  onDestroy(() => {
    if (resizeHandler) {
      window.removeEventListener("resize", resizeHandler);
    }
    if (outsideClickHandler) {
      window.removeEventListener("click", outsideClickHandler);
    }
  });

  function handleSelect(name) {
    load(name);
    // Auto-close dropdown only on mobile
    if (!pc) {
      isOpen = false;
    }
  }

  function handleCreateNewFile() {
    createNewFile?.();
    if (!pc) {
      isOpen = false;
    }
  }

  function signIn() {
    dispatch("googleSignIn");
  }

  function signOut() {
    dispatch("googleSignOut");
  }

  function uploadNow() {
    dispatch("uploadNow");
  }

  function downloadNow() {
    dispatch("downloadNow");
  }

  function toggleAutoSync() {
    dispatch("toggleAutoSync");
  }


  function handleThemeSelect(event) {
    dispatch("selectTheme", event.detail);
    if (!pc) {
      isOpen = false;
    }
  }

  function openAdvancedCssPage() {
    dispatch("openAdvancedCss");
    if (!pc) {
      isOpen = false;
    }
  }
</script>



<style>

  /* Remove list bullets and extra padding/margin */
.controls-scroll ul,
.controls-scroll li {
  list-style: none;
  margin: 0;
  padding: 0;
}


  .right-controls summary {
    all: unset; /* remove browser default styles */
    /* flex, not block: the icon beside the label is an element of its own and
       was being pushed onto a second line. */
    display: flex;
    align-items: center;
    gap: 7px;
    cursor: pointer;
    padding: 6px 12px;
    background: var(--right-button-bg, #222222);
    color: var(--right-button-text, #ffffff);
    border-radius: 6px;
    border: 1px solid var(--right-border-color, #444444);
    font-weight: bold;
    transition: background 0.2s ease;
    min-height: 42px;
    box-sizing: border-box;
  }

  .right-controls details[open] .dropdown-content {
    display: block;
  }

  .right-controls details {
    position: relative;
    cursor: pointer;
  }

  .dropdown-content {
    display: none;
    position: fixed;
    top: var(--controls-height, 56px);
    right: 0;
    bottom: 0;
    width: 260px;
    background: var(--right-panel-bg, #222222);
    border-left: 1px solid var(--right-border-color, #444444);
    z-index: 999;
    box-shadow: -2px 0 10px rgba(0,0,0,0.4);
    color: var(--right-text-color, #ffffff);
  }

  .controls-scroll {
    height: 100%;
    padding: 16px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 18px;
    box-sizing: border-box;
    padding-bottom: 32px;
  }

  /* Optional: make it more mobile-friendly */
  @media (max-width: 1024px) {
  .right-controls {
    position: static;
    z-index: 1003;
  }

    /* Header button only — the controls inside the drawer keep their own size.
       The label is dropped so the button is just its icon: every pixel spent
       here pushes the toolbar towards needing to scroll. */
    .right-controls summary {
      min-height: 36px;
      padding: 5px 9px;
      font-size: 0.98rem;
      display: flex;
      align-items: center;
      gap: 0;
    }
    .right-controls summary .summary-label { display: none; }

    .dropdown-content {
    display: none;
    position: fixed;
    top: calc(var(--controls-height, 56px) + 8px);
    right: 8px;
    bottom: auto;
    width: min(56vw, 240px);
    max-width: 92vw;
    max-height: calc(100dvh - var(--controls-height, 56px) - 16px);
    background: var(--right-panel-bg, #222222);
    border: 1px solid var(--right-border-color, #444444);
    border-radius: 12px;
    padding: 0;
    overflow-y: auto;
    z-index: 1002;
    box-shadow: -2px 0 10px rgba(0,0,0,0.4);
  }

    .controls-scroll {
      padding: 10px;
      gap: 10px;
    }

    .tab-section { gap: 7px; }

    /* The narrow drawer would otherwise wrap these headings onto two lines. */
    .tab-section h4 {
      font-size: 0.72rem;
      letter-spacing: 0.04em;
    }

}

  .controls-scroll ul {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .controls-scroll li {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .controls-scroll li button {
    flex: 1 1 auto;
    padding: 6px 10px;
    background: var(--right-button-bg, #333333);
    color: var(--right-button-text, #ffffff);
    border: 1px solid var(--right-border-color, #444444);
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
  }

  .controls-scroll li button:last-child {
    flex: 0 0 auto;
    padding: 6px 8px;
  }

  .create-theme-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border-radius: 6px;
    background: var(--right-button-bg, #333333);
    color: var(--right-button-text, #ffffff);
    border: 1px solid var(--right-border-color, #444444);
    cursor: pointer;
    font-size: 0.82rem;
    transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
    margin-bottom: 10px;
  }

  .toggle-label {
    margin: 0 0 6px;
    font-size: 0.78rem;
    opacity: 0.8;
  }

  .toggle-row {
    display: flex;
    gap: 6px;
    margin-bottom: 10px;
  }

  .toggle-half {
    flex: 1;
    justify-content: center;
    margin-bottom: 0;
    font-size: 0.76rem;
    padding: 7px 8px;
  }

  .create-theme-btn.active-toggle {
    background: color-mix(in srgb, var(--right-button-text, #ffffff) 22%, transparent);
    border-color: var(--right-button-text, #ffffff);
  }

  .create-theme-btn:hover {
    background: var(--right-button-text, #ffffff);
    color: var(--right-panel-bg, #222222);
  }

  .tab-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .tab-section h4 {
    margin: 0;
    font-size: 0.85rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.85;
  }


  .empty-state {
    font-size: 0.8rem;
    opacity: 0.65;
  }



  /* The sync log. Dense on purpose: reading it means scanning for the one line
     that repeats, so each entry has to stay small enough that a loop is visible
     as a pattern rather than as a wall of text. */
  /* Colours come from the panel's own theme variables rather than fixed
     values, because every one of these is user-controlled: a hardcoded grey
     bar vanishes on half the themes people build. */
  .storage-usage {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-top: 0.5rem;
    padding: 0.55rem 0.65rem;
    border: 1px solid var(--panel-border, #444);
    border-radius: 8px;
  }

  .storage-usage-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
    font-size: 0.78rem;
    opacity: 0.85;
  }

  .storage-usage-figure {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .storage-usage-bar {
    height: 6px;
    border-radius: 999px;
    overflow: hidden;
    background: color-mix(in srgb, currentColor 18%, transparent);
  }

  .storage-usage-bar > span {
    display: block;
    height: 100%;
    background: currentColor;
    transition: width 0.25s ease;
  }

  @media (prefers-reduced-motion: reduce) {
    .storage-usage-bar > span { transition: none; }
  }

  /* Severity is carried by colour *and* by the message below it, never by
     colour alone. */
  .storage-usage[data-state='nearly'] { color: #e0a341; }
  .storage-usage[data-state='full'] { color: #ff6b6b; }

  .storage-usage-message {
    margin: 0;
    font-size: 0.74rem;
    line-height: 1.35;
  }

  .sync-log {
    margin-top: 6px;
    border: 1px solid var(--dlg-border, #444);
    border-radius: 8px;
    padding: 6px;
    max-height: 260px;
    overflow-y: auto;
    font-size: 0.72rem;
  }
  .sync-log-actions {
    display: flex;
    gap: 6px;
    margin-bottom: 6px;
  }
  .sync-log-actions button {
    flex: 1;
    padding: 4px 6px;
    font-size: 0.72rem;
    border-radius: 6px;
  }
  .sync-log ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .sync-log-entry {
    display: grid;
    grid-template-columns: auto auto 1fr;
    gap: 4px 6px;
    padding: 3px 0;
    border-top: 1px solid color-mix(in srgb, var(--dlg-border, #444) 50%, transparent);
    align-items: baseline;
  }
  .sync-log-time {
    opacity: 0.55;
    font-variant-numeric: tabular-nums;
  }
  .sync-log-kind {
    text-transform: uppercase;
    font-size: 0.62rem;
    letter-spacing: 0.04em;
    opacity: 0.8;
  }
  .sync-log-entry[data-kind='error'] .sync-log-kind { color: #e2705a; }
  .sync-log-entry[data-kind='save'] .sync-log-kind,
  .sync-log-entry[data-kind='upload'] .sync-log-kind { color: #7fb2ff; }
  .sync-log-entry[data-kind='download'] .sync-log-kind,
  .sync-log-entry[data-kind='remount'] .sync-log-kind { color: #ffcc70; }
  .sync-log-message { word-break: break-word; }
  /* The diff lines are the point of the whole panel, so they get the full
     width under the entry rather than being squeezed into a column. */
  .sync-log-diff {
    grid-column: 1 / -1;
    padding-left: 8px;
    opacity: 0.75;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    word-break: break-word;
  }
</style>

<div class="right-controls" style={rightCssVars} bind:this={rightControlsRef}>
  <details bind:open={isOpen}>
    <summary><ControlIcon name="settings" /><span class="summary-label">Settings</span></summary>

    <div class="dropdown-content">
      <div class="controls-scroll">
      {#if settingsPage === 'advanced'}
        <AdvancedSettingsPage
          {typeScales}
          {folderSnapshots}
          {currentSaveName}
          on:typeScaleChange
          on:restoreSnapshot
          on:forgetSnapshot
          on:back={() => (settingsPage = 'main')}
        />
      {:else}
        <div class="tab-section">
          <h4>⚙️ Advanced</h4>
          <button
            class="create-theme-btn"
            type="button"
            on:click={() => {
              settingsPage = 'advanced';
              dispatch('advancedOpened');
            }}
          >
            Advanced settings ›
          </button>
        </div>

        <div class="tab-section">
          <h4>📂 Saved Files</h4>
          <button class="create-theme-btn" type="button" on:click={handleCreateNewFile}>
            ➕ New File
          </button>
          {#if savedList.length}
            <ul>
              {#each savedList as name}
                <li>
                  <!-- A folder with no name rendered as an invisible, unlabelled
                       row: nothing to read and nothing obvious to click, so the
                       one folder you might actually want to remove was the one
                       you could not see. -->
                  <button on:click={() => handleSelect(name)}>{name || '(unnamed folder)'}</button>
                  <button on:click={() => deleteSave(name)}>🗑</button>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="empty-state">No saved scenes yet.</p>
          {/if}
        </div>

        {#if firebaseReady}
          <div class="tab-section">
            <h4>☁️ Cloud</h4>
            {#if authUser}
              <button class="create-theme-btn" type="button" on:click={uploadNow} disabled={uploadInProgress}>
                {uploadInProgress ? "⏳ Uploading..." : "⤴ Upload to Cloud"}
              </button>
              <button class="create-theme-btn" type="button" on:click={toggleAutoSync}>
                {autoSyncEnabled ? "🟢 Auto Sync: ON" : "⚪ Auto Sync: OFF"}
              </button>
              <button class="create-theme-btn" type="button" on:click={downloadNow} disabled={downloadInProgress}>
                {downloadInProgress ? "⏳ Downloading..." : "⤵ Download from Cloud"}
              </button>
              <button class="create-theme-btn" type="button" on:click={signOut}>🚪 Sign Out</button>
              <p class="empty-state">Signed in as {authUser.displayName || authUser.email || authUser.uid}</p>

              {#if storageUsage}
                {@const usage = describeStorageUsage(storageUsage)}
                {@const message = storageMessageFor(storageUsage)}
                <div class="storage-usage" data-state={usage.state}>
                  <div class="storage-usage-head">
                    <span>Cloud storage</span>
                    <span class="storage-usage-figure">{usage.label}</span>
                  </div>

                  {#if usage.state !== 'unlimited'}
                    <div
                      class="storage-usage-bar"
                      role="progressbar"
                      aria-valuenow={usage.percent}
                      aria-valuemin="0"
                      aria-valuemax="100"
                      aria-label="Cloud storage used"
                    >
                      <span style="width: {usage.percent}%"></span>
                    </div>
                  {/if}

                  {#if message}
                    <p class="storage-usage-message">{message}</p>
                  {/if}
                </div>
              {/if}
            {:else}
              <button class="create-theme-btn" type="button" on:click={signIn}>🔐 Sign in Google</button>
            {/if}

            <button class="create-theme-btn" type="button" on:click={copyDiagnostics}>
              {diagnosticsCopied ? "Copied — paste it in a message" : "🩺 Copy diagnostics"}
            </button>
            <button class="create-theme-btn" type="button" on:click={() => (showSyncLog = !showSyncLog)}>
              {showSyncLog ? '▾' : '▸'} Sync log ({syncLogEntries.length})
            </button>
            {#if showSyncLog}
              <div class="sync-log">
                <div class="sync-log-actions">
                  <button type="button" on:click={copySyncLog}>{syncLogCopied ? 'Copied' : 'Copy'}</button>
                  <button type="button" on:click={clearSyncLog}>Clear</button>
                </div>
                {#if !recentSyncLog.length}
                  <p class="empty-state">Nothing yet. It fills as sync runs.</p>
                {:else}
                  <ul>
                    {#each recentSyncLog as entry}
                      <li class="sync-log-entry" data-kind={entry.kind}>
                        <span class="sync-log-time">{syncLogTime(entry.at)}</span>
                        <span class="sync-log-kind">{entry.kind}</span>
                        <span class="sync-log-message">
                          {entry.folder ? `[${entry.folder}] ` : ''}{entry.message}
                        </span>
                        {#if Array.isArray(entry.detail)}
                          {#each entry.detail as diff}
                            <span class="sync-log-diff">{diff.path}: {diff.before} → {diff.after}</span>
                          {/each}
                        {:else if entry.detail}
                          <span class="sync-log-diff">
                            {Object.entries(entry.detail).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                          </span>
                        {/if}
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>
            {/if}
          </div>
        {/if}

        <div class="tab-section">
          <h4>🧩 Style Presets</h4>
          <button class="create-theme-btn" type="button" on:click={openAdvancedCssPage}>
            ✨ Create custom theme
          </button>
          <p class="toggle-label">🎨 Blocks match theme</p>
          <div class="toggle-row">
            <button
              class="create-theme-btn toggle-half"
              class:active-toggle={blocksFollowTheme}
              type="button"
              title="Recolor this folder's blocks to match the theme. Syncs with the folder."
              on:click={() => dispatch('toggleBlocksFollowTheme')}
            >
              This folder{blocksFollowTheme ? ' ✓' : ''}
            </button>
            <button
              class="create-theme-btn toggle-half"
              class:active-toggle={blocksFollowThemeAll}
              type="button"
              title="Apply to every folder on this device. Overrides the per-folder switch."
              on:click={() => dispatch('toggleBlocksFollowThemeAll')}
            >
              All folders{blocksFollowThemeAll ? ' ✓' : ''}
            </button>
          </div>
          <StylePresetPage
            {themes}
            {selectedThemeId}
            on:selectTheme={handleThemeSelect}
          />
        </div>

      {/if}
      </div>
    </div>
  </details>
</div>
