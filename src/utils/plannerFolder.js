/**
 * The study and work planner: a folder ready to use, built on pages.
 *
 * Asked 2026-11-22: "another example folder for beginners that is basically a
 * whole made folder using pages and everything for almost ready use with the
 * utmost best style using bgs that look a bit professional". Sora chose a
 * study / work planner, and backgrounds made by Claude, abstract, so no one
 * else's art ships (PENDING, "Starter folders").
 *
 * The folder's own page is the home: today's tasks, the clock, the week's
 * calendar and the way to every other page. Each page is a page block --
 * a weekly plan, a course, a project, a reading list, notes -- holding its
 * own writing and task list, so opening one is opening a part of the plan.
 * Everything is an ordinary block or setting: rename, change or delete any
 * of it. On the Canvas the pages show as previews of themselves beside the
 * home's blocks (PageBlock.svelte); what is inside them is not loose there.
 *
 * The wallpaper is bundled with the app (public/starter/, made by
 * scripts/starterBackgrounds.sh): dark slate with soft light and a faint dot
 * grid, for white writing. On the Canvas the blocks are glass over it.
 *
 * Pure, as newcomerFolder.js: today and the ids come in.
 */

import { BACKGROUND_DEFAULTS } from './modeBackground.js';

export const PLANNER_FOLDER_NAME = 'Study & Work Planner';

export const PLANNER_WALLPAPER = {
  desktop: '/starter/planner-desktop.webp',
  phone: '/starter/planner-phone.webp'
};

/** The day `days` after a 'YYYY-MM-DD' key. */
function dayAfter(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The Monday of the week `key` is in. */
function mondayOf(key) {
  const [y, m, d] = key.split('-').map(Number);
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // Monday 0
  return dayAfter(key, -weekday);
}

const p = text => `<p>${text}</p>`;
const h = text => `<h2>${text}</h2>`;
const h3 = text => `<h3>${text}</h3>`;
const list = items => `<ul>${items.map(item => `<li><p>${item}</p></li>`).join('')}</ul>`;
// Boxes to tick inside writing (TipTap's task list), for checklists that
// are part of a note rather than tasks of their own.
const checklist = items => `<ul data-type="taskList">${items.map(item => `<li data-type="taskItem" data-checked="false"><p>${item}</p></li>`).join('')}</ul>`;

// Glass over the wallpaper, on the Canvas. On a page, blocks are drawn on the
// page itself and these do not show.
const GLASS = { bgColor: 'rgba(14, 20, 32, 0.72)', textColor: '#e8edf5' };
const MIN = 60;

export function plannerFolder({ today, newId = () => crypto.randomUUID() } = {}) {
  const ids = {};
  const id = key => (ids[key] ||= newId());
  const monday = mondayOf(today);
  const blocks = [];
  const add = (key, type, fields, place) => {
    blocks.push({ id: id(key), type, content: '', src: '', ...GLASS, ...fields, ...place });
  };
  const at = (x, y, width, height) => ({ position: { x, y }, size: { width, height } });
  const task = (text, extra = {}) => ({ id: newId(), text, done: false, ...extra });
  const timeGoal = (minutes, daily = true) => ({ kind: 'time', target: minutes, targetSeconds: minutes * 60, progress: 0, daily, day: daily ? today : null, runningSince: null, finishedAt: null });
  const countGoal = (times, daily = false) => ({ kind: 'count', target: times, progress: 0, daily, day: daily ? today : null, runningSince: null, finishedAt: null });

  // ── Home ──────────────────────────────────────────────────────────────
  add('intro', 'text', {
    content: p('Plan the week on Sunday, look at <strong>Today</strong> every morning, and keep each course or project on its own page. Everything here is yours: rename it, change it, delete what you do not need.')
  }, at(24, 24, 420, 190));
  add('today', 'task', {
    title: 'Today',
    tasks: [
      task('Deep work: 90 minutes on the report', { goal: timeGoal(90) }),
      task('Mathematics: exercises 4.1 to 4.6'),
      task('Reply to the group about Thursday'),
      task('Review this week\'s notes', { goal: timeGoal(20) })
    ]
  }, at(24, 226, 420, 634));
  add('clock', 'clock', { hour12: false, showSeconds: false, showDate: true, alarmTime: '07:30', alarmEnabled: false }, at(460, 24, 300, 160));
  add('week', 'calendar', {
    title: 'This week',
    events: [
      { id: newId(), date: monday, start: 9 * MIN, end: 11 * MIN, title: 'Deep work', allDay: false, color: '#4f7cd6', repeat: { every: 1, unit: 'week' }, skip: [] },
      { id: newId(), date: dayAfter(monday, 2), start: 9 * MIN, end: 11 * MIN, title: 'Deep work', allDay: false, color: '#4f7cd6', repeat: { every: 1, unit: 'week' }, skip: [] },
      { id: newId(), date: dayAfter(monday, 1), start: 14 * MIN, end: 16 * MIN, title: 'Mathematics lecture', allDay: false, color: '#3a9c8f', repeat: { every: 1, unit: 'week' }, skip: [] },
      { id: newId(), date: dayAfter(monday, 3), start: 10 * MIN, end: 11 * MIN, title: 'Project meeting', allDay: false, color: '#8a6fd1', repeat: { every: 1, unit: 'week' }, skip: [] },
      { id: newId(), date: dayAfter(monday, 4), start: 16 * MIN, end: 16 * MIN + 30, title: 'Weekly review', allDay: false, color: '#c9a24a', repeat: { every: 1, unit: 'week' }, skip: [] },
      { id: newId(), date: dayAfter(monday, 6), start: 18 * MIN, end: 18 * MIN + 30, title: 'Plan the week', allDay: false, color: '#c9a24a', repeat: { every: 1, unit: 'week' }, skip: [] },
      { id: newId(), date: dayAfter(today, 6), start: 10 * MIN, end: 11 * MIN, title: 'Mathematics quiz', allDay: false, color: '#d0605e' },
      { id: newId(), date: dayAfter(today, 10), start: 0, end: 24 * MIN, title: 'Report: first draft due', allDay: true, color: '#d0605e' }
    ]
  }, at(460, 200, 520, 660));

  // ── The pages, and what is on them ───────────────────────────────────
  const page = (key, title, rows, place) => add(key, 'page', { title, rows: rows.map(cells => ({ cells: cells.map(k => ({ blockId: id(k) })) })) }, place);

  add('plan-text', 'text', {
    content: h('The week')
      + h3('Three things that matter')
      + checklist(['The one that moves everything else', 'The one with a deadline', 'The one you keep putting off'])
      + h3('Must, should, could')
      + list(['<strong>Must</strong> -- ', '<strong>Should</strong> -- ', '<strong>Could</strong> -- '])
      + h3('On Friday')
      + p('What went well, what got in the way, what changes next week.')
  }, at(1000, 24, 380, 520));
  add('plan-tasks', 'task', {
    title: 'This week',
    tasks: [
      task('Six hours of deep work', { goal: timeGoal(360, false) }),
      task('Exercises done', { goal: countGoal(20) }),
      task('Plan next week on Sunday')
    ]
  }, at(1000, 560, 380, 300));
  page('plan', 'Weekly plan', [['plan-text'], ['plan-tasks']], at(1000, 24, 400, 420));

  add('course-text', 'text', {
    content: h('Mathematics')
      + p('<strong>Teacher</strong> -- &nbsp; <strong>Room</strong> -- &nbsp; <strong>Exam</strong> -- ')
      + h3('Chapters')
      + checklist(['1. Sets and functions', '2. Limits', '3. Derivatives', '4. Integrals'])
      + h3('Notes')
      + p('Write as you go; type <strong>/</strong> for a picture of the board, a table, or a block of any kind.')
  }, at(1400, 24, 380, 520));
  add('course-tasks', 'task', {
    title: 'Mathematics',
    tasks: [
      task('Exercises 4.1 to 4.6', { goal: countGoal(6) }),
      task('Revise chapter 3 for the quiz', { goal: timeGoal(45, false) }),
      task('Ask about exercise 3.9')
    ]
  }, at(1400, 560, 380, 300));
  page('course', 'Course: Mathematics', [['course-text'], ['course-tasks']], at(1416, 24, 400, 420));

  add('project-text', 'text', {
    content: h('Report')
      + p('<strong>Goal</strong> -- what it should show, in one sentence.')
      + p('<strong>Due</strong> -- the first draft is in the calendar.')
      + h3('Milestones')
      + checklist(['Outline', 'Sources gathered', 'First draft', 'Feedback', 'Final version'])
      + h3('Decisions')
      + p('Keep what was decided and why, so nobody has to remember it.')
  }, at(1800, 24, 380, 520));
  add('project-tasks', 'task', {
    title: 'Report',
    tasks: [
      task('Write every day', { goal: timeGoal(60) }),
      task('Read the three main sources'),
      task('Send the outline for feedback')
    ]
  }, at(1800, 560, 380, 300));
  page('project', 'Project: Report', [['project-text'], ['project-tasks']], at(1000, 460, 400, 400));

  add('reading-text', 'text', {
    content: h('Reading list')
      + checklist(['A book for the course', 'An article for the report', 'Something just for you'])
      + p('Add one when you hear of it; tick it when it is done.')
  }, at(2200, 24, 380, 360));
  page('reading', 'Reading list', [['reading-text']], at(1416, 460, 400, 190));

  add('notes-text', 'text', {
    content: h('Notes')
      + p('<strong>Date</strong> -- &nbsp; <strong>Topic</strong> -- ')
      + h3('Key points')
      + list(['What was said', 'What it means for you'])
      + h3('Questions')
      + list(['What to ask next time'])
      + h3('Next steps')
      + checklist(['Who does what, by when'])
  }, at(2200, 400, 380, 460));
  page('notes', 'Notes', [['notes-text']], at(1416, 666, 400, 194));

  // The home page: what to do today beside the clock, the week, the pages.
  // A heading for the home page; on the Canvas the pages are beside it, so
  // it stays off the Canvas (utils/canvasShown.js).
  add('pages-heading', 'text', { content: h3('Pages'), onCanvas: false }, at(24, 682, 420, 60));
  const home = {
    rows: [
      { cells: [{ blockId: id('intro') }] },
      { cells: [{ blockId: id('today') }, { blockId: id('clock') }] },
      { cells: [{ blockId: id('week') }] },
      { cells: [{ blockId: id('pages-heading') }] },
      { cells: [{ blockId: id('plan') }, { blockId: id('course') }] },
      { cells: [{ blockId: id('project') }, { blockId: id('reading') }] },
      { cells: [{ blockId: id('notes') }] }
    ]
  };

  const habits = ['Deep work', 'Review notes', 'Sleep by 23:00'].map(name => ({ id: newId(), name, log: {} }));

  return {
    blocks,
    modeSettings: {
      page: home,
      habit: { habits },
      simple: { columnCount: 2 },
      task: { addDirection: 'below' },
      default: {
        ...BACKGROUND_DEFAULTS,
        backgroundImage: PLANNER_WALLPAPER.desktop,
        backgroundImageMobile: PLANNER_WALLPAPER.phone
      }
    }
  };
}
