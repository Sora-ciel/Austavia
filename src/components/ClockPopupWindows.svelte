<script>
  /**
   * Opens and closes the always-on-top pop-ups for the open folder's clock
   * blocks, on the Windows app only. Which ones should exist, and where, is
   * decided in utils/clockPopups.js; this looks once a second and makes the
   * windows match -- afresh each time, so one that failed to open is opened on
   * the next look and one left over is closed.
   *
   * Renders nothing. `open` is the labels it has open, for the main window's
   * ringer to stay quiet about.
   */
  import { onMount, onDestroy } from 'svelte';
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

      const wanted = popupsWanted({ blocks, devices, now, hidden, kept });
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
          new api.WebviewWindow(popup.label, {
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
            resizable: false,
            skipTaskbar: true,
            // Not taking the keyboard from whatever is being typed into.
            focus: false
          });
        } catch (error) {
          console.warn('Could not open the timer pop-up:', error);
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
      const [{ WebviewWindow, getAllWebviewWindows }, { primaryMonitor }] = await Promise.all([
        import('@tauri-apps/api/webviewWindow'),
        import('@tauri-apps/api/window')
      ]);
      api = { WebviewWindow, getAllWebviewWindows, primaryMonitor };
      reconcile();
      tick = setInterval(reconcile, 1000);
    } catch (error) {
      console.warn('Timer pop-ups are not available here:', error);
    }
  });

  // A change to a timer or alarm is looked at straight away rather than on
  // the next second, so a pop-up opens as Start is pressed.
  $: if (api) { $clockDevices; blocks; reconcile(); }

  onDestroy(() => clearInterval(tick));
</script>
