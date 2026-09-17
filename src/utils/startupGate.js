/**
 * Whether the workspace is held shut while the cloud copy is fetched.
 *
 * ## What was asked for
 *
 * "There's a moment between the opening of the app, the mounting of the mode,
 * and the pop-up that stops editing to sync. In that window we can probably
 * edit and create a wrong version to sync. We should have that pop-up logic
 * fire before the mode is mounted. Still at the same conditions: that you are
 * connected to an account and that you have auto sync on."
 *
 * ## The window
 *
 * The lock that stops editing during a sync was tied to the bootstrap, and the
 * bootstrap cannot start until Firebase has initialised and restored the
 * session -- which is a network round trip after the page has already drawn.
 * Until then `authUser` is null, nothing is holding anything, and the modes are
 * mounted and editable over whatever this device last had on disk.
 *
 * Anything typed in that window is written against the old copy. Either the
 * download lands and takes it away, or it is saved first and uploaded, and a
 * copy assembled from a stale base goes to every other device. The second is
 * worse, and it is the one that is silent.
 *
 * ## Deciding it without waiting for the network
 *
 * The condition asked for -- signed in, with auto sync on -- is known from this
 * device before Firebase says anything: the account is remembered in local
 * storage from the last session, and so is the auto-sync switch. Both are read
 * synchronously, so the hold can be in place on the first frame rather than
 * after a round trip.
 *
 * It is a guess about the account, and a cheap one to be wrong about: if the
 * session turns out to be gone, the hold lifts the moment auth says so.
 *
 * ## Getting out is as important as getting in
 *
 * A gate with no way out is worse than the bug. Somebody on a train with no
 * signal must not be locked out of their own notes because this device once saw
 * an account, so every one of these lifts the hold:
 *
 * - the bootstrap finishing, which is the ordinary way
 * - auth coming back signed out -- nothing is going to arrive
 * - the device being offline, where nothing can arrive either
 * - auto sync being off, or Firebase not configured at all
 * - no account remembered: a fresh install has nothing to wait for
 * - the wait running past `GATE_TIMEOUT_MS`
 *
 * The timeout is the one that matters most, because it is the only one that
 * covers the case nobody predicted. Waiting for ever is a decision too.
 */

/**
 * How long to hold before giving up and letting them write.
 *
 * Long enough for a slow sign-in on a phone waking up, short enough that it
 * reads as a pause rather than a hang. The cost of releasing too early is one
 * device writing against a stale copy -- which is the bug this reduces rather
 * than eliminates. The cost of holding too long is somebody staring at a
 * blocked screen wondering whether their app is broken.
 */
export const GATE_TIMEOUT_MS = 8000;

/**
 * Whether to hold the workspace shut, and why.
 *
 * The reason is returned rather than kept, because it is what the banner says
 * and what the sync log records; nowhere else has enough to work it out.
 */
export function startupGate({
  remembersAccount = false,
  autoSyncEnabled = false,
  firebaseConfigured = false,
  authResolved = false,
  signedIn = false,
  bootstrapComplete = false,
  online = true,
  waitedMs = 0
} = {}) {
  // In the order they can be known, cheapest first. Every one of these is a
  // reason nothing is coming, so there is nothing to wait for.
  if (!firebaseConfigured) return release('there is no cloud configured');
  if (!autoSyncEnabled) return release('auto sync is off');
  if (!remembersAccount) return release('no account is remembered on this device');
  if (bootstrapComplete) return release('the cloud copy is here');
  if (!online) return release('this device is offline');
  if (authResolved && !signedIn) return release('the account is signed out');
  if (waitedMs >= GATE_TIMEOUT_MS) return release('the cloud did not answer in time');

  return {
    hold: true,
    reason: authResolved ? 'fetching the cloud copy' : 'checking the account'
  };
}

function release(reason) {
  return { hold: false, reason };
}

/**
 * Whether a release happened because it worked or because it gave up.
 *
 * Worth telling apart: the second means this device is about to be edited
 * against a copy nobody has checked, which is exactly the state the gate exists
 * to avoid and is worth a line in the log.
 */
export function releasedWithoutSyncing(reason) {
  return reason === 'the cloud did not answer in time' || reason === 'this device is offline';
}

/**
 * Whether coming back to the window is worth checking the cloud over.
 *
 * ## What went wrong
 *
 * The check that runs on returning to the app was bound to `focus` as well as
 * `visibilitychange`, because on Android a WebView can be back in front of
 * somebody before `visibilitychange` fires.
 *
 * `focus` is broader than that. A native file dialog takes focus from the
 * window and gives it back when it closes — so choosing a picture to add ran
 * the check, the workspace went read-only for the fraction of a second it took,
 * and the picture being inserted right then was refused. It only happened while
 * signed in with auto sync on, because that is the only time the check runs at
 * all, and it left nothing in the log because nothing had gone wrong as far as
 * the check was concerned.
 *
 * ## The distinction
 *
 * Coming back from *away* is worth a check. Coming back from a dialog that was
 * on top of a page which never stopped being visible is not — nothing can have
 * changed underneath in that moment that was not already going to be picked up.
 *
 * So focus only counts when the page had actually been hidden since the last
 * check. `visibilitychange` is what sets that, and it is exactly the event a
 * file dialog does not fire.
 */
export function shouldCheckOnReturn({ trigger = 'focus', wasHidden = false } = {}) {
  // The page itself saying it is visible again is first-hand and always counts.
  if (trigger === 'visibilitychange') return true;
  // Everything else is a hint, and only worth acting on if the app was away.
  return Boolean(wasHidden);
}
