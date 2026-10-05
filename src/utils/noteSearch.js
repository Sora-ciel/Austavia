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
const SNIPPET_LENGTH = 90;

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

function entriesOf(notes = [], folder = '') {
  return (notes || []).map((note, index) => {
    const text = htmlToText(note?.content || '');
    return {
      id: note?.id,
      folder,
      title: noteTitle(note?.content, index),
      snippet: snippetOf(text),
      picture: lastPicture(note?.content),
      bgColor: note?.bgColor || null,
      textColor: note?.textColor || null,
      text: text.toLowerCase()
    };
  });
}

/**
 * The notes to show for a search.
 *
 * `here` is this folder's notes, in its order; `elsewhere` is
 * `[{ folder, notes }]` for the others. An empty query finds everything. A
 * note matches when its writing contains every word of the query, in any
 * order and any case.
 */
export function searchNotes({ currentFolder = '', here = [], elsewhere = [], query = '' } = {}) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  const matches = entry => words.every(word => entry.text.includes(word));
  const strip = ({ text, ...entry }) => entry;

  const inThisFolder = entriesOf(here, currentFolder).filter(matches).map(strip);

  const inOthers = [...(elsewhere || [])]
    .filter(group => group && group.folder !== currentFolder)
    .sort((a, b) => String(a.folder).localeCompare(String(b.folder)))
    .map(group => ({ folder: group.folder, notes: entriesOf(group.notes, group.folder).filter(matches).map(strip) }))
    .filter(group => group.notes.length > 0);

  return { here: inThisFolder, elsewhere: inOthers };
}
