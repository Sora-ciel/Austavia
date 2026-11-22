/**
 * The newcomer folder: one folder that shows how Austavia works in every
 * mode it has.
 *
 * Asked 2026-11-21: "take your time to also create a beginner, or newcomer
 * folder that shows how the app works in all the modes we have rn." PENDING
 * had owed it since 2026-10-12 ("an example folder instead of an empty
 * canvas"), with Sora's own drawings to come later.
 *
 * It is an ordinary folder, built from the same blocks anybody makes, which
 * is the lesson itself: one folder, the same blocks, a different way of
 * showing them in each mode (CLAUDE.md, "a mode only shows blocks"). So:
 *   - Canvas lays every block out on the board, where each one was put;
 *   - Simple Note shows them in columns, Single Note the writing;
 *   - Page shows the ones put on its page, one under another, two side by side;
 *   - Task shows the task list, Calendar the calendar;
 *   - Habit Tracker shows the habits in the folder's settings;
 *   - Playlist is music on this device, so the guide says how to add some.
 *
 * Made on a fresh device with no folders (App.svelte), and from the Saved
 * Files panel whenever somebody wants it back. It is theirs once made: they
 * can change it, rename it or throw it away, and it syncs like any folder.
 *
 * `newcomerFolder` is pure: today's date and the ids come in, so it can be
 * tested and every device makes the same shape.
 */

export const NEWCOMER_FOLDER_NAME = 'Welcome to Austavia';

/** The day `days` after a 'YYYY-MM-DD' key, as a key. */
function dayAfter(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

const p = text => `<p>${text}</p>`;
const h = text => `<h2>${text}</h2>`;
const h3 = text => `<h3>${text}</h3>`;
const list = items => `<ul>${items.map(item => `<li><p>${item}</p></li>`).join('')}</ul>`;
// A screen of the app, bundled with it (public/guide/, scripts/guideShots.mjs):
// the same on every device, offline, and no one's storage.
const screen = (name, alt) => `<p><img src="/guide/${name}.webp" alt="${alt}"></p>`;

/**
 * The guide: one block that explains everything, with screens of the app in
 * it (asked 2026-11-22: "one block that explains everything ... with screens
 * inside showing how everything works. from teaching what the app does. to
 * even how to change themes or custom them"). Kept as one text block so it
 * reads the same in every mode, and can be changed like any writing.
 */
export const GUIDE_HTML =
  h('How Austavia works')
  + p('Austavia keeps your notes, tasks, plans, habits and music together, in <strong>folders</strong>. Everything in a folder is a <strong>block</strong>: this guide, the task list, the calendar, the clock. A <strong>mode</strong> is a way of looking at the same blocks -- switch modes and nothing moves or disappears, it is only shown differently.')
  + screen('pc-default', 'Canvas')
  + h3('Adding blocks')
  + p('Press <strong>Add block</strong> at the top (<strong>Menu</strong> at the bottom on a phone) and pick one: writing, a picture, music, a web page, a clock and alarm, a calendar, a task list, a nest of other folders, or a page.')
  + screen('pc-add-block', 'The Add block list')
  + h3('Modes')
  + p('The first button at the top shows the mode you are in; press it to change. On a phone it is <strong>Mode</strong>, at the bottom.')
  + screen('pc-mode-picker', 'The list of modes')
  + p('<strong>Canvas</strong> -- a board with room for everything. Drag a block by its top bar to move it and by its corner to size it; right-click it (hold it on a phone) for its menu. Ctrl + scroll zooms; right-click and drag the empty board to move around.')
  + p('<strong>Simple Note</strong> -- the same blocks in tidy columns, to read and write without arranging anything.')
  + screen('pc-simple', 'Simple Note')
  + p('<strong>Single Note</strong> -- one piece of writing at a time, full screen. Every text block is a tab; press the note\'s name to find another.')
  + screen('pc-single', 'Single Note')
  + p('<strong>Page</strong> -- a document. Click below the last line to write, or type <strong>/</strong> for a block of any kind. The pencil turns on edit mode: move a block by its dot, put two side by side, size pictures.')
  + screen('pc-page', 'Page')
  + p('<strong>Task</strong> -- the folder\'s task lists, To Do and Done. Tick a task to finish it, double-click it to change it, and right-click it (hold on a phone) to give it an objective: a time to spend, or a number of times.')
  + screen('pc-task', 'Task')
  + p('<strong>Calendar</strong> -- your plans a day at a time, or seven. Click an empty hour to plan something, drag it to move it, and set it to repeat. On a phone, pinch to make the hours taller.')
  + screen('pc-calendar', 'Calendar')
  + p('<strong>Habit Tracker</strong> -- tap a day to mark it done, again for missed, again for skipped. The flame counts the days in a row.')
  + screen('pc-habit', 'Habit Tracker')
  + p('<strong>Playlist</strong> -- music kept on this device. Press <strong>Add music</strong> to bring in files; a music block plays them in any mode.')
  + screen('pc-playlist', 'Playlist')
  + h3('On a phone')
  + p('The bar at the bottom holds everything: <strong>Mode</strong>, <strong>Menu</strong>, the camera and the settings. In Page mode the pencil is there too.')
  + screen('phone-page', 'Austavia on a phone')
  + h3('Folders, and your devices')
  + p('<strong>Settings</strong> (the gear) holds your folders under <strong>Saved Files</strong>: make a new one, open one, or move one to the Bin, where it waits before it goes. <strong>Sign in with Google</strong> and every folder syncs between your computer and your phone by itself.')
  + screen('pc-settings', 'Settings, with Saved Files and Cloud')
  + h3('Themes')
  + p('Further down in Settings, <strong>Style presets</strong> changes how the whole app looks with one press. <strong>Blocks match theme</strong> paints the blocks in the theme\'s colours too, in this folder or in all of them.')
  + screen('pc-themes', 'Style presets')
  + p('<strong>Create custom theme</strong> makes your own: the colours of the bars, the panels and the blocks, their borders, corners and shadows. Save it, and it is in the list with the others -- and on your other devices.')
  + screen('pc-custom-theme', 'The theme builder')
  + h3('And')
  + list([
    'The <strong>camera</strong> button saves a picture of the whole mode you are in, and copies it.',
    'Undo and Redo are at the top, or Ctrl + Z and Ctrl + Shift + Z.',
    'This folder is yours: change it, rename it or throw it away. <strong>Saved Files &gt; Newcomer folder</strong> brings it back.'
  ]);

/** The writing in the folder: the guide. */
export const NEWCOMER_NOTES = [{ key: 'guide', content: GUIDE_HTML }];

/**
 * The folder, as stored. `today` is the device's day ('YYYY-MM-DD'); `newId`
 * makes ids (crypto.randomUUID in the app).
 */
export function newcomerFolder({ today, newId = () => crypto.randomUUID() } = {}) {
  const ids = {};
  const id = key => (ids[key] ||= newId());

  // The Canvas as Sora laid it out (2026-11-22, "I think it's a bit better
  // turned like that"): the writing on the left, with the clock, the
  // calendar and the task list beside it.
  const CANVAS = {
    // The guide where the welcome and the modes' notes were.
    guide: { position: { x: 20, y: 3 }, size: { width: 799, height: 894 } },
    clock: { position: { x: 835, y: 12 }, size: { width: 260, height: 150 } },
    calendar: { position: { x: 1101, y: 12 }, size: { width: 488, height: 886 } },
    tasks: { position: { x: 1594, y: 10 }, size: { width: 305, height: 883 } }
  };
  const notes = NEWCOMER_NOTES.map(note => ({
    id: id(note.key),
    type: 'text',
    content: note.content,
    src: '',
    ...CANVAS[note.key]
  }));

  const tasks = {
    id: id('tasks'),
    type: 'task',
    title: 'Try these',
    content: '',
    src: '',
    tasks: [
      { id: newId(), text: 'Tick me when done', done: false },
      { id: newId(), text: 'Double-click me to change what I say', done: false },
      { id: newId(), text: 'Right-click me (hold on a phone) to give me an objective', done: false },
      {
        id: newId(),
        text: 'Drink three glasses of water',
        done: false,
        goal: { kind: 'count', target: 3, progress: 1, daily: true, day: today, runningSince: null, finishedAt: null }
      },
      { id: newId(), text: 'Open the newcomer folder', done: true }
    ],
    ...CANVAS.tasks
  };

  const clock = {
    id: id('clock'),
    type: 'clock',
    content: '',
    src: '',
    hour12: false,
    showSeconds: false,
    showDate: true,
    alarmTime: '07:00',
    alarmEnabled: false,
    ...CANVAS.clock
  };

  const calendar = {
    id: id('calendar'),
    type: 'calendar',
    title: 'Calendar',
    content: '',
    src: '',
    events: [
      { id: newId(), date: today, start: 9 * 60, end: 10 * 60, title: 'Look around Austavia', allDay: false, color: '' },
      { id: newId(), date: today, start: 12 * 60 + 30, end: 13 * 60 + 30, title: 'Lunch', allDay: false, color: '' },
      { id: newId(), date: dayAfter(today, 1), start: 18 * 60, end: 19 * 60, title: 'Draw something', allDay: false, color: '' },
      {
        id: newId(),
        date: today,
        start: 20 * 60,
        end: 20 * 60 + 30,
        title: 'Plan the week (repeats every week)',
        allDay: false,
        color: '',
        repeat: { every: 1, unit: 'week' },
        skip: []
      }
    ],
    ...CANVAS.calendar
  };

  // A week of marks, so the tracker has something to show on its first day.
  const log = marks => Object.fromEntries(marks.map(([back, mark]) => [dayAfter(today, -back), mark]));
  const habits = [
    { id: newId(), name: 'Read', log: log([[6, 'done'], [5, 'done'], [4, 'missed'], [3, 'done'], [2, 'skipped'], [1, 'done']]) },
    { id: newId(), name: 'Walk', log: log([[5, 'done'], [3, 'done'], [1, 'done']]) },
    { id: newId(), name: 'Stretch', log: {} }
  ];

  // The page: the guide first, then the things to try -- two side by side,
  // then the calendar.
  const page = {
    rows: [
      { cells: [{ blockId: id('guide') }] },
      { cells: [{ blockId: id('tasks') }, { blockId: id('clock') }] },
      { cells: [{ blockId: id('calendar') }] }
    ]
  };

  return {
    blocks: [...notes, tasks, clock, calendar],
    modeSettings: { page, habit: { habits }, simple: { columnCount: 2 } }
  };
}
