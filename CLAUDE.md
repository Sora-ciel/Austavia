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

## A behaviour that was asked for gets a test that says so

Code cannot tell the difference between a rule somebody wanted and an accident
nobody noticed. Both look like a line you could delete.

Scrolling inside a block only while that block is focused was asked for and
built on 2026-05-18. On 2026-08-26 it was deleted while fixing a different
complaint — scrolling escaping into the canvas — because the focus requirement
looked like the cause. Nothing failed. The commit that removed it recorded a
confident account of why the rule had been wrong, and from then on that account
read as history, including to whoever had written it. It was reported again as
a bug six weeks later.

Three things let that happen, and all three are avoidable:

- **The rule was inside a `.svelte` file**, so no test could reach it. This is
  the doctrine above, and it applies to interaction rules exactly as it does to
  sync rules — `utils/scrollOwnership.js` exists for that reason.
- **The commit that introduced it was one line with no body.** A request is the
  only reason some code exists; if the commit does not say so, nothing does.
- **Removing it broke nothing.** A comment can be argued past by somebody who
  believes they have found the cause. A red test cannot.

So when something is built because it was asked for, write the test in the
words of the request — `a block only takes the scroll while it is focused`, not
`returns false when blockFocused is false` — and say in the test file that the
behaviour was wanted. Then the next person to decide it looks wrong has to read
that first, and deleting it costs an argument rather than nothing.

Judgement still applies: a request can be superseded, and the user can change
their mind. The point is that it should be a decision, taken with the intent in
front of you, and not a tidy-up.

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
