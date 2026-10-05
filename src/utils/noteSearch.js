/**
 * Finding a note from Single Note mode.
 *
 * ## What was asked for
 *
 * "Put the case that shows the note's title before the 'Words:', then when
 * someone clicks on that title it will open a searching page that will show
 * the notes in that folder first and the notes in other folders after a
 * separator. That page is in the mode of course, like always, and will follow
 * the mode's theme ... everywhere. So that now the note titles and the word
 * count are only one line high instead of two." -- 2026-10-05.
 *
 * The row of tabs it replaces took a line of its own, and grew a second one as
 * soon as there were more notes than would fit across.
 *
 * ## What is decided here
 *
 * What a note is called, which notes a search finds, and in what order: this
 * folder's notes as the folder keeps them, then every other folder's, grouped
 * by folder in name order -- each folder a heading with its notes under it,
 * and a folder with none not shown at all ("it'll show easier for people which
 * note is where", 2026-10-05). The page itself (NotePicker.svelte) only draws
 * it.
 *
 * Each entry also carries what its card is drawn with: the note's own colours,
 * and the last picture in it, shown beside the text -- asked for the same day.
 */
import { htmlToText } from './htmlToText.js';

export const TITLE_LENGTH = 28;
// Four lines' worth on a wide card -- the list holds up to four lines of what
// the note says (asked for on 2026-10-05) -- and the page cuts it to fit.
const SNIPPET_LENGTH = 360;

/** A note's name: its first line, or "Note N" when it has none yet. */
export function noteTitle(content, index = 0) {
  const firstLine = htmlToText(content || '').split('\n')[0]?.trim();
  if (firstLine) return firstLine.length > TITLE_LENGTH ? `${firstLine.slice(0, TITLE_LENGTH)}…` : firstLine;
  return `Note ${index + 1}`;
}

/** What follows the first line, for telling two similar notes apart. */
function snippetOf(text) {
  const rest = text.split('\n').slice(1).join(' ').replace(/\s+/g, ' ').trim();
  return rest.length > SNIPPET_LENGTH ? `${rest.slice(0, SNIPPET_LENGTH)}…` : rest;
}

/** The last picture in a note's writing, or null. The newest one is the likeliest to say what it is. */
export function lastPicture(content) {
  const sources = [...String(content || '').matchAll(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)].map(m => m[1]);
  return sources.length ? sources[sources.length - 1] : null;
}

/**
 * A folder's picture: the first one in it, in the folder's order -- an
 * image block's, or the first picture in a note's writing, whichever comes
 * first. Every note of the folder shows it on the search page, so a folder
 * keeps one face and is easier to recognise -- asked for on 2026-10-05, in
 * place of each note's own last picture.
 */
export function firstPicture(blocks = []) {
  for (const block of blocks || []) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'image') {
      const src = block.resolvedSrc || block.src;
      if (typeof src === 'string' && src) return src;
    } else if (block.type === 'text' || block.type === 'cleantext') {
      const match = String(block.content || '').match(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i);
      if (match) return match[1];
    }
  }
  return null;
}

function entriesOf(notes = [], folder = '', wallpaper = null, folderPicture = null) {
  return (notes || []).map((note, index) => {
    const text = htmlToText(note?.content || '');
    return {
      id: note?.id,
      folder,
      title: noteTitle(note?.content, index),
      snippet: snippetOf(text),
      // The folder's picture, the same on every one of its notes.
      picture: folderPicture,
      bgColor: note?.bgColor || null,
      textColor: note?.textColor || null,
      // The folder's wallpaper settings, drawn behind the card so the folder
      // can be told at a glance -- asked for on 2026-10-05.
      wallpaper,
      // What a search looks through: the writing, the note's name -- the
      // "Note 3" a note with no writing is given included -- and the name of
      // its folder. Asked for on 2026-10-05: searching a folder's name finds
      // every note in it, and "note 1" finds the notes called that.
      text: `${noteTitle(note?.content, index)}\n${text}\n${folder}`.toLowerCase()
    };
  });
}

/**
 * The notes to show for a search.
 *
 * `here` is this folder's notes, in its order, and `hereWallpaper` its
 * wallpaper settings; `elsewhere` is `[{ folder, notes, wallpaper }]` for the
 * others. An empty query finds everything. A
 * note matches when its writing contains every word of the query, in any
 * order and any case.
 */
/**
 * How well an entry answers a search, best first: named exactly that, then
 * named with it, then in a folder named with it, then anything else that
 * matched. Keeps "note 1" from burying "Note 1" under every note that merely
 * mentions a note and a 1.
 */
function rank(entry, phrase) {
  if (!phrase) return 0;
  const title = entry.title.toLowerCase();
  if (title === phrase) return 0;
  if (title.includes(phrase)) return 1;
  if (String(entry.folder).toLowerCase().includes(phrase)) return 2;
  return 3;
}

function matcher(query) {
  const phrase = String(query || '').trim().toLowerCase();
  const words = phrase.split(/\s+/).filter(Boolean);
  const matches = entry => words.every(word => entry.text.includes(word));
  // Stable: equal ranks keep the folder's own order.
  const order = list => list
    .map((entry, i) => ({ entry, i, r: rank(entry, phrase) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(({ entry }) => entry);
  return { matches, order };
}

const strip = ({ text, ...entry }) => entry;

export function searchNotes({ currentFolder = '', here = [], hereWallpaper = null, herePicture = null, elsewhere = [], query = '' } = {}) {
  const { matches, order } = matcher(query);

  const inThisFolder = order(entriesOf(here, currentFolder, hereWallpaper, herePicture).filter(matches)).map(strip);

  const inOthers = [...(elsewhere || [])]
    .filter(group => group && group.folder !== currentFolder)
    .sort((a, b) => String(a.folder).localeCompare(String(b.folder)))
    .map(group => ({
      folder: group.folder,
      // Drawn behind the whole category, its notes on top of it.
      wallpaper: group.wallpaper || null,
      notes: order(entriesOf(group.notes, group.folder, group.wallpaper || null, group.picture || null).filter(matches)).map(strip)
    }))
    .filter(group => group.notes.length > 0);

  return { here: inThisFolder, elsewhere: inOthers };
}

/**
 * The other way to show the search page: a shelf of folders along the top
 * and the notes as a grid of tiles. Proposed on 2026-10-05 and asked to be
 * built beside the list of categories, with a switch between the two.
 *
 * - `folders`: this folder first, then the others by name, each with how many
 *   notes it holds and its wallpaper -- only folders that hold any.
 * - `notes`: the tiles to show -- one folder's (`folder`), or every folder's
 *   with this one's first (`'all'`), narrowed and ordered by the search.
 * - `recent`: the notes last opened, newest first, from `recentlyOpened`
 *   (`[{ folder, id }]`), only where they still exist -- shown while nothing
 *   is being searched for and every folder is in view.
 */
export function shelfView({ currentFolder = '', here = [], hereWallpaper = null, herePicture = null, elsewhere = [], query = '', folder = 'all', recentlyOpened = [] } = {}) {
  const groups = [
    { folder: currentFolder, wallpaper: hereWallpaper, entries: entriesOf(here, currentFolder, hereWallpaper, herePicture), here: true },
    ...[...(elsewhere || [])]
      .filter(group => group && group.folder !== currentFolder)
      .sort((a, b) => String(a.folder).localeCompare(String(b.folder)))
      .map(group => ({ folder: group.folder, wallpaper: group.wallpaper || null, entries: entriesOf(group.notes, group.folder, group.wallpaper || null, group.picture || null), here: false }))
  ].filter(group => group.entries.length > 0);

  const folders = groups.map(group => ({ folder: group.folder, count: group.entries.length, wallpaper: group.wallpaper, here: group.here }));

  const { matches, order } = matcher(query);
  const chosen = folder === 'all' ? groups : groups.filter(group => group.folder === folder);
  const notes = order(chosen.flatMap(group => group.entries).filter(matches)).map(strip);

  const searching = String(query || '').trim() !== '';
  const byKey = new Map(groups.flatMap(group => group.entries.map(entry => [`${entry.folder}\n${entry.id}`, entry])));
  const recent = searching || folder !== 'all'
    ? []
    : (recentlyOpened || [])
        .map(item => byKey.get(`${item?.folder}\n${item?.id}`))
        .filter(Boolean)
        .map(strip);

  return { folders, notes, recent };
}
