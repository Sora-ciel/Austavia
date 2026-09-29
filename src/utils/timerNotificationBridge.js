// The timer notification in the Android app's shade -- what it says is decided
// in utils/timerChip.js (timerNotice); this only hands it to the native plugin
// (TimerNotificationPlugin.java) and hands the buttons pressed on it back.
//
// A no-op anywhere but the Android app.

let listening = false;
let handler = null;

function plugin() {
  if (typeof window === 'undefined') return null;
  return window.Capacitor?.Plugins?.TimerNotification || null;
}

export function isNativeAndroid() {
  const capacitor = typeof window !== 'undefined' ? window.Capacitor : null;
  return !!capacitor?.isNativePlatform?.() && capacitor.getPlatform?.() === 'android';
}

/** What to do with a button pressed on the notification: `{ action, blockId }`. */
export function onTimerNotificationAction(fn) {
  handler = fn;
  const service = plugin();
  if (!service || listening) return;
  listening = true;
  try {
    service.addListener('action', event => handler?.(event || {}));
  } catch (error) {
    listening = false;
    console.warn('Timer notification buttons are not available:', error);
  }
}

export async function showTimerNotification(notice) {
  try {
    await plugin()?.show(notice);
  } catch (error) {
    console.warn('Could not show the timer notification:', error);
  }
}

export async function clearTimerNotification() {
  try {
    await plugin()?.clear();
  } catch (error) {
    console.warn('Could not clear the timer notification:', error);
  }
}
