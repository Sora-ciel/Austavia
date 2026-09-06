# Working on Austavia

Two rules that were each learned the same way — by shipping the opposite and
finding out later.

## Anything driven by events needs something that recomputes

An event-driven value is only ever as right as the last event it heard. One
trigger that times out, one retry that never lands, one listener that was not
connected, and the value is wrong from that moment on — permanently, and
silently, because nothing ever looks again. There is no error, nothing in a
log, and the code that reads the value has no way to tell.

So: whenever something is kept up to date by a trigger, a webhook or a
subscription, there must also be something that recomputes it from scratch on a
timer. Not as a nicety. The event path is the fast path; the periodic pass is
what makes it *true*.

Four of these were found in one week, all the same shape:

| Kept by | Would have gone wrong as | Now also |
| --- | --- | --- |
| Storage triggers → `storage/{uid}` | A balance that drifts for ever; the ceiling never fires, or fires on someone under it | `reconcileStorageUsage`, weekly, from a full bucket listing |
| Deleting a block → its uploads | Attachments charged for after the picture was deleted; a full account with no way out | A sweep after a save that deleted something, against what storage actually holds |
| A payment webhook → `plan` | One missed `subscription.revoked` and an account stays paid up for ever | `expiredPlanFor`, recomputed from the stored record |
| A database subscription → downloads | A phone that never learns anything changed, until something else happens to wake it | A 30s tick, plus a pull when the app becomes visible |

The recomputing pass should always be **absolute, not incremental** — it works
out what the value should be and writes that, rather than applying a delta. That
is what makes it safe to run at any time and safe to run twice, which is what
makes it safe to run at all.

Two things follow from this, and both have already bitten:

- **Remembering what happened is not a substitute for looking.** The attachment
  sweep compares against storage rather than a list of deletions, because a
  remembered list is wrong in both directions: an undo restores a block while
  the memory still says to delete it, and a redo removes one without the memory
  noticing.
- **Declining to answer beats guessing.** When a periodic pass meets a record it
  cannot make sense of, it leaves it alone. "Correcting" it means cutting off
  somebody who is paying, on the strength of a field this build does not
  recognise.

## The part that decides goes somewhere Node can reach

`App.svelte` needs a component runtime and `firebaseClient.js` imports
Capacitor, so neither can be loaded outside a browser. Any rule buried in them
can only be exercised by running the app, signing in, and trying it by hand —
which is why the bugs in them were found by the person using Austavia rather than
the person changing it.

So the part that *decides* lives in a plain module and the part that *acts*
stays at the call site. `src/utils/syncRules.js` was the first; `themeSync.js`,
`attachmentCleanup.js`, `saveScheduling.js` and `storageUsage.js` follow it, and
`functions/` is split the same way — `storageUsage.js` and `entitlements.js`
decide, `storageAccounting.js` and `index.js` act.

The test suites and what each is for are in [`test/README.md`](test/README.md).
`npm test` must stay fast and dependency-free; it gates every build.

## Releasing goes by the checklist, not by memory

[`RELEASE.md`](RELEASE.md) has every step in order. Follow it whenever the ask
is a release — "ship it", "release everything", "cut a version" — rather than
working out which parts seem to apply.

The two that get skipped when it is done from memory: the version moves **one
step**, whatever the size of the release, and a pushed tag **is not a release**.
0.8.50 and 0.8.51 both went out with the site deployed, the installers built and
nothing at all on the releases page.

## Two things that are not obvious

**Never put a Cloud Function trigger on `files/{fileId}`.** It is the whole note
and it is rewritten on every edit, so it blows past the payload ceiling for
watched paths and breaks live saving with `TRIGGER_PAYLOAD_TOO_LARGE`. Watch
`index/{fileId}` and read the file inside the handler instead. Small,
fixed-shape nodes like `themes/{themeId}` are fine to watch directly.

**Storage rules cannot read the Realtime Database.** They can query Firestore
and they can read the caller's own token, which is why a storage ceiling is
enforced through a custom auth claim rather than a lookup. That claim lags by a
token refresh; the exact number always lives in the database.
