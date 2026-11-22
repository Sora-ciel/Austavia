/**
 * Starter folders (the newcomer folder, the planner) and signing in.
 *
 * Found 2026-11-22 by npm run test:sync: a device that had made the newcomer
 * folder on its first start was asked, on signing in, whether to add "1
 * folder that isn't linked to any account" -- a question about a guide
 * nobody had touched. Kept, every new device would add another guide to the
 * account.
 *
 * So a starter folder carries a fingerprint of itself as made
 * (modeSettings.starter, kept by every version since mode settings keep what
 * they do not know). At sign-in, one still exactly as made is not asked
 * about: an account that already has folders does not want it (Saved Files
 * brings it back any time), and a new account keeps it. One that has been
 * changed is somebody's folder like any other, and is asked about as
 * before -- an edit is never thrown away on a guess.
 */

import { baseOf, fingerprint } from './folderMerge.js';
import { normalizeModeSettings } from './modeSettings.js';

/** What makes a starter folder itself: its blocks, its page and its habits. */
export function starterPrint(payload) {
  const base = baseOf(payload);
  if (!base) return null;
  const settings = normalizeModeSettings(payload?.modeSettings || {});
  return fingerprint({ blocks: base.blocks, page: settings.page, habit: settings.habit });
}

/** A starter folder as made, marked with what it was. */
export function markedStarter(payload, kind) {
  return {
    ...payload,
    modeSettings: { ...(payload.modeSettings || {}), starter: { kind, print: starterPrint(payload) } }
  };
}

/** Whether a folder is a starter folder nobody has changed. */
export function isUntouchedStarter(payload) {
  const mark = payload?.modeSettings?.starter;
  if (!mark || typeof mark.print !== 'string') return false;
  return starterPrint(payload) === mark.print;
}

/**
 * What to do with this device's folders when it signs in for the first time:
 * `ask` the folders to ask about, and `drop` the untouched starter folders
 * to remove from the device (only when the account already has folders).
 * `payloads` is name -> folder.
 */
export function startersAtSignIn({ payloads, accountHasFolders }) {
  const ask = [];
  const untouched = [];
  for (const [name, payload] of Object.entries(payloads)) {
    (isUntouchedStarter(payload) ? untouched : ask).push(name);
  }
  return { ask, drop: accountHasFolders ? untouched : [] };
}
