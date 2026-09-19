# Tests

```bash
npm test
```

No framework, no dependencies — Node's own test runner. The whole suite takes
about a second and a half. `npm run build` runs it first and stops if anything
fails, so a broken rule cannot reach a release.

## Why these tests exist

Every case in here is a bug that got as far as a release and was found by using
the app. Not one of them needed a browser, a signed-in account, or a second
device to detect — they only *looked* that way, because the rules that broke
were buried in files that cannot be loaded outside a browser.

- `App.svelte` needs a component runtime
- `firebaseClient.js` imports Capacitor and a Firebase config

So the rules that decide things were moved into plain modules that Node can
import, and the code that acts on them stayed where it was:

| Module | Decides |
| --- | --- |
| `src/utils/syncRules.js` | what may be synced, and what counts as a change |
| `src/utils/textHistory.js` | how typing is grouped into undo steps |
| `src/utils/syncLog.js` | what sync decided, and what it thought had changed |
| `src/utils/editorUpdates.js` | when the editor tells the app the writing changed |
| `src/utils/playbackPosition.js` | what the phone's notification is told about the track |
| `src/utils/coverArtwork.js` | how big a cover may be before it cannot be sent |
| `src/utils/notificationPresence.js` | whether the playback notification should be on screen |
| `src/utils/mp4Cover.js` | where the artwork is inside an .m4a, and whether it is artwork |
| `src/utils/clipboardPicture.js` | which thing on the clipboard is a picture, and what to do without one |

## What is covered

**`sync-rules.test.js`**

- A folder name the database cannot hold is never sent. A blank one is not just
  rejected, it is dangerous: `files/${fileId}` with a blank id collapses to the
  node holding *every* folder, and the write replaces the lot.
- A picture pasted into written text is found, in HTML and in markdown, in
  notes and in tasks. Missing this put megabytes of base64 into a database
  field, the write failed, and the upload loop abandoned every folder queued
  behind it.
- Inline base64 anywhere in a payload is detected, as the last line of defence
  before a write.
- A cloud round trip does not look like an edit. The database stores no empty
  list, so a folder uploaded with `tasks: []` comes back without the field;
  putting it back made the copy on disk differ, the save stamped a new
  modifiedAt, and two open instances handed the folder back and forth for as
  long as both were running.

- A theme repaint is not an edit. "Blocks follow theme" writes the current
  theme's colours into every block, and those are derived from whichever theme
  *this device* is on — so two devices on different themes each rewrote what the
  other wrote, for ever. Blocks are compared with the paint undone. Found by
  reading the sync log, not by reasoning: `blocks.0.bgColor: #1b2129 ->
  #1c0d2bc7`.

**`sync-log.test.js`**

- The difference between two folders is named exactly: the field path, both
  values, deep inside a block. This is what answers "what did it think had
  changed?" on a machine I cannot reach, so it is tested rather than trusted.
- Long values are cut down (a note can hold megabytes of base64) and the list
  stops after a few findings, so the culprit is not buried.
- The log does not grow without limit, keeps the newest, and a listener that
  throws cannot stop it recording. That last one was a real bug this test
  found: the listener called at subscription was outside the guard.

**`text-history.test.js`**

- Undo steps back about a sentence: three presses for three sentences, where it
  was once a whole paragraph in one press and later twenty-nine.
- Typing in the middle of a note groups the same as typing at the end.
- History survives the editor being rebuilt, which happens on every block move
  and every mode switch.
- Redo returns exactly what undo took away.

**`editorUpdates.test.js`**

- A burst of typing is serialised once rather than once per character. Reported
  as "writing on the phone seems slow even without images"; the work used to run
  inside the key event, ahead of the character being drawn.
- What is sent is the writing as it ended up, not as it was when the first key
  went down — which is why the editor is read at the end instead of a value
  being kept per keystroke.
- The window does not move while somebody keeps typing. A window that restarted
  on every keystroke would never close during a paragraph, so the writing would
  reach the save and the undo history only once they stopped.
- **The last characters typed are never lost.** This is the risk the delay
  introduces and the one thing that must not happen, so blur, teardown, undo
  and an incoming copy all send first. Flushing when nothing was typed sends
  nothing, and nothing is sent after the editor is gone.

**`playbackPosition.test.js`**

- **A track playing normally is never reported again, however long it plays.**
  Android is given a position and a speed and extrapolates the rest, so a
  fresh report is only worth sending when the audio has diverged from what the
  shade will have worked out. Comparing against the position last *sent*, rather
  than against where it will have been carried to, sends an update every second
  for ever on a track that is playing perfectly — the test walks ten minutes of
  playback to say so.
- A seek is reported, forwards or backwards, and so is a stall — where the
  music stops advancing and no event fires at all. That last one is why this is
  a recomputing pass and not only an event handler.
- A duration that is `NaN` — which every track is until its metadata loads —
  claims no length rather than sending nonsense to the shade.
- A paused track reports a speed of zero, or the bar creeps forward over music
  that is not playing and then jumps back.

**`coverArtwork.test.js`**

- **A cover that already fits is not touched at all** — no re-encode, no loss —
  and only one too big to send is reduced, by as little as gets it under the
  limit. Not a tidy-up: the cover reaches Android as a string on an intent,
  everything on an intent goes through Binder, and Binder's buffer is about a
  megabyte for the whole process. A measured 1400px sleeve is **2.58 million
  characters** as a data URL and cannot cross at all.
- Reducing everything was the first version, and it cost quality on covers that
  were never the problem — the artwork was not being made at all, for a reason
  that had nothing to do with size.
- The ceiling is deliberately far below the real one, because the budget is
  shared with everything else in flight and that cannot be asked about from here.

**`notificationPresence.test.js`**

- Swiping the notification away leaves the track loaded and only stops playback.
  It used to fire the same stop as the player's own Stop button, which clears the
  track, the object URL and the resume position — so a gesture meaning "put this
  away" threw away what you were listening to.
- **The swipe does not undo itself.** The notification is shown from a reactive
  statement that re-runs when the play state changes, so pausing — which is what
  the swipe now does — would put it straight back up.
- The dismissal is recorded against the track it was made on, so pressing play or
  changing track ends it with nothing having to clear a flag. A flag that
  something must remember to clear is the kind that goes stale and leaves the
  notification gone for the rest of the session.

**`mp4Cover.test.js`**

- **A cover declared as text is still read as a picture.** An iTunes `covr` atom
  says what it holds, and plenty of encoders say 1 (UTF-8 text) over bytes that
  begin `ff d8 ff`. A parser that believes the file reports no picture, which is
  right behaviour on a wrong file and is why those tracks had no artwork. The
  first bytes are believed instead of the declaration.
- **An atom name beginning with © does not stop the walk.** This cost a build.
  iTunes names most metadata atoms `©nam`, `©ART`, `©alb`, and one of them is the
  *first* child of `ilst` — so a walk that only accepts printable ASCII rejects it
  and stops before reaching the artwork beside it.
- `meta` is a full atom, with four bytes of version and flags between its header
  and its children; descending without stepping over those lands mid-length and
  the walk falls apart.
- Only the metadata is read, not the audio: the top level is stepped through by
  length, so `mdat` is skipped rather than scanned. Measured at 2% of the example
  file, and 46ms against 305ms for the byte scan it replaces.
- Junk, a non-MP4 file, a file with no cover, and a `covr` atom genuinely holding
  text all come back empty rather than confidently wrong.

**`clipboardPicture.test.js`**

- A screenshot is preferred over a photograph, and either over a GIF, because a
  screenshot is most of what gets pasted into a note.
- **Every way the clipboard can decline ends at the file picker** — an old
  browser, a refused permission, a clipboard holding only text. The button means
  "put a picture here", and all of those deserve the same answer rather than an
  error. Only a picture actually found goes straight in.
- Reported as "I can't paste images in Single Note on mobile — and even on the
  site on Chrome". A keyboard does not paste a picture, it offers one through
  `commitContent`, and the app must have declared it accepts them. In the Android
  app that declaration is ours and `ImagePasteWebView` makes it; on the website
  it is Chrome's, and Chrome refuses. Nothing here can change Chrome's mind, so
  this is the route that never asks the keyboard.

## Adding to it

When you add something that decides *whether* or *what* — whether to sync,
whether something changed, how to group an edit — put the decision in a plain
module and test it here. The rule of thumb: if answering "is this still
correct?" means running the app and trying it by hand, it is in the wrong file.

Two habits worth keeping:

- **Name a test after the behaviour, not the function.** A failure should say
  what broke. `three sentences take three presses, not twenty-nine` is worth
  more at 2am than `recordText returns 3`.
- **Check that a new test can fail.** Undo the fix, watch it go red, put the fix
  back. A test that has never failed is not yet evidence of anything. All four
  fixes in this suite were verified that way.

## What this does not cover

Deliberately, so nobody reads a green run as more than it is:

- Anything needing a signed-in account: the actual database write, permission
  rules, two real devices.
- Anything needing a browser: the editor, the canvas, layout, themes.
- Android and the desktop shell.

A green run means the rules are intact. It does not mean the app works.

## The other suite: rules

`npm test` stays what it always was — no framework, no dependencies, nothing
listening, about a second and a half, and it gates every build.

Security rules cannot be tested that way. They are enforced by the database,
not by any code Node can import, so checking them needs the emulator running
and therefore Java. That suite lives in [`../test-rules/`](../test-rules/) and
runs separately:

```bash
npm run test:rules
```

It starts the database emulator against a `demo-arial` project id, runs the
tests, and shuts the emulator down. Nothing touches the real Firebase project,
and no credentials are involved — a `demo-` prefix makes the CLI refuse to
reach any live service.

Same principle as the tests above, one layer down: every case is a property
the app depends on that nothing else would notice breaking. Account isolation,
write being scoped to `files` and `index` rather than the whole user node, the
`updatedAt` and `fileId` validations, and the quota block.

The group that matters most is `entitlements are server-written only`. A
signed-in client must never be able to write its own `blocked` flag, and when
a paid `plan` field lands beside it the same has to be true of that. It is the
one failure on this list that is completely silent: the app keeps working, the
sync keeps syncing, and the only symptom is that nobody ever needs to pay.
That is why it is asserted rather than assumed.

`npm run deploy:rules` runs this suite before pushing rules to production, so
a broken rule cannot reach the live database — the same bargain `npm run
build` makes for releases.

### What runs there

Three files, two kinds of test.

`database-rules.test.js` and `storage-rules.test.js` drive the client SDK
through `@firebase/rules-unit-testing` and assert what a signed-in browser is
and is not allowed to do.

`storage-accounting.test.js` is different: it uses the Admin SDK to exercise
`functions/storageAccounting.js` against emulated database, storage and auth.
The arithmetic it relies on is already covered by `storage-usage.test.js` in
the fast suite; what this adds is the wiring around it, which is where the rest
of the risk lives — whether a paged bucket listing returns what the code
expects, whether an object's size arrives as a string, whether the transaction
guarding against a mid-scan write actually aborts, and whether stamping a quota
flag onto a token leaves the rest of that token's claims alone. None of those
can be reached without real services, and every one of them fails silently: a
balance that is quietly wrong enforces a ceiling that is quietly wrong.

That file resolves its imports as though from `functions/`, because that is
where `firebase-admin` is installed. Duplicating it at the root would let the
tests pass against a different version than the one that deploys.

### And a third: do the triggers actually fire?

```bash
npm run test:triggers
```

The suites above stop short of one thing. `storage-accounting.test.js` calls
`recordStorageDelta` directly, which proves the accounting is right and proves
nothing about whether an upload ever reaches it. The wiring in `index.js` — the
event type, which field of the event carries the object name, whether a delete
fires anything at all — is exactly the part no other test touches, and all of
it fails silently: uploads keep working, the balance just stays at zero for
ever and the ceiling never fires.

So [`../test-triggers/`](../test-triggers/) runs the real functions in the
functions emulator, uploads a real object, and waits for the balance to move on
its own. It is separate from `npm run test:rules` because a functions emulator
would otherwise be running these triggers *during* the rules tests, writing to
the same nodes those tests assert on. It is also slower — a cold functions
emulator has to load the module and start a runtime before the first event.

Scheduled functions do not run here; the emulator skips them without a pubsub
emulator, and they are covered directly in `test-rules/` instead.

This suite has already paid for itself once. It caught `recordStorageDelta`
bumping the byte count in one write and the limit and verdict in another,
leaving a window where the record held a new total against the old verdict —
which the app reads to say "you have used X of Y". It showed up as a test that
passed on a warm machine and failed on a cold one, which is the kind of
flakiness worth listening to rather than retrying.
