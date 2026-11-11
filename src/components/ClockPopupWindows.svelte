<script>
  /**
   * Opens and closes the always-on-top pop-ups for the open folder's clock
   * blocks and its running timed habits and objectives, in the desktop apps
   * (Windows and Linux). Which ones should exist, and where, is
   * decided in utils/clockPopups.js; this looks once a second and makes the
   * windows match -- afresh each time, so one that failed to open is opened on
   * the next look and one left over is closed.
   *
   * Renders nothing. A button pressed on a habit's or objective's pop-up
   * comes out as `goalAction`, the event the phone's notification sends.
   */
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { goalTimers, parseGoalKey } from '../utils/goalNotices.js';
  import { readAnswered } from '../utils/taskGoalRings.js';
  import { logSync } from '../utils/syncLog.js';
  import { clockDevices, peekClockDevice } from '../utils/clockDeviceStore.js';
  import {
    popupsWanted,
    hiddenToForget,
    keptToForget,
    popupPosition,
    popupWindowSize,
    goalPopupLabel,
    GOALS_KEY,
    GOAL_ACTION_KEY,
    POPUP_WIDTH,
    POPUP_HEIGHT,
    HIDDEN_KEY_PREFIX,
    KEEP_KEY_PREFIX,
    POSITION_KEY
  } from '../utils/clockPopups.js';

  export let blocks = [];
  /** The folder's habits: one with a time running gets a pop-up too. */
  export let habits = [];

  const dispatch = createEventDispatcher();

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

      // Kept open after the pop-up's own Stop or pause -- until its × or the
      // clock or objective goes.
      const kept = readMarks(KEEP_KEY_PREFIX);

      // Timed habits and objectives: running, ringing, or paused from their
      // own pop-up. Written down for their pop-ups, which cannot see the folder.
      const goals = goalTimers({
        blocks,
        habits,
        now,
        answered: readAnswered(localStorage),
        keepPaused: key => kept.has(goalPopupLabel(key))
      });
      publishGoals(goals);

      // A hide lasts one run -- see hiddenToForget.
      const hidden = readMarks(HIDDEN_KEY_PREFIX);
      for (const label of hiddenToForget({ blocks, devices, goals, now, hidden })) {
        try { localStorage.removeItem(HIDDEN_KEY_PREFIX + label); } catch { /* next time */ }
        hidden.delete(label);
      }

      for (const label of keptToForget({ blocks, goals, kept })) {
        try { localStorage.removeItem(KEEP_KEY_PREFIX + label); } catch { /* next time */ }
        kept.delete(label);
      }

      // Looked at afresh each second as well as on focus and blur, so a
      // missed event costs a second at most.
      const appInFront = await appHasFocus();
      const wanted = popupsWanted({ blocks, devices, goals, now, hidden, kept, appInFront });
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
        const size = popupWindowSize(onLinux);
        const { x, y } = popupPosition({ workArea: area, index, saved, size });
        const query = new URLSearchParams({
          popup: 'clock',
          ...(popup.kind === 'goal' ? { goal: popup.goalKey } : { block: popup.blockId }),
          kind: popup.kind,
          label: popup.label,
          ...(onLinux ? { framed: '1' } : {}),
          ...(popup.kind === 'alarm' ? { time: popup.time, hour12: popup.hour12 ? '1' : '0' } : {})
        });
        try {
          const created = new api.WebviewWindow(popup.label, {
            url: `index.html?${query}`,
            title: popup.kind === 'alarm' ? 'Alarm' : popup.kind === 'goal' ? 'Objective' : 'Timer',
            width: size.width,
            height: size.height,
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
          created.once?.('tauri://created', async () => {
            let got = '';
            try {
              const inner = await created.innerSize();
              const scale = await created.scaleFactor();
              got = ` at ${Math.round(inner.width / scale)}x${Math.round(inner.height / scale)}`;
            } catch { /* the size is only for the log */ }
            logSync('popup', '', `opened the ${popup.kind} pop-up${got} (window ${size.width}x${size.height}, card ${POPUP_WIDTH}x${POPUP_HEIGHT})`);
          });
          created.once?.('tauri://error', event => logSync('popup', '', `the ${popup.kind} pop-up would not open: ${JSON.stringify(event?.payload ?? event)}`));
        } catch (error) {
          console.warn('Could not open the timer pop-up:', error);
          logSync('popup', '', `the ${popup.kind} pop-up could not be made: ${error?.message || error}`);
        }
        index += 1;
      }

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
      window.addEventListener('storage', onGoalAction);
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
  $: if (api) { $clockDevices; blocks; habits; reconcile(); }

  // What each habit's or objective's pop-up shows, written only when it
  // changes: a running one carries when it ends, not the time left, so it is
  // not rewritten every second.
  let lastGoals = '';
  function publishGoals(goals) {
    const shown = Object.fromEntries(goals.map(goal => [goal.blockId, {
      phase: goal.phase,
      endsAt: goal.endsAt,
      left: goal.phase === 'paused' ? goal.left : 0,
      duration: goal.duration,
      title: goal.title,
      ringKey: goal.ringKey || null
    }]));
    const text = JSON.stringify(shown);
    if (text === lastGoals) return;
    lastGoals = text;
    try { localStorage.setItem(GOALS_KEY, text); } catch { /* the pop-up shows what it last had */ }
  }

  // A button pressed on a habit's or objective's pop-up.
  function onGoalAction(event) {
    if (event.key !== GOAL_ACTION_KEY || !event.newValue) return;
    let pressed = null;
    try { pressed = JSON.parse(event.newValue); } catch { return; }
    const goal = parseGoalKey(pressed?.key);
    if (!goal || !pressed.action) return;
    let ringKey = null;
    try { ringKey = JSON.parse(localStorage.getItem(GOALS_KEY) || '{}')[pressed.key]?.ringKey || null; } catch { /* not ringing */ }
    dispatch('goalAction', { ...goal, action: pressed.action, ringKey });
  }

  onDestroy(() => {
    if (typeof window !== 'undefined') window.removeEventListener('storage', onGoalAction);
    clearInterval(tick);
    stopFocusWatch?.();
    window.removeEventListener('focus', reconcile);
    window.removeEventListener('blur', reconcile);
  });
</script>
