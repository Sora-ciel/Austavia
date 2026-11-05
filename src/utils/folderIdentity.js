/**
 * Which folder is which, through a rename: what a nest's link points at.
 *
 * ## Why
 *
 * A folder's name is its key in storage and in the cloud, and a rename is a
 * new folder under the new name with the old one deleted. A link by name
 * would break on every rename. Asked 2026-10-27 that folders be found inside
 * others "using a link to folders instead of actually being inside", and
 * nests asked for 2026-11-04 (PENDING, "Page mode, and nests", step 0).
 *
 * ## The rule
 *
 * A folder's id is `modeSettings.folder.id` when it has one, and otherwise
 * `legacy:<its name>` -- worked out the same on every device without them
 * talking to each other, so nothing has to be written for a folder that is
 * never renamed. A rename writes the id it had into the folder under its new
 * name, so it carries on being the same folder. Everything else that writes a
 * folder under another name -- a duplicate, an import into a new folder, a
 * local folder adopted beside a cloud one of the same name -- is a different
 * folder, and drops the id, so it gets its own from its new name.
 *
 * It lives in the mode settings, which every build since 0.8.662 keeps
 * whole, fields it does not know included (utils/keepUnknown.js).
 */

export const LEGACY_PREFIX = 'legacy:';

/** The folder's id: the one it carries, or the one its name gives it. */
export function folderIdOf(name, modeSettings) {
  const carried = modeSettings?.folder?.id;
  return typeof carried === 'string' && carried ? carried : `${LEGACY_PREFIX}${name}`;
}

/** The mode settings to save under a new name when the folder is renamed: its id goes with it. */
export function settingsForRename(modeSettings, fromName) {
  const settings = modeSettings || {};
  return { ...settings, folder: { ...(settings.folder || {}), id: folderIdOf(fromName, settings) } };
}

/** The mode settings for a copy under another name: no id, so it takes its own from its name. */
export function settingsForCopy(modeSettings) {
  if (!modeSettings?.folder) return modeSettings;
  const { folder, ...rest } = modeSettings;
  const { id, ...folderRest } = folder || {};
  return Object.keys(folderRest).length ? { ...rest, folder: folderRest } : rest;
}

/** The mode settings for something written in place of a folder: it stays that folder. */
export function settingsInPlaceOf(modeSettings, name, currentSettings) {
  const id = folderIdOf(name, currentSettings);
  const settings = settingsForCopy(modeSettings) || {};
  return id === `${LEGACY_PREFIX}${name}` ? settings : { ...settings, folder: { ...(settings.folder || {}), id } };
}

/**
 * Where a link goes: the folder in `directory` (`[{ name, id }]`) with the
 * link's id, or null when there is none -- deleted, or not on this device.
 * Looked up each time from what the folders say, never remembered.
 */
export function followLink(link, directory = []) {
  if (!link?.folderId) return null;
  return directory.find(folder => folder.id === link.folderId) || null;
}
