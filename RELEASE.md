# Releasing Austavia

Every step, in order, because a release that skips one is not obviously wrong
until later. The first two releases done from a session missed the GitHub
release entirely — the tag was pushed, the site went out, the installers were
built and filed, and nothing on the releases page changed. Nobody watching the
repository would have known either had happened.

## Two kinds of release

There is a **full release** and there is a **test release**, and the difference
is not a label on the GitHub page — it is which of the steps below you run.

| | Full release | Test release |
| --- | --- | --- |
| The live site | `firebase deploy --only hosting` | **not touched** |
| The web app | — | an unlisted preview channel, 30 days |
| The apps | built and attached | built and attached |
| GitHub | a release | `gh release create --prerelease` |
| Marked `Latest` | yes | **never** |

The GitHub flag is the small half. **The live site is the half that reaches
people**, and it does not care what the release was labelled, so a test release
that runs `firebase deploy --only hosting` has shipped to everybody no matter
what the page says. Skipping that one command is what makes a test release a
test release.

Nothing in the app polls GitHub for a new version — there is no updater in
`src/`, `src-tauri/` or `tauri.conf.json` — so a prerelease cannot arrive on
somebody's device on its own.

## The version

**One step at a time, whatever the size of the release.** 0.8.50 → 0.8.51. The
number says what came after what and nothing else; it is not a claim about how
much changed. Do not open a new minor line without being asked.

A test release takes **a further digit** rather than the next number, so the
version says which kind it is:

| | |
| --- | --- |
| 0.8.64 | a full release |
| 0.8.641, 0.8.642, … | its test builds, in order |
| 0.8.65 | the next full release |

Asked for in as many words: a test build steps by `0.0.001` and a full release
by `0.0.01`. Both are ordinary semver — the patch is just a larger number — and
both fit the MSI's version fields, whose limits are 255 / 255 / 65535.

**Going back is not free on Android.** `versionCode` only ever rises, so once a
test build is on the phone, returning to the last full release means
uninstalling first — and uninstalling takes the folders with it. Anything not
synced to the cloud is gone. Either stay on test builds until the next full
release, or make sure everything has synced before going back.

Two files carry it, and both must agree:

| File | Field |
| --- | --- |
| `src-tauri/tauri.conf.json` | `version` |
| `android/app/build.gradle` | `versionName`, and `versionCode` +1 |

`versionCode` is a separate counter that only ever goes up — Android refuses an
install that moves it backwards. `package.json` stays at `0.0.0`; it has for
every release so far and nothing reads it. The app reports its own version from
`tauri.conf.json`, read at build time in `vite.config.js`, so there is no third
place to forget.

## Before anything ships

```bash
npm run build          # runs the tests first; a failing test stops the build
```

Then work out what actually changed, because it decides how much of the
following is needed:

```bash
git diff --name-only <last tag>..HEAD -- storage.rules database.rules.json functions/
```

Empty means the release is client-only: **hosting and the apps, nothing else.**
Deploying rules or functions that did not change is not harmless — it is a
chance to ship something half-finished that was sitting in the working tree.

## The order

Ship the things that can be rolled back last, and the things everything else
depends on first.

### 1. Rules — only if they changed

```bash
npm run deploy:rules
```

Runs the emulator suite before deploying. Rules are the one thing that can lock
every user out of their own files, so they are never deployed without it.

### 2. Functions — only if they changed

```bash
firebase deploy --only functions
```

Currently blocked: the production-only monitoring functions declare
`ARIAL_SMTP_PASS`, and the CLI resolves every secret in the codebase before
working out which functions were asked for — so a missing secret blocks the
whole codebase, targeted deploys included. Enable Secret Manager and set the
secret, or comment out the three `exports.bandwidth*` lines in
`functions/index.js`. See `functions/monitoring/README.md`.

### 3. Commit and tag

The commit is the version bump. The tag is annotated, so it carries a date and
a message of its own.

```bash
git add -A
git commit                       # "Austavia 0.8.51" + what is in it
git tag -a v0.8.51 -m "Austavia 0.8.51"
git push origin main
git push origin v0.8.51
```

### 4. The site

**Full release only.**

```bash
firebase deploy --only hosting
```

Then **open it and confirm it is the build you just made** — the diagnostics
button reports the version, which is the quickest way to be sure the upload was
not a no-op.

#### 4b. A test release goes to a channel instead

Never to `live`. A preview channel is a separate, unguessable URL on the same
project, and production is untouched:

```bash
firebase hosting:channel:deploy testing --expires 30d
```

Thirty days is the maximum the CLI allows, and deploying to the same channel
again resets the clock. The command prints the URL; it is not guessable and not
listed anywhere, but it is not a secret either — treat it as unlisted rather
than private.

It adds the channel's domain to Firebase Auth's authorised domains by default,
so **signing in works there**, which is the point: most of the faults worth
chasing only exist with an account attached. Two tabs on it are two devices
arguing — see the staging note in `CLAUDE.md`.

### Putting it back

Hosting keeps every version it has served, so the site can be returned to an
earlier one at any time. There is no `firebase hosting:rollback`; it was
written here once and does not exist in the CLI. Two ways that do:

- **The console.** Hosting → the site's release history → the ⋮ beside an
  earlier release → *Rollback*. One click, takes effect immediately, and the
  rollback is itself recorded as a new release.
- **The CLI**, for a version that is on a channel:
  `firebase hosting:clone <site>:<channel> <site>:live`.

The apps do not roll back the same way. Every installer stays on its GitHub
release, so going back means installing the older one — and on Android that
needs the app uninstalled first, because `versionCode` only ever goes up and
the installer refuses to move it backwards. Uninstalling takes the folders
with it; anything not synced to the cloud is gone with them.

### 5. The apps

```bash
npx cap sync android
```

Then Gradle, which needs two things set that a plain shell does not have:
`TEMP`/`TMP` pointed at `E:\gradle-tmp` (the accented user folder breaks the
socket path it opens) and `JAVA_HOME` on JDK 21. `build_apk.bat` does both.

```bash
cd android && ./gradlew.bat assembleRelease
npx tauri build --bundles msi,nsis
```

Check the APK's metadata says the version you meant
(`android/app/build/outputs/apk/release/output-metadata.json`), then copy all
three into `release/`, named for the app and the version:

```
release/Austavia_0.8.51.apk
release/Austavia_0.8.51_x64-setup.exe
release/Austavia_0.8.51_x64_en-US.msi
```

`release/` is not tracked by git. The copies that are published live on the
GitHub release, which is the next step and the one that gets forgotten.

### 6. The GitHub release — the step that gets missed

A pushed tag is not a release. Nothing appears on the releases page and nobody
gets a notification.

```bash
gh release create v0.8.51 --verify-tag \
  --title "v0.8.51 — <a short phrase, not a version restated>" \
  --notes-file <notes> \
  release/Austavia_0.8.51.apk \
  release/Austavia_0.8.51_x64-setup.exe \
  release/Austavia_0.8.51_x64_en-US.msi
```

`--verify-tag` refuses rather than inventing a tag if the push was forgotten.

Check afterwards that the newest release is the one marked `Latest`; a release
created out of order is not, and `gh release edit <tag> --latest` fixes it.

**A test release adds `--prerelease`**, and then the opposite check applies: it
must *not* be `Latest`, and `/releases/latest` must still point at the last full
release.

```bash
gh release create v0.8.641 --verify-tag --prerelease \
  --title "v0.8.641 — <what is in it to try>" \
  --notes-file <notes> \
  release/Austavia_0.8.641.apk \
  release/Austavia_0.8.641_x64-setup.exe \
  release/Austavia_0.8.641_x64_en-US.msi
```

It still appears on the releases page, badged *Pre-release*. That is as hidden
as a public repository gets while keeping a link that installs on a phone; a
draft would be invisible but its downloads need a token, which is the one thing
the link is for.

If a test build turns out to be the one worth keeping, promote it rather than
rebuilding it:

```bash
gh release edit v0.8.641 --prerelease=false --latest
```

**Never pass a placeholder title or notes meaning to edit them after.** A
release is public and notified the moment it is created.

## Writing the notes

Follow what is already on the releases page. They are written for somebody
using Austavia, not reading its source:

- A title that says what the release is: *"Two windows that leave each other
  alone"*, *"Arial is now Austavia"*. Not a restated version number.
- Headings per theme, not per commit. Nobody wants the log.
- Say what was wrong from the outside — what it looked like — then what it does
  now. Where a bug had a cause worth knowing, say it plainly; where a fix
  changes what people should expect, say that too.
- Call out anything that touches saved data, even when the answer is "nothing
  changes". That is the question a reader has.
- **A test release is written for the one person installing it**, so it says
  what to try and what would count as it going wrong, rather than what was
  added. Open it by saying it is a test build and that the live site is still
  on the last full release — otherwise the first question is whether everybody
  just got this.
- End with the standing Android note:

  > **Android:** the build is unlisted, so Android will warn about installing
  > outside the Play Store. Music plays with the screen off, which needs the
  > notification permission.

## Afterwards

Update [`PENDING.md`](PENDING.md) as part of the release, not later:

- Anything that went out and can only be judged on a real device goes into
  section 0, with what to look for. Nobody remembers this a day later, and every
  one of those has been mentioned once in a message and then lost.
- Anything fixed has its entry deleted, if that did not already happen in the
  commit that fixed it.
- Anything learned on the way in — a thing tried and rejected, a measurement —
  goes in beside the item it belongs to, so the next attempt starts from it
  rather than from nothing.


Send the APK and the installer to whoever is waiting on them, and say plainly
what did **not** go out — an undeployed function or a known bug left in is
worth a sentence, because silence reads as "everything shipped".
