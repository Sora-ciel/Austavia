/**
 * A paused song lets go of the sound system, in the desktop apps.
 *
 * Asked 2026-11-17: "in Linux when playing a song then pausing it, we can
 * still see the sound icon in the task bar on the app. Let's fix it so that
 * it only shows when actual sound is playing." The <audio> element keeps its
 * stream to the sound server open while paused, and the desktop counts an
 * open stream as an app making sound. So a moment after a pause the stream
 * is closed -- the source taken off the element -- with the position kept,
 * and play opens it again from there (App.svelte, toggleMusic).
 *
 * Not on a phone (the notification and lock-screen controls are bound to
 * the element) nor in a browser (a tab's speaker already follows sound).
 */
export const RELEASE_AFTER_MS = 1500;

export function releasesWhenPaused({ desktopApp = false, androidApp = false } = {}) {
  return desktopApp && !androidApp;
}
