<script>
  /**
   * Opens and closes the always-on-top pop-ups for the open folder's clock
   * blocks, in the desktop apps (Windows and Linux). Which ones should exist, and where, is
   * decided in utils/clockPopups.js; this looks once a second and makes the
   * windows match -- afresh each time, so one that failed to open is opened on
   * the next look and one left over is closed.
   *
   * Renders nothing. `open` is the labels it has open, for the main window's
   * ringer to stay quiet about.
   */
  import { onMount, onDestroy } from 'svelte';
  import { logSync } from '../utils/syncLog.js';
  import { clockDevices, peekClockDevice } from '../utils/clockDeviceStore.js';
  import {
    popupsWanted,
    hiddenToForget,
    keptToForget,
    popupPosition,
    POPUP_WIDTH,
    POPUP_HEIGHT,
    HIDDEN_KEY_PREFIX,
    KEEP_KEY_PREFIX,
    POSITION_KEY
  } from '../utils/clockPopups.js';

  export let blocks = [];
  export let open = new Set();

  const LABEL_PREFIX = 'clock-popup-';
  let api = null;
  let tick = null;
  let busy = false;
  let stopFocusWatch = null;
  const onLinux = typeof navigator !== 'undefined' && /Linux/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent);

  // What happened, in the sync log ("Copy diagnostics"), once per change
  // rather than every second: the pop-ups never appeared on the Linux app
  // (reported 2026-11-10), and nothing could say why.
  let lastNote = '';
  function note(message) {
    if (message === lastNote) return;
    lastNote = message;
    logSync('popup', '', message);
  }

  /**
   * Whether Austavia's own window has the focus -- asked of the window system
   * through Tauri rather than the page's document.hasFocus(), which the Linux
   * app's web engine (WebKitGTK) does not keep true to the window: with the
   * app always "in front", no pop-up was ever wanted there.
   */
  async function appHasFocus() {
    try {
      if (api?.currentWindow) return await api.currentWindow.isFocused();
    } catch { /* fall back to the page's own idea */ }
    return typeof document !== 'undefined' && document.hasFocus();
  }

  function readMarks(prefix) {
    const marks = new Set();
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix)) marks.add(key.slice(prefix.length));
      }
    } catch { /* none */ }
    return marks;
  }

  function readSaved() {
    try { return JSON.parse(localStorage.getItem(POSITION_KEY) || 'null'); } catch { return null; }
  }

  async function workArea() {
    try {
      const monitor = await api.primaryMonitor();
      if (!monitor) return null;
      const scale = monitor.scaleFactor || 1;
      const area = monitor.workArea || { position: monitor.position, size: monitor.size };
      return {
        x: area.position.x / scale,
        y: area.position.y / scale,
        width: area.size.width / scale,
        height: area.size.height / scale
      };
    } catch {
      return null;
    }
  }

  async function reconcile() {
    if (!api || busy) return;
    busy = true;
    try {
      const now = Date.now();
      const devices = {};
      for (const block of blocks || []) {
        if (block?.type === 'clock') devices[block.id] = peekClockDevice(block.id, $clockDevices);
      }

      // A hide lasts one run -- see hiddenToForget.
      const hidden = readMarks(HIDDEN_KEY_PREFIX);
      for (const label of hiddenToForget({ blocks, devices, now, hidden })) {
        try { localStorage.removeItem(HIDDEN_KEY_PREFIX + label); } catch { /* next time */ }
        hidden.delete(label);
      }

      // Kept open after the pop-up's own Stop -- until its × or the clock goes.
      const kept = readMarks(KEEP_KEY_PREFIX);
      for (const label of keptToForget({ blocks, kept })) {
        try { localStorage.removeItem(KEEP_KEY_PREFIX + label); } catch { /* next time */ }
        kept.delete(label);
      }

      // Looked at afresh each second as well as on focus and blur, so a
      // missed event costs a second at most.
      const appInFront = await appHasFocus();
      const wanted = popupsWanted({ blocks, devices, now, hidden, kept, appInFront });
      note(`app ${appInFront ? 'in front' : 'behind'}; pop-ups wanted: ${wanted.map(p => p.kind).join(', ') || 'none'}`);
      const wantedLabels = new Set(wanted.map(popup => popup.label));

      const existing = (await api.getAllWebviewWindows())
        .filter(win => win.label.startsWith(LABEL_PREFIX));
      const existingLabels = new Set(existing.map(win => win.label));

      for (const win of existing) {
        if (!wantedLabels.has(win.label)) {
          try { await win.close(); } catch { /* already closing */ }
        }
      }

      const area = await workArea();
      const saved = readSaved();
      let index = 0;
      for (const popup of wanted) {
        if (existingLabels.has(popup.label)) { index += 1; continue; }
        const { x, y } = popupPosition({ workArea: area, index, saved });
        const query = new URLSearchParams({
          popup: 'clock',
          block: popup.blockId,
          kind: popup.kind,
          label: popup.label,
          ...(popup.kind === 'alarm' ? { time: popup.time, hour12: popup.hour12 ? '1' : '0' } : {})
        });
        try {
          const created = new api.WebviewWindow(popup.label, {
            url: `index.html?${query}`,
            title: popup.kind === 'alarm' ? 'Alarm' : 'Timer',
            width: POPUP_WIDTH,
            height: POPUP_HEIGHT,
            x,
            y,
            alwaysOnTop: true,
            decorations: false,
            transparent: true,
            shadow: false,
            // On Linux a window that cannot be resized is sized by GTK to its
            // content, not to the size asked for: the pop-up opened about
            // 210 by 235 rather than one row (reported 2026-11-10). There
            // it stays resizable and is held to the size by a minimum and a
            // maximum instead; it has no frame to be resized by anyway.
            resizable: !onLinux,
            ...(onLinux ? { minWidth: POPUP_WIDTH, minHeight: POPUP_HEIGHT, maxWidth: POPUP_WIDTH, maxHeight: POPUP_HEIGHT } : {}),
            skipTaskbar: true,
            // Not taking the keyboard from whatever is being typed into.
            focus: false
          });
          created.once?.('tauri://created', async () => {
            let size = '';
            try {
              const inner = await created.innerSize();
              const scale = await created.scaleFactor();
              size = ` at ${Math.round(inner.width / scale)}x${Math.round(inner.height / scale)}`;
            } catch { /* the size is only for the log */ }
            logSync('popup', '', `opened the ${popup.kind} pop-up${size} (asked ${POPUP_WIDTH}x${POPUP_HEIGHT})`);
          });
          created.once?.('tauri://error', event => logSync('popup', '', `the ${popup.kind} pop-up would not open: ${JSON.stringify(event?.payload ?? event)}`));
        } catch (error) {
          console.warn('Could not open the timer pop-up:', error);
          logSync('popup', '', `the ${popup.kind} pop-up could not be made: ${error?.message || error}`);
        }
        index += 1;
      }

      open = wantedLabels;
    } catch (error) {
      console.warn('Timer pop-ups:', error);
    } finally {
      busy = false;
    }
  }

  onMount(async () => {
    const isDesktop = typeof window !== 'undefined' && !!(window.__TAURI_INTERNALS__ || window.__TAURI__);
    if (!isDesktop) return;
    try {
      const [{ WebviewWindow, getAllWebviewWindows }, { primaryMonitor, getCurrentWindow }] = await Promise.all([
        import('@tauri-apps/api/webviewWindow'),
        import('@tauri-apps/api/window')
      ]);
      api = { WebviewWindow, getAllWebviewWindows, primaryMonitor, currentWindow: getCurrentWindow() };
      // The window system says when the app goes behind or comes back, so a
      // pop-up opens at once rather than waiting for the page to notice.
      try {
        stopFocusWatch = await api.currentWindow.onFocusChanged(() => reconcile());
      } catch { /* the once-a-second look still catches it */ }
      reconcile();
      tick = setInterval(reconcile, 1000);
      window.addEventListener('focus', reconcile);
      window.addEventListener('blur', reconcile);
    } catch (error) {
      console.warn('Timer pop-ups are not available here:', error);
    }
  });

  // A change to a timer or alarm is looked at straight away rather than on
  // the next second, so a pop-up opens as Start is pressed.
  $: if (api) { $clockDevices; blocks; reconcile(); }

  onDestroy(() => {
    clearInterval(tick);
    stopFocusWatch?.();
    window.removeEventListener('focus', reconcile);
    window.removeEventListener('blur', reconcile);
  });
</script>
