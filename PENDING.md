# What is still owed

Everything known-but-not-done, with enough of the why that it can be picked up
cold. Written down because the list has been reconstructed from memory twice,
and both times something fell off it.

Ordered by what to do first. Measurements in here were taken on a desktop; a
phone is several times worse for anything about layout or serialising.

---

## 0. To check on a device after the next release

Things that are built and shipped but that nobody has confirmed. Cross one off
when it is seen working; if one turns out to be wrong, it goes back into the
list below with what was observed.

| Shipped | What to look for |
| --- | --- |
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

## 4. Loose ends

- **The mouse pointer reappears while typing, in the desktop app.** It should
  hide on the first keystroke and stay hidden until the mouse moves. The likely
  cause is item 1: every keystroke in a note re-lays the whole document out, and
  a layout under the pointer is enough for the browser to decide the pointer is
  worth showing again. Untested, and worth re-checking after the editor's height
  is restructured rather than chased on its own. Coalescing the update handler
  did not touch the layout, so it will not have fixed this.

- **Canvas pan and the column-list scroll are not remembered.** `scrollMemory.js`
  already has `modeSurfaceKey` for exactly this; only notes and text blocks are
  wired. ~30 minutes.
- **Snapshot limits** (10 copies or 8MB per folder) want revisiting once
  pictures are references — at that point ten copies costs less than one does
  now.
- **`ImgBlock`, `TaskBlock` and `EmbedBlock` are not on `BlockShell`.** Only
  Text and Music are. Directly the reuse philosophy in
  `project-content-architecture`.
- **EB Garamond and Cormorant themes fall back to system serif** — the fonts
  were never bundled, unlike Inter.
- **`functions/package.json` is on Node 20** and wants 22.
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

Everything it needs is written and none of it is switched on in production,
because no function in this repo has ever deployed there — see section 5. The
ceiling works through three pieces and the middle one is a function:
`storage/{uid}` counts the bytes, `syncStorageFullClaim` puts `storageFull` on
the token, and `storage.rules` refuses an upload when it is true. The rules are
live; the counting is not, so the claim is never written and `notOverQuota()`
reads as true for everybody.

In order, when the production deploy is unblocked:

1. **Deploy the functions.** That is the whole switch — the moment
   `trackStorageUpload` runs, accounts start being counted and claimed.
2. **Force-run `reconcileStorageUsage`** from Cloud Scheduler before anything
   can bite. It has never run on production, so every account currently reads
   as zero bytes, and the first upload after the deploy would be measured
   against a balance that does not know about anything uploaded until now.
3. **Put every account that exists today on `legacy`.** Decided 2026-09-27:
   every live account except the owner's gets 5 GB, which is comfortably more
   than any of them uses. `limits.js` has carried `legacy` for exactly this
   since it was written — a limit introduced after people are already using
   something is a limit taken away from them.

New accounts then start on `free` at 100 MB, which is the thing a price
attaches to.

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

## 5. Not code

- **Cloud Functions are undeployed.** Blocked on Secret Manager and
  `ARIAL_SMTP_PASS`, which only the account owner can set. See
  `functions/monitoring/README.md`; `RELEASE.md` explains why a missing secret
  blocks even a targeted deploy.
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
4. **The portal's org slug.** `.env.staging` carries a *guessed*
   `VITE_POLAR_PORTAL_LINK` — `sandbox.polar.sh/austavia/portal`. It will 404
   until it is replaced with the real sandbox organisation slug, and the live
   one still has to be written into `checkout.js` before any real sale.
5. **Delete the sandbox access token when the sandbox run is finished.** It
   was pasted into a chat on 2026-09-26, which is fine for a token scoped to a
   sandbox organisation holding nothing but test data — and is exactly why it
   should not outlive the testing. The production one never gets handled that
   way: set with `functions:secrets:set`, read by nothing but the function.
6. **Birthday Mode's unlock** rewired onto `plan`.

What the subscriber sees is now built and unverified rather than missing: a
plan panel above the storage bar showing what they are on, when it renews, that
a payment failed and by when, and a Manage subscription link into Polar's
portal. Only the words and the states are tested — the panel itself needs a
signed-in staging session to look at, because it lives behind `authUser`.

Done: the product and the checkout link, the first functions deploy this repo
has ever had (to `arial-staging`), and a paid-for plan landing on a real
account and being taken off it again.

Three things noticed while building it, none blocking:

- **The upgrade button opens an ordinary link.** That is right on the web and
  in the Android app, where Capacitor hands an outside URL to the system
  browser. What it does in the Tauri desktop build is unverified — it may
  navigate the app window instead of opening a browser.
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
