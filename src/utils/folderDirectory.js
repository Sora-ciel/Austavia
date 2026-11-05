/**
 * What a nest shows of each folder: its name, its id (utils/folderIdentity.js)
 * and a cover -- the folder's wallpaper, or else its first picture.
 *
 * Worked out from the folders themselves every time the list of folders
 * changes, whole, never kept up to date by edits (CLAUDE.md, "anything driven
 * by events needs something that recomputes"): a cover or a name that has
 * changed is right the next time it is looked at.
 */
import { folderIdOf } from './folderIdentity.js';

const usable = src => typeof src === 'string' && /^(data:image\/|https?:|blob:)/.test(src);

/** One folder's card, from its stored payload. */
export function folderCard(name, payload) {
  const settings = payload?.modeSettings || {};
  const wallpaper = settings.default?.backgroundImage;
  const picture = (payload?.blocks || []).find(block => block?.type === 'image' && usable(block.src))?.src;
  return {
    name,
    id: folderIdOf(name, settings),
    cover: usable(wallpaper) ? wallpaper : picture || '',
    blocks: (payload?.blocks || []).length
  };
}
