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
| next | **The notification on the track that froze it** — heylog, "snake's in the wall". Its cover is a 197KB PNG where most are 30KB JPEGs, and it used to ride on the same intent as the title, the play state and the position. The progress bar should now move, the button should show pause while it plays, and the cover should be that track's own. Worth skipping *between* a big-cover track and a small one a few times, since the fault only showed on the second update of a track. |
| next | **Habits on two devices.** They belong to the folder now and travel with it, so the same folder opened on the phone and the computer should show the same habits and the same ticks, and a tick on one should appear on the other after a sync. Also worth checking the one-time move: a device that had habits in the old tracker should find them in whichever folder was open the first time this build ran, and **only** that folder. |
| next | **The screenshot button on a phone.** It now saves a PNG *and* copies it, on every platform, where before a phone got the system share sheet instead of a download. Two things to look at: that the file actually arrives (it lands in Downloads now, not the gallery — that was the share sheet's whole reason for existing, and it was replaced on purpose), and that pasting it into another app gives the picture. Worth trying in the app *and* on austavia.com, since the clipboard half is the browser's to allow. |
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
