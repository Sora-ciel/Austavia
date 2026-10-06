/**
 * Moving folders in and out of the app as files, and naming new ones.
 *
 * ## What was asked for
 *
 * On 2026-10-05: "you can't export the themes and mode settings along with the
 * folder information, and choose what you import ... also the background
 * images". Export took the open folder only, as it happened to be stored --
 * which since pictures moved to the cloud meant links, not pictures -- and
 * Import replaced the open folder whole, cleared Undo and saved over it.
 *
 * Now an export says what it carries (folders, their settings, their pictures,
 * the themes) and an import lets you choose from that, into **new folders by
 * default**. A new folder keeps the name it was exported under; when that is
 * taken it gets a number -- "if you export a folder named Damn and import it,
 * call it Damn if there's no Damn yet. If there's already a Damn, call it
 * Damn 1, and if there's already a Damn 1, call it Damn 2." Duplicating a
 * folder names the copy the same way.
 *
 * ## The file
 *
 * `{ format: 'austavia-export', version: 2, exportedAt, folders: [{ name,
 * blocks, modeOrders, modeSettings? }], themes?: { custom: [...], selectedId } }`.
 * A file from before this -- `{ blocks, modeOrders, modeSettings }` or a bare
 * array of blocks -- still imports, as one folder named after the file.
 *
 * Pure: what the app does with it (reading files, saving folders, adding
 * themes) is App's.
 */

export const EXPORT_FORMAT = 'austavia-export';
export const EXPORT_VERSION = 2;

/**
 * A name nothing else has: the name itself when it is free, otherwise the next
 * number after it -- "Damn", then "Damn 1", then "Damn 2". A name that already
 * ends in a number counts on from it ("Damn 1" taken gives "Damn 2", not
 * "Damn 1 1").
 */
export function uniqueName(name, taken = [], fallback = 'Imported') {
  const wanted = String(name ?? '').trim() || fallback;
  const used = new Set(taken);
  if (!used.has(wanted)) return wanted;

  const numbered = wanted.match(/^(.*\S)\s+(\d+)$/);
  const stem = numbered ? numbered[1] : wanted;
  let n = numbered ? Number(numbered[2]) + 1 : 1;
  while (used.has(`${stem} ${n}`)) n += 1;
  return `${stem} ${n}`;
}

/** The name a file was exported under: its own, without ".json" or a browser's " (2)". */
export function nameFromFile(fileName = '') {
  return String(fileName)
    .replace(/\.json$/i, '')
    .replace(/\s*\(\d+\)$/, '')
    .trim();
}

/**
 * The file to save. `include.settings` keeps each folder's settings (columns,
 * habits, wallpaper and its dials); `include.themes` adds the custom themes
 * and which theme was in use. Pictures are already inside `folders` when they
 * were asked for -- App fetches them first.
 */
export function buildExport({ folders = [], include = {}, themes = null, now = Date.now() } = {}) {
  const file = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date(now).toISOString(),
    folders: (folders || []).map(folder => {
      const out = {
        name: folder.name,
        blocks: Array.isArray(folder.blocks) ? folder.blocks : [],
        modeOrders: folder.modeOrders && typeof folder.modeOrders === 'object' ? folder.modeOrders : {}
      };
      if (include.settings && folder.modeSettings) out.modeSettings = folder.modeSettings;
      return out;
    })
  };
  if (include.themes && themes) {
    file.themes = {
      custom: Array.isArray(themes.custom) ? themes.custom : [],
      selectedId: themes.selectedId ?? null
    };
  }
  return file;
}

/**
 * What a file holds, whatever age it is: `{ folders, themes, legacy }`, or
 * `{ error }` when it is not something this app wrote.
 */
export function readExport(text, fileName = '') {
  let data;
  try {
    data = typeof text === 'string' ? JSON.parse(text) : text;
  } catch {
    return { error: 'This file is not a JSON file.' };
  }

  const fallbackName = nameFromFile(fileName) || 'Imported';
  const folderOf = (raw, name) => ({
    name: String(name ?? '').trim() || fallbackName,
    blocks: Array.isArray(raw?.blocks) ? raw.blocks : [],
    modeOrders: raw?.modeOrders && typeof raw.modeOrders === 'object' ? raw.modeOrders : {},
    modeSettings: raw?.modeSettings && typeof raw.modeSettings === 'object' ? raw.modeSettings : null
  });

  if (data && typeof data === 'object' && data.format === EXPORT_FORMAT) {
    const folders = (Array.isArray(data.folders) ? data.folders : [])
      .filter(folder => folder && typeof folder === 'object')
      .map(folder => folderOf(folder, folder.name));
    const themes = data.themes && typeof data.themes === 'object'
      ? {
          custom: Array.isArray(data.themes.custom) ? data.themes.custom.filter(t => t && typeof t === 'object') : [],
          selectedId: data.themes.selectedId ?? null
        }
      : null;
    if (!folders.length && !themes) return { error: 'This file has nothing in it to import.' };
    return { folders, themes, legacy: false };
  }

  // Before 2026-10-05: one folder, as the open folder was stored.
  if (Array.isArray(data)) return { folders: [folderOf({ blocks: data }, fallbackName)], themes: null, legacy: true };
  if (data && typeof data === 'object' && Array.isArray(data.blocks)) {
    return { folders: [folderOf(data, fallbackName)], themes: null, legacy: true };
  }
  return { error: 'This file is not an Austavia export.' };
}

/**
 * What an import does, from what was chosen.
 *
 * - `folders`: the names chosen from the file (all of them when not given).
 * - `settings`: bring each folder's settings with it; without, a new folder
 *   starts on the defaults and a replaced one keeps its own.
 * - `target`: `'new'` (the default) puts each in a folder of its own, named
 *   by `uniqueName`; `'replace'` writes the one chosen folder over the open
 *   folder, and needs exactly one.
 * - `themes`: add the file's custom themes, each under a name no theme has.
 *
 * Returns `{ writes: [{ name, blocks, modeOrders, modeSettings, replaces }],
 * themes: [...] }`, or `{ error }`.
 */
export function planImport({
  file,
  folders = null,
  settings = true,
  themes = true,
  target = 'new',
  existingFolders = [],
  currentFolder = '',
  existingThemeNames = []
} = {}) {
  if (!file || file.error) return { error: file?.error || 'Nothing to import.' };
  const chosen = (file.folders || []).filter(folder => !folders || folders.includes(folder.name));

  let writes = [];
  if (target === 'replace') {
    if (chosen.length !== 1) return { error: 'Choose one folder to put in place of this one.' };
    if (!currentFolder) return { error: 'There is no open folder to replace.' };
    const [folder] = chosen;
    writes = [{
      name: currentFolder,
      blocks: folder.blocks,
      modeOrders: folder.modeOrders,
      modeSettings: settings ? folder.modeSettings : undefined,
      replaces: true
    }];
  } else {
    const taken = [...existingFolders];
    writes = chosen.map(folder => {
      const name = uniqueName(folder.name, taken);
      taken.push(name);
      return {
        name,
        blocks: folder.blocks,
        modeOrders: folder.modeOrders,
        modeSettings: settings ? folder.modeSettings : null,
        replaces: false
      };
    });
  }

  const themeNames = [...existingThemeNames];
  const addedThemes = themes && file.themes
    ? file.themes.custom.map(theme => {
        const name = uniqueName(theme.name, themeNames, 'Imported theme');
        themeNames.push(name);
        return { ...theme, name };
      })
    : [];

  return { writes, themes: addedThemes };
}
