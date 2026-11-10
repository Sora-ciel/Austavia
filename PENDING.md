# What is still owed

Everything known-but-not-done, with enough of the why that it can be picked up
cold. Written down because the list has been reconstructed from memory twice,
and both times something fell off it.

Ordered by what to do first. Measurements in here were taken on a desktop; a
phone is several times worse for anything about layout or serialising.

---

## Now, asked 2026-10-26: one of everything, then the habit tracker

Set 2026-10-26. Two halves, in this order, because the second is built on the
first: the habit work is the first thing that has to *use* shared parts
rather than add its own, so the shared parts come first.

The rule behind it, in the user's words: "use the least amount of different
code when two things use the same thing ... like how Linux installs apps
using packages", so that modes can be added, improved or removed without
dragging copies with them. Now in CLAUDE.md as "One of everything".

### First: writing (asked 2026-10-26, after the plan below was set)

"Next thing I'll do is the improvement on writing" -- so this goes ahead of
A and B. Two asks:

**1. A long note lags on the phone.** Reported: "after 3000 words and a couple
of images in Single Note mode it starts lagging on phone". Not measured on a
phone yet -- measure first, on a copy of such a note, before choosing.
What is already known points at two sections below, in this order:

- **Section 2, pictures stored by reference**, is the likely main cause with
  pictures in the note: each picture is megabytes of base64 inside the
  writing, so every save and every undo step copies all of it. Staged in
  four steps there, and it has failed before -- keep to the stages.
- **Section 1a, letting the editor be laid out on its own**: 7ms a keystroke
  at 16k characters on a desktop, several times that on a phone. The obvious
  fix (`contain: layout`) breaks scrolling; the restructure it needs is
  written there.

**2. Everything that is not text behaves like one character** -- done
2026-10-29 (utils/atomCaret.js and TipTapEditor's AtomCaret): one arrow press
steps over a picture, a click on its left or right half puts the cursor on
that side, and beside one the editor draws the cursor itself, since the
browser draws none next to a picture at the edge of a line. Backspace and
Delete already took one in a single press. Not done: dragging a picture to
move it within the text -- cut and paste moves it meanwhile.

### A. Shared parts first

Measured on 2026-10-26, before any of it:

- **The same colour under four names.** The text colour of a mode is
  `--mode-text-color` (Habit, Simple Note, Single Note, Task, Playlist),
  `--text-color` (Simple Note, 26 uses), `--text` (Task, 37 uses) and
  `--active-note-text` (Single Note). The background is `--bg-color`, `--bg`,
  `--active-note-bg`, `--pl-surface`, `--task-surface`.
- **The same line copied four times.** `modeTextColor = canvasTheme.textColor
  || getReadableTextColor(canvasTheme.innerBg)` is written out in Habit, Single
  Note, Simple Note and Task, each building its own `canvasCssVars`.
- **Hardcoded colours** (hex/rgba, fallbacks included): Task 39, Playlist 34,
  Habit 28, Simple Note 24, Single Note 13, Canvas 8.
- **Inputs and buttons styled per file**: 12 components style their own
  `input`/`button`; LeftControls 10 rules, AdvancedCssPage 7, Habit 6.
- **Undo does not reach mode settings.** The history (`pushHistory` /
  `cloneState` in App.svelte) holds blocks and modeOrders only. Habits live in
  `modeSettings.habit.habits`, so the Undo button that exists cannot bring a
  deleted habit back -- and nor can it undo a wallpaper, a Task-mode add
  direction or anything else in modeSettings.

Steps, each landing on its own:

1. ~~One set of mode colour names~~ -- done 2026-10-29: the names in
   CLAUDE.md ("A colour has one name"), the four copies of modeTextColor made
   one, Simple Note's private copy of the readable-colour rule and the unused
   SimpleNoteModeLegacy.svelte removed. Checked by every element's computed
   colours in all six modes, before and after: none changed.
2. **One dialog** -- done for Bin, Export, Import and the habit page
   (`components/AppDialog.svelte`, 2026-10-26). Left: the app's own alert and
   confirm dialog in App.svelte (`.app-dialog*`), which has its own buttons and
   keyboard handling; move it onto AppDialog.
2a. **One picker.** `components/PickerSheet.svelte` (2026-10-28) is the sheet
   Playlist mode chooses a playlist from. Single Note's NotePicker is the same
   shape with more in it -- search, layouts, folders -- and has its own copy of
   the sheet, the head and the rows; move it onto PickerSheet, adding a
   search and a slot for its grid there rather than keeping a second sheet.
2b. **One input, one button, one field.** Base styles in app.css for text
   inputs, buttons (plain, primary, small/icon) and pill toggles, in the
   theme's colours; a component only adds what is truly its own. Converted
   mode by mode, Habit first because it is rebuilt next. A test lists any
   component restyling `input`/`button` from scratch.
3. ~~Undo covers mode settings~~ -- done for habits 2026-10-26
   (`utils/undoableSettings.js`). The wallpaper and the other display
   preferences stay out on purpose; see that file.
4. **Hardcoded colours out of the modes**, as each one is touched, rather
   than as a sweep: a sweep across six modes at once is how a theme breaks
   unnoticed.

### B. The habit tracker (agreed 2026-10-26, numbers from the proposal)

Each built from the parts above, and any new part added as a shared one --
e.g. the Task-mode drop line, the objective editor, the alarm banner.

5. **Colour or emoji per habit**, from the theme's colours or tints of them.
8. **Reminders**, through AlarmRinger -- after background ringing (section 4).
10, 12, 13, 14 (a note on a day, the weekly review, the finished-the-day
moment, archive instead of delete) after these, in an order to be agreed.

## Now, asked 2026-11-10 (third list): look and feel

1. *Done 2026-11-10.* **Calendar, 7 days: the days' row has a background of its own** -- "it
   destroys the styling". No background; it stays put above the hours
   instead of scrolling over them.
2. *Done 2026-11-10.* **Calendar: the arrows inline with the date**, at its height -- they sat
   apart from it and slightly lower.
3. *Done 2026-11-10.* **Calendar: in the app's style rather than Outlook's**; the now line not
   red -- "maybe the opposite of the text's colour".
4. *Done 2026-11-10.* **Page mode: the ⋮⋮ handle a little further right, and better drawn** --
   easier to take a block that sits to the right of another.
5. *Done 2026-11-10.* **Page mode: three ways to drop next to a block that is beside a longer
   one** -- beside it, below the whole row, or "just after the end of
   another block when they are both on the right side of another longer
   block": stacked in that column. A cell can hold blocks one under
   another (`under`), kept by older builds as an unknown field.
6. *Done 2026-11-10.* **Page mode: the arrows and the edit button no longer push the page
   down** -- into the control bar, before the music and the timer.
7. **Habit tracker, below computer width: the day buttons square**, not
   stretched as the screen widens.
8. **Habit tracker on a computer: no dot on a day not pressed**; and
   bigger buttons, and the space used better.

## Now, asked 2026-11-10 (second list), in this order

1. *Done 2026-11-10.* **Task mode: margins halved again, text 5-10% bigger again.**
2. *Done 2026-11-10.* **Page mode: writing beside a picture starts a little lower** -- "the
   uppercase letters are still a bit higher than where the image starts".
3. *Done 2026-11-10.* **Page mode: no big gap between a picture and the writing beside it**
   -- the picture's cell kept half the row while the picture was narrower.
4. *Done 2026-11-10.* **Page mode: close to the full width on a computer**, not 72rem.
5. *Done 2026-11-10.* **Calendar: Ctrl + wheel changes the height of an hour**, kept per
   device.
6. *Done 2026-11-10.* **Calendar: a 7-day view**, beside the day one.
7. *Done 2026-11-10.* **Calendar: a colour per block**, the last one chosen used for the next
   block made.
8. *Done 2026-11-10.* **Calendar: blocks outlined all round in the writing colour.**
9. *Done 2026-11-10.* **Calendar: the block editor and whole-day pop-up as opaque as the right
   controls' panel.**
10. *Done 2026-11-10.* **Nests: a page shows its first picture** as its tile's cover.
11. *Done 2026-11-10.* **The Linux app's copies of songs in /tmp** (the entry below): stop
    leaving them.
12. *First version done 2026-11-10* (CropEditor.svelte, utils/crop.js). Still owed: the "other things we'll be able to do" -- the user's to name. **Page mode: an edit mode** -- "activate an edit mode for that mode
    where you can change the images size even crop it and other things we'll
    be able to do". A toggle; in it a picture on a page can be resized (its
    share of the row, kept per layout on the cell) and cropped (kept on the
    picture block, so the Canvas shows the crop too).

## Now, asked 2026-11-10, in this order

Asked in one message; small ones first, the calendar last because it is the
biggest, the Linux pop-ups after everything.

1. *Done 2026-11-10.* **Task mode: smaller margins, text about 5% bigger** -- "make margins and
   the other style of margin smaller to have more space for text".
2. *Done 2026-11-10.* **Page mode: nests bigger on a computer** -- "the default size of each nest
   block is a bit bigger than that for pcs. right now it's a bit small".
3. *Done 2026-11-10.* **Page mode: a picture and writing on one row start at the same height**
   -- "make the upper part of the first line of text start at the same place
   as the start of the image. right now the text starts slightly higher".
4. *Done 2026-11-10.* **Nests: New folder and New page** -- "you should be able to choose new
   folder or new page too. so that pages can be nested in pages instead of
   always being a different folder." A page that is not a folder is a
   **page block** (`type: 'page'`, its own `title` and `rows`), so it works
   on its own (CLAUDE.md); Page mode opens it in place of the folder's own
   page. A nest links it as `{ pageId, name }` beside folder links.
5. *Done 2026-11-10* (utils/pagePlaces.js). **Page mode: back and forward arrows**, top left, in the mode's colours
   -- "so that if you click and enter a nest you can easily go back or the
   other way around". A history of places (a folder's page, or a page
   block in a folder) kept for the session on this device.
6. *Done 2026-11-10* (pageLayout.js editPage). **Page mode: wider on a computer, and its own layout on a phone** -- "on
   pc use more of the width than on phone ... if i change for the blocks to
   be a certain way in phone, it won't change it for pc too." Two layouts per
   page, `rows` (wide) and `narrowRows` (phone), the narrow one following the
   wide one, stacked, until something is moved on a phone. Putting a block on
   or taking it off a page changes both; moving it, only the one in use.
7. *First version done 2026-11-10* (utils/calendar.js, CalendarBlock.svelte, CalendarMode.svelte). Still owed: 4 days, week, month, year; repeating blocks; a block's colour; dragging a block to another day; reminders. **Calendar: a block, then a mode** -- "put time blocks easily of what you
   will do at a certain hour ... maybe 12min till the next hour, maybe a
   clean 1h block, or 30. be able to have the day blocked. focus on the day
   by day way of showing the calendar for now. and you will be able to see
   the calendar on other modes, the ones that share all the other blocks".
   A `calendar` block holds `events: [{ id, date, start, end, title,
   allDay }]` (minutes from midnight), day view: hours down the side, drag
   on the empty day to make one (snapped to 5 minutes), drag its edges or
   type the times to make it exactly 12 minutes or an hour, "Whole day" for
   a day blocked. On the Canvas, Simple Note and pages like any block;
   Calendar mode shows the folder's calendar full size. 4 days, week, month
   and year come later.
8. *Cleared away since 2026-11-10* (src-tauri/src/temp_blobs.rs): at start for
   what earlier runs left, and every half hour for copies left alone for 30
   minutes -- only `Blob-XXXXXX` files of this user that no process has open.
   The engine still makes them; if they turn out to matter while the app runs
   (6 GB in a day of tagging is 30 minutes' worth at most now), the next step
   is writing the library's tracks without a Blob each time.
   **The Linux app leaks a copy of every song into /tmp.** Found 2026-11-10:
   3005 files `/tmp/Blob-*`, 6.2 GB, MP3s, made in one day, held open by no
   process -- /tmp (a 7.7 GB tmpfs) filled up and nothing could write, the
   dev server included. They look like WebKitGTK spilling large Blobs to
   disk (the Playlist library hands the player a Blob per track) and never
   removing them. Not yet traced to the line: check whether object URLs
   made for tracks are revoked, and whether the player's source can be the
   stored file rather than a fresh Blob each time. Cleared by hand that day.
8. **Later: the pop-ups of the timer and timed objectives in Task mode do not
   show on Linux** (the desktop pop-ups are the Windows app's only, PENDING
   3b).

## Blocks and their modes (rule in CLAUDE.md, asked 2026-10-27)

Checked against "a block works on its own; a mode only shows blocks" on
2026-10-27:

- **The task block could not use objectives** -- fixed the same day: the goal
  line, the goal menu (right-click, or hold and let go) and the shared
  reordering with the drop line, all from the same pieces Task mode uses.
- **Habits and the music library have no block, and that is decided**
  (2026-10-27): they stay in their modes' settings as the two accepted
  exceptions. So "a page holds every kind of block" means every block; the
  Habit Tracker and the Playlist are not blocks.

## Planned 2026-10-27: Page mode, and nests

Asked: "a mode that is like Notion -- a page mode, where you'll be able to add
folders like the databases in Notion. You'll be able to add the blocks using
'/' and the name of the block or command." And: folders are found inside other
folders "using a link to folders instead of actually being inside, so that in
another folder you can also have that link". Notion's databases are called
**nests** here, "because you'll be able to nest a bunch of things, not just
other folders".

Comes **after the writing work** at the top of this file: a page is mostly
writing, and is no faster than the text blocks it is made of.

### What it is (settled 2026-10-27)

- **A page is a column of blocks, not one document.** Page mode is a seventh
  mode that shows blocks one under another, full width, in the folder's
  wallpaper and theme. It is exactly the rule in CLAUDE.md -- a mode only
  mounts blocks -- so a page has no data of its own beyond which blocks it
  shows, in what order. (Chosen over one long document with blocks embedded
  in it: that is one huge editor, the thing that lags on a phone, and putting
  blocks inside a text document is the hardest kind of editor work.)
- **A page shows only what was put on it.** Asked: "it doesn't show all
  blocks from the get go, but you can add blocks that already exist in the
  folder -- or later even in other folders -- using '/' then choosing the
  type of block, and then you should be able to see if you create a new one or
  show one that exists already." So `/` → a type (Image, Clock, Task, Nest...)
  → **New**, or one of the existing blocks of that type, listed by name or
  first line: in this folder first, other folders later (step 6).
- **Writing is ordinary text blocks.** A new page starts with one. Typing `/`
  on an empty line inside a text block splits it there and puts the chosen
  block between the two halves, so writing reads as one page with blocks
  between paragraphs.
- **A page keeps a list of entries**, `{ blockId }` -- and later
  `{ folderId, blockId }` for a block in another folder -- in the folder's
  mode settings under `page`. Not the per-mode orders (`modeOrders`): those
  always hold every block in the folder and drop any id they cannot find, so a
  block from another folder would be deleted from them. Kept by older builds
  from 0.8.662 on (keepUnknown).
- **The same block, anywhere.** A clock on the page is the folder's clock, the
  same one the Canvas shows. Taking it off the page leaves the block in the
  folder; deleting it is a separate, asked-for choice.
- **A nest is a block that holds links**, drawn as tiles first. It holds, in
  the decided order, folders, then page blocks, then pictures; web links and
  blocks from other folders later. A link is never containment: one folder
  can be in any number of nests, and deleting a nest deletes nothing in it.
- **`/page` makes a folder and links it where you typed** -- Notion's
  sub-page, as a new folder plus a link.

### Redirected 2026-11-04, after the first version

Asked, on seeing the first version: "text blocks and other blocks and all
won't have the colors on the borders. second. the page wherever you click,
it's basically a line and you can directly write something and it will be
considered a block of text. though paragraphs and other things you write
without putting a block in between it's only one block of text. another thing
is that on one line or multiple lines we can have multiple blocks sharing the
width etc. I'm aiming for a ui and ux like that." So, Notion's page:

- **No frames.** On a page a block has no border, no glow, no header and no
  background of its own: it sits on the page, in the page's writing colour.
  Its own colours stay in the block (the Canvas still draws them). A handle
  (⋮⋮) shows beside a block under the pointer, for moving it and its menu.
- **Writing anywhere.** Clicking the page's empty space puts the caret in
  writing: the text block there, or a new one at the end. Writing with no
  block between is one text block; blocks split it (later, "/").
- **Rows.** The page is rows, a row is one block or several side by side
  sharing the width: `page.rows: [{ cells: [{ blockId }] }]` (replaces
  `entries`, which never shipped). Dragging a block by its handle onto
  another's left or right edge puts it beside it; onto a gap between rows
  puts it on a row of its own. On a phone, a row of several stacks.
- **One frame for every block.** Page placement is a mode of `BlockShell`
  (`placement="page"`: in the flow, full width of its cell, its own height,
  nothing drawn round it), so a block is the same component on the Canvas
  and on a page -- which first means moving ImgBlock, TaskBlock and
  EmbedBlock onto BlockShell (owed anyway, "Blocks and their modes").

Steps: (a) Img, Task, Embed onto BlockShell, nothing visible changes on the
Canvas -- *done 2026-11-04*; (b) `placement="page"`, rows, writing anywhere;
(c) side by side by dragging the handle -- *(b) and (c) done 2026-11-04*:
Block.svelte draws any block for the Canvas and the page alike, PageMode
draws rows of them, utils/pageLayout.js decides. Still owed after them:
Enter / arrows / Backspace moving between a text block and its neighbours,
a row's widths dragged (each cell even for now, a `width` on the cell
would be kept by older builds already). (d) "/" -- *done 2026-11-04* for
blocks: "/" in the writing on a page opens one menu (SlashMenu,
utils/slashMenu.js) of a new block of each kind and the folder's blocks not
on the page yet, filtered by what is typed after it; the one chosen goes
under, over or between the two halves of the writing (App insertOnPage, one
Undo). "＋ Block…" opens the same menu with a search field. Still owed from
step 1: the text kinds (headings, lists, checkbox, quote, divider) in the
same menu, the "/" menu in Single Note and on the Canvas, and a `+` at the
start of an empty line on a phone.

### In order, each landing on its own

0. **A folder that keeps its identity when renamed** -- *landed 2026-11-04*
   (utils/folderIdentity.js). A folder's id is `modeSettings.folder.id`, or
   `legacy:<name>` when it has none, so nothing is written for a folder never
   renamed and every device works out the same id. A rename writes the id
   into the folder under its new name; a duplicate, an import into a new
   folder and a local folder adopted beside a cloud one of the same name drop
   it and take their own. Kept by every build from 0.8.662 (mode settings
   keep unknown fields). **Still owed:** the cloud index carrying the id, so
   a link can be followed to a folder not downloaded yet -- check the index
   rule in `database.rules.json` accepts the field and deploy it first.
1. **The `/` menu, in every editor**: one shared command list and menu, in
   Single Note, text blocks and pages. First the text kinds that exist
   already -- headings, lists, checkbox, quote, divider, separator, picture.
   Useful the day it lands. Keys (arrows, Enter, Escape) and touch; on a phone
   a `+` at the start of an empty line opens the same menu.
2. **Page mode** -- landed 2026-11-04, then redirected the same day; see
   "Redirected 2026-11-04" above for what it is now.
3. **`/` places blocks** -- *landed 2026-11-04*, see step (d) above. Still
   owed: moving between blocks with the keys: up at the top of
   a text block goes to the one above, Backspace at the start of one after a
   removed block joins the two halves again.
4. **Nests, first version: folders as tiles** -- *landed 2026-11-04*
   (NestBlock.svelte, utils/folderDirectory.js). A `nest` block, on the
   Canvas ("+ Nest") and on a page ("/nest"), holds `links: [{ folderId,
   name }]`. "＋ Folder" searches this device's folders (the same menu as
   "/"); a tile shows the folder's current name over its cover (wallpaper,
   else first picture) and opens it; × takes the link out, deleting nothing.
   App works the directory out whole from the folders whenever the folder
   list or the open folder changes ('folders' context). **Still owed:** cloud
   folders not downloaded (step 0's index); a deleted folder shows "Not
   found" rather than Restore from the bin; covers stored in the cloud
   (`{ type: 'storage' }`) are not shown yet; the directory loads every
   folder to build itself, which wants measuring with many big folders.
5. **`/page`**: a new folder, opened in Page mode, linked where it was typed.
6. **Further**: nests gain page blocks, then pictures, then web links and
   blocks from other folders; the `/` menu offers blocks from other folders,
   placed as `{ folderId, blockId }` -- the other folder loaded to show and edit
   it, and saved back to that folder.
7. **Getting around**: a back button and breadcrumbs after following links;
   "Linked from" on a folder, recomputed from every folder's nests, never kept
   as a list (CLAUDE.md, recomputing).
8. **Nests' views**: 8a, how a nest shows what it holds -- tiles with a
   picture and a name (Notion's gallery), list, table, board -- with sort and
   filter. 8b, later and only if wanted: properties on each entry (a tag, a
   status, a date), Notion's columns.

### Decided 2026-10-27

- **A page holds every kind of block.** Habits and the music library are not
  blocks (the accepted exception, "Blocks and their modes"), so not these.
- **A page is a column of blocks it lists**, not one page block, and shows
  only what was put on it -- new or existing, from this folder, later others.
- **Nests hold folders, then page blocks, then pictures**, then the rest.
- **Views first, properties later** (step 8).
- **The folder list stays as it is**, with other ways to show it later -- as
  the note picker got its layouts -- not tied to nests.

### What could go wrong

- **Every device must be on 0.8.662 or later before step 0 ships**: earlier
  builds drop fields they do not know.
- **Text across two blocks** cannot be selected in one go, and the keys have to
  be taught to move between blocks (step 3) -- the cost of not being one
  document.
- **A block shown in a page from another folder** has to be saved back to
  that folder, which this device may not have downloaded, and which may be
  renamed or deleted elsewhere. Step 0 and the tombstones from 0b are what
  make that answerable; until step 6 a page only holds its own folder's
  blocks.
- **Cycles**: A nests B, B nests A. Harmless as links; anything that previews
  a nest's contents inside another nest stops at one level.

## Next, in order (set 2026-10-12)

The order agreed for the run-up to launch. Each line points at the section
that holds the detail; cross a line off in the same commit that finishes it.

1. **Start the slow, outside things now**, because they run on the calendar
   rather than on code: Polar live and the payout proven with a real month
   (section 6 items 3-5, `POLAR.md` step 9) -- with the Stripe/payout
   verification first; the INPI filing (classes 9, 42); the accountant
   question in `POLAR.md`.
5. **Linux**: the first sign-in press failing, then the frame rate -- measured
   before changed (3b).
6. **A starter folder for newcomers, made from Sora's own drawings.** Artists'
   work cannot be shipped; Sora's own art can, and is the brand anyway. Opens
   on first launch instead of an empty canvas; the pictures are bundled with
   the app and covered in `ASSETS-LICENSE.md`.
7. **A landing page**: moving visuals of real boards, downloads per platform,
   an email waitlist.
8. **Clear section 0 on Windows and Android**, then a release.

After launch: music playing with the app closed (0a), pictures by reference
(2), the editor's layout (1a), asking Polar what it thinks (6, item 2), real
alarms (4). Marketing runs alongside all of it from now:
`Austavia-chat-handoff.md`.

---

## 0. To check on a device after the next release

Things that are built and shipped but that nobody has confirmed. Cross one off
when it is seen working; if one turns out to be wrong, it goes back into the
list below with what was observed.

| Shipped | What to look for |
| --- | --- |
| next | **One Austavia at a time (Linux .deb, Windows).** Reported 2026-10-26: after each restart KDE reopened Austavia once per window it had saved, so the windows multiplied. With the single-instance plugin a second launch brings the open window forward and exits. Log out with Austavia open, log back in: one window. Click the launcher while it is open: the same window comes forward. |
| next | **Page mode, second round** (2026-11-10). Writing beside a picture starts just below its top edge; the picture's cell is as wide as the picture (at most half the row), so no gap; the page takes the whole width of a computer. The pencil beside the arrows turns on edit mode: each picture outlined, a grip on its right edge to size it (a share of the row, kept separately on a phone and a computer), "Crop" to keep part of it (the Canvas shows the crop too), "Natural size" to undo the size. A page in a nest shows its first picture. On Linux, /tmp no longer fills with copies of music (check `du -sh /tmp` after a day of tagging). |
| next | **Task mode, again** (2026-11-10). Margins halved a second time, a task's writing at 1.03rem. |
| next | **Calendar, second round** (2026-11-10). "Day" and "7 days" at the top right (Monday first; a day's name opens it as a day; "+" under a day blocks it whole). Ctrl and the mouse wheel make the hours taller or shorter, and the height is still there after a restart on that computer (Calendar mode and blocks each keep their own). In the 7-day view a block can be dragged to another day. A block's pop-up has colours (and a field for any colour); the next block made takes the last colour chosen. Blocks are outlined all round in the writing's colour. The pop-up is as solid as the right panel. |
| next | **Calendar** (2026-11-10). Mode, Calendar ("＋ Make a calendar" when the folder has none), or "+ Calendar" on the Canvas, in Simple Note and on a page ("/cal"). A day at a time, ‹ › to change day, the date to come back to today. Click an empty hour: an hour from the quarter clicked. Drag down the day: any length, to 5 minutes. Then type what it is. Drag a block's middle to move it, its top or bottom edge to stretch it; press it to type the times to the minute (10:48 to 11:00 shows "12 min"), pick 15 min to 2 h, make it Whole day, or Delete. "＋ Whole day" blocks the day. The red line is now. Seen in a browser; on the phone check a tap makes an hour while a finger drag scrolls the day, and that moving a block with a finger works. |
| next | **Pages in pages, back and forward, a phone's own layout** (2026-11-10). In a nest, "＋ Add" offers New page and New folder (each asks a name), this folder's pages and the other folders. A page opens in Page mode in place of the folder's page, with its own title (press to rename) and its own blocks; "/page" puts one straight on a page as a line that opens it; on the Canvas "+ Page" is a card with Open page. The arrows top left go back and forward through what was opened. On a phone, moving a block changes only the phone's layout and not the computer's; putting a block on or taking it off changes both. A page uses most of a computer's width. Seen in a browser at 1200 and 390 px wide; check on the phone itself. |
| next | **Nests** (2026-11-04). "+ Nest" on the Canvas, or "/nest" on a page: "＋ Folder" lists this device's other folders; a tile shows the folder's name over its wallpaper (or first picture) and opens it; × takes it out of the nest without touching the folder. Rename a linked folder: the tile follows the new name (seen in a browser). Duplicate it: the copy is a separate folder, not the linked one. On a second device after a sync the same tiles. Check on the phone, and that an older build keeps both the nest and the folder ids. |
| next | **"/" on a page** (2026-11-04). In the writing on a page, type / (at the start of a line or after a space): a menu opens under the cursor with a new block of each kind, then the folder's blocks not on the page yet; typing after the / filters it ("/cour" finds a list called Courses), arrows and Enter pick, Escape closes. Picked at the end of the writing, the block goes under it; at the start, over it; in the middle, the writing is cut in two around it. One Undo takes it all back. "＋ Block…" opens the same menu with a search field. On the phone, check the menu opens above the keyboard and a tap picks. |
| next | **Page mode** (2026-11-04). Mode, Page: the folder's name as a big title (press it to rename the folder), and only the blocks put on the page, with no frames or colours of their own. Click anywhere on the empty page and write: paragraphs typed together are one text block. "＋ Block…" offers a type, then New or one of the folder's blocks not on the page yet. The ⋮⋮ beside a block (top right on a phone): drag it onto another block's left or right edge to put them side by side, above or below for a row of its own; press it for "Take off page" (the block stays in the folder) and "Delete block". Undo takes any of it back; another device after a sync shows the same page. A row of several stacks on a phone. Seen in a browser; on the phone check dragging the handle with a finger, and that the task list, picture, clock and music look right on a page.
| next | **Every block in one frame** (2026-11-04). The image, task and embed blocks now use the same frame as text, clock and music (BlockShell). On the Canvas: drag each by its header, resize from the corner (an image keeps its shape), change both colours, delete, change a picture (⏏), add and tick tasks. All should feel as before; the embed lost its empty ⚙ settings panel. |
| next | **A task list renamed from its tab** (2026-11-04). In Task mode the name field is gone; pressing the tab of the list already open turns it into its name to type into. Enter or tapping elsewhere keeps it, Escape keeps the old one. On the phone, check the keyboard does not hide it. |
| next | **New File makes the folder at once** (2026-11-04). Settings, New File, a name, OK: the folder appears in the list straight away, empty, and syncs. It used to appear only once something was put in it. |
| next | **A picture in a note is one character** (2026-10-29). In a note with a picture -- alone on its line, and between words: one arrow press steps over it either way; tapping its left or right half puts the cursor on that side; a cursor shows beside it at the start or end of a line (it was invisible there); Backspace after it removes it. On the phone, with the touch cursor too. |
| next | **Phone screenshots go to Downloads, and the clipboard** (2026-10-29). Seen on the phone: the button says "Saved to Downloads and copied" and the PNG is in Download at full size (5495 x 2160 for a Canvas board). Still to see: pasting it (it should paste as a picture in a chat), and that it shows in the gallery's Download album. Android before 10 still gets the share sheet. |
| next | **A screenshot of a long list** (2026-10-28). Seen on the phone: Playlist mode with 537 tracks gives a 1080 x 8190 picture -- the phone's full width, about 54 songs from the top, every cover in, the wallpaper behind -- in about 10 seconds. Still to see: other long lists (Task mode with many tasks) and the desktop app. |
| next | **The music in order, newest file first** (2026-10-28). Playlist mode lists the music by each file's own date, newest first, and the order can be changed at the end of the title row (Newest first, Oldest first, Title, Artist, Album, Length); the choice stays on that device and pressing play follows it. Music imported before this gets its date from the stored file on a device that has the audio, and the dates sync. Music restored from an Export zip may have no date and is listed after the dated tracks. Check it on the phone with a real library. |
| next | **Objectives: seconds, and a ring when one finishes.** A goal can be typed as 45s, 1m30, 1:05:10 or 1h 5m 10s, and the bar counts the seconds. A **time** objective reaching its goal rings like a timer -- the same banner ("Time's up") and sound, in whichever mode is open -- until Stop; a **count** one reaching its goal by +1 chimes once and its banner goes by itself after 6s. Seen in a browser 2026-10-26; still to see on the phone (sound and buzz) and on the Windows app. Older builds still read a seconds goal, rounded up to whole minutes. |
| next | **Objective tasks in Task mode.** Right-click a task (hold and let go on the phone): Time or Count, the goal (2h, 90m, 1h30 / 20), Resets every day. Time: ▶/⏸ fills the bar, sessions add up, and it keeps running across a restart; ✎ logs by hand (15m, -10m). Count: +1, ✎ to log several. Reaching the goal moves it to Done. Seen in a browser on 2026-10-25; still to see: a **daily** one coming back to To Do at 0 the next morning, and a timer started on the phone showing the same time on the computer. |
| next | **Typing during a slow download is kept** (staging, two tabs). In tab A put a large picture into a folder; in tab B, signed in to the same account with that folder open, switch away and back so the resume check runs, and start typing straight away while it downloads. The typing must survive; the sync log should say "edited here while the cloud copy was downloading; the edit stays", and the next sync then sends it. The error "started editing without checking the cloud first" may still appear -- it now means only that the check was slow. |
| next | **Signing in on the Linux app (.deb), in a window of its own.** Sign in with Google opens a small "Sign in with Google" window on Google's own page, with the account picker; choosing an account closes it and the main window is signed in and syncing. Closing it without finishing says the window was closed; pressing sign in again while it is open replaces it with a fresh one. Built 2026-10-09 (utils/desktopSignIn.js, src-tauri/src/sign_in_window.rs), after the first version, through the system browser, was asked to be in the app instead. A whole sign-in was traced on the user's account: Google accepted the window and returned a good token, and then Firebase hung, because `getAuth()` never finishes starting in the Linux app (its popup helper waits for ever on a tauri:// page) and a sign-in waits for start-up. The Linux app now uses `initializeAuth()` without that helper -- measured ready in 1ms in the real app, against never -- but a sign-in with the fix has not been done yet. If it ever hangs again it now says "Firebase did not answer the sign-in within 30 seconds" rather than nothing. The Windows app must still use its popup. And under KDE the window has KDE's own title bar (dark Breeze, KDE's buttons, the lotus) because it runs through XWayland; checked on 2026-10-09, but it is worth noticing whether typing, scrolling and pictures feel any different. `AUSTAVIA_WAYLAND=1` puts it back on Wayland. |
| next | **Export and import.** Export asks: this folder or all, with settings, with pictures inside the file, with themes. Import shows what the file holds and goes into a new folder by default -- "Damn", or "Damn 1" / "Damn 2" when the name is taken -- or in place of the open folder (a kept copy first). A file exported before this still imports, named after the file. On the phone, export opens the share sheet. |
| next | **Renaming a folder** by editing its name: on Enter or leaving the field the same folder takes the new name, no second folder appears, pictures still show, and on the other device after a sync the new name arrives. The old name should disappear from the cloud on the next upload (the sync log says "old name deleted from the cloud after a rename"); on a second device the old name's local copy stays until the bin work (PENDING 0b). A taken name is refused. |
| next | **The folder menu**: right click on a computer, long press on the phone, in Settings' folder list -- Duplicate makes "Damn 1" with its own pictures. |
| next | **Deleting the open folder** opens another folder in its place, and no other folder is touched. On 2026-10-06 in staging, deleting an imported folder while it was open wrote nothing over "default" (4 blocks -> 0), because the save that followed had no folder name and took "default". And **a save that empties a folder keeps a copy first**: clear a folder, then Settings, Advanced -- its copy should be listed and restore. The deleted folder still comes back from the cloud on the next pull; that is 0b. |
| next | **A copy of an official theme is the same theme.** Duplicate a see-through theme (Lime Wire, say) in the theme editor: the list that opens from Modes, dialogs and the mini player's veil should look exactly as they did, and new blocks start in the same colours. The editor now has the pop-up background, player veil, new block colours, the theme's wallpaper and Mr.Lee's toolbar characters, and every colour has an opacity slider -- a see-through panel no longer turns opaque when touched. The input background is its own colour now rather than following the left panel's. These travel through sync and exports too. |
| next | **Export: the theme you use and your custom themes are two choices**, the first ticked and the second not. On import, "Switch to the theme it was using" makes that theme if this device does not have it, and a custom theme you already have is not added a second time. Both dialogs restyled: every choice is a themed row with its explanation underneath. |
| next | **Music in Export and Import.** Export has "Your music from Playlist mode" (off by default); with it the file is a .zip holding the folders and the audio. Import takes .json or .zip -- including a music file from Playlist mode's own export -- and adds the tracks and playlists to yours. Playlist mode's export now opens the share sheet on the phone. Import also shows, under "Into a new folder" and "In place of", the name each will give. |
| next | **Screenshots on the phone** open the share sheet -- Photos, Files, a messaging app -- instead of a download that saved nothing and a copy that reached nothing. On a computer they still download and copy. |
| 0.8.661 | **The timer in the notification shade, counting down.** Start a timer on the phone and leave the app: a notification sits with the others (not under "Silent") with the time counting down, in the theme's colours, and the pop-up's buttons -- pause/resume, +1, loop-arrow stop -- each changing the timer in the app. Paused, it shows what is left; at the end, "Time's up" with sound if the app is in the background. Change theme and the notification follows. |
| 0.8.661 | **Single Note's one-line header.** The note's name, its count, Words, Characters and the picture button on one line, on a computer and on a phone (the picture button an icon only on a phone). Pressing the name opens the search page in the mode's colours: this folder's notes, a line, then other folders'. Typing finds notes by any word in them; picking one in another folder opens that folder on that note, still in Single Note. |
| 0.8.661 | **Old habit history coming back.** On each device, the first time a folder sharing its habits opens, the habits kept on that device before syncing are merged in: missing days filled, ✕ days back where the move turned them into ticks, habits only that device had added. The sync log says "brought in the habits this device kept before they synced"; Copy diagnostics now lists each habit's ✓ and ✕ counts. |
| 0.8.661 | **No empty folder written while one opens.** Switch folders quickly, and launch the app, a few times: the sync log should never show `blocks.length: N -> 0` for a folder nobody emptied. If a save is asked for mid-open it now says "not saved: the folder is still opening". Uploads now log "sent to the cloud" or "upload failed" after "queued for upload". |
| 0.8.66 | **Blocks that do not jump.** On the canvas, with a text block holding pictures scrolled half way: tick a task, change a clock setting, change theme (with "blocks follow the theme" on) -- the note should not move at all, and nothing else on the canvas should flicker or reload (an embedded video keeps playing). Undo and a mode switch still rebuild the block: it may show lower lines for a moment while pictures load, then must settle exactly where it was, not further down. |
| 0.8.66 | **Clicking into a scrolled note.** Scroll a note with pictures down, click another block, then click once low in the note: the caret goes where you clicked and the note stays put. Click in the space between two paragraphs or beside a picture: the same, never a jump to the top. Worth trying in Single Note too, where a short note should still be clickable all the way down the page. |
| 0.8.66 | **Single Note's "+ Text".** With notes already there, it adds a note and opens it on its own tab; choosing another tab afterwards stays chosen. |
| 0.8.66 | **The timer panel's pop-up switch**, on the Windows app: in the toolbar timer's panel, a small window icon with On or Off, the same height as the other buttons, on one line. The panel opens under the hourglass even on a narrow window. |
| 0.8.66 | **The timer on the toolbar**, on a computer: start a timer on a clock block and an hourglass button, drawn like Bg, appears just before the mini player (or where it would be), in every mode. Pressing it opens a panel under it with pause/resume, +1 and the loop-arrow Stop (and on Windows the pop-up On/Off switch); Stop leaves it in the panel with a Start button until the panel closes; a click anywhere else closes it. Two timers: the one ending soonest shows. A ringing one blinks "Time's up". It should vanish once no timer is in use, and never show on a phone-sized window. |
| 0.8.66 | **The timer in the Android notification shade**, instead of the toolbar. Start a timer: a quiet notification says "Timer", "Ends at 14:32", with Android's own countdown, and Pause/Resume, +1 min and Stop. Each button should change the timer in the app, and the other way round. Lock the phone past the end with the app in the background: "Time's up" should arrive with sound and vibration -- possibly a little late on an idle phone, because the alarm is inexact (an exact one needs a permission). With the app in front it rings in the app and the notification changes silently. **Known gap:** with the app swiped away and its process gone, Pause and +1 on the notification do nothing and Stop only removes the notification -- the timer itself lives in the app's storage, so it is still running when the app is next opened. The first time, Android should ask for the notification permission. |
| 0.8.66 | **Timer pop-up, back to one row.** 195×48: the time (a touch bigger than 0.8.656's) and the icon buttons on one row, about 20px apart at "59:59" and more below ten minutes; an hour or more reads "1h 05", without seconds, the label line with × above; "Timer · 5:00" only while it is not running. The two-column 200px layout of 0.8.657 is gone. **And it stays out of the way while Austavia is in front**: with the main window focused, no pop-up; click another app (or minimise) and it comes back where it was dragged to, within a second. A hidden or kept pop-up should still be hidden or kept after going in and out. Also the **Bg** button: no colour change while its panel is open, and a click outside closes it; in Single Note, "pictures follow these" is unchecked on a folder that never ticked it. |
| 0.8.655 | **Timer pop-up, smaller, with a switch.** The pop-up should be 195×48 from 0.8.66 (200×48 in 0.8.657, 228×48 in 0.8.656, 228×76 in 0.8.655, 260×112 in 0.8.654), progress as a hairline along the bottom. On the Windows app each clock block has an On/Off switch beside its bottom-left timer corner: Off means no pop-up for that block's timer at all, not even when it rings; On is the default. |
| 0.8.654 | **Block scroll and themes.** In Canvas with blocks following the theme: scroll a block, change theme, change back -- the block should stay where you left it each time, never jump to an older place. Scrolling to the very top and then changing theme should leave it at the top. |
| 0.8.654 | **Timer pop-up.** Rounded corners with nothing square behind them. Stop in the pop-up should keep it open at the timer's full length with a Start button; × closes it. Start a timer on a clock block: a small card should appear bottom-right above the taskbar, on top of every other window, without taking the keyboard. Pause, +1 min and Stop there should show on the block and the other way round; × hides it for that run but it comes back when time is up, beeping (the main window stays quiet then). Drag it somewhere, then start another timer: it opens there, a second one stacks above. Double-click brings Austavia forward; Esc hides; Space does nothing (0.8.656). A ringing alarm gets one too. Worth checking with Austavia minimised, and on a second monitor. |
| 0.8.654 | **Copy and paste.** Copy a note with a list, a heading and a picture; paste it into another note, onto the canvas, and into Simple Note: it should arrive whole -- one block, lists still lists, picture included. Paste a list from Word or Google Docs into a note: the list, not a picture of it. Copy just a picture in a browser: still a picture. On Android, long-press paste goes the same way. Also, Single Note's picture dials: in a folder with no wallpaper, Bg should show Picture opacity and Picture luminosity straight away and they should dim the pictures in the note; with a wallpaper, the "follow these" box appears. |
| 0.8.653 | **The clock & alarm block**, in Canvas and Simple Note: the corner flips between the clock and the alarm page, the page it was left on is still open after a reload (on that device only), and an alarm set a minute ahead rings — banner, beeps, and a buzz on a phone — in whatever mode is open. Snooze gives it five minutes; Stop keeps it quiet until tomorrow. Expect it *not* to ring with the app closed or a phone asleep: see 4. |
| 0.8.653 | **The stopwatch**, from the clock block's top-left corner: Start, Lap, Pause, Resume, Reset; the corner shows the running figure from the other two pages. Start it on a phone, lock the screen for a minute, and it should read the right time on return -- it is worked out from when it started, not counted. It is per device, like the page. |
| 0.8.653 | **A background too big to sync**, signed in with auto sync on: choosing one over 10 MB once stored (a 4K PNG does it) should be refused with a dialog saying why, and the folder should keep syncing. With auto sync off it is kept, with a banner saying the folder will not sync while it holds it. If one got through anyway, the banner should now say so in words rather than print the database's error. |
| 0.8.653 | **Outline**, the see-through theme, over a Canvas wallpaper: blocks, headers, both panels and their buttons should show the wallpaper through them, with only the writing (shadowed), outlines and shadows drawn. Pop-ups -- Settings, Bg, More, the add-block and mode menus, dialogs -- sit on black at 72% under it, and Single Note's page is black rather than whatever colour its block last had. |
| 0.8.653 | **Twenty-eight themes, in two groups of fourteen** -- ordinary, then See-through. New to look at and keep or drop: Flatline (no shadows), Neon Grid (glowing writing and edges), Harbor Signal (three colours, three jobs), Brutal Mono (square, thick, hard offset shadows); Indigo Gilt Glass; and the see-through experiments Smoke Headers, Veil, Faint Ink, Silver Pane, Cyan Glow and Bare. Most want "blocks follow the theme" on to be seen as meant. Chalk, Coral Wire and Rose Wire are gone. |
| 0.8.653 | **One wallpaper per folder, in every mode but Birthday**: the picture set in Canvas (Bg) should show in Simple Note, Single Note, Habit Tracker, Task and Playlist too, with the same opacity, blur and luminosity, and changing it from any of them changes it everywhere. A Single Note wallpaper set before this is now deleted: gone from the folder at its next save, and its uploaded picture removed from storage by the wallpaper sweep on that folder's first save of the session. The wallpaper itself now uploads as a file, like a picture block, instead of going into the folder -- so a big one counts against storage rather than stopping the folder syncing. |
| 0.8.653 | **Wallpapers behind the toolbar**, in Canvas, Single Note and Playlist: with a see-through toolbar (Outline, or any theme's translucent bar) the wallpaper should show behind the controls, and the picture should fill the whole window from the top. On a phone, check that typing still leaves the wallpaper where it was -- it keeps the held window height it already had. |
| 0.8.653 | **Screenshots with a wallpaper**: in Canvas, the wallpaper now fills the whole screenshot under the blocks, with its opacity, blur and luminosity. Single Note and Playlist already had theirs. |
| 0.8.653 | **The timer**, from the bottom-left corner: type `5` or `1:30` into the reading, Start, and it rings — banner, beeps, buzz — in whatever mode is open when it runs out, with +1 min and Stop. Start one on a phone and lock the screen past its end: it should be found run out and ring on return (within ten minutes), since it is kept as the moment it ends. Per device. The same limit as the alarm applies: nothing rings with the app closed. |
| 0.8.653 | **The clock face**, in Canvas and Simple Note: the right local time, the day beneath it, and its three settings (12-hour, seconds, date) surviving a reload. Worth leaving one open on a phone for a few minutes with the screen off and back on — it wakes once a minute, not once a second, and each tick reads the time afresh, so it should be right the moment the screen comes back rather than catching up. |
| 0.8.65 | **The plan panel, doing nothing.** The subscription groundwork ships with this release and is deliberately inert: no checkout link is committed, so no Upgrade button should appear anywhere, on any platform, signed in or out. If one does, something shipped that should not have. |
| 0.8.65 | **The word count row** in Single Note, a third shorter, and the **mini player** opening Playlist when pressed anywhere that is not a button. |
| 0.8.652 | **Holding a habit to delete it** — and scrolling a list of habits without the menu appearing, which is the case it is most likely to get wrong. Also **the note's footer** going while the keyboard is up and coming back after, with the picture behind holding still. |
| 0.8.651 | **Habit Tracker on a phone**: a habit two lines tall, the last seven days on one row. Also worth checking **after 8pm** that the last square is really today — the date used to be worked out in UTC, so from early evening the tracker thought it was tomorrow and ticks landed a day late. Old evening ticks will be sitting one square too far right. |
| 0.8.650 | Pasting a picture from the **Android keyboard's** own picker. Broken since a Capacitor upgrade renamed the layout our WebView override was aimed at, so the app was not using its own WebView at all and nothing was ever declared. Fixed and now guarded by `test/capacitorLayout.test.js`. |
| 0.8.59 | The **drag pointer** on the desktop: the no-drop cursor should no longer flash at the start of a drag. A browser ignores `dropEffect` outside a real drag. |
| 0.8.60 | A **real track ending** and autoplay stepping on, in a full library. Seeded audio covered everything up to that. |
| 0.8.62 | **Adding a picture while signed in.** This is the file-dialog fix; it is the one most likely to have been the whole complaint. |
| 0.8.65 | **The notification on the track that froze it** — heylog, "snake's in the wall". Its cover is a 197KB PNG where most are 30KB JPEGs, and it used to ride on the same intent as the title, the play state and the position. The progress bar should now move, the button should show pause while it plays, and the cover should be that track's own. Worth skipping *between* a big-cover track and a small one a few times, since the fault only showed on the second update of a track. |
| 0.8.65 | **Habits on two devices.** They belong to the folder now and travel with it, so the same folder opened on the phone and the computer should show the same habits and the same ticks, and a tick on one should appear on the other after a sync. Also worth checking the one-time move: a device that had habits in the old tracker should find them in whichever folder was open the first time this build ran, and **only** that folder. |
| 0.8.65 | **The screenshot button on a phone.** It now saves a PNG *and* copies it, on every platform, where before a phone got the system share sheet instead of a download. Two things to look at: that the file actually arrives (it lands in Downloads now, not the gallery — that was the share sheet's whole reason for existing, and it was replaced on purpose), and that pasting it into another app gives the picture. Worth trying in the app *and* on austavia.com, since the clipboard half is the browser's to allow. |
| 0.8.65 | The **wallpaper** holding still in Single Note and Playlist while the phone keyboard opens *and closes* — the closing is the half a browser cannot show. |
| 0.8.65 | **Moving a block on the canvas** no longer making the text inside jump. |
| 0.8.65 | **One click** on an unfocused text block leaving the caret where you clicked. |
| 0.8.63 | **Shuffle's back button** retracing what you heard. |
| 0.8.64 | **Shuffle's path surviving a restart** — close the app mid-listen, reopen, and back should still walk what you heard before. |
| 0.8.641 | **Typing on the phone**, which is where the complaint came from. Also worth a look: undo straight after a word, clicking away mid-word, and switching modes mid-word — those are the three moments the last characters typed could go missing, and each is now flushed on purpose. |
| 0.8.648 | **The Picture button in Single Note** — clipboard first, file picker when the clipboard has nothing. Worth trying in the app *and* on austavia.com in Chrome, since those failed for different reasons and only one of them was ours. |
| 0.8.647 | **Covers on .m4a files** that had none before, and **changing tracks without the player going blank** — including skipping quickly, where the artwork must never land on the wrong track. |
| 0.8.646 | **The cover at full quality.** Confirmed working in 0.8.645 — the cause was that the cover was only ever produced behind a check for the browser Media Session API, which the phone's webview does not provide, so the native notification never got one. Now it is also sent untouched unless too big to cross, so what is left to look at is whether it is sharp rather than whether it is there. |
| 0.8.643 | **Swiping the notification away** — the track should still be loaded and paused in the app, not gone. Pressing play, or changing track, should bring the notification back. Worth trying a stop from a headset or car too, which now behaves the same. |
| 0.8.642 | **The notification on the phone**: the transport buttons should be the app's own shapes rather than Android's, and the system player should now draw a **progress bar that can be dragged**. Worth checking on the lock screen as well as in the shade, and that the bar stops moving when the music is paused. None of it can be exercised from a browser. |
| 0.8.641 | **The test-release path itself**, the first time it has been run: the live site should still report 0.8.64, the GitHub release should be badged *Pre-release* and not *Latest*, and the preview channel should report 0.8.641. All three were checked from here; what is unconfirmed is installing the APK over a full release and finding it behaves. |

Two standing checks worth doing at the same time:

- **`fetching: N` on the second launch.** The bootstrap line should read
  `fetching: 0` on a device that is up to date. `fetching: 17` on a first launch
  after a fresh install is right; on every launch it would mean the stamps never
  match and the whole account is re-downloaded each time.
- **The text size rebase.** Both numbers are settled — 109 on a computer, 97 on
  a phone — and they are the base now rather than the slider's starting point,
  so both sliders read 100. The one to check is that a slider you had *already
  moved* still gives the size it did: the stored number changed meaning and is
  converted on read, not reset.

## Parked: Birthday mode

Taken out of the app and out of the public repo's current code on 2026-10-06
("something I might work on later, but I don't want people on GitHub to fall
on it"). The code as it was -- the mode, its 24-hour password lock in the mode
list, its win background -- is on the branch `birthday-mode` of the **private**
repo `Sora-ciel/austavia-birthday-mode` (local remote name `birthday`).

To bring it back: `git fetch birthday` and take
`src/Modes/BirthdayMode.svelte`, `src/assets/birthdayWinBgDataUri.js` and the
removal commit's other hunks back (reverting that commit is the shortest way).
Folders kept their `modeOrders.birthday` -- `ensureModeOrders` keeps keys it
does not know -- so nothing needs migrating.

---

## 0b. A bin for deleted folders, and deletes that sync

Asked for on 2026-10-05: "we should have a bin, cloud and local, and from the
client we should be able to retrieve folders we deleted in the last 15 days,
or delete them from the cloud for ever". Agreed to build **after** the
export/import, rename and duplicate work, and to give the folder menu its
**Delete** only once the bin exists -- a cloud delete without one is final.

**Found while looking: deleting a folder did not sync at all.** (Still true
for other devices; this one now keeps it in the bin -- see part 1.) The 🗑
in the folder list (`deleteSave`) removes the local copy only; nothing calls
`deleteRemoteFile`. The cloud copy stays, and the next pull downloads it again
(it is in the remote index and not local, which `shouldTakeCloudCopy` reads as
a folder to receive). Other devices never learn of the delete.

The plan, in three parts, easiest first:

1. **Local bin -- done 2026-10-06** (`utils/folderBin.js`, store
   `folder-bin`, DB v9). A delete moves the folder there; Settings, Saved
   Files, Bin restores it or deletes it for ever; anything past 15 days is
   emptied whenever the bin is read (launch, every pull, opening it). A
   folder in the bin is skipped by the pull, so it no longer comes straight
   back; emptying it owes a cloud delete through the rename's owed-deletes
   list. The folder menu has Delete now.
2. **Cloud bin.** The folder moves to `sync/{ns}/users/{uid}/trash/{fileId}`
   with `deletedAt` instead of being erased, its attachments left in place so
   Restore brings the pictures back. Delete for ever is `deleteRemoteFile`. A
   daily scheduled function empties anything past 15 days, absolute from
   `deletedAt` (the recompute rule), so it happens with no device open. Needs
   rules for `trash` (owner-only) with emulator tests, and a functions deploy.
3. **Telling other devices -- the hard part.** The index keeps a tombstone
   (`index/{fileId}: { deletedAt }`); a pull that meets one moves the local
   copy to the bin instead of uploading it back. This is the sync core
   (`runPull`, `shouldTakeCloudCopy`), so it wants tests for two devices
   deleting, one offline, and a delete followed by a restore. A rename is the
   same mechanism: a new folder plus a tombstone on the old name.

**Parts 2 and 3, as settled on 2026-10-06** (one design, built together):

- The index entry of a folder says one of three things: **live**; **in the
  bin** (`binnedAt`, the folder and its pictures stay in `files/` and Storage);
  **deleted for ever** (`deletedAt`, a tombstone -- `files/` and the pictures
  removed, the index entry kept).
- Every device compares each entry with what it holds, absolutely, on every
  pull and at launch (`utils/cloudBin.js`): a bin mark moves its copy into its
  bin (or fetches it into the bin, so the bin is shared); a tombstone deletes
  a copy older than it (a kept copy goes to Advanced first); a live entry newer
  than a local bin entry means it was restored elsewhere, so it leaves the bin;
  a live entry older than a local bin entry is marked binned (a delete made
  offline).
- Moving to the bin writes `binnedAt`; Restore is an ordinary upload, which
  rewrites the entry without it; Delete for ever, 15 days, and a rename's old
  name write the tombstone.
- **The rules refuse a folder written over a tombstone unless it is newer than
  the delete.** That is what stops an old build -- which knows none of this --
  from uploading a deleted folder back.
- A scheduled function empties bin marks past 15 days with no device open, and
  forgets tombstones after 180 days. `enforceSyncQuota` records 0 bytes for a
  tombstone and does not charge a bin mark as a write.
- Rollout: rules and functions to staging, two signed-in tabs, then production.

---

## 0a. Music that keeps playing with the app closed (Android)

Asked for on 2026-09-28: "when removing the app from the opened apps on
Android the music stops -- it would be great that even with all the app's
windows closed you can still listen to your music and playlist."

**Why it stops.** The sound is played by the web view (an `<audio>` element in
`App.svelte`). `MediaNotificationService` only shows the notification and
answers its buttons; it plays nothing. Swiping the app away destroys the
activity and its web view, and the sound goes with them. The service surviving
would not help: there is nothing in it to keep playing.

**What it takes** is playback moved into the service -- Media3 ExoPlayer inside
a media session service -- with the web view becoming a remote control while it
exists. Staged so each step lands on its own:

1. **Files the service can open.** The audio lives in IndexedDB, inside the web
   view, where native code cannot read it. Copy the playing track (then the
   queue) to the app's files directory, keyed by track id, and hand the service
   a path. Nothing else changes yet.
2. **The service plays one track** from that path; the web view stops using its
   own `<audio>` on Android and sends play/pause/seek over the plugin instead.
   Position and state come back as events, so the player and lyrics keep
   working. Swiping the app away now keeps the current track going.
3. **The queue moves too**, so next, previous, shuffle and the end of a track
   are decided in the service without the web view. This is the step that
   makes "all windows closed" actually true for a playlist.
4. **Coming back.** When the app opens again it asks the service what is
   playing and where, rather than starting over -- the reconcile rule: the
   service is the truth, the page reads it.

Desktop and web keep the `<audio>` element; only Android changes. Not started.

## 1. Typing in a long note

Two separate causes, measured on a note of 15,930 characters — the size of a
real one. A keystroke costs about **7ms**, and it scales with the note: 0.4ms at
655 characters, 8ms at 23,000, 13ms at 51,000.

**Almost none of it is ours.** With the editor at `display: none` — same code,
no layout — a keystroke costs **0.3ms**. The rest is the browser recalculating
style and laying out the page, because every character typed at the end of a
note re-lays the whole of it.

The second cause — our own ~3.4ms of serialising and dispatching, which used to
run inside the key event — is **done**, in `utils/editorUpdates.js`. What is
left here is the layout.

### 1a. Let the editor be laid out on its own

`contain: layout` on `.tiptap-inner` takes a keystroke from 7.0ms to 3.0ms.
**It also breaks scrolling**, and this was tried and reverted, so do not simply
add it:

| | per keystroke | scrolls |
| --- | --- | --- |
| no containment | 7.0ms | yes |
| on `.tiptap-inner` | 3.0ms | **no** |
| on `.tiptap-wrap` | 7.6ms | yes |

`.tiptap-inner` is stretched to the visible height (`flex: 1 1 auto`) and its
content *overflows* it; that overflow is what gives `.tiptap-wrap` something to
scroll. Containment hides the overflow from the scroller, which is both the
speed-up and the breakage — the same effect seen from two sides.

The real fix is to restructure so the editable sizes to its content and the wrap
scrolls it, which is the ordinary arrangement; containment is then safe and
free. That is a layout change to the most-used component in the app, so check
empty notes, the click-anywhere-to-focus area, and Simple Note's grid.

## 2. Pictures stored by reference, not inside the text

**The largest item, and the one that has failed before.** See
`project-content-architecture` in memory: this was attempted in versions 4 and 5
of the app and broke, which is why it is staged rather than done in one go.

A pasted picture is a base64 data URL inside the note's writing, so a note with
one photograph is 3.6 million characters. That one fact causes four costs:

- every local save rewrites the whole picture (~33ms on a desktop)
- **every undo step keeps another full copy in memory** — `textHistory.js` holds
  up to 200 steps, so fifty edits is ~180MB of strings held live
- a replaced-copy snapshot costs 3.6MB, so that history collapses from ten
  copies to about two
- storage pressure, alongside a music library of ~1900 tracks on the same origin

In order, each landing and released on its own:

1. **A resolver** — one function that turns a picture reference into something
   displayable. Nothing else changes.
2. **Pasted pictures move onto it** — paste writes a blob and inserts a
   reference. This is where most of the win is.
3. **Image blocks move onto it**, so both kinds are stored alike.
4. **Then** the screenshot feature, export and download, which by then all go
   through the same resolver.

## 2a. Music lost from a packaged desktop build

Reported 2026-09-26 on 0.8.641: every imported track gone, while the notes and
the sign-in were still there. Not reproduced, and not explained — what follows
is what is *known*, so the next report is not started from nothing.

**The notes surviving proves less than it looks.** Music and notes live in the
same IndexedDB database, `codex-db` — the music in its own store beside the
blocks. The sign-in does not: Firebase keeps that in a database of its own. So
a wipe of `codex-db` takes the notes too, and they come straight back from the
cloud on the next launch, while music is **never uploaded** and cannot. Losing
everything local therefore looks exactly like losing only the music.

**And there is a fourth, which is ours and is confirmed to exist.** The Tauri
identifier changed from `com.sora.codex` to `com.sora.austavia` on 2026-09-03
(`88a2a4d`). WebView2 keys its data folder on that identifier, so builds from
either side of that commit do not share storage at all — different folder,
different IndexedDB, different everything. Both folders are on this machine
right now:

```
56 MB  %LOCALAPPDATA%\com.sora.codex
88 MB  %LOCALAPPDATA%\com.sora.austavia
```

Running an exe from the wrong side of that rename shows an empty library, notes
that come straight back from the cloud, and — once signed in again — a session
that looks entirely normal. Which is the reported symptom exactly.

It was known that changing the identifier makes the next build install as a
separate app; what was not written down is that it also leaves the old app's
data behind in a folder nothing will ever look in again.

(On this machine neither folder holds a library worth recovering: about 5MB of
IndexedDB blobs each. If the affected machine is a different one, look there
before concluding anything.)

That leaves three more candidates, which nothing in the report could tell
apart:

1. The database would not open — most plausibly a `VersionError`, since the
   version has been raised twice and an older build cannot open a database a
   newer one has already upgraded. He runs several packaged builds.
2. The library index went and the audio did not, which is recoverable.
3. The store really is empty.

There is now a **launch journal** as well — `utils/storageJournal.js`. Every
launch writes down the version and how much was in each store, and the
diagnostics lead with anything that dropped, naming the window and the builds
either side of it. It lives in `localStorage`, not in the database it watches,
because a journal kept there would be wiped by the event it exists to record.
A journal that comes back *empty* is therefore a finding of its own: not
"nothing recorded yet" but "this profile has never run the app before", which
is the swapped-data-folder case above.

`describeLocalStorage` in `storage.js` and `describeLocalStore` in
`diagnostics.js` answer the rest, in the same report: the version on
disk against the one this build wants, a count per store, and audio keys
counted separately from the index. A database that was not there at all reads
as "was not there before this launch" rather than as version zero, because for
this question that is the answer and not a detail.

**If it turns out to be the VersionError**, the fix is not to bump anything: it
is that `getDB()` should open with no version at all when the one on disk is
higher, since every store it needs already exists there. Do not do that
speculatively — wait for a report that says so.

## 3. Waiting on a device, not on code

- **Image paste from the Android keyboard.** The cause is known now and fixed
  in 0.8.650: Capacitor renamed the layout `BridgeActivity` inflates, from
  `bridge_layout_main` to `capacitor_bridge_layout_main`, while still shipping
  the old name — so the override kept merging cleanly against a file nothing
  reads and the app silently went back to Capacitor's plain WebView.

  **The lesson is the silence, not the rename.** There was no symptom except the
  feature being gone: the build passed, the resource merge passed, and checking
  the old file by hand looked like a pass because our class was in it. It took a
  diagnostic to say "our WebView: NOT IN USE". `test/capacitorLayout.test.js`
  now reads Capacitor's source for the name it really inflates and fails if we
  are not overriding it, so the next upgrade is loud.

  Two things checked along the way and found sound, so they are not re-checked:
  the editor lookup in `receivePictureFromKeyboard` works (TipTap does set
  `.editor` on the ProseMirror node), and on the website none of this can ever
  work, because there the declaration is Chrome's to make and Chrome refuses.
  The Picture button from 0.8.648 covers both.
- **The desktop drag cursor.** `dragDropEnabled: false` fixed the drag in
  0.8.58; `dropEffect` in 0.8.59 was meant to remove the remaining flash of the
  no-drop pointer. A browser ignores `dropEffect` outside a real drag, so this
  needs a hand on a mouse.
- **Autoplay across a track ending, with real music.** The search pool, the
  remembered playlist and the resumed track were all exercised in a browser with
  seeded five-minute audio, including playing from one playlist and then another
  and restarting. What a seeded library still cannot show is a real file
  finishing and autoplay stepping on in a long library.
- **The phone's media notification.** Icons, progress bar, cover and swipe are
  all confirmed working on a device as of 0.8.645. What is left is a matter of
  taste rather than function: whether the cover looks sharp now that it is sent
  untouched, and whether the swipe behaviour feels right in daily use.

  Worth keeping: the fault was not any of the three things guessed at — the
  Binder size limit, the metadata keys, or the intent's shape. It was that the
  cover was only ever produced *inside* the browser Media Session code, behind
  its check for an API the webview does not provide, while the notification
  itself is native and has nothing to do with that API. The diagnostic found it
  in one round after three wrong guesses; `describeNotification` in
  `diagnostics.js` is what to reach for next time rather than a fourth guess.

## 3b. The Linux app, owed

- **Lower frame rate and late scrolling than on Windows**, with folders open
  (reported 2026-10-09 on the .deb, KDE Wayland, an Acer Nitro AN515-57 with
  Intel + NVIDIA graphics). Nothing measured yet. Suspects, in the order worth
  trying: the app runs through XWayland on KDE for the native title bar
  (compare with `AUSTAVIA_WAYLAND=1`); WebKitGTK compositing on the NVIDIA /
  hybrid setup (`WEBKIT_DISABLE_DMABUF_RENDERER=1`,
  `WEBKIT_DISABLE_COMPOSITING_MODE=1` to compare, and which GPU it renders on);
  and WebKitGTK simply being slower than WebView2 at the canvas's blur,
  transparency and large pictures. Measure before changing anything: frames
  per second while scrolling a heavy folder, under each setting.
- **The first sign-in press failed at once; the second worked** (2026-10-09,
  first sign-in after the fix that made Firebase start without its popup
  helper). The message was not recorded. Signing out and in again afterwards
  worked every time. Suspect the first press racing Firebase's start-up or the
  event listener; get the message next time it happens.
- **The sync-log error after the first sign-in -- explained, fixed 2026-10-12,
  not yet seen.** "Started editing without checking the cloud first" came from
  the resume check: coming back to the app, a pull took longer than the 8s the
  workspace is held read-only, so editing was let go while it still ran. The
  pull decided "nothing unsent here" *before* downloading, so anything typed in
  that window was overwritten when the copy landed. The pull now asks again
  just before writing (`editedDuringDownload` in `utils/syncOwing.js`): edited
  meanwhile, or a save waiting for that folder, and the edit stays. See
  section 0 for how to see it working.

## 3c. The phone notification's cover, zoomed in

Reported 2026-10-12 on "akkiro - let go": with the shade partly pulled down the
cover looks zoomed in; pulled fully down it shows whole. Sora wants the least
zoom possible with **no bands and no stretching** -- not the whole picture
fitted inside a square.

Known: 1,948 of 1,949 covers in the library are not square (1,523 are 1280x720
video thumbnails, 425 are 640x720). Android fills its media card with the
artwork and crops what does not fit; the card is short and wide when the shade
is partly down and taller when fully down, so a 16:9 cover loses its top and
bottom in the first and fits in the second. That alone is the least zoom
possible without bands, and the app cannot change the card's shape.

Tried and reverted the same day: sending a square made of the whole picture
with blurred bands (`squareLayout`). It removed the crop by adding exactly the
bands that were not wanted.

Next: two screenshots, shade partly and fully down, to measure whether Android
crops *more* than the short card needs (say to a square first, then to the
card). Only that would be the app's to fix.

## 4. Loose ends

- **Objectives outside the app: Android done, the desktop pop-ups owed.**
  Reported again 2026-10-28 ("I asked for that, not just an in-app timer").
  Android since 2026-10-28: running and ringing time objectives join the
  timer's own notification (utils/goalNotices.js), ranked with the clock
  timers, its buttons routed back by a `goal:<owner>:<taskId>` key
  (App.svelte, handleGoalAction), and its alarm playing "Time's up" with the
  app shut. **Owed: the Windows always-on-top pop-ups** (utils/clockPopups.js,
  ClockPopupWindows.svelte, popup/ClockPopup.svelte) are keyed to clock
  blocks and read the clock's device memory; an objective needs a pop-up kind
  of its own, fed from the folder rather than that memory. And **Linux has no
  pop-ups at all**, for timers either -- they are opened on the Windows app
  only; whether Tauri's always-on-top windows behave under KDE/XWayland has to
  be tried before they are switched on there.

- **Apply `storage.cors.json` to the production bucket.** Done for staging
  2026-10-28 (Cloud Shell, `gcloud storage buckets update
  gs://arial-staging.firebasestorage.app --cors-file=cors.json`), which with
  freshCopyUrl put the wallpaper into the phone's screenshots -- seen on the
  phone. Production needs the same for `gs://arial-473c1.firebasestorage.app`,
  before or with the next full release; until then the real app's
  screenshots lack a synced wallpaper and Export cannot put synced pictures
  inside the file (both fetch the picture, and the bucket refused).

- **Ctrl+Z after typing and then recolouring a block** undoes the typing
  first, not the colour (2026-10-12). Ctrl+Z now goes to the workspace when the
  caret is in a note with nothing of its own to undo, or left behind in a block
  that is no longer focused (`utils/undoShortcut.js`) -- which is what was
  reported. But with typing in the note's history, the note's undo still wins,
  whichever change was newer. Doing it properly means timestamping both
  histories and undoing the newer one; the Undo button has the opposite
  version of the same question.

- **The mouse pointer reappears while typing, in the desktop app.** It should
  hide on the first keystroke and stay hidden until the mouse moves. The likely
  cause is item 1: every keystroke in a note re-lays the whole document out, and
  a layout under the pointer is enough for the browser to decide the pointer is
  worth showing again. Untested, and worth re-checking after the editor's height
  is restructured rather than chased on its own. Coalescing the update handler
  did not touch the layout, so it will not have fixed this.

- **A rebuilt note still shows the wrong lines for a moment while its pictures
  load.** Since 2026-10-05 a block is only rebuilt when something changed it
  behind its back (`utils/blockVersions.js`), and a theme change or a ticked task
  rebuilds nothing -- so this is now an undo, a mode switch, a sync bringing
  the note in. On those, the editor puts the scroll back before the pictures
  have a height, so until they load the reader sees lines further down; the
  hold (`utils/scrollHold.js`) then puts them back exactly once the pictures
  arrive -- measured: 1200 -> "Line 23" for 600ms with deliberately slowed
  pictures, then back to "Line 16". Before the hold it ended at 1837, the wrong
  place, for good. The real fix is giving pictures their size before they
  load: store `width`/`height` on the image node when a picture is put in (the
  Image extension can carry attributes), and old notes fill theirs in on first
  load. That changes stored content and so syncs -- do it with item 2, pictures
  by reference, rather than on its own. Hiding the writing until the pictures
  load was considered and rejected: a blank flash on every rebuild is worse
  than a short wrong one on some.

- **Canvas pan and the column-list scroll are not remembered.** `scrollMemory.js`
  already has `modeSurfaceKey` for exactly this; only notes and text blocks are
  wired. ~30 minutes.
- **Snapshot limits** (10 copies or 8MB per folder) want revisiting once
  pictures are references — at that point ten copies costs less than one does
  now.
- **EB Garamond and Cormorant themes fall back to system serif** — the fonts
  were never bundled, unlike Inter.
- **The alarm and the timer only ring while the app is open on their folder.** It is a
  timer in the page (`AlarmRinger.svelte`), so it cannot ring with the app
  closed, with a phone that has put the WebView to sleep, or for a clock in a
  folder that is not open. Answering is per device (`utils/alarm.js` says why),
  so two open devices both ring and each needs stopping. A real alarm on Android
  is `AlarmManager.setAlarmClock` from a Capacitor plugin, handed the block's
  time whenever it is saved — and, per the reconcile rule, re-handed on every
  launch from the folders themselves rather than trusted from the last save.
  The desktop builds would want the same from Tauri. Not started.

## 4a. The notification, as far as it can go

The transport icons and the progress bar are done. What is **not** possible, so
nobody spends an afternoon on it:

- **The notification cannot be given a layout of ours.** A `MediaStyle`
  notification is drawn by the system, and from Android 13 the media control in
  the shade is built from the MediaSession rather than from anything the app
  posts. `setCustomContentView` is ignored there.
- **`setColor` does not stick either.** From Android 12 the colours are derived
  from the album art, which means the artwork *is* the theming.
- Dropping `MediaStyle` for custom `RemoteViews` would buy a layout and cost
  the lock-screen player, the Quick Settings media card, and Bluetooth, car and
  watch controls. Not worth it for a music app.

Still open, and cheap if ever wanted: **shuffle and repeat buttons**. The
wrinkle is that from Android 13 the system builds the buttons from the
session's `PlaybackState` custom actions rather than from the notification's
own actions, so it has to be done in both places to appear across versions.

## 4b. The test-release path, now that it exists

Shipped and working, but two things are worth deciding once rather than each
time:

- **The preview channel expires after 30 days** — the CLI's maximum. Deploying
  to the same channel again resets it. Nothing warns when it lapses; the URL
  simply stops working, which will look like a bug the first time.
- **Test builds accumulate on the releases page.** They are badged and never
  *Latest*, so they cost nothing but clutter. Worth deleting the ones between
  two full releases when the later full release goes out, or leaving them as a
  record — but pick one, rather than letting it be whatever happened.

## 4c. Turning the storage ceiling on

**Switched on in production on 2026-10-05.** The ceiling works through three
pieces and the middle one is a function: `storage/{uid}` counts the bytes,
`syncStorageFullClaim` puts `storageFull` on the token, and `storage.rules`
refuses an upload when it is true.

How it was done, in this order, and the order mattered:

1. **Every existing account put on a plan first**, by hand with
   `firebase database:set /sync/default/users/<uid>/plan`: the owner's on
   `owner`, the other five on `legacy` (5 GB, decided 2026-09-27). Doing this
   before the deploy is what kept anyone from being cut off -- two accounts
   already held more than `free`'s 100 MB (665 MB and 110 MB) and would have
   been refused uploads the moment counting started.
2. **The functions deployed** (Node 22), with `ARIAL_SMTP_PASS` set and the two
   Polar secrets set to placeholders until Polar goes live -- see section 6.
3. **`reconcileStorageUsage` force-run** from Cloud Scheduler straight after.
   It scanned 2,337 objects and corrected 4 accounts, 1.37 GB in all; every
   account came out `full: false`. The two accounts that have never synced
   have no record yet and are on `legacy` already.

New accounts start on `free` at 100 MB, which is the thing a price attaches
to.

The warning is already built and needs none of this: `storageAlerts.js` speaks
when the account's own record crosses into nearly-full and full, in the same
words the refusal will use. And `uploadAllowance.js` does the arithmetic on the
way *in*, so a picture that will not fit is refused at the moment it is chosen
rather than half a minute later — measured on staging at **thirty seconds**
from adding a picture to the app knowing it was over, which is the floor for a
ceiling enforced by counting what landed.

**The balance counts everything the account keeps now**, not just its
attachments. Asked for on 2026-09-27 — "I wanted the storage to count
everything that is synced in an account folder" — and it was a fair complaint:
the number was Cloud Storage objects alone, so an account could hold a hundred
megabytes of notes, every picture pasted into writing included, and read as
empty. "5 GB" meant 5 GB of attachments and an unspecified amount of
everything else.

`storage/{uid}` carries two components and their sum: `bytes` for Storage
objects, `noteBytes` for the folders, `total` for the ceiling to compare
against. They stay apart because different triggers maintain them and a single
number could not say which half had drifted. Per-folder sizes live in
`noteSizes/{uid}/{fileId}`, written on every sync write and removed with the
folder.

The weekly reconcile corrects both halves properly, and without downloading
every note in every account. Each recorded folder size carries that folder's
own `updatedAt` beside it, and the index — tiny and fixed-shape — carries the
same stamp. So the pass opens only folders never measured or measured before
their last change, and removes sizes for folders that no longer exist. A
folder nobody has touched since it was measured cannot have changed size, so
skipping it is free rather than optimistic. `foldersNeedingMeasure` and
`orphanSizes` decide that, and they are tested.

The client refuses a picture that will not fit **both** as an image block and
as one going into writing. The second measures the data URL rather than the
file, because that is what a picture in writing actually costs — about a third
more, which is what base64 does.

**A full account can get out of being full.** Reported 2026-09-27: deleting a
picture freed nothing and the account stayed stuck. Two reasonable halves made
a trap — a save uploads its attachments before it writes the folder, so a full
account fails the whole save on the first refused upload; and the sweep that
removes deleted blocks' uploads runs *after* a successful save. So the save
that would record a deletion was the save that could not succeed. When the
account is full and something has been deleted, the sweep now goes first.
Only when full: sweeping before a save that then fails would leave the cloud
copy pointing at uploads that are gone, which is the worse trade everywhere it
is not necessary.

**The figure on screen is instant, and the cloud's is still the truth.** Asked
for 2026-09-27. What is shown is the server's last word plus what this device
has done since, so it moves the moment a picture is added rather than half a
minute later — and every refusal is judged against that same figure, so a
second picture is measured against the room the first one took.

When the server's record arrives the estimate is thrown away and the new
number adopted whole. Before that, the two are compared: a disagreement beyond
a few kilobytes of JSON overhead goes into the **sync log** and the
**diagnostics**, with what was predicted, what was counted and the difference.
Disagreeing is not a fault — another device uploading, a sweep, the
punctuation around a picture all move the real number without this one
knowing. It is recorded because a guess nobody checks is a lie with a refresh
rate, and because a large one is the first sign the two halves have stopped
counting the same thing.

All of it can be exercised on staging without filling anything: put the
staging account's `plan` on `tiny` (1 MB, which exists for this) and one
photograph is enough.

## 7. Readable for a programmer

Asked 2026-10-13: "I can't read the code anymore 'cause it isn't mine
anymore" -- `App.svelte` alone is about 7,700 lines and the modes 1,400 to
2,000 each. Nobody reads a codebase that size top to bottom; a newcomer to a
team gets a map, people to ask, small changes to review and one area at a
time. These are that, for one person working with an assistant:

1. **A map** -- one page, "how Austavia works": the big pieces, where notes
   and music live (device, cloud), how sync decides, what happens when
   somebody pays, each part linking to the files it lives in. The biggest
   single help; to be written as a page Sora opens in a browser.
2. **One fix, one commit.** A commit that mixes four changes cannot be read;
   one that does one thing, with a body that says why, can. In force from
   2026-10-25.
3. **Reading sessions on request** -- "walk me through the Ctrl+Z fix": the
   real code, one feature, in plain words.
4. **The tests as the way in.** 98 test files, most written as sentences of
   what the app does; reading them says what the app does without reading
   how. The `src/utils/` modules are where the decisions live, short and
   commented. The map should point at both.
5. **`App.svelte` split, slowly.** Hard for anyone at this size. Not one big
   refactor -- that is how working code breaks -- but each time a feature in
   it is touched, its deciding part moves to a module (the rule above) and
   its markup to a component, so the file shrinks as work happens.

## 5. Not code

- **Cloud Functions are deployed** to production since 2026-10-05 (Node 22).
  `POLAR_WEBHOOK_SECRET` and `POLAR_ACCESS_TOKEN` there hold placeholders, so
  the webhook refuses every delivery until Polar goes live -- section 6, step 3.
- **Server-side version history** — the next rung of the sync ladder, and a
  plausible paid feature: it turns every future bug of the "my folder reverted"
  class from lost into restore.
- **Conflict copies** via version vectors, instead of silently picking a winner.
- **Monetisation**: the paywall's remaining half, then INPI classes 9 and 42.
  See section 6.

## 6. The paywall, and what is left of it

Agreed build order was: storage accounting, analytics, theme sync, **the
paywall**, Birthday Mode's unlock, then the theme gallery. The first four are
now written and tested. **Everything that is left is outside this repo**, in a
dashboard or behind a deploy — see [`POLAR.md`](POLAR.md), which is the running
order for it.

**The provider is Polar** (merchant of record, so EU digital VAT is theirs and
not ours). The account is connected; no product exists in it yet.

| | |
| --- | --- |
| Decide what a subscription means | `functions/entitlements.js` |
| Decide what Polar's words mean | `functions/polarAdapter.js` |
| Decide what a delivery changes | `functions/subscriptionRecord.js` |
| Receive a webhook | `polarWebhook` in `index.js` |
| Write the plan, the ceiling and the token claim | `functions/subscriptions.js` |
| Sweep for plans that should have lapsed | `sweepExpiredPlans`, daily |
| Send someone to a checkout carrying their uid | `src/utils/checkout.js` |
| An upgrade button | `RightControls.svelte`, under the usage bar |

**The uid survives the round trip — confirmed 2026-09-21.** This was the one
part with a real unknown in it: a checkout link cannot carry arbitrary metadata
in its URL, only `reference_id`, and Polar does not document which key that
lands under. It works, and `diagnostics/polar/unmatched` was never written at
all, so every event in a real checkout carries it.

**The whole path has now run against live Polar deliveries**, in the sandbox,
against `arial-staging`:

| Tried | Result |
| --- | --- |
| Buying it | `plan: "pro"` on the buyer's real uid, 5.3s after checkout, 10 GB ceiling applied with it |
| Cancelling | `status: "canceled"`, `plan` still `"pro"`, the October period intact |
| Refunding | `plan: "free"` and the 100 MB ceiling back, 0.5s after the refund |

**The refund now revokes at Polar — confirmed 2026-09-26.**
`refund-revoked`, `alreadyDone: false`, under two seconds after the refund.
The whole chain works: money back, plan to free, ceiling to 100 MB, and the
subscription ended at Polar so the customer can subscribe again.

It took six attempts, and none of them were the code. The value in
`POLAR_ACCESS_TOKEN` was the *webhook signing secret* — a `whsec_` where a
`polar_oat_` belonged, which a Bearer header rejects as malformed with the
same 401 as a wrong token. What found it was taking our function out of the
picture: curl with the real token returned 200 from the sandbox while the
stored secret returned 401 from the same endpoint, which is not a fact any
amount of reading the log could have produced.

Two things worth keeping from it. Setting the secret interactively mangled the
value four times on that machine — the first attempt stored it *twice* — so it
is set from a file now. And Polar's own 200 proved the scopes and the
environment were fine, which had been the leading theory twice.

**And the bounce is gone — confirmed 2026-09-26, 22:37.** The first working
revoke exposed a second fault: one second later a `subscription.updated`
carrying `status: canceled` and a period end a month away put the account back
on `pro`, and only a later `subscription.revoked` corrected it. Reading
`ends_at` first fixed it, and the deployed run proves it: after the refund,
`subscription.updated`, `subscription.canceled` and `subscription.revoked` all
arrived and every one of them read as no change. Nothing now depends on that
last delivery arriving.

Still owed, in order:

1. **The lapse, and a failed payment.** What is left of the unhappy half is the
   `past_due` grace window, which needs a card that fails, and
   `sweepExpiredPlans` itself — the net under a `subscription.revoked` that
   never arrives. Force-run the sweep from Cloud Scheduler rather than waiting
   for a period to end.

   Revoke was deliberately not tried by hand: it maps by event *name* rather
   than by reading a payload, the emulator suite covers it end to end, and it
   goes through the same `applyPlan` the refund just proved against live
   deliveries.
2. **Nothing ever asks Polar what it thinks.** `sweepExpiredPlans` recomputes
   absolutely, but it recomputes from *our own record* — so when the two sides
   disagree, nothing notices. That is not hypothetical: refunding an order on
   2026-09-21 left Polar saying the subscription was active and us saying the
   account was free, and the only reason it surfaced is that Polar refused a
   second checkout.

   The *cause* of that particular disagreement is fixed — a full refund now
   revokes the subscription at Polar, see `revokeAfterRefund` — but the fix is
   another event path, and an event path is only ever as right as the last
   event it heard. A real reconcile would list subscriptions from Polar's API
   and recompute from that, the way `reconcileStorageUsage` lists the bucket
   rather than trusting the running balance. The token for it already exists
   now (`POLAR_ACCESS_TOKEN`), so what is left is the listing, the paging and
   deciding what to do with a subscription Polar knows about and we do not.
3. **Going live**: the same steps against the real dashboard — product,
   checkout link (the committed one in `checkout.js`, not `.env.staging`), a
   **new** signing secret, a new endpoint — plus deploying the functions to
   production, which is still blocked by `ARIAL_SMTP_PASS`. See section 5 and
   `POLAR.md`.
4. **Prove the money arrives -- before telling anyone they can pay.** Raised
   2026-10-05: Polar could not say for certain that payouts will work for this
   account, and nothing so far has tested it. The sandbox runs prove only our
   side -- that a purchase, a cancellation and a refund change the plan
   correctly. Sandbox money is not real and never reaches a bank, so they
   cannot show the other half: Polar, as the seller, collecting the money and
   paying it out. That half can fail on its own -- identity or bank checks on
   the payout account, a review of the account after its first sales, a
   minimum or waiting period before a payout, a country or bank it does not
   pay out to -- and none of it involves the app, so it would only surface at
   the first real sale.

   So, straight after going live: **buy one month with your own card, keep it
   (a refund pays nothing out, so it proves nothing), and wait until the money
   is in the bank.** Note how long it took and what Polar asked for on the
   way. It costs one month's price less fees, which come back. Check the
   payout account is connected and verified in Polar's dashboard before that,
   so the test is of the payout itself and not of a setup step left undone.
5. **The portal's org slug.** `.env.staging` carries a *guessed*
   `VITE_POLAR_PORTAL_LINK` — `sandbox.polar.sh/austavia/portal`. It will 404
   until it is replaced with the real sandbox organisation slug, and the live
   one still has to be written into `checkout.js` before any real sale.
6. **Delete the sandbox access token when the sandbox run is finished.** It
   was pasted into a chat on 2026-09-26, which is fine for a token scoped to a
   sandbox organisation holding nothing but test data — and is exactly why it
   should not outlive the testing. The production one never gets handled that
   way: set with `functions:secrets:set`, read by nothing but the function.
7. **Birthday Mode's unlock** rewired onto `plan`.

What the subscriber sees is now built and unverified rather than missing: a
plan panel above the storage bar showing what they are on, when it renews, that
a payment failed and by when, and a Manage subscription link into Polar's
portal. Only the words and the states are tested — the panel itself needs a
signed-in staging session to look at, because it lives behind `authUser`.

Done: the product and the checkout link, the first functions deploy this repo
has ever had (to `arial-staging`), and a paid-for plan landing on a real
account and being taken off it again.

Three things noticed while building it, none blocking:

- **The upgrade button on the desktop app -- fixed 2026-10-12.** It was an
  ordinary `target="_blank"` link: on Linux it did nothing at all, on Windows
  it opened the checkout in a bare popup with no address bar. Both desktop
  builds now hand Polar's checkout and portal to the system browser
  (`utils/externalLinks.js`, `open_in_browser` in src-tauri, which only opens
  https pages on polar.sh). Checked in the Linux app: polar.sh opened in the
  browser, another site was refused. Not yet seen on Windows.
- **An event with no uid is recorded as unmatched even when we would have
  ignored it anyway.** `applyPolarEvent` looks for the account before it asks
  whether the event means anything, so a stray `order.created` that carries no
  metadata lands in `diagnostics/polar/unmatched` beside the ones that matter.
  Harmless, but it would make a diagnostic noisier than it should be. Checked
  after the first sandbox purchase on 2026-09-21: the node does not exist at
  all, so every delivery in a real checkout carried the metadata and there is
  nothing to tighten yet.
- **The webhook's end-to-end test found the one bug unit tests could not**: the
  delivery id becomes a database key, and a Realtime Database key cannot hold a
  dot. It threw, so the endpoint answered 500 and the provider would have
  retried for ever while nobody's plan changed. `eventKey` escapes it now.
