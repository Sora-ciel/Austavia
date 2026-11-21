/**
 * Exporting a folder with the folders its nests lead to.
 *
 * Asked 2026-11-21: "when exporting. it should take count of what is nested.
 * and ask if you want to export what is nested on the first level too. or to
 * the level you want. or all nested ... so 4 options. no nest, nest to 1
 * level. nest to ... level (you can choose up to max), nest max (shows the
 * number that is the max)".
 *
 * A nest holds links to folders (`{ folderId, name }`, NestBlock.svelte),
 * not the folders themselves, so what is "inside" a folder is whatever its
 * nests link to; one level further is whatever *their* nests link to. Links
 * to pages of the same folder are already in it and are not followed.
 *
 * Links can go round -- a folder nested in a folder that nests it -- so each
 * folder is counted once, at the first level it is reached.
 */

/** The ids of the folders a folder's nests link to, in order, each once. */
export function nestedFolderIds(payload) {
  const ids = [];
  for (const block of Array.isArray(payload?.blocks) ? payload.blocks : []) {
    if (block?.type !== 'nest' || !Array.isArray(block.links)) continue;
    for (const link of block.links) {
      if (link?.folderId && !ids.includes(link.folderId)) ids.push(link.folderId);
    }
  }
  return ids;
}

/**
 * The folders to export, from `start` (names) down to `depth` levels of
 * nests (0: none; Infinity: all). `load(name)` reads a folder; `directory`
 * is every folder as `{ id, name }` (App.svelte's folder directory).
 *
 * Returns `{ names, deepest }`: the folders, `start` first, and the deepest
 * level reached -- with `depth` Infinity, the most levels there are to
 * choose from. A link to a folder that no longer exists is left out.
 */
export async function foldersWithNests({ start = [], depth = 0, load, directory = [] } = {}) {
  const nameOf = new Map(directory.filter(folder => folder?.id).map(folder => [folder.id, folder.name]));
  const names = [];
  const seen = new Set();
  let level = start.filter(name => name && !seen.has(name) && seen.add(name));
  names.push(...level);
  let deepest = 0;
  for (let at = 1; at <= depth && level.length; at += 1) {
    const next = [];
    for (const name of level) {
      let payload = null;
      try { payload = await load(name); } catch { payload = null; }
      for (const id of nestedFolderIds(payload)) {
        const found = nameOf.get(id);
        if (!found || seen.has(found)) continue;
        seen.add(found);
        next.push(found);
      }
    }
    if (!next.length) break;
    names.push(...next);
    deepest = at;
    level = next;
  }
  return { names, deepest };
}
