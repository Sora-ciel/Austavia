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
 *   - Simple Note shows them in columns, Single Note the writing as tabs;
 *   - Page shows the ones put on its page, one under another, two side by side;
 *   - Task shows the task list, Calendar the calendar;
 *   - Habit Tracker shows the habits in the folder's settings;
 *   - Playlist is music on this device, so a note says how to add some.
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
const list = items => `<ul>${items.map(item => `<li><p>${item}</p></li>`).join('')}</ul>`;

/** The writing, one note per mode, in the order they are met. */
export const NEWCOMER_NOTES = [
  {
    key: 'welcome',
    content: h('Start here')
      + p('This is a <strong>folder</strong>. Everything in it is a <strong>block</strong>: this writing, the task list, the calendar, the clock.')
      + p('A <strong>mode</strong> is a way of looking at the same blocks. Press <strong>Mode</strong> (at the bottom on a phone, in the column on the left on a computer) and try each one: the blocks stay the same, only how they are shown changes.')
      + p('Signed in, every folder syncs between your devices. This one is yours now: change it, rename it, or throw it away. You can get it back from Saved Files.')
  },
  {
    key: 'canvas',
    content: h('Canvas')
      + p('A board with room for everything. Each block sits where you put it.')
      + list([
        'Drag a block by its top bar to move it, and by its corner to size it.',
        'Right-click a block (hold it on a phone) for its menu.',
        'Ctrl + scroll to zoom; right-click and drag the empty board to move around.',
        'Add blocks from <strong>Menu</strong>.'
      ])
  },
  {
    key: 'simple',
    content: h('Simple Note')
      + p('The same blocks in tidy columns, to read and write without arranging anything. The number of columns is in the mode\'s settings.')
  },
  {
    key: 'single',
    content: h('Single Note')
      + p('One piece of writing at a time, full screen. Every text block in the folder is a tab; press the note\'s name to find another.')
      + p('Writing works the same everywhere: <strong>bold</strong>, <em>italic</em>, lists, headings, and <code>/</code> on a page for any kind of block.')
  },
  {
    key: 'page',
    content: h('Page')
      + p('A document. Click below the last line to write, or type <strong>/</strong> to put in a block of any kind.')
      + p('Press the pencil for edit mode: move a block by its dot, put two side by side, and size pictures. The task list and the clock below are side by side.')
  },
  {
    key: 'more',
    content: h('Task, Calendar, Habit Tracker, Playlist')
      + list([
        '<strong>Task</strong> shows the folder\'s task lists. Tick a task to finish it; double-click it to change it; right-click it (hold on a phone) to give it an objective -- a time to spend or a number of times.',
        '<strong>Calendar</strong> shows the calendar a day at a time. Click an empty hour to plan something; drag it to move it. On a phone, pinch to make the hours taller.',
        '<strong>Habit Tracker</strong> keeps habits. Tap a day to mark it done, missed or skipped.',
        '<strong>Playlist</strong> plays music kept on this device: press <strong>Add music</strong> there.'
      ])
      + p('The camera button takes a picture of whatever mode you are in.')
  }
];

/**
 * The folder, as stored. `today` is the device's day ('YYYY-MM-DD'); `newId`
 * makes ids (crypto.randomUUID in the app).
 */
export function newcomerFolder({ today, newId = () => crypto.randomUUID() } = {}) {
  const ids = {};
  const id = key => (ids[key] ||= newId());

  // The Canvas: two columns of writing, the working blocks to their right.
  const COL = 340;
  const at = (col, y) => ({ x: 40 + col * COL, y });
  const notes = NEWCOMER_NOTES.map((note, index) => ({
    id: id(note.key),
    type: 'text',
    content: note.content,
    src: '',
    position: at(index % 2, 40 + Math.floor(index / 2) * 460),
    size: { width: 320, height: 440 }
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
    position: at(2, 40),
    size: { width: 320, height: 380 }
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
    position: at(2, 450),
    size: { width: 260, height: 150 }
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
    position: at(3, 40),
    size: { width: 340, height: 480 }
  };

  // A week of marks, so the tracker has something to show on its first day.
  const log = marks => Object.fromEntries(marks.map(([back, mark]) => [dayAfter(today, -back), mark]));
  const habits = [
    { id: newId(), name: 'Read', log: log([[6, 'done'], [5, 'done'], [4, 'missed'], [3, 'done'], [2, 'skipped'], [1, 'done']]) },
    { id: newId(), name: 'Walk', log: log([[5, 'done'], [3, 'done'], [1, 'done']]) },
    { id: newId(), name: 'Stretch', log: {} }
  ];

  // The page: the welcome and how a page works, then two blocks side by
  // side, then the calendar.
  const page = {
    rows: [
      { cells: [{ blockId: id('welcome') }] },
      { cells: [{ blockId: id('page') }] },
      { cells: [{ blockId: id('tasks') }, { blockId: id('clock') }] },
      { cells: [{ blockId: id('calendar') }] },
      { cells: [{ blockId: id('more') }] }
    ]
  };

  return {
    blocks: [...notes, tasks, clock, calendar],
    modeSettings: { page, habit: { habits } }
  };
}
