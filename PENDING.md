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
| 0.8.652 | **Holding a habit to delete it** — and scrolling a list of habits without the menu appearing, which is the case it is most likely to get wrong. Also **the note's footer** going while the keyboard is up and coming back after, with the picture behind holding still. |
| 0.8.651 | **Habit Tracker on a phone**: a habit two lines tall, the last seven days on one row. Also worth checking **after 8pm** that the last square is really today — the date used to be worked out in UTC, so from early evening the tracker thought it was tomorrow and ticks landed a day late. Old evening ticks will be sitting one square too far right. |
| 0.8.650 | Pasting a picture from the **Android keyboard's** own picker. Broken since a Capacitor upgrade renamed the layout our WebView override was aimed at, so the app was not using its own WebView at all and nothing was ever declared. Fixed and now guarded by `test/capacitorLayout.test.js`. |
| 0.8.59 | The **drag pointer** on the desktop: the no-drop cursor should no longer flash at the start of a drag. A browser ignores `dropEffect` outside a real drag. |
| 0.8.60 | A **real track ending** and autoplay stepping on, in a full library. Seeded audio covered everything up to that. |
| 0.8.62 | **Adding a picture while signed in.** This is the file-dialog fix; it is the one most likely to have been the whole complaint. |
| next | The **wallpaper** holding still in Single Note and Playlist while the phone keyboard opens *and closes* — the closing is the half a browser cannot show. |
| next | **Moving a block on the canvas** no longer making the text inside jump. |
| next | **One click** on an unfocused text block leaving the caret where you clicked. |
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

## 5. Not code

- **Cloud Functions are undeployed.** Blocked on Secret Manager and
  `ARIAL_SMTP_PASS`, which only the account owner can set. See
  `functions/monitoring/README.md`; `RELEASE.md` explains why a missing secret
  blocks even a targeted deploy.
- **Server-side version history** — the next rung of the sync ladder, and a
  plausible paid feature: it turns every future bug of the "my folder reverted"
  class from lost into restore.
- **Conflict copies** via version vectors, instead of silently picking a winner.
- **Monetisation**: Paddle, the storage ceiling, the paywall, INPI classes 9
  and 42.
