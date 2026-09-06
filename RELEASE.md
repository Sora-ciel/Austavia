# Releasing Austavia

Every step, in order, because a release that skips one is not obviously wrong
until later. The first two releases done from a session missed the GitHub
release entirely — the tag was pushed, the site went out, the installers were
built and filed, and nothing on the releases page changed. Nobody watching the
repository would have known either had happened.

## The version

**One step at a time, whatever the size of the release.** 0.8.50 → 0.8.51. The
number says what came after what and nothing else; it is not a claim about how
much changed. Do not open a new minor line without being asked.

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

```bash
firebase deploy --only hosting
```

Then **open it and confirm it is the build you just made** — the diagnostics
button reports the version, which is the quickest way to be sure the upload was
not a no-op. `firebase hosting:rollback` puts the previous version back if it
is wrong.

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
- End with the standing Android note:

  > **Android:** the build is unlisted, so Android will warn about installing
  > outside the Play Store. Music plays with the screen off, which needs the
  > notification permission.

## Afterwards

Send the APK and the installer to whoever is waiting on them, and say plainly
what did **not** go out — an undeployed function or a known bug left in is
worth a sentence, because silence reads as "everything shipped".
