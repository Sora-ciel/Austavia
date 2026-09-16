# What is still owed

Everything known-but-not-done, with enough of the why that it can be picked up
cold. Written down because the list has been reconstructed from memory twice,
and both times something fell off it.

Ordered by what to do first. Measurements in here were taken on a desktop; a
phone is several times worse for anything about layout or serialising.

---

## 1. Typing in a long note

Two separate causes, measured on a note of 15,930 characters — the size of a
real one. A keystroke costs about **7ms**, and it scales with the note: 0.4ms at
655 characters, 8ms at 23,000, 13ms at 51,000.

**Almost none of it is ours.** With the editor at `display: none` — same code,
no layout — a keystroke costs **0.3ms**. The rest is the browser recalculating
style and laying out the page, because every character typed at the end of a
note re-lays the whole of it.

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

### 1b. Coalesce the editor's update handler

Worth about 3ms of the 7: roughly 1.5ms serialising the document with
`getHTML()` and 1.9ms in the Svelte cascade that follows `dispatch('change')`.
Both run on every single keystroke.

One serialise-and-dispatch per ~50ms instead of per character. The risk is
losing the last characters typed, so it must flush on blur, on destroy, and
before any external content push — that is the part to get right rather than
fast.

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

- **Image paste from the Android keyboard.** Shipped in 0.8.57
  (`ImagePasteWebView`), never confirmed. `commitContent` cannot be exercised
  from a browser.
- **The desktop drag cursor.** `dragDropEnabled: false` fixed the drag in
  0.8.58; `dropEffect` in 0.8.59 was meant to remove the remaining flash of the
  no-drop pointer. A browser ignores `dropEffect` outside a real drag, so this
  needs a hand on a mouse.
- **Autoplay across a track ending, with real music.** The search pool, the
  remembered playlist and the resumed track were all exercised in a browser with
  seeded five-minute audio, including playing from one playlist and then another
  and restarting. What a seeded library still cannot show is a real file
  finishing and autoplay stepping on in a long library.
- **A text size for phones.** Computers settled at 109%; the phone number is
  still the neutral 100 in `typeScale.js`, waiting for somebody to drag the
  slider and say.

## 4. Loose ends

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
