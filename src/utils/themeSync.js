// The rules that decide how custom themes move between a device and the cloud.
//
// Same reasoning as syncRules.js, and the same rule: nothing here touches the
// network, the database, the DOM or storage. The theme CRUD lives in
// App.svelte, which needs a component runtime and so cannot be loaded outside a
// browser — which would mean every one of these decisions could only be checked
// by signing in on two devices and trying it by hand. The part that decides is
// here; the part that acts stays at the call site.

// Realtime Database keys cannot be empty and cannot contain . # $ [ ] or /.
const FORBIDDEN_KEY_CHARACTERS = /[.#$/[\]]/;

/**
 * Whether a theme id can be a database key at all.
 *
 * Empty is not merely invalid, it is destructive, and for exactly the reason a
 * blank folder name was: the path is built as `themes/${themeId}`, so a blank
 * id makes `themes/`, the trailing slash is stripped, and the write lands on
 * the node holding *every* theme and replaces the lot. Ids are slugified from
 * a user-supplied name, so a name of nothing but punctuation reaches this with
 * an empty slug.
 */
export function isSyncableThemeId(themeId) {
  return typeof themeId === 'string'
    && themeId.length > 0
    && !FORBIDDEN_KEY_CHARACTERS.test(themeId);
}

// What a theme is once the runtime-only parts are taken off. `isCustom` is
// added back on load and is a property of where a theme came from, not of the
// theme, so syncing it would let one device tell another what its own themes
// are called locally.
import { THEME_EXTRA_FIELDS } from './themeExtras.js';

const SYNCED_FIELDS = [
  'id',
  'name',
  'description',
  'controlColors',
  'blockTheme',
  'previewBg',
  // Pop-up backing, player veil and the rest: without them a theme arrives
  // on the next device looking different from how it left.
  ...THEME_EXTRA_FIELDS,
  'createdAt',
  'updatedAt'
];

/**
 * A theme as it should be written to the database.
 *
 * Every theme carries an `updatedAt`, because that is the only thing that can
 * settle which of two copies is newer. Themes written before this existed have
 * only `createdAt`, so they inherit it — an old theme then loses to any edit
 * made since, which is the right way round.
 */
export function themeForSync(theme, now = Date.now()) {
  if (!theme || !isSyncableThemeId(theme.id)) return null;

  const out = {};
  for (const field of SYNCED_FIELDS) {
    if (theme[field] !== undefined && theme[field] !== null) out[field] = theme[field];
  }

  out.updatedAt = Number(theme.updatedAt) || Number(theme.createdAt) || now;
  if (!out.createdAt) out.createdAt = out.updatedAt;

  return out;
}

/** Themes that survive a round trip, with the local-only flag put back. */
export function themeFromSync(theme) {
  if (!theme || !isSyncableThemeId(theme.id)) return null;
  return { ...theme, isCustom: true };
}

function updatedAtOf(theme) {
  return Number((theme && theme.updatedAt) || (theme && theme.createdAt) || 0);
}

/**
 * One list of themes from two, plus what this device still owes the cloud.
 *
 * Whole-theme last-writer-wins, deliberately: the same model the folder sync
 * uses, for the same reason. Merging field by field would mean two devices
 * could each hold half of a theme nobody designed — one device's background
 * against the other's text colour — and a theme is looked at as a whole or not
 * at all.
 *
 * The hard case is a theme this device has and the cloud does not, because two
 * very different things look identical from here: one made offline that has
 * never been uploaded, and one deleted from another device. Treating them the
 * same breaks something either way — assume "new" and every deletion is undone
 * by whichever device was not present for it, assume "deleted" and a theme
 * made on a plane disappears on landing. `syncedAt` is what separates them: it
 * is set once a theme has been written to the cloud, and is never synced
 * itself, so it means precisely "this device has seen this theme in the
 * cloud". Absent from the cloud *and* previously synced is a deletion.
 *
 * Local order is kept so themes do not reshuffle in the picker when a second
 * device appears; anything only the cloud has is appended.
 */
export function reconcileThemes(local = [], remote = []) {
  const remoteById = new Map();
  for (const theme of remote) {
    if (theme && isSyncableThemeId(theme.id)) remoteById.set(theme.id, theme);
  }

  const themes = [];
  const toUpload = [];

  for (const localTheme of local) {
    if (!localTheme || !isSyncableThemeId(localTheme.id)) continue;

    const incoming = remoteById.get(localTheme.id);

    if (incoming) {
      remoteById.delete(localTheme.id);

      // Strictly newer, so a tie goes to the cloud. That matters when two
      // devices somehow hold different themes stamped the same moment:
      // preferring local would leave them disagreeing for ever, each certain
      // it is right, while both deferring to the cloud converges — and neither
      // uploads, so there is no loop either way.
      if (updatedAtOf(localTheme) > updatedAtOf(incoming)) {
        themes.push(localTheme);
        toUpload.push(localTheme); // the cloud is behind; catch it up
      } else {
        themes.push(incoming);
      }
      continue;
    }

    if (localTheme.syncedAt) continue; // deleted elsewhere — let it go

    themes.push(localTheme);
    toUpload.push(localTheme);
  }

  for (const remoteOnly of remoteById.values()) themes.push(remoteOnly);

  return { themes, toUpload };
}

/**
 * Whether a theme actually differs from the copy the cloud already holds.
 *
 * A round trip is not an edit. Without this, loading a theme and writing it
 * straight back would stamp a new `updatedAt`, which would make it newer than
 * the identical copy on every other device, which would make those devices
 * write it back — the same loop two open windows once got into over folders.
 * `updatedAt` itself is excluded from the comparison for that reason.
 */
export function themeChanged(before, after) {
  if (!before || !after) return before !== after;

  for (const field of SYNCED_FIELDS) {
    if (field === 'updatedAt') continue;
    if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) return true;
  }

  return false;
}
