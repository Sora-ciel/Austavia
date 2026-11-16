// Hands the calendar's reminders to the Android app
// (CalendarRemindersPlugin.java), which sets them with the alarm service so
// they arrive with Austavia closed. What to remind of is decided in
// utils/calendarReminders.js. A no-op anywhere but the Android app.

function plugin() {
  if (typeof window === 'undefined') return null;
  const capacitor = window.Capacitor;
  if (!capacitor?.isNativePlatform?.() || capacitor.getPlatform?.() !== 'android') return null;
  return capacitor.Plugins?.CalendarReminders || null;
}

export function remindersAvailable() {
  return Boolean(plugin());
}

/** Replace every reminder set before with these: `[{ id, at, title, body }]`. */
export async function setCalendarReminders(items) {
  const service = plugin();
  if (!service) return;
  try {
    // Asked once, the first time there is something to remind of; Android
    // remembers the answer.
    if (items.length) await service.ensurePermission();
    await service.set({ items });
  } catch (error) {
    console.warn('Could not set the calendar reminders:', error);
  }
}
